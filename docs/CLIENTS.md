# Client setup and verification scope

Source defaults to the canonical endpoint `https://eidova-mcp.vercel.app/mcp`. See [rollout requirements](DEPLOYMENT.md).

Eidova supports stateless Streamable HTTP and stdio. The default `/mcp` profile exposes 13 read-only essentials. The explicit `/mcp/full` profile exposes 41 public tools and adds owner rule mutation with a workspace key. The website defaults to core. Choose the profile before connecting; reconnect the client after changing its endpoint. A client connected to `/mcp` should show 13 tools.

Default core endpoint: `https://eidova-mcp.vercel.app/mcp`. Full endpoint: append `/full`. For local HTTP use `http://localhost:3000/mcp` or `/mcp/full`. Configuration formats were checked against official documentation on 2026-11-10. SDK transport and website copy/keyboard tests passed during implementation. On 15 November, Codex CLI 0.169.0 actually discovered 42 tools and completed selection, kit/source retrieval, invalid-component recovery and copy review. Claude Code 2.1.318 accepted a temporary local HTTP configuration and reported Connected; the configuration was removed after the check. **Fresh five-minute setup observations and model-context token traces remain unmeasured.** A connection check does not establish a complete agent workflow.

| Client | HTTP setup | Local stdio setup | Verification |
| --- | --- | --- | --- |
| Codex CLI/app | `codex mcp add eidova --url <endpoint>` | `codex mcp add eidova -- npx -y eidova-mcp --profile core` | Actual full-profile tools/recovery passed in CLI 0.169.0; fresh setup timing/context traces pending |
| Claude Code | `claude mcp add --transport http eidova <endpoint>` | `claude mcp add --transport stdio eidova -- npx -y eidova-mcp --profile core` | Actual HTTP configuration/connection passed in 2.1.318; agent workflow/context traces pending |
| Claude Desktop | Settings → Connectors → add a custom remote connector; availability depends on the account | `claude_desktop_config.json`, `mcpServers` with `command: "npx"`, `args: ["-y", "eidova-mcp", "--profile", "core"]` | Official format; host walkthrough pending |
| Cursor | `.cursor/mcp.json`, `mcpServers` with `url` | Same file with `command: "npx"`, `args: ["-y", "eidova-mcp", "--profile", "core"]` | Official format; host walkthrough pending |
| VS Code | `.vscode/mcp.json`, `servers` with `type: "http"` and `url` | Same file with `type: "stdio"`, `command: "npx"`, `args: ["-y", "eidova-mcp", "--profile", "core"]` | Official format; host walkthrough pending |

Claude remote connectors require reachable HTTPS; your machine's `localhost` is not reachable from the remote connector service. Local-only Claude Desktop uses stdio, not an HTTP URL inserted into its stdio configuration.

Stdio starts its own loopback registry; set `EIDOVA_BASE_URL` only when using a separately running service with matching assets and state.

## Cursor HTTP

Downloadable configurations and the project `AGENTS.md` starter are listed in [Agent setup](AGENT-SETUP.md). Merge examples into existing configuration; keep other servers and private settings.

```json
{"mcpServers":{"eidova":{"url":"http://localhost:3000/mcp"}}}
```

## VS Code HTTP

```json
{"servers":{"eidova":{"type":"http","url":"http://localhost:3000/mcp"}}}
```

## Claude Desktop local

```json
{
  "mcpServers": {
    "eidova": {
      "command": "npx",
      "args": ["-y", "eidova-mcp", "--profile", "core"]
    }
  }
}
```

Or for a local development checkout:

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
