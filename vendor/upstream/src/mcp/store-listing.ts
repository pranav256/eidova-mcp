/**
 * The App Store listing as files in the user's project [BD-1167]: the fields,
 * Apple's limits on them, and the screenshot sizes each device folder takes.
 * The `better-design listing` command and the `get-store-listing-guide` tool
 * both read these tables, so the preview, the push and the agent's guide never
 * disagree about a limit.
 */

/** A text field of one locale, named as `store.config.json` names it. */
export type ListingField =
  | "title"
  | "subtitle"
  | "promoText"
  | "description"
  | "keywords"
  | "releaseNotes"
  | "supportUrl"
  | "marketingUrl"
  | "privacyPolicyUrl";

/** Narrows a string, such as a command-line argument, to a listing field. */
export function isListingField(value: string): value is ListingField {
  return LISTING_FIELD_RULES.some((rule) => rule.field === value);
}

/** One field's rule, read from Apple's App Store Connect help on 14 October 2026. */
export interface ListingFieldRule {
  field: ListingField;
  label: string;
  /** Maximum length, counted in `unit`. URLs have none. */
  max?: number;
  min?: number;
  /** Keywords count bytes, because Apple counts them in bytes. */
  unit?: "characters" | "bytes";
  /** App Store Connect refuses to submit a version without it. */
  required?: boolean;
  url?: boolean;
}

/**
 * Apple's limits, from "App information" and "Platform version information"
 * in the App Store Connect help, read on 14 October 2026.
 */
export const LISTING_FIELD_RULES: readonly ListingFieldRule[] = [
  { field: "title", label: "Name", min: 2, max: 30, unit: "characters", required: true },
  { field: "subtitle", label: "Subtitle", max: 30, unit: "characters" },
  { field: "promoText", label: "Promotional text", max: 170, unit: "characters" },
  { field: "description", label: "Description", max: 4000, unit: "characters", required: true },
  { field: "keywords", label: "Keywords", max: 100, unit: "bytes", required: true },
  { field: "releaseNotes", label: "What's new", max: 4000, unit: "characters" },
  { field: "supportUrl", label: "Support URL", url: true, required: true },
  { field: "marketingUrl", label: "Marketing URL", url: true },
  { field: "privacyPolicyUrl", label: "Privacy policy URL", url: true, required: true },
];

/** The text of one locale. Keywords are joined with commas, the form Apple stores. */
export type ListingLocale = Partial<Record<ListingField, string>>;

/** One problem with a field, worded for the person who must fix it. */
export interface ListingIssue {
  locale: string;
  field: ListingField;
  /** `error` blocks a push; `warning` does not. */
  level: "error" | "warning";
  message: string;
}

/** Counts a value the way Apple counts it for that field. */
export function measureField(rule: ListingFieldRule, value: string): number {
  return rule.unit === "bytes" ? new TextEncoder().encode(value).length : [...value].length;
}

/** Checks one locale against Apple's limits. */
export function checkListingLocale(locale: string, fields: ListingLocale): ListingIssue[] {
  const issues: ListingIssue[] = [];
  for (const rule of LISTING_FIELD_RULES) {
    const value = (fields[rule.field] ?? "").trim();
    const issue = (level: ListingIssue["level"], message: string) =>
      issues.push({ locale, field: rule.field, level, message });
    if (!value) {
      if (rule.required) issue("error", `${rule.label} is empty. App Store Connect needs it before review.`);
      continue;
    }
    if (rule.url && !/^https?:\/\/\S+\.\S+/.test(value)) {
      issue("error", `${rule.label} is not a web address. Start it with https://.`);
    }
    const length = measureField(rule, value);
    if (rule.max !== undefined && length > rule.max) {
      issue("error", `${rule.label} is ${length - rule.max} ${rule.unit} over Apple's limit of ${rule.max}.`);
    }
    if (rule.min !== undefined && length < rule.min) {
      issue("error", `${rule.label} needs at least ${rule.min} ${rule.unit}.`);
    }
  }
  const keywords = (fields.keywords ?? "").split(",").map((word) => word.trim()).filter(Boolean);
  const short = keywords.filter((word) => [...word].length <= 2);
  if (short.length) {
    issues.push({
      locale,
      field: "keywords",
      level: "warning",
      message: `Apple ignores keywords of two characters or fewer: ${short.join(", ")}.`,
    });
  }
  return issues;
}

/** One device folder under `store-listing/screenshots/<locale>/`. */
export interface ScreenshotDevice {
  /** The folder name. */
  id: string;
  label: string;
  family: "iphone" | "duo" | "ipad";
  /** Portrait sizes. The landscape size of each is accepted too. */
  sizes: readonly (readonly [number, number])[];
  /** Apple refuses review without this device's screenshots. */
  required?: string;
}

/**
 * The devices the listing takes screenshots for, from Apple's "Screenshot
 * specifications" page read on 14 October 2026. Older sizes are left out
 * because App Store Connect scales them down from these.
 *
 * This table files a screenshot before any App Store Connect key exists. At
 * push time Apple's reference data wins: the push asks it which placement
 * group takes each size, and stops on a size it no longer lists.
 */
