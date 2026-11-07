import { z } from "zod";

import { storeListingGuide } from "../store-listing";
import { CONTEXT_ARG, READ_ONLY_TOOL_ANNOTATIONS, type RegisterToolDeps } from "./shared";

/** `get-store-listing-guide` [BD-1167]: how the App Store listing lives in the project, and the commands that preview and push it. */
export function registerStoreListingTools({ server, tracked }: RegisterToolDeps): void {
  server.registerTool(
    "get-store-listing-guide",
    {
      title: "Get the App Store Listing Guide",
      description:
        "Use this when the user wants to write, edit, translate, preview or publish an app's App Store listing: name, subtitle, promotional text, description, keywords, what's new, URLs and screenshots per device and language. Returns the file format the listing keeps in the project (`store.config.json`, the file Expo's metadata command reads, plus a screenshot folder per language and device), Apple's limit for every field, the screenshot sizes each device folder accepts, and the `npx better-design listing` commands that show a live App Store preview, file screenshots by size, and pull from and push to App Store Connect with the user's own key.",
      inputSchema: z.object({ context: CONTEXT_ARG }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ context }) =>
      tracked("get-store-listing-guide", { context }, async () => ({
        content: [{ type: "text" as const, text: storeListingGuide() }],
      })),
  );
}
