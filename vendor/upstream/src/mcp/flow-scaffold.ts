/**
 * The starting screen the local kit writes into a project it just created. A
 * local model dropped every layout and component choice we described in text:
 * it built a narrow card, native inputs and the Radix API on Base UI parts. So
 * the kit writes a working flow built from the installed components instead,
 * and the model fills in the content. [BD-1285]
 */

/** What the scaffold needs to know about the install. */
export interface FlowScaffoldInput {
  /** The primitive library the components were installed for. */
  library: "base" | "radix";
  /** Reads an installed component's source by file name, or null when it is absent. */
  read: (name: string) => string | null;
  /** Installed icon component names from `@/components/icons`; empty when none were installed. */
  icons: string[];
}

/** The components the scaffold is built from; it is written only when all of them are installed. */
export const FLOW_SCAFFOLD_COMPONENTS = [
  "button", "input", "card", "badge", "checkbox", "label", "switch", "radio-group", "toggle-group", "tabs", "multi-select",
  "time-picker", "ix-onboarding-stepper",
];

// Most time pickers take a string and call back with one; the rest behave as an input.
function timePicker(read: FlowScaffoldInput["read"], value: string, set: string): string {
  const source = read("time-picker") ?? "";
  return /onChange\?:\s*\(value:\s*string\)/.test(source)
    ? `<TimePicker value={${value}} onChange={${set}} />`
    : `<TimePicker value={${value}} onChange={(event) => (${set})(event.target.value)} />`;
}

// About half the catalog's multi-selects report a change through onValueChange,
// the rest through onChange.
function multiSelect(read: FlowScaffoldInput["read"], value: string, set: string): string {
  const source = read("multi-select") ?? "";
  const prop = /onValueChange/.test(source) ? "onValueChange" : "onChange";
  return `<MultiSelect options={CHANNELS} value={${value}} ${prop}={${set}} placeholder="Choose how" />`;
}

/**
 * The starting App.tsx: a three-step flow in the system's own stepper, at full
 * desktop width with a side panel, that compiles against the install. Returns
 * null when a component it needs is missing, so the kit falls back to text.
 */
