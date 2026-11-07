import {
  DS_PREVIEW_WIDGET_HTML,
  DS_PREVIEW_WIDGET_URI,
} from "../preview-html";
import type { RegisterToolDeps } from "./shared";
import {
  APP_BASE_URL,
  WIDGET_APP_DOMAIN,
  WIDGET_RESOURCE_DOMAINS,
} from "./shared";

// Widget _meta, shared by the resources/list registration AND the read result
// (both must carry it). Keep the widget self-contained: it may load the preview
// screenshot and fonts, but it must not advertise frame domains or render a
// nested frame. Two CSP surfaces remain for cross-host compatibility:
//  - `ui.csp` (camelCase): the standard MCP Apps CSP (Claude + new ChatGPT).
//  - `openai/widgetCSP` (snake_case): the legacy ChatGPT compatibility key.
//    redirect_domains allowlists window.openai.openExternal targets. [BD-316]
const PREVIEW_UI_META = {
  ui: {
    prefersBorder: true,
    csp: {
      connectDomains: [APP_BASE_URL, ...WIDGET_RESOURCE_DOMAINS],
      resourceDomains: [APP_BASE_URL, ...WIDGET_RESOURCE_DOMAINS],
    },
    domain: WIDGET_APP_DOMAIN,
  },
  "openai/widgetCSP": {
    connect_domains: [APP_BASE_URL, ...WIDGET_RESOURCE_DOMAINS],
    resource_domains: [APP_BASE_URL, ...WIDGET_RESOURCE_DOMAINS],
    redirect_domains: [APP_BASE_URL],
  },
} as const;

export function registerPreviewResource({ server }: RegisterToolDeps): void {
  server.registerResource(
    "ds-preview-widget",
    DS_PREVIEW_WIDGET_URI,
    {
      mimeType: "text/html;profile=mcp-app",
      _meta: PREVIEW_UI_META,
    },
    async () => ({
      contents: [
        {
          uri: DS_PREVIEW_WIDGET_URI,
          mimeType: "text/html;profile=mcp-app",
          text: DS_PREVIEW_WIDGET_HTML,
          _meta: PREVIEW_UI_META,
        },
      ],
    }),
  );
}
