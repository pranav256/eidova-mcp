import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { RequestHandlerExtra, RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  CallToolRequestSchema, CallToolResultSchema, CompleteRequestSchema, CompleteResultSchema,
  GetPromptRequestSchema, GetPromptResultSchema, ListPromptsRequestSchema, ListPromptsResultSchema,
  ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema,
  ReadResourceRequestSchema, ReadResourceResultSchema, ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema, ErrorCode, McpError,
  type ServerRequest, type ServerNotification, type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { isAbsolute, dirname } from 'node:path';
import { stat } from 'node:fs/promises';

/** Launch only the explicitly selected local adapter; never inherit team/model keys. */
export async function nativeStudioTransport(env: NodeJS.ProcessEnv = process.env) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Native Studio requires Node 24.');
  const entry = env.EIDOVA_NATIVE_STUDIO_ENTRY;
  if (!entry || !isAbsolute(entry) || !/\.(?:mjs|js)$/.test(entry) || !(await stat(entry).catch(() => null))?.isFile()) {
    throw new Error('Set EIDOVA_NATIVE_STUDIO_ENTRY to the absolute path of the built Studio apps/daemon/bin/od.mjs entry. Run studio:install and studio:start first.');
  }
  const url = new URL(env.EIDOVA_NATIVE_STUDIO_URL ?? 'http://127.0.0.1:7456');
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('EIDOVA_NATIVE_STUDIO_URL must be an HTTP loopback origin without a path, credentials, query or fragment.');
  }
  return new StdioClientTransport({ command: process.execPath, args: [entry, 'mcp', '--daemon-url', url.origin], cwd: dirname(entry), stderr: 'inherit' });
}

