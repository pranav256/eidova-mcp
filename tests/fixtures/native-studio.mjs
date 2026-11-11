import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'native-fixture', version: '1' }, { capabilities: { tools: {}, resources: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'native_probe', inputSchema: { type: 'object' } }] }));
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: 'text', text: JSON.stringify({
  credentialInherited: Boolean(process.env.EIDOVA_STUDIO_KEY), args: process.argv.slice(2),
}) }] }));
await server.connect(new StdioServerTransport());
