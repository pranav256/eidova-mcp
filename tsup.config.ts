import { defineConfig } from 'tsup';

// SQLite is a Node builtin that requires the node: prefix.
export default defineConfig({ removeNodeProtocol: false });
