import {
  SPACING_INSPECTION_WIDGET_HTML,
  SPACING_INSPECTION_WIDGET_URI,
} from "../spacing-inspection-html";
import type { RegisterToolDeps } from "./shared";
import { WIDGET_APP_DOMAIN } from "./shared";

const INSPECTION_UI_META = {
  ui: {
    prefersBorder: true,
    domain: WIDGET_APP_DOMAIN,
  },
} as const;

/**
 * Publishes the spacing overlay as an MCP resource, so a host can render the
 * annotated measurements instead of reading them as text.
 */
export function registerInspectionResource({ server }: RegisterToolDeps): void {
  server.registerResource(
    "spacing-inspection-widget",
    SPACING_INSPECTION_WIDGET_URI,
    {
      mimeType: "text/html;profile=mcp-app",
      _meta: INSPECTION_UI_META,
    },
    async () => ({
      contents: [{
        uri: SPACING_INSPECTION_WIDGET_URI,
        mimeType: "text/html;profile=mcp-app",
        text: SPACING_INSPECTION_WIDGET_HTML,
        _meta: INSPECTION_UI_META,
      }],
    }),
  );
}
