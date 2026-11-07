import { app } from './app.js';
const port=Number(process.env.PORT??3000);
app.listen(port,()=>process.stderr.write(`Open Design MCP listening on http://localhost:${port}/mcp\n`));