async function pages<T>(read: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>): Promise<T[]> {
  const items: T[] = [], seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await read(cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (items.length > 10000 || seen.size >= 100 || (cursor !== undefined && seen.has(cursor))) {
      throw new Error('Studio returned an oversized or repeating MCP catalog.');
    }
    if (cursor !== undefined) seen.add(cursor);
  } while (cursor !== undefined);
  return items;
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;
const resourceOwner = (uri: string): 'design' | 'native' => {
  if (uri.startsWith('design://') || uri.startsWith('ui://widget/')) return 'design';
  if (uri.startsWith('od://') || uri.startsWith('ui://open-design/')) return 'native';
  throw new McpError(ErrorCode.InvalidParams, 'Unsupported Studio resource URI.');
};

/** Keep native tool names and schemas intact, including names used by its MCP App. */
export async function createStudioMcpBridge(designServer: Pick<McpServer, 'connect' | 'close'>, nativeTransport: Transport) {
  const design = new Client({ name: 'eidova-design-bridge', version: '0.2.0' });
  const native = new Client({ name: 'eidova-native-bridge', version: '0.2.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  let server: Server | undefined, closing: Promise<void> | undefined;
  const close = () => closing ??= Promise.resolve().then(async () => {
    await Promise.allSettled([design.close(), native.close(), designServer.close(), server?.close()]);
  });
  try {
    await designServer.connect(b);
    const connected = await Promise.allSettled([design.connect(a), native.connect(nativeTransport)]);
    for (const result of connected) if (result.status === 'rejected') throw result.reason;
    if (!native.getServerCapabilities()?.tools || !native.getServerCapabilities()?.resources) {
      throw new Error('Native Studio must advertise both tools and resources.');
    }
    const bridge = server = new Server({ name: 'Eidova', version: '0.2.0' }, {
      capabilities: { tools: { listChanged: true }, resources: { listChanged: true }, prompts: {}, completions: {} },
      instructions: [design.getInstructions(),
        'Eidova uses its own team backend. Native start_run requires an explicit local CLI agent; AMR/Vela cloud execution is disabled here. Configure model credentials in the native Local BYOK UI or your local CLI, never in MCP arguments. Native project IDs and Eidova team project IDs are separate; use the explicit file sync workflow to exchange files.',
      ].filter(Boolean).join('\n\n'),
    });
    const options = (extra: Extra): RequestOptions => ({ signal: extra.signal, timeout: 300000,
      ...(extra._meta?.progressToken === undefined ? {} : { onprogress: progress => {
        void extra.sendNotification({ method: 'notifications/progress', params: { ...progress, progressToken: extra._meta!.progressToken! } }).catch(() => {});
      } }),
    });
    let tools: Tool[] = [], owners = new Map<string, Client>(), dirty = true;
    let refresh: Promise<void> | undefined;
    const refreshTools = () => refresh ??= (async () => {
      const catalogs = await Promise.all([design, native].map(client => pages(async cursor => {
        const result = await client.listTools(cursor === undefined ? undefined : { cursor });
        return { items: result.tools, nextCursor: result.nextCursor };
      })));
      const nextOwners = new Map<string, Client>();
      catalogs.forEach((catalog, index) => catalog.forEach(tool => {
        if (nextOwners.has(tool.name)) throw new Error(`Duplicate MCP tool name: ${tool.name}`);
        nextOwners.set(tool.name, index === 0 ? design : native);
      }));
      tools = catalogs.flat(); owners = nextOwners; dirty = false;
    })().finally(() => { refresh = undefined; });
    await refreshTools();
    bridge.setRequestHandler(ListToolsRequestSchema, async () => { await refreshTools(); return { tools }; });
    bridge.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
      if (dirty) await refreshTools();
      const target = owners.get(req.params.name);
      if (!target) throw new McpError(ErrorCode.InvalidParams, 'Unknown MCP tool.');
      if (target === native && req.params.name === 'start_run') {
        const agent = req.params.arguments?.agent;
        if (typeof agent !== 'string' || !agent.trim() || ['amr', 'vela'].includes(agent.trim().toLowerCase())) {
          return { isError: true, content: [{ type: 'text', text: 'Choose an explicit local CLI agent from list_agents. Eidova does not start OpenDesign Cloud runs. Local BYOK generation starts in the native Studio UI.' }] };
        }
      }
      // No write retries: a lost response may follow a successful native mutation.
      return target.request(req, CallToolResultSchema, options(extra));
    });
    bridge.setRequestHandler(ListResourcesRequestSchema, async (_req, extra) => {
      const catalogs = await Promise.all([design, native].map(client => pages(async cursor => {
        const result = await client.listResources(cursor === undefined ? undefined : { cursor }, options(extra));
        for (const resource of result.resources) {
          if (resourceOwner(resource.uri) !== (client === design ? 'design' : 'native')) throw new Error('MCP resource namespace collision.');
        }
        return { items: result.resources, nextCursor: result.nextCursor };
      })));
      return { resources: catalogs.flat() };
    });
    bridge.setRequestHandler(ReadResourceRequestSchema, (req, extra) =>
      (resourceOwner(req.params.uri) === 'design' ? design : native).request(req, ReadResourceResultSchema, options(extra)));
    // The pinned native adapter has no templates, prompts or completions.
    bridge.setRequestHandler(ListResourceTemplatesRequestSchema, (req, extra) => design.listResourceTemplates(req.params, options(extra)));
    bridge.setRequestHandler(ListPromptsRequestSchema, (req, extra) => design.request(req, ListPromptsResultSchema, options(extra)));
    bridge.setRequestHandler(GetPromptRequestSchema, (req, extra) => design.request(req, GetPromptResultSchema, options(extra)));
    bridge.setRequestHandler(CompleteRequestSchema, (req, extra) => design.request(req, CompleteResultSchema, options(extra)));
    for (const client of [design, native]) {
      client.setNotificationHandler(ToolListChangedNotificationSchema, () => { dirty = true; void bridge.sendToolListChanged().catch(() => {}); });
      client.setNotificationHandler(ResourceListChangedNotificationSchema, () => { void bridge.sendResourceListChanged().catch(() => {}); });
    }
    bridge.onclose = () => { void close(); };
    return { server: bridge, close };
  } catch (error) { await close(); throw error; }
}
