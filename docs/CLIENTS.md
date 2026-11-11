# Client setup and verification scope

The candidate supports stateless Streamable HTTP and stdio. Core has 13 read-only tools; full has 42 public tools and adds owner rule mutation with a workspace key. Choose the profile before connecting. Use `http://localhost:3000/mcp/core` or `/mcp` for a local HTTP server.

The existing hosted `/mcp` is the previous release. The candidate hosted `/mcp/core` in `server.json` must be activated and checked before publication. Configuration formats were checked against official documentation on 2026-11-10. SDK transport and website copy/keyboard tests passed during implementation; **actual client-host walkthroughs and model token traces remain untested**. CLI presence or an example is not a successful host walkthrough.

| Client | HTTP setup | Local stdio setup | Verification |
| --- | --- | --- | --- |
| Codex CLI/app | `codex mcp add eidova --url <endpoint>` | `codex mcp add eidova -- node /absolute/path/dist/stdio.js --profile core` | Official format; host walkthrough pending |
| Claude Code | `claude mcp add --transport http eidova <endpoint>` | `claude mcp add --transport stdio eidova -- node /absolute/path/dist/stdio.js --profile core` | Official format; host walkthrough pending |
| Claude Desktop | Settings → Connectors → add a custom remote connector; availability depends on the account | `claude_desktop_config.json`, `mcpServers` with `command`/`args` | Official format; host walkthrough pending |
| Cursor | `.cursor/mcp.json`, `mcpServers` with `url` | Same file with `command`/`args` | Official format; host walkthrough pending |
| VS Code | `.vscode/mcp.json`, `servers` with `type: "http"` and `url` | Same file with `type: "stdio"`, `command`/`args` | Official format; host walkthrough pending |

Claude remote connectors require reachable HTTPS; your machine's `localhost` is not reachable from the remote connector service. Local-only Claude Desktop uses stdio, not an HTTP URL inserted into its stdio configuration.

## Cursor HTTP

```json
{"mcpServers":{"eidova":{"url":"http://localhost:3000/mcp/core"}}}
```

## VS Code HTTP

```json
{"servers":{"eidova":{"type":"http","url":"http://localhost:3000/mcp/core"}}}
```

## Claude Desktop local

```json
{
  "mcpServers": {
    "eidova": {
      "command": "node",
      "args": ["D:\\Projects\\eidova\\eidova-mcp\\dist\\stdio.js", "--profile", "core"]
    }
  }
}
```

Use your actual absolute path and a Node executable the client can resolve. Assets resolve beside the executable; the working directory controls default local state. The service never edits client configuration implicitly.

For persistence choose full and use the client's secure credential mechanism to send a workspace bearer key. Do not put keys in URLs. Public use needs no key. [Deployment](DEPLOYMENT.md) explains storage, key loss and hosting limits.

Before release, record each host's version, transport, profile, first-task time, invalid-input recovery and discovery/context trace. Include a host using plain tools without resources or deferred loading. The SDK benchmark demonstrates that path but does not certify a named host.

References: [Codex](https://developers.openai.com/codex/mcp), [Claude Code](https://code.claude.com/docs/en/mcp), [Claude connectors](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp), [Cursor](https://cursor.com/docs/context/mcp), [VS Code](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).
