import assert from 'node:assert/strict';

export const WEBSITE_REVIEW_WIDTHS = [390, 1440, 1728];

export async function captureWebsiteSetupStates({ page, script, clients, save }) {
  const width = page.viewportSize().width;
  const states = [];
  for (const [index, name] of clients.entries()) {
    await page.getByRole('tab', { name, exact: true }).click();
    const state = await page.evaluate(script);
    state.name = `${width}px ${name} setup`;
    await save(`setup-state-${width}-${index}`, state);
    states.push(state);
  }
  return states;
}

export function websiteSpacingBatches(captured) {
  const groups = new Map();
  for (const state of captured) {
    const name = state.name.replace(/^(?:390|1440|1728)px /, '');
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(state);
  }
  assert.ok(groups.size, 'Spacing evidence requires all three viewport widths.');
  const batches = [];
  for (const [name, states] of groups) {
    assert.deepEqual(states.map(state => state.viewport.width).sort((a, b) => a - b), [390, 1440, 1728], `${name}: spacing evidence requires all three viewport widths.`);
    const args = {states, spacingScale: [4,8,12,16,20,24,32,40,48,56,64,72,80,88,96,104,128], tolerance: 2, detail: 'full'};
    assert.ok(Buffer.byteLength(JSON.stringify(args)) < 4*1024*1024-1024, 'Spacing evidence must fit the HTTP limit.');
    batches.push(args);
  }
  return batches;
}
