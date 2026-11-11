import { createHash } from 'node:crypto';
import { baseUrl, catalog, sourceItem, tokensCss } from './catalog.js';

export async function designContext(id: string): Promise<string | null> {
  const system = (await catalog()).find(item => item.id === id);
  if (!system) return null;
  const [globals, css] = await Promise.all([sourceItem(id, 'globals'), tokensCss(id)]);
  const registry = `${baseUrl()}/registry/${id}`;
  const tokenSections = Object.entries(globals.cssVars ?? {}).map(([scope, values]) => [
    `### Registry scope: \`cssVars.${scope}\``,
    '',
    '```css',
    ...Object.entries(values).map(([name, value]) => `${name.startsWith('--') ? name : `--${name}`}: ${value};`),
    '```',
  ].join('\n'));
  return [
    `# ${system.title} design system`,
    '',
    `Exact catalog ID: \`${system.id}\`. Family: ${system.family.title} (\`${system.family.id}\`).`,
    system.variant
      ? `This is a family variant. The representative preview uses \`${system.family.representative}\`; install \`${system.id}\` for this variant's actual source and tokens.`
      : 'This is the family representative shown in the component preview.',
    '',
    '## Read order and use',
    '',
    '1. Read the existing project instructions, theme, and components first. Preserve the product\'s own design unless a replacement was explicitly requested.',
    '2. Save this as DESIGN.md only when that file is absent. Otherwise merge the selected-system details into it; never overwrite existing rules automatically.',
    `3. Read [the exact globals registry item](${registry}/globals.json), then request only needed components with \`get-design-system-kit\` using \`designSystemId: "${system.id}"\`, \`target: "react"\`, and \`library: "radix"\`.`,
    '4. Load UI guidance before styling and UX guidance before changing behavior. Keep the installed components, token values, font loading, and embedded icons.',
    '',
    '## Family fit',
    '',
    system.family.description,
    `Design traits: ${system.family.axes.join('; ')}.`,
    `Suggested uses: ${system.family.useCases.join('; ')}.`,
    `Tradeoff: ${system.family.tradeoff}`,
    'These are editorial recommendations for the family, not measured user preferences or a guarantee about every variant.',
    '',
    '## Source tokens',
    '',
    `Catalog font: \`${system.font}\`. Catalog radius: \`${system.borderRadius}\`.`,
    `Source CSS SHA-256: \`${createHash('sha256').update(css).digest('hex')}\`.`,
    'The declarations below preserve the globals registry values and scope names. A scope named `light` is a registry field, not proof of a light appearance: some systems put their original dark palette there. Read globals.css for actual selectors, font imports, mappings, and overrides. These declarations alone are not a complete stylesheet, and the website\'s adapted palettes do not establish native dual-mode support.',
    '',
    ...tokenSections,
    '',
    '## Components and installation',
    '',
    'React kits require Tailwind 4, Radix, the @/* import alias, and components.json. Inspect the project before installing; preserve existing dependency versions and review conflicts. Initialize shadcn only if needed. HTML and DTCG exports are available through the same kit tool for their respective targets.',
    `Registry: [all items](${registry}/all.json). Prefer a scoped kit request over installing every item.`,
    '',
    'Available registry components and helpers:',
    '',
    system.components.map(name => `\`${name}\``).join(', '),
    '',
    '## Review before delivery',
    '',
    'Run get-review-rules, review-ui-code, and check-comprehension on the completed screen. Capture rendered DOM evidence for inspect-spacing at mobile and desktop widths; fix every critical and serious finding. Test keyboard focus, labels, contrast, and the actual task. Dashboards also require their dashboard review workflow.',
    'This document describes checked-in source. Downloading it does not install components, load fonts, render a screen, or certify accessibility. Follow the registry license and NOTICE when redistributing source.',
    '',
  ].join('\n');
}
