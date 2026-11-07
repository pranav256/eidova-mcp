import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp.js';
import { createStore } from './store.js';
import { workspaceId } from './provider.js';
const server=createServer(createStore(),workspaceId(process.env.OPEN_DESIGN_WORKSPACE_KEY,true));
await server.connect(new StdioServerTransport());
