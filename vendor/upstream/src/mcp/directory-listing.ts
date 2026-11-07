import type { McpServer, RegisteredTool, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";
import { MCP_TOOL_NAMES, type McpToolName } from "./tool-names";

// The hosted connector that Claude and ChatGPT list in their directories must
// follow their directory policies: a tool description says what the tool does
// and when it applies, never how the model should behave or which other tools
// to call first, and no tool collects conversation data for analytics. The npm
// and API-key paths keep the full workflow text. [BD-389]

/** Server instructions for a directory-listed connection: what each tool family does, nothing more. */
export const DIRECTORY_INSTRUCTIONS = `# Better Design

Better Design provides design systems, design principles and UI review checks for building interfaces.

- find-design-system searches the catalog. preview-design-system shows one system. get-design-system-kit returns its install command or CSS kit.
- create-design-system generates a custom system. get-design-system-status reports its progress.
- get-inspiration returns real references from shipped apps: product screens found by flow name and App Store screenshot sets as images, and flows rebuilt as HTML beside their screenshots.
- get-ui-principle, get-ux-principle and the platform guides return design principles and best practices on a topic.
- plan-video, cut-screen-recording and render-video-frames plan a product film, cut a recording into beats and render frames for review.
- get-review-rules, check-comprehension, inspect-spacing and review-dashboard-structure check finished interfaces.
- find-icon-library, find-icons and install-icons return icon component files.
- make-sales-page and make-social-image publish a sales page with its one-page PDF, or a social image, for one account.`;

/** One plain description per tool, used in place of the workflow text on a directory-listed connection. */
export const DIRECTORY_TOOL_DESCRIPTIONS = {
  "get-ui-principle":
    "Returns Better Design's visual design principles on a topic: hierarchy, spacing and layout, typography, color, depth, images, accessibility, polish and animation. Pass `topic` for one principle, `query` to search by situation, or nothing for the index of topics. Use it when the user wants to know how an interface should look. `maxTokens` limits the length of the response.",
  "get-ux-principle":
    "Returns Better Design's UX principles on a topic: forms, navigation, notifications, errors, dialogs, search, onboarding, microcopy, positioning, commerce flows, behavior change and cognitive laws. Pass `topic` for one principle, `query` to search by situation, or nothing for the index of topics. Use it when the user wants to know how an interface should behave or what its copy should say. `maxTokens` limits the length of the response.",
  "get-sales-principle":
    "Returns Better Design's sales principles: handling objections, preparing a champion and mapping features to value. Pass `topic` for one principle, `query` to search by situation, or nothing for the index of topics. Use it when the user prepares a sales conversation or writes a sales asset.",
  "get-react-native-guide":
    "Returns best practices and TypeScript recipes for React Native and Expo apps: setup, components and styling, Expo Router, data and authentication, native UI, animation, notifications, EAS builds, testing and store submission. It includes the official Expo skills (MIT) under topics that start with `official-`. Pass `topic`, `query`, or nothing for the index of topics.",
  "get-three-js-guide":
    "Returns best practices and code recipes for Three.js and React Three Fiber scenes: fundamentals, materials, lights, models, particles, physics, performance, postprocessing, WebGPU, shaders and auditing an existing scene. Pass `topic`, `query`, or nothing for the index of topics.",
  "get-shopify-guide":
    "Returns Better Design's best practices for Shopify Liquid and Online Store 2.0 themes: theme architecture, Liquid objects and filters, section schema, localization, accessibility, performance and Theme Check validation, with links to Shopify's documentation. Pass `topic`, `query`, or nothing for the index of topics.",
  "get-motion-guide":
    "Returns best practices and components for building a product demo or promo video in code with Remotion: the brief, brand and motion tokens, format profiles, captions, pacing, rendering and review. `scaffold: true` returns a complete Remotion starter project. `component` returns one video component's source and install command, and no arguments lists the components. Better Design wrote every component and serves them from its registry.",
  "plan-video":
    "Plans a product film from a one-line brief: the beats, one video component per beat with alternatives, the frame budget, one install command, and a Remotion TransitionSeries file that renders with the components' demo copy. It infers the kind of film, such as a product launch, changelog, onboarding film or App Store preview, and takes a length and a format.",
  "cut-screen-recording":
    "Cuts a screen recording into beats for a Remotion film. The first call returns a script that measures the recording with Remotion's bundled ffmpeg. The second call takes those measurements and returns the browser chrome to crop, the second each beat opens on, where the camera points, and the Remotion code. The server never receives the recording itself.",
  "render-video-frames":
    "Returns the Remotion commands that render chosen frames of a composition as images, with a checklist for reviewing them. On a connection that runs on the user's machine, it renders the frames in the given project and returns the images.",
  "get-swiftui-guide":
    "Returns best practices and Swift examples for SwiftUI interfaces: layout and view composition, animation and gestures, Metal shader effects and the platform APIs they use. Pass `topic`, `query`, or nothing for the index of topics.",
  "get-review-rules":
    "Returns Better Design's review rules for UI code, each with a severity: accessibility (WCAG 2.1), visual design, animation, content, comprehension and AI features. Pass `category` for one group. Use it when the user wants UI code reviewed. `maxTokens` limits the length of the response. The rules are read against source, so a clean self-review is not visual approval.",
  "get-store-listing-guide":
    "Returns how an app's App Store listing lives as files in the project: the text in `store.config.json`, a screenshot folder per language and device, Apple's limit for every field and the screenshot sizes each device takes. It names the `npx better-design listing` commands that show a live App Store preview and pull from and push to App Store Connect on the user's machine. It reads and writes nothing itself.",
  "get-widget-guide":
    "Returns a build brief for an interactive widget on an article or landing page, such as a calculator, estimator, converter, quiz or checklist. Pass what is known about the widget. The response lists any details still missing, and once the details are complete it returns the brief with rules for calculation accuracy, form behavior, search visibility, performance and privacy. With `format: \"page-family\"` it returns a brief for a family of pages built from the rows of a dataset, such as a CSV or a database table.",
  "check-comprehension":
    "Checks interface copy for clarity with three tests: whether a person outside the team understands it, whether the screen can be explained in 15 seconds, and whether a screenshot alone says what the screen does. Pass the headline, body and action labels, or the markup. Returns each finding with a severity and a suggested fix. `knownTerms` lists words the audience already knows. `surface: \"slide\"` adds a density test for slides. It reads text only, not screenshots or visual hierarchy, so a pass is not visual approval. Better Design runs the checks itself and calls no other API.",
  "review-dashboard-structure":
    "Reviews the source of a dashboard or overview page against a fixed rubric: complete source, unchanged data, supported claims, hierarchy, scan order and use of the installed Sidebar, StatCard and Table components. Pass the page source, the data fixture, its interpretation and the component sources. Returns PASS, or FAIL with every finding as a tool error.",
  "finalize-dashboard-review":
    "Captures a deployed dashboard at a public HTTPS URL in Better Design's own browser at 390, 1440 and 1728 pixels wide, compares it with the submitted source, data and components, and returns a receipt tied to that deployment. The receipt reports hierarchy, component, copy and spacing faults and any hidden data fields.",
  "find-icon-library":
    "Searches icon libraries by style, mood or use case, such as \"minimal clean professional\", and returns the closest matches with a note on each library's style.",
  "find-icons":
    "Searches one icon library for icons by concept and returns icon names that exist in that library. A single noun, such as \"inbox\", ranks best. `variant` lists the names that have that variant first. Takes a `libraryId` from find-icon-library.",
  "install-icons":
    "Fetches the named icons from the public Iconify API and returns one React component file per icon, plus an index.ts barrel, as text for the caller to save. It writes no files. Takes a `libraryId` and icon names from find-icons.",
  "detect-icon-library":
    "Reads the contents of the `.library.json` file that an earlier icon install left in a project and returns the icon library the project uses and the icons it has installed, or reports that none is recorded.",
  "find-design-system":
    "Searches Better Design's catalog of design systems by industry, personality or a description of the interface, and returns ranked matches with a preview link for each. Use it when the user wants a design system or a visual direction for an app, site, page, dashboard or presentation.",
  "get-design-system-kit":
    "Returns the build kit for a catalog design system or a generated project. `target` picks the format: `react` returns one shadcn install command for every component and the tokens, `html` returns framework-free token and component CSS for inline canvases, `react-native` and `swiftui` return mobile kits, `shopify` returns Liquid theme files, `dtcg` returns a W3C Design Tokens document, and `store-screenshots` returns slide files and a render script for App Store and Google Play screenshots. `component` narrows the React install to one component.",
  "get-inspiration":
    "Returns real reference designs from Better Design's library. `type` picks the collection: `app-screens`, product screens of shipped apps as images, found by words in `query` such as \"settings\" and an optional `platform`; `html-flows`, shipped web flows rebuilt as HTML, found by words in `query`; or `app-store-screenshots`, App Store screenshot sets as images, narrowed by an App Store `category`. `limit` sets how many come back.",
  "change-design-system":
    "Changes a design system the user already generated, such as one component, the icons or a style, through the same agent as the project chat on the website. The project's install command and preview then serve the new version; earlier versions stay in the project's history. Each call uses one credit from the user's Better Design account.",
  "create-design-system":
    "Starts generating a custom design system from a description of the product and its look, and returns the project id and project URL at once. Generation runs in the background and typically takes 1 to 3 minutes. get-design-system-status reports progress and returns the install command when it finishes. `baseDesignSystemId` starts from a catalog system the user picked, `userConfirmedCustom` records that the user chose fully custom, and `brandCss` builds from an existing brand token sheet, such as the output of extract-design-system. With none of the three, it generates nothing and returns the top catalog matches to show the user. Each call uses one credit from the user's Better Design account. Anyone with the registry or preview URL can view the generated source and previews.",
  "get-design-system-status":
    "Reports the progress of a design system started with create-design-system. While generation runs it returns the current stage. When generation finishes it returns the live preview URL and the `npx shadcn add` install command.",
  "preview-design-system":
    "Returns a visual preview of a catalog design system: its palette, typography, buttons, card, input and badge, with a link to the full live showcase. Takes an id from find-design-system.",
  "get-design-config":
    "Returns the design config saved on a generated project: exact color tokens, radius, fonts, icon library and layout density, including values the user tuned on the project page.",
  "set-design-config":
    "Saves exact design token values (colors, radius, fonts, icon library and layout density) onto a generated project, merged over its current config. The saved values replace the earlier ones, and anyone with the project's config URL can read them.",
  "get-jig-guide":
    "Returns setup code for a jig. Kind `tune-in-place` returns a control panel to wire to taste-based values in the interface being built, such as animation timing, gradients or shadows, so the user can tune them by eye. Kind `standalone-tool` returns the Toolcraft starter kit (MIT) for a reusable custom tool, such as a generator or a shader playground. Kind `variant-canvas` returns a canvas that lays several versions of one component or screen side by side in the user's own app, so the user compares, tunes and picks one. `framework` picks React, vanilla JavaScript or React Native.",
  "extract-design-system":
    "Reads design tokens from CSS the caller passes in and returns the semantic palette, radius, fonts and shadow scale, with a token sheet that converts every color to `oklch()`. It accepts hex, rgb, hsl, named and oklch colors across `:root`, `.dark` and `@theme` blocks. `sources` merges several inputs, including a sample of computed styles from a live page. The server cannot read files, so the caller passes the text.",
  "extract-from-url":
    "Fetches a public web page, reads its stylesheets and renders it in a headless browser to sample the colors, fonts and radii of its body, headings, links, buttons, inputs and cards, then returns the brand as an oklch token sheet. It reads the page the way a browser does and calls no other API. A call takes about 10 to 45 seconds.",
  "get-illustration-guide":
    "Returns Better Design's guide for figures that explain a technical idea as an isometric drawing of a small machine: choosing the object, the parts, the camera and depth order, lines, the card and motion, the drawing kit and the review. Pass `topic`, `query`, or nothing for the index of topics.",
  "review-illustration":
    "Renders an SVG illustration in a browser and returns its visible faults against Better Design's illustration principles, such as open shapes, floating parts, inconsistent light and contents outside their container. Pass the SVG and what it is meant to show, and `style` \"isometric\" for a technical figure. Pass the returned `reviewToken` back to review the same drawing again. SVG that carries scripts, event handlers or remote references is refused.",
  "inspect-spacing":
    "Measures spacing in a rendered interface from DOM geometry and returns the spacing faults with a correction for each. The first call returns a read-only capture script to run in the page. The second call takes the captured states, such as viewport widths or hover and focus states, and returns the measurements and findings. At desktop widths it also checks the layout against one density: compact, comfortable or spacious. It measures geometry only, so a clean result is not visual approval.",
  "build-feature-map":
    "Drafts a map of a product's features and flows from its repository file list and returns it as JSON for .better-design/feature-map.json. Routes become screens, nested routes become flows, and components, API routes and hooks join the step they share a name with. Pass every path from `git ls-files` as `files`.",
  "read-feature-map":
    "Returns the flows in a feature map that match a flow name, a feature or a file path, with the screen, route, components and data files of every step. Pass the contents of .better-design/feature-map.json as `map`. With no filter it lists every flow and the Main Quest, each initiative with what serves it. Pass `planned` to check new work against the Main Quest before building it.",
  "update-feature-map":
    "Applies one change to a feature map, such as adding, renaming or removing a feature or flow, setting the Main Quest and its initiatives, or linking a flow to an initiative, and returns the updated map.",
  "get-team-rules":
    "Returns the Markdown rules the user's Better Design team wrote for how their product is built and reviewed. Given a client project, a screen and the parts it uses, it adds only what that screen needs: the project's guidelines, the rules for those parts, the brand-wide bans and the specs saved on the screen. When the team has no rules yet, it returns an outline and the steps to draft them with the person.",
  "propose-team-rule":
    "Keeps one rule the user's agent proposed from the user's correction, with why it exists and where it applies. The rule waits on the user's Better Design Team rules page, and no agent follows it until the user approves it there.",
  "set-team-rules":
    "Saves the Markdown rules the user approved as their Better Design team's rules, or, given a client project, one piece of it: its guidelines, a use, never or pairing rule for one part, a brand-wide ban, or a spec on a screen. It refuses to replace different saved text unless the user agreed.",
  "review-ui-code":
    "Reviews React component source and CSS and returns findings with line numbers and fixes: native elements that bypass the installed design system, undefined font variables, hardcoded colors and raw palette classes, generated-UI patterns, and WCAG faults such as missing alt text or accessible names. The same input always returns the same findings.",
  "send-feedback":
    "Sends Better Design a report of a bug, a missing feature or wrong output in its tools or API: the kind of problem, the tool or endpoint, a one-sentence summary, and optionally what was tried, expected and returned. A person reads every report. It is available only on connections that use a Better Design API key.",
  "confirm-claim":
    "Moves this Better Design API key onto the account that opened its claim link, when the person pastes the code the claim page showed. It returns the account the key now belongs to. It is available only on connections that use a Better Design API key.",
  "open-design-panel":
    "Opens the Better Design panel in ChatGPT, from the sidebar or beside a conversation. It shows the checks the person's agent ran lately with what failed, their own design systems and the catalog, and sends the step they pick into the chat.",
  "make-sales-page":
    "Makes a hosted sales page for one account, with the same page as a one-page PDF, in a catalog design system, from the account's company, website, offer and call-to-action link. Better Design writes the words left out and draws the visual. It returns the page, PNG and PDF links at once, and they show the page when it is ready. Each call uses 3 credits from the user's Better Design account, and it needs a Better Design account with a verified email.",
  "make-social-image":
    "Makes a LinkedIn-size social image for one account, in a catalog design system, from the account's company, website, offer and call-to-action link. Better Design writes the headline when it is left out and draws the image. It returns the page and PNG links at once, and they show the image when it is ready. Each call uses 2 credits from the user's Better Design account, and it needs a Better Design account with a verified email.",
  "create-figma-prototype":
    "Reads a frame from the Figma file that has the Better Design plugin open and returns it as one HTML page built from the design system's components, with a report of every layer that could not be mapped. Name a frame, or omit the name to use the current selection.",
} as const satisfies Record<McpToolName, string>;

// A tool with no plain description must not reach a directory connection with
// its workflow text, so an unknown name stops the server from starting.
function directoryDescription(name: string): string {
  const tool = MCP_TOOL_NAMES.find((known) => known === name);
  if (tool === undefined) {
    throw new Error(`Tool "${name}" is not in MCP_TOOL_NAMES, so it has no directory description.`);
  }
  return DIRECTORY_TOOL_DESCRIPTIONS[tool];
}

type ToolFieldMap = Record<string, AnySchema>;

interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema?: AnySchema | ToolFieldMap;
  annotations?: ToolAnnotations;
}

