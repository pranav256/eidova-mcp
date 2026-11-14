import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
function replaceExact(source,target,replacement,count=1) {
  assert.equal(source.split(target).length-1,count,`Security patch target changed: ${target}`);
  return source.replaceAll(target,replacement);
}
assert.throws(()=>replaceExact('changed source','required target','safe replacement'),/Security patch target changed/);
assert.equal(replaceExact('target','target','safe'),'safe');
function patch(file, original) {
  let result = original.replaceAll('\r\n','\n');
  if (file.endsWith('/mcp/tools/shared.ts')) result = result
  .replace('process.env.BETTER_DESIGN_REGISTRY_URL', '(process.env.EIDOVA_REGISTRY_URL ?? process.env.OPEN_DESIGN_REGISTRY_URL)')
  .replace('"https://better-design.com/registry"', '`${(process.env.EIDOVA_BASE_URL ?? process.env.OPEN_DESIGN_BASE_URL) ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")}/registry`')
  .replace('process.env.BETTER_DESIGN_APP_URL', '(process.env.EIDOVA_BASE_URL ?? process.env.OPEN_DESIGN_BASE_URL)')
  .replace('"https://better-design.com"', '(process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")')
  .replace('export const ICONIFY_API_BASE = "https://api.iconify.design";', 'export const ICONIFY_API_BASE = `${(process.env.EIDOVA_BASE_URL ?? process.env.OPEN_DESIGN_BASE_URL) ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")}/icons`;')
  ;
  if(file.endsWith('/mcp/tools/shared.ts')) result=replaceExact(result,'return await globalThis.fetch(url, { signal: controller.signal });','return await globalThis.__EIDOVA_PUBLIC_FETCH__(url, { signal: controller.signal });');
  if(file.endsWith('/mcp/selected-icon-handoff.ts')) result=replaceExact(result,'  if (CATALOG_ICON_LIBRARY_ASSIGNMENTS[metadata.id]) return resolveDesignSystemIcons({ id: metadata.id });','  // The independent catalog supplies its own supplemental icon assignment.');
  if(file.endsWith('/inspection/capture-script.ts')) result=replaceExact(result,'    if (hiddenByAncestor(element)) return false;',`    if (hiddenByAncestor(element)) return false;
    // Visually hidden assistive labels remain available to screen readers.
    if (["absolute", "fixed"].includes(style.position)
      && (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)")) return false;`);
  if(file.endsWith('/inspection/spacing.ts')) result=replaceExact(result,'  return clips(element.style?.overflowX) && clips(element.style?.overflowY);','  return [element.style?.overflowX, element.style?.overflowY].every(value => value !== undefined && ["hidden", "clip", "auto", "scroll"].includes(value));');
  if(file.endsWith('/mcp/tools/comprehension-tools.ts')) result=replaceExact(result,'      const nextStep = reviewDesignSystemStep(session);','      const nextStep = report.verdict === "pass" ? "Continue with the interface; this text check does not verify its rendering." : "Fix critical and serious copy findings, then run check-comprehension again.";');
  if(file.endsWith('/mcp/tools/inspection-tools.ts')) result=replaceExact(result,'        const nextStep = reviewDesignSystemStep(await sessionLookup);','        const nextStep = "Fix critical and serious spacing findings, then recapture the affected rendered states.";');
  if (file.endsWith('/mcp/catalog-tokens.ts') || file.endsWith('/mcp/tools/design-system-tools.ts')) {
    assert.equal((result.match(/(?<![\w.])fetch\(/g)??[]).length,file.endsWith('/mcp/catalog-tokens.ts')?3:1,'Network patch call count changed.');
    result = result.replace(/(?<![\w.])fetch\(/g, 'globalThis.__EIDOVA_PUBLIC_FETCH__(');
  }
  if(file.endsWith('/mcp/index.ts')) {
    result=replaceExact(result,'instructions: directoryListing','instructions: options.instructions ?? (directoryListing');
    result=replaceExact(result,'enableReviewUiCode,\n          }),\n    },\n  );','enableReviewUiCode,\n          })),\n    },\n  );');
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
    result = replaceExact(result, target, `    const rule = elementRules[ruleKey];
    // Exported primitives implement native elements; page code still uses the kit.
    const reviewedPath = input.path.replaceAll("\\\\", "/");
    const moduleName = reviewedPath.match(/(?:^|\\/)components\\/ui\\/([a-z0-9-]+)\\.[jt]sx$/i)?.[1];
    const primitiveName = moduleName?.replace(/(^|-)([a-z])/g, (_, prefix, letter) => letter.toUpperCase());
    let declaration = node.parent;
    while (declaration && !ts.isVariableDeclaration(declaration) && !ts.isFunctionDeclaration(declaration)) declaration = declaration.parent;
    const componentName = declaration && declaration.name && ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
    const exportsPrimitive = sourceFile.statements.some(statement => {
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        return statement.exportClause.elements.some(element => (element.propertyName ?? element.name).text === componentName);
      }
      const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) return false;
      if (ts.isFunctionDeclaration(statement)) return statement.name?.text === componentName;
      if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === componentName);
      return false;
    });
    if (primitiveName && componentName && exportsPrimitive
      && (componentName === primitiveName || (componentName.startsWith(primitiveName) && /^[A-Z]/.test(componentName.slice(primitiveName.length))))) return;
    const p = pos(sourceFile, node);`);
    // A labeled native picker is valid; a component preference is not a blocker.
    result=replaceExact(result,'      severity: "serious",\n      ruleId: `element/${ruleKey}`,','      severity: tag === "select" ? "moderate" : "serious",\n      ruleId: `element/${ruleKey}`,');
    result=replaceExact(result,'      message: `Native <${tag}> should be replaced by <${rule.use}> from ${rule.from}.`,','      message: tag === "select" ? `Prefer <${rule.use}> when it exists in the product; a labeled native <select> is valid.` : `Native <${tag}> should be replaced by <${rule.use}> from ${rule.from}.`,');
    result=replaceExact(result,'      fix: `Import { ${rule.use} } from "${rule.from}" and use <${rule.use}> instead of <${tag}>.`,','      fix: tag === "select" ? "Keep the existing product picker, its labels, focus and keyboard behavior. Use the house component when installed." : `Import { ${rule.use} } from "${rule.from}" and use <${rule.use}> instead of <${tag}>.`,');
  }
  return result.replaceAll('send it the path of every .swift file you wrote, with no content', 'send each .swift file path with its complete inline content')
    .replaceAll("send each file's path and no content, so it reads the whole file", "send each file's path and complete inline content")
    .replaceAll('issuedBy: "better-design-mcp"', 'issuedBy: "eidova-mcp"')
    .replaceAll('Better Design', 'Eidova')
    .replaceAll('written by Eidova', 'from the MIT-licensed Better Design package')
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
assert.equal((built.match(/globalThis\.__EIDOVA_PUBLIC_FETCH__\(/g)??[]).length,5,'Unexpected network adapter calls in compiled runtime.');
console.log('Built recovered MIT runtime with local registry adapters.');