export function flowScaffold({ library, read, icons }: FlowScaffoldInput): string | null {
  if (FLOW_SCAFFOLD_COMPONENTS.some((name) => read(name) === null)) return null;
  const base = library === "base";
  const iconNames = icons.slice(0, 8);
  const withIcons = iconNames.length >= 4;
  const items = Array.from({ length: 12 }, (_, i) =>
    `  { id: "item-${i + 1}", title: "Item ${i + 1}", detail: "One line on what this item is", group: "${["Health", "Mind", "Learning"][i % 3]}"${withIcons ? `, icon: Icons.${iconNames[i % iconNames.length]}` : ""} },`,
  ).join("\n");
  const days = base
    ? `<ToggleGroup multiple value={plan.days} onValueChange={(days) => setPlan(item.id, { days: days as string[] })}>`
    : `<ToggleGroup type="multiple" value={plan.days} onValueChange={(days) => setPlan(item.id, { days })}>`;
  const lead = base
    ? `<RadioGroup value={settings.lead} onValueChange={(lead) => setSettings({ ...settings, lead: String(lead) })}>`
    : `<RadioGroup value={settings.lead} onValueChange={(lead) => setSettings({ ...settings, lead })}>`;

  return `// A working starting flow written by Better Design from this design system's
// components. Replace the items, titles and copy with the real ones; keep the
// components, the full-width layout and the side panel.
import { useState, type ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OnboardingStepper } from "@/components/ui/ix-onboarding-stepper";
${withIcons ? 'import * as Icons from "@/components/icons";\n' : ""}
type Item = { id: string; title: string; detail: string; group: string${withIcons ? "; icon: ComponentType<{ className?: string }>" : ""} };
type Plan = { days: string[]; time: string };

// Replace with 10 to 16 real items, each with a group and its own fitting icon.
const ITEMS: Item[] = [
${items}
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHANNELS = [
  { value: "push", label: "Push notification" },
  { value: "email", label: "Email" },
  { value: "sms", label: "Text message" },
];
const LEAD_TIMES = [
  { value: "0", label: "At the time" },
  { value: "10", label: "10 minutes before" },
  { value: "60", label: "An hour before" },
];

export default function App() {
  const [chosen, setChosen] = useState<string[]>([]);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [settings, setSettings] = useState({ on: true, channels: ["push"], lead: "10", time: "09:00" });
  const [step, setStep] = useState(0);
  const [group, setGroup] = useState("All");
  const [custom, setCustom] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const all = [...ITEMS, ...custom];
  const groups = ["All", ...new Set(ITEMS.map((item) => item.group))];
  const shown = all.filter((item) => group === "All" || item.group === group);
  const addOwn = () => {
    const title = draft.trim();
    if (!title) return;
    const id = \`own-\${custom.length + 1}\`;
    setCustom((items) => [...items, { ...ITEMS[0], id, title, detail: "Your own", group: "Your own" }]);
    setChosen((ids) => [...ids, id]);
    setDraft("");
  };
  const toggle = (id: string) =>
    setChosen((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const planFor = (id: string): Plan => plans[id] ?? { days: ["Mon", "Wed", "Fri"], time: "08:00" };
  const setPlan = (id: string, change: Partial<Plan>) => setPlans((all) => ({ ...all, [id]: { ...planFor(id), ...change } }));
  const picked = all.filter((item) => chosen.includes(item.id));

  const choose = (
    <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={group} onValueChange={(value) => setGroup(String(value))}>
        <TabsList>
          {groups.map((name) => <TabsTrigger key={name} value={name}>{name}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add your own" className="sm:w-56" />
        <Button variant="outline" onClick={addOwn}>Add</Button>
      </div>
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map((item) => (
        <Card key={item.id} onClick={() => toggle(item.id)} className="cursor-pointer">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
${withIcons ? '                <item.icon className="size-5 text-primary" />\n' : ""}                <CardTitle>{item.title}</CardTitle>
              </div>
              <Checkbox checked={chosen.includes(item.id)} onClick={(event) => event.stopPropagation()} onCheckedChange={() => toggle(item.id)} />
            </div>
          </CardHeader>
          <CardContent><CardDescription>{item.detail}</CardDescription></CardContent>
        </Card>
      ))}
    </div>
    </div>
  );

  const schedule = (
    <div className="grid gap-4">
      {picked.map((item) => {
        const plan = planFor(item.id);
        return (
          <Card key={item.id}>
            <CardHeader><CardTitle>{item.title}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Days</Label>
                ${days}
                  {DAYS.map((day) => <ToggleGroupItem key={day} value={day}>{day}</ToggleGroupItem>)}
                </ToggleGroup>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                ${timePicker(read, "plan.time", "(time: string) => setPlan(item.id, { time })")}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  const reminders = (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="reminders-on">Send reminders</Label>
          <Switch id="reminders-on" checked={settings.on} onCheckedChange={(on) => setSettings({ ...settings, on })} />
        </div>
        <div className="space-y-2">
          <Label>How they arrive</Label>
          ${multiSelect(read, "settings.channels", "(channels: string[]) => setSettings({ ...settings, channels })")}
        </div>
        <div className="space-y-2">
          <Label>How far ahead</Label>
          ${lead}
            {LEAD_TIMES.map(({ value, label }) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={\`lead-\${value}\`} />
                <Label htmlFor={\`lead-\${value}\`}>{label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <div className="space-y-2">
          <Label>When</Label>
          ${timePicker(read, "settings.time", "(time: string) => setSettings({ ...settings, time })")}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-4 py-4 sm:px-8">{/* product name */}</header>
      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <OnboardingStepper
          index={step}
          onIndexChange={(next) => setStep(next)}
          steps={[
            { id: "choose", label: "Choose", title: "Choose what to set up", content: choose, complete: chosen.length > 0 },
            { id: "schedule", label: "Schedule", title: "Set a schedule for each", content: schedule },
            { id: "reminders", label: "Reminders", title: "Choose your reminders", content: reminders },
          ]}
          completion={
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">You are all set</h2>
              {picked.map((item) => (
                <p key={item.id}>{item.title}: {planFor(item.id).days.join(", ")} at {planFor(item.id).time}</p>
              ))}
            </div>
          }
        />
        <aside className="h-fit space-y-3 rounded-xl border p-6">
          <div className="flex items-center justify-between"><h2 className="font-medium">Your choices</h2><Badge>{chosen.length} chosen</Badge></div>
          {picked.map((item) => <p key={item.id} className="text-sm text-muted-foreground">{item.title}</p>)}
        </aside>
      </main>
    </div>
  );
}
`;
}