type RegisterTool = (
  name: string,
  config: ToolConfig,
  handler: ToolCallback<ToolFieldMap>,
) => RegisteredTool;

// The analytics-only intent field the workflow tools carry (CONTEXT_ARG). No
// tool reads it to do its work, so a directory-listed tool does not ask for it.
function withoutContextArg(schema: ToolConfig["inputSchema"]): ToolConfig["inputSchema"] {
  const asksForContext = schema instanceof z.ZodObject && schema.keyof().options.includes("context");
  return asksForContext ? schema.omit({ context: true }) : schema;
}

/**
 * Makes every tool this server registers from now on carry its plain directory
 * description and its title as an annotation, and drop the analytics-only
 * `context` field. Call it after `declareAdvertisedSchemaDialect`, so this
 * wrapper strips the field before the dialect wrapper tags the schema: `omit`
 * returns a new schema without the tag.
 */
export function declareDirectoryListing(server: McpServer): void {
  // SAFETY: the wrapper only forwards its arguments, so it needs the method's
  // shared contract, not the per-tool generics TypeScript cannot carry through.
  const register = server.registerTool.bind(server) as RegisterTool;

  const registerForDirectory: RegisterTool = (name, config, handler) =>
    register(
      name,
      {
        ...config,
        description: directoryDescription(name),
        inputSchema: withoutContextArg(config.inputSchema),
        // The directory reads the listing name from annotations.title, not the top-level title.
        annotations: { ...config.annotations, title: config.annotations?.title ?? config.title },
      },
      handler,
    );

  // SAFETY: the wrapper registers the same tool with a shorter description and
  // one optional field fewer, which no handler needs.
  server.registerTool = registerForDirectory as McpServer["registerTool"];
}
