import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp.js';
import { createStore } from './store.js';
import { workspaceId } from './provider.js';
import { loadPrivateArchive } from './private-archive.js';
const archive=process.env.OPEN_DESIGN_PRIVATE_ARCHIVE ? await loadPrivateArchive(process.env.OPEN_DESIGN_PRIVATE_ARCHIVE) : undefined;
const server=createServer(createStore(),workspaceId(process.env.OPEN_DESIGN_WORKSPACE_KEY,true),archive);
await server.connect(new StdioServerTransport());
