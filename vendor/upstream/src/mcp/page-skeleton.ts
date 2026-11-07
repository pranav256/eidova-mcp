/**
 * A starting layout the local kit sends after it installs a design system. A
 * small local model built a narrow card with a bare list where a stronger
 * model built a full-width screen with filters, adding and a count. This
 * skeleton compiles against the installed components and keeps those parts,
 * and the model fills in the content. About 650 tokens. [BD-1262]
 */
export const DESKTOP_SCREEN_SKELETON = `A starting layout for a screen where a person chooses items. It works from a 390px phone to a wide desktop: keep the breakpoints when you change it. It compiles against the installed components. Fill in the comments with real content, and change the parts the screen does not need:

\`\`\`tsx
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type Item = { id: string; title: string; detail: string; group: string };
const ITEMS: Item[] = [/* 8 to 12 real items, each with a group */];
const GROUPS = ["All", ...new Set(ITEMS.map((item) => item.group))];

export default function App() {
  const [chosen, setChosen] = useState<string[]>([]); // nothing chosen at first
  const [group, setGroup] = useState("All");
  const shown = ITEMS.filter((item) => group === "All" || item.group === group);
  const toggle = (id: string) =>
    setChosen((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-4 sm:px-8">{/* product name, step 1 of 3 */}</header>
      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <h1 className="text-2xl font-semibold sm:text-3xl">{/* the question this screen asks */}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {GROUPS.map((name) => (
              <Button key={name} size="sm" variant={name === group ? "default" : "outline"} onClick={() => setGroup(name)}>{name}</Button>
            ))}
            <Input className="w-full sm:ml-auto sm:w-64" placeholder="Add your own" />
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((item) => (
              <Card key={item.id} onClick={() => toggle(item.id)} className="cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle>{item.title}</CardTitle>
                    <Checkbox checked={chosen.includes(item.id)} onClick={(event) => event.stopPropagation()} onCheckedChange={() => toggle(item.id)} />
                  </div>
                </CardHeader>
                <CardContent><CardDescription>{item.detail}</CardDescription></CardContent>
              </Card>
            ))}
          </div>
        </section>
        <aside className="h-fit rounded-xl border p-6">
          <div className="flex justify-between"><h2 className="font-medium">Your choices</h2><Badge>{chosen.length} chosen</Badge></div>
          <Button className="mt-6 w-full" disabled={chosen.length === 0}>Continue</Button>
        </aside>
      </main>
    </div>
  );
}
\`\`\`

On a desktop the page fills the width up to \`max-w-7xl\`, with the side panel beside the content from \`lg\`. A flow with steps keeps this layout on every step: put the stepper above the content, and the choices so far in the side panel. Never put a screen in a centered card capped at \`max-w-xl\` to \`max-w-4xl\`.`;

/**
 * The skeleton for this install. When the kit installed icons, each item
 * carries one from \`@/components/icons\` and its card shows it: a local model
 * used 4 of 18 installed icons and none on the cards. Without icons it is the
 * plain skeleton, so it never imports a folder that is not there. [BD-1285]
 */
export function screenSkeleton(iconNames: string[]): string {
  const example = iconNames[0];
  if (!example) return DESKTOP_SCREEN_SKELETON;
  return DESKTOP_SCREEN_SKELETON
    .replace('import { useState } from "react";', 'import { useState, type ComponentType } from "react";')
    .replace('import { Input } from "@/components/ui/input";', 'import { Input } from "@/components/ui/input";\nimport * as Icons from "@/components/icons";')
    .replace("type Item = { id: string; title: string; detail: string; group: string };",
      "type Item = { id: string; title: string; detail: string; group: string; icon: ComponentType<{ className?: string }> };")
    .replace("/* 8 to 12 real items, each with a group */", `/* 8 to 12 real items, each with a group and its own icon, such as icon: Icons.${example} */`)
    .replace("<CardTitle>{item.title}</CardTitle>",
      '<div className="flex items-center gap-3"><item.icon className="size-5 text-primary" /><CardTitle>{item.title}</CardTitle></div>');
}

// Each control a flow often needs, and the component files that provide it, in
// order of preference. A local model reached for a native time input while the
// system shipped a time picker. [BD-1278]
const CONTROLS: [need: string, files: string[]][] = [
  ["a time of day", ["time-picker"]],
  ["a date or a date range", ["date-picker", "data-range-picker", "calendar"]],
  ["days of the week, or several of a few options", ["toggle-group"]],
  ["one option from a list", ["select", "native-select"]],
  ["one of a few options side by side", ["ix-segmented-control", "radio-group"]],
  ["on or off", ["switch"]],
  ["the steps of a flow", ["onboarding-stepper", "stepper"]],
];

// A local model writes the Radix API from memory. Base UI differs where it
// broke the build: checked against @base-ui/react's own types. [BD-1285]
/** Where Base UI props differ from Radix, as the kit tells a model. */
export const BASE_UI_PROPS = "These are Base UI components, not Radix: ToggleGroup takes `multiple` (true or false), never `type`, Toggle has no `type`, and Select's `onValueChange` passes `string | null`.";

/**
 * The installed component to use for each control the system covers, so a
 * model never builds one from a native input. Empty when it covers none.
 */
export function controlMap(componentNames: string[], library: "base" | "radix" = "radix"): string {
  // A base-primitive install names a component `time-picker-base`; its file is `time-picker.tsx`.
  const installed = new Set(componentNames.map((name) => name.replace(/-base$/, "")));
  const lines = CONTROLS.flatMap(([need, files]) => {
    const file = files.find((name) => installed.has(name));
    return file ? [`- ${need}: \`@/components/ui/${file}\``] : [];
  });
  if (lines.length === 0) return "";
  return [
    'Use the installed component for each control, never a native `<input type="time">`, `<input type="date">` or `<select>`. Read the file for its exports first:',
    ...lines,
    ...(library === "base" ? [BASE_UI_PROPS] : []),
  ].join("\n");
}

