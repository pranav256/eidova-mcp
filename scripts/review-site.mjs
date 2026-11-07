import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const endpoint = process.argv[2] ?? 'http://localhost:3000/mcp';
const website = resolve(process.argv[3] ?? 'website');
const output = resolve('.work/verification');
await mkdir(output, { recursive: true });
const client = new Client({ name: 'open-design-website-source-review', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
try {
  const rules = await client.callTool({ name: 'get-review-rules', arguments: { category: 'all' } });
  assert.ok(!rules.isError, 'Review rules failed');
  const paths = ['App.tsx', 'styles.css', 'theme.css', 'components/ui/button.tsx', 'components/ui/input.tsx', 'main.tsx'];
  const files = await Promise.all(paths.map(async path => ({ path, content: await readFile(join(website, 'src', path), 'utf8') })));
  const source = await client.callTool({ name: 'review-ui-code', arguments: { files } });
  await writeFile(join(output, 'website-source-review.json'), JSON.stringify({ rules, source }, null, 2));
  assert.ok(!source.isError, 'Source review failed');
  const report = source.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  assert.match(report, /0 critical, 0 serious/, 'Source review found blocking issues');
  console.log(report.split('\n')[0]);
} finally {
  await client.close();
}