export const SCREENSHOT_DEVICES: readonly ScreenshotDevice[] = [
  { id: "iphone-6.9", label: "iPhone 6.9 inch", family: "iphone", sizes: [[1320, 2868], [1290, 2796], [1260, 2736]] },
  { id: "iphone-6.5", label: "iPhone 6.5 inch", family: "iphone", sizes: [[1284, 2778], [1242, 2688]] },
  {
    id: "iphone-6.3",
    label: "iPhone 6.3 inch",
    family: "iphone",
    sizes: [[1206, 2622], [1179, 2556]],
    required: "Apple asks for at least one iPhone 6.3 inch screenshot.",
  },
  { id: "iphone-6.1", label: "iPhone 6.1 inch", family: "iphone", sizes: [[1170, 2532], [1125, 2436], [1080, 2340]] },
  { id: "iphone-5.5", label: "iPhone 5.5 inch", family: "iphone", sizes: [[1242, 2208]] },
  // iPhone Duo folds, so it has a screenshot size per display. Apple will require them
  // from April 2027 for apps built with the iOS 27.1 SDK or later.
  { id: "iphone-duo-inner", label: "iPhone Duo inner display", family: "duo", sizes: [[2007, 2853]] },
  { id: "iphone-duo-outer", label: "iPhone Duo outer display", family: "duo", sizes: [[1398, 2034]] },
  {
    id: "ipad-13",
    label: "iPad 13 inch",
    family: "ipad",
    sizes: [[2064, 2752], [2048, 2732]],
    required: "An app that runs on iPad needs at least one iPad 13 inch screenshot.",
  },
  { id: "ipad-11", label: "iPad 11 inch", family: "ipad", sizes: [[1668, 2420], [1668, 2388], [1640, 2360], [1488, 2266]] },
];

/** Sizes Apple still lists that the listing refuses, with the size to use instead. */
const OLDER_SIZES: readonly { size: readonly [number, number]; label: string; use: string }[] = [
  { size: [750, 1334], label: "iPhone 4.7 inch", use: "iphone-6.3" },
  { size: [640, 1136], label: "iPhone 4 inch", use: "iphone-6.3" },
  { size: [640, 960], label: "iPhone 3.5 inch", use: "iphone-6.3" },
  { size: [1668, 2224], label: "iPad 10.5 inch", use: "ipad-13" },
  { size: [1536, 2048], label: "iPad 9.7 inch", use: "ipad-13" },
];

/** Apple's per-device ceiling for one locale. */
export const MAX_SCREENSHOTS_PER_DEVICE = 10;

/** What a screenshot file is, read from its header. */
export interface ImageFacts {
  width: number;
  height: number;
  format: "png" | "jpeg" | "other";
  /** An alpha channel or a transparency chunk, which Apple refuses. */
  alpha: boolean;
}

/** Where a screenshot belongs, or why it belongs nowhere. */
export type ScreenshotPlacement =
  | { ok: true; device: ScreenshotDevice; orientation: "portrait" | "landscape" }
  | { ok: false; reason: string };

const matches = (facts: ImageFacts, [w, h]: readonly [number, number]) =>
  (facts.width === w && facts.height === h) || (facts.width === h && facts.height === w);

/** Files one image under its device by pixel size, or says why it cannot be filed. */
export function placeScreenshot(facts: ImageFacts): ScreenshotPlacement {
  const size = `${facts.width} x ${facts.height}`;
  if (facts.format === "other") {
    return { ok: false, reason: "App Store Connect takes PNG or JPEG files only." };
  }
  if (facts.alpha) {
    return {
      ok: false,
      reason: `This ${facts.format.toUpperCase()} has a transparency layer, which App Store Connect refuses. Export it without alpha.`,
    };
  }
  for (const device of SCREENSHOT_DEVICES) {
    for (const accepted of device.sizes) {
      if (matches(facts, accepted)) {
        return { ok: true, device, orientation: facts.width < facts.height ? "portrait" : "landscape" };
      }
    }
  }
  const older = OLDER_SIZES.find((entry) => matches(facts, entry.size));
  if (older) {
    return {
      ok: false,
      reason: `${size} is the ${older.label} size. Apple scales that from a larger set, so make it at one of the ${labelOf(older.use)} sizes: ${sizeList(older.use)}.`,
    };
  }
  const nearest = nearestDevice(facts);
  return {
    ok: false,
    reason: `${size} is not a size App Store Connect accepts. The closest device is ${nearest.label}: ${sizeList(nearest.id)}.`,
  };
}

function labelOf(id: string): string {
  return SCREENSHOT_DEVICES.find((device) => device.id === id)?.label ?? id;
}

function sizeList(id: string): string {
  const device = SCREENSHOT_DEVICES.find((entry) => entry.id === id);
  return (device?.sizes ?? []).map(([w, h]) => `${w} x ${h}`).join(", ");
}

