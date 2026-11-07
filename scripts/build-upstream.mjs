import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
function patch(file, original) {
  let result = original.replaceAll('\r\n','\n');
  if (file.endsWith('/mcp/tools/shared.ts')) result = result
  .replace('process.env.BETTER_DESIGN_REGISTRY_URL', 'process.env.OPEN_DESIGN_REGISTRY_URL')
  .replace('"https://better-design.com/registry"', '`${process.env.OPEN_DESIGN_BASE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")}/registry`')
  .replace('process.env.BETTER_DESIGN_APP_URL', 'process.env.OPEN_DESIGN_BASE_URL')
  .replace('"https://better-design.com"', '(process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")')
  .replace('export const ICONIFY_API_BASE = "https://api.iconify.design";', 'export const ICONIFY_API_BASE = `${process.env.OPEN_DESIGN_BASE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")}/icons`;')
  .replace('return await globalThis.fetch(url, { signal: controller.signal });', 'return await globalThis.__OPEN_DESIGN_PUBLIC_FETCH__(url, { signal: controller.signal });');
  if (file.endsWith('/mcp/catalog-tokens.ts') || file.endsWith('/mcp/tools/design-system-tools.ts')) {
    result = result.replace(/(?<![\w.])fetch\(/g, 'globalThis.__OPEN_DESIGN_PUBLIC_FETCH__(');
  }
  if (file.endsWith('/mcp/review-tool.ts')) {
    for (const required of [
      'const loaded = await loadReviewFiles(files.filter((f) => isReviewableSourcePath(f.path)));',
      'lengthSamples: readLengthSamples(process.cwd(), web.map((input) => input.path)),',
    ]) if (!result.includes(required)) throw new Error(`Security patch target changed: ${required}`);
    result = result
      .replace('const loaded = await loadReviewFiles(files.filter((f) => isReviewableSourcePath(f.path)));', 'const loaded = files.filter((f) => isReviewableSourcePath(f.path)).map((file) => file.content !== undefined ? { input: { path: file.path, content: file.content } } : { skipped: `${file.path}: provide inline source content` });')
      .replace('lengthSamples: readLengthSamples(process.cwd(), web.map((input) => input.path)),', 'lengthSamples: [],');
  }
  if (file.endsWith('/lint/engine.ts')) {
    const target = '    const rule = elementRules[ruleKey];\n    const p = pos(sourceFile, node);';
    if (!result.includes(target)) throw new Error('Primitive review patch target changed.');
    result = result.replace(target, `    const rule = elementRules[ruleKey];
    // A public primitive implements its own native element. Keep all other checks.
    const primitivePath = rule.from.replace(/^@\\//, "");
    const reviewedPath = input.path.replaceAll("\\\\", "/");
    const implementsPrimitive = ["tsx", "jsx"].some(ext =>
      reviewedPath === primitivePath + "." + ext || reviewedPath.endsWith("/" + primitivePath + "." + ext));
    const exportsPrimitive = sourceFile.statements.some(statement => {
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        return statement.exportClause.elements.some(element => element.name.text === rule.use);
      }
      const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) return false;
      if (ts.isFunctionDeclaration(statement)) return statement.name?.text === rule.use;
      if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === rule.use);
      return false;
    });
    if (implementsPrimitive && exportsPrimitive) return;
    const p = pos(sourceFile, node);`);
  }
  return result.replaceAll('issuedBy: "better-design-mcp"', 'issuedBy: "open-design-mcp"')
    .replaceAll('Better Design', 'Open Design')
    .replaceAll('written by Open Design', 'from the MIT-licensed Better Design package')
    .replaceAll('https://better-design.com', 'https://open-design-mcp-liard.vercel.app')
    .replaceAll('https://www.better-design.com', 'https://open-design-mcp-liard.vercel.app');
}
await build({
  entryPoints: ['scripts/upstream-entry.ts'], outfile: 'vendor/upstream/runtime.mjs',
  bundle: true, format: 'esm', platform: 'node', target: 'node22',
  packages: 'external', sourcemap: false, logLevel: 'warning',
  plugins: [{ name: 'local-adapters', setup(builder) {
    builder.onLoad({ filter: /vendor[\\/]upstream[\\/]src[\\/].*\.ts$/ }, async args => ({
      contents: patch(args.path.replaceAll('\\', '/'), await readFile(args.path, 'utf8')), loader: 'ts',
    }));
  }}],
});
const built=await readFile('vendor/upstream/runtime.mjs','utf8');
if (/loadReviewFiles|readLengthSamples/.test(built)) throw new Error('Unsafe filesystem review code remained in the runtime; refusing release.');
console.log('Built recovered MIT runtime with local registry adapters.');