function nearestDevice(facts: ImageFacts): ScreenshotDevice {
  const ratio = Math.min(facts.width, facts.height) / Math.max(facts.width, facts.height);
  let best = SCREENSHOT_DEVICES[0]!;
  let bestDistance = Infinity;
  for (const device of SCREENSHOT_DEVICES) {
    for (const [w, h] of device.sizes) {
      const distance = Math.abs(w / h - ratio) * 10 + Math.abs(w * h - facts.width * facts.height) / (w * h);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = device;
      }
    }
  }
  return best;
}

/** The guide `get-store-listing-guide` returns, built from the same tables the command enforces. */
export function storeListingGuide(): string {
  const fieldRows = LISTING_FIELD_RULES.map((rule) => {
    const limit = rule.max ? `${rule.min ? `${rule.min} to ` : ""}${rule.max} ${rule.unit}` : "a web address";
    return `| \`${rule.field}\` | ${rule.label} | ${limit} | ${rule.required ? "yes" : "no"} |`;
  }).join("\n");
  const deviceRows = SCREENSHOT_DEVICES.map(
    (device) => `| \`${device.id}\` | ${device.sizes.map(([w, h]) => `${w} x ${h}`).join(", ")} | ${device.required ? "yes" : "no"} |`,
  ).join("\n");
  return `# The App Store listing, as files in this project

The listing lives in the project, so you edit it like code and the person reviews it in a live preview. The \`better-design listing\` command, from the same npm package as this server, does the rest on the person's machine. Their App Store Connect key never leaves it.

## Files

- \`store.config.json\`: the text, under \`apple.info.<locale>\`. It is the same file Expo's \`eas metadata\` reads, so an Expo project already has it. Keep every other key in the file as it is.
- \`store-listing/screenshots/<locale>/<device>/\`: the screenshots, in display order by file name, such as \`01-home.png\`.
- \`store-listing/sync.json\`: what App Store Connect held at the last pull or push. The command writes it. Commit it, and never edit it by hand.

\`\`\`json
{
  "configVersion": 0,
  "apple": {
    "info": {
      "en-US": {
        "title": "Budgetly",
        "subtitle": "Plan every pound",
        "promoText": "",
        "description": "",
        "keywords": ["budget", "expenses", "savings"],
        "releaseNotes": "",
        "supportUrl": "https://example.com/support",
        "marketingUrl": "https://example.com",
        "privacyPolicyUrl": "https://example.com/privacy"
      }
    }
  }
}
\`\`\`

## Apple's limits

The preview and the push both enforce these. A push stops on any field over its limit.

| Field | Name in App Store Connect | Limit | Required |
|---|---|---|---|
${fieldRows}

Keywords: Apple counts the comma-joined list in bytes, ignores words of two characters or fewer, and already searches the app name, so do not repeat it.

## Screenshots

Each device folder takes 1 to ${MAX_SCREENSHOTS_PER_DEVICE} PNG or JPEG files at one of its sizes, portrait or landscape, with no transparency.

| Folder | Accepted sizes (portrait) | Required |
|---|---|---|
${deviceRows}

\`get-design-system-kit\` with \`target: "store-screenshots"\` renders 1320 x 2868 slides, which file under \`iphone-6.9\`.

## Commands

Run them from the project root.

| Command | What it does |
|---|---|
| \`npx better-design listing init\` | Writes \`store.config.json\` for one locale if the project has none, and the screenshot folders. |
| \`npx better-design listing preview\` | Serves the live preview on a local port: the product page and the search card on iPhone, iPhone Duo and iPad, light and dark, any locale. It redraws on every save, marks every field over its limit, shows conflicts, files screenshots dropped on it, and has Pull and Push buttons. |
| \`npx better-design listing add <files...> --locale en-US\` | Files screenshots under their device by pixel size and refuses a wrong size with the reason. |
| \`npx better-design listing check\` | Prints every field over its limit and every missing required screenshot. Exits 1 on an error. |
| \`npx better-design listing pull\` | Reads App Store Connect, takes every change made only there, and lists the fields changed on both sides. |
| \`npx better-design listing resolve <locale> <field> --keep mine\\|theirs\` | Settles one conflict. The preview has the same choice as buttons. |
| \`npx better-design listing push\` | Pulls first, stops on a conflict or an error, then sends the text and the screenshots to the version being prepared. |
| \`npx better-design listing submit --build <number> --yes\` | Attaches the build and submits the version for App Review. |
| \`npx better-design listing status\` | Reports the version's state and its App Review submission. |

## Rules for you, the agent

- Edit \`store.config.json\` and the screenshot folders. Never edit \`store-listing/sync.json\`.
- Run \`listing check\` after each edit, and fix every error before you hand the listing back.
- Ask the person before \`listing push\`, and never run \`listing submit\` unless they asked for that submission in this conversation.
- A conflict is the person's choice. Show both versions and let them pick, in the preview or with \`listing resolve\`.
- The key comes from the person's environment: \`APP_STORE_CONNECT_KEY_ID\`, \`APP_STORE_CONNECT_ISSUER_ID\` and \`APP_STORE_CONNECT_KEY_PATH\`, or Expo's \`EXPO_ASC_KEY_ID\`, \`EXPO_ASC_ISSUER_ID\` and \`EXPO_ASC_API_KEY_PATH\`. Never ask them to paste the key into the chat.
`;
}
