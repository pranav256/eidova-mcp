import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
function replaceExact(source,target,replacement,count=1) {
  assert.equal(source.split(target).length-1,count,`Security patch target changed: ${target}`);
  return source.replaceAll(target,replacement);
}
assert.throws(()=>replaceExact('changed source','required target','safe replacement'),/Security patch target changed/);
assert.equal(replaceExact('target','target','safe'),'safe');
function patch(file, original) {
  let result = original.replaceAll('\r\n','\n');
  if (file.endsWith('/mcp/build-loop.ts')) return 'export { workflowNote as BUILD_LOOP } from "../../../../src/tool-descriptions.ts";';
  if (file.endsWith('/mcp/guardrails.ts')) {
    const start = result.indexOf('export const GUARDRAILS_SETUP_MD = `');
    assert.ok(start >= 0, 'Guardrail guidance target changed.');
    result = result.slice(0, start) + 'export const GUARDRAILS_SETUP_MD = "Keep DESIGN.md and the installed component rules with the project. Merge any supplied rules or lint configuration into existing files without overwriting them. Review complete inline source with review-ui-code, then verify copy and rendered spacing. Eidova does not install editor hooks or a separate review CLI.";';
  }
  if (file.endsWith('/mcp/store-listing.ts')) {
    result = replaceExact(result, "The listing lives in the project, so you edit it like code and the person reviews it in a live preview. The \\`better-design listing\\` command, from the same npm package as this server, does the rest on the person's machine. Their App Store Connect key never leaves it.", 'Keep listing copy and screenshots in the project for review. Eidova returns guidance and source files; previewing, synchronization and publishing require your existing publishing workflow. Keep credentials in the local environment.');
    result = replaceExact(result, '- \\`store-listing/sync.json\\`: what App Store Connect held at the last pull or push. The command writes it. Commit it, and never edit it by hand.\n', '');
    result = replaceExact(result, 'The preview and the push both enforce these. A push stops on any field over its limit.', 'Validate each field against the current store requirements before publishing.');
    const start = result.indexOf('## Commands\n'), end = result.indexOf('\n`;', start);
    assert.ok(start >= 0 && end > start, 'Listing command guidance target changed.');
    result = result.slice(0, start) + '## Review and publish\n\nReview each locale and screenshot at its target size. Use the existing project tooling to validate and publish the listing. Preserve any publisher-managed synchronization files and show conflicting changes for review. This MCP does not provide listing CLI commands, access publishing credentials or submit an app.\n' + result.slice(end);
    result = result.replace('"title": "Budgetly"', '"title": "Eidova"').replace('"subtitle": "Plan every pound"', '"subtitle": "Design interfaces"').replace('["budget", "expenses", "savings"]', '["design", "interfaces", "components"]');
  }
  if (file.endsWith('/mcp/tools/team-rules-tools.ts')) {
    result = replaceExact(result, ' They can also paste it at ${APP_BASE_URL}/dashboard/settings/team-rules.', '');
    result = replaceExact(result, ': project ? "" : DRAFTING_BRIEF;', ': project ? "" : provider.saveTeamRules ? DRAFTING_BRIEF : "# Team rules\\n\\nNo private workspace is connected. Follow the existing project instructions. Connect a private workspace before reading or saving its rules.";');
  }
  if (file.endsWith('/mcp/tools/shared.ts')) result = result
  .replace('process.env.BETTER_DESIGN_REGISTRY_URL', 'process.env.EIDOVA_REGISTRY_URL')
  .replace('"https://better-design.com/registry"', '`${process.env.EIDOVA_BASE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")}/registry`')
  .replace('process.env.BETTER_DESIGN_APP_URL', 'process.env.EIDOVA_BASE_URL')
  .replace('"https://better-design.com"', '(process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")')
  .replace('export const ICONIFY_API_BASE = "https://api.iconify.design";', 'export const ICONIFY_API_BASE = `${process.env.EIDOVA_BASE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "http://localhost:3000")}/icons`;')
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
  if (file.endsWith('/mcp/tools/design-system-tools.ts')) result = replaceExact(result, 'const PREPARE_PROJECT = "npx -y better-design@latest init";', 'const PREPARE_PROJECT = "npx shadcn@latest init -d -y";');
  if(file.endsWith('/mcp/index.ts')) {
    result=replaceExact(result,'instructions: directoryListing','instructions: options.instructions ?? (directoryListing');
    result=replaceExact(result,'enableReviewUiCode,\n          }),\n    },\n  );','enableReviewUiCode,\n          })),\n    },\n  );');
    result=replaceExact(result,'  declareAdvertisedSchemaDialect(server);',`  declareAdvertisedSchemaDialect(server);
  if (options.configureTool) {
    const register = server.registerTool.bind(server);
    server.registerTool = (name, config, callback) => {
      const tool = options.configureTool(name, config, callback);
      return tool ? register(tool.name, tool.config, tool.callback) : undefined;
    };
  }`);
  }
  if(file.endsWith('/mcp/tools/principle-tools.ts')) {
    result=replaceExact(result,'return { content: [{ type: "text" as const, text: `Error: ${message}` }] };','return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };');
    result=replaceExact(result,'response: { content: [{ type: "text" as const, text }] },','response: { content: [{ type: "text" as const, text }], isError: Boolean((capture.topic || capture.query) && capture.topResults.length === 0) },');
    const target=result.split('\n').find(line=>line.startsWith('4. For dashboards,')&&line.includes('finalize-dashboard-review'));
    assert.ok(target,'Dashboard review guidance target changed.');
    result=replaceExact(result,target,'4. For dashboards, verify the complete source and fixture against rendered states at 390, 1440 and 1728 pixels. Confirm navigation and task behavior in the browser. Report any unverified states; this service does not issue a trusted browser receipt.');
  }
  if(file.endsWith('/mcp/tools/icon-tools.ts')) {
    result=replaceExact(result,'{ content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }] }','{ content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }], isError: true }',3);
    for(const message of ["Icon library '${libraryId}' not found.","Icon library '${libraryId}' not found. Call find-icon-library first."])result=replaceExact(result,'{ content: [{ type: "text" as const, text: `'+message+'` }] }','{ content: [{ type: "text" as const, text: `'+message+'` }], isError: true }');
    result=replaceExact(result,'return { content: [{ type: "text" as const, text: parts.join("\\n") }] };','return { content: [{ type: "text" as const, text: parts.join("\\n") }], isError: generated.length === 0 || skipped.length > 0 };');
  }
  if(file.endsWith('/mcp/session-guidance.ts')) {
    const target=result.split('\n').find(line=>line.includes('return "You have loaded design guidance')&&line.includes('finalize-dashboard-review'));
    assert.ok(target,'Session review guidance target changed.');
    result=replaceExact(result,target,'  return "Review the completed source, copy and rendered spacing. For dashboards, also run review-dashboard-structure and verify navigation and task behavior in the browser. Fix critical and serious findings and report unverified states.";');
  }
  if(file.endsWith('/mcp/tools/shared.ts')) {
    result=replaceExact(result,'      outputPreview: extractOutputPreview(response),\n    },\n  );\n  return response;','      outputPreview: extractOutputPreview(response),\n    },\n  );\n  return isError ? { ...response, isError: true } : response;');
    const start=result.indexOf('For dashboards, run \\`review-dashboard-structure\\`'),end=result.indexOf('For other UI, fix',start);
    assert.ok(start>=0&&end>start,'Shared dashboard guidance target changed.');
    result=result.slice(0,start)+'For dashboards, run review-dashboard-structure, check-comprehension and inspect-spacing, and verify task behavior in the browser. Report any unverified states. '+result.slice(end);
  }
  if(file.endsWith('/mcp/tools/dashboard-review-tools.ts'))result=replaceExact(result,'Then run check-comprehension and inspect-spacing, and call finalize-dashboard-review. Only its VALID source-bound receipt permits presentation.','Then run check-comprehension and inspect-spacing on the rendered states. Report remaining limits explicitly.');
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
    .replaceAll('com.better-design.mode', 'io.eidova.mode')
    .replaceAll("send each file's path and no content, so it reads the whole file", "send each file's path and complete inline content")
    .replaceAll('issuedBy: "better-design-mcp"', 'issuedBy: "eidova-mcp"')
    .replaceAll('written by Better Design', 'provided by Eidova (source attribution in NOTICE)')
    .replaceAll('Try again with the hosted Better Design MCP server or the latest `better-design` npm package.', 'Connect a private workspace with saved reference content.')
    .replaceAll('info@better-design.com', 'the workspace owner')
    .replaceAll('https://better-design.com', 'https://eidova-mcp.vercel.app')
    .replaceAll('https://www.better-design.com', 'https://eidova-mcp.vercel.app')
    .replaceAll('better-design.com', 'eidova-mcp.vercel.app')
    .replaceAll('Better Design', 'Eidova')
    .replaceAll('BetterDesign', 'Eidova')
    .replaceAll('betterDesign', 'eidova')
    .replaceAll('app api better design ', 'app api design better eidova ')
    .replaceAll('uclips.eu', 'example.com')
    .replaceAll('Cashmere DS tokens', 'Eidova example tokens')
    .replaceAll('cashmere', 'minimal-light')
    .replaceAll('render-video-frames', 'get-video-render-commands')
    .replaceAll('install-icons', 'get-icon-files')
    .replaceAll('dashboards need a VALID finalize-dashboard-review receipt.', 'dashboards need source and rendered checks.')
    .replaceAll('better-design', 'eidova');
}
await build({
  entryPoints: ['scripts/upstream-entry.ts'], outfile: 'vendor/upstream/runtime.mjs',
  bundle: true, format: 'esm', platform: 'node', target: 'node22',
  packages: 'external', sourcemap: false, logLevel: 'warning',
  plugins: [{ name: 'local-adapters', setup(builder) {
    // Reuse local validators instead of loading the upstream PostgreSQL schema.
    builder.onResolve({ filter: /^(?:\.\.?\/)+schema$/ }, args => {
      if (path.resolve(args.resolveDir, args.path) === path.resolve('vendor/upstream/src/schema')) return { path: path.resolve('src/schema.ts') };
    });
    builder.onLoad({ filter: /vendor[\\/]upstream[\\/]src[\\/].*\.ts$/ }, async args => ({
      contents: patch(args.path.replaceAll('\\', '/'), await readFile(args.path, 'utf8')), loader: 'ts',
    }));
  }}],
});
const built=await readFile('vendor/upstream/runtime.mjs','utf8');
if (/loadReviewFiles|readLengthSamples/.test(built)) throw new Error('Unsafe filesystem review code remained in the runtime; refusing release.');
assert.doesNotMatch(built, /from ["']drizzle-(?:orm|zod)(?:["'/])/, 'Upstream database dependencies must not enter the runtime.');
assert.doesNotMatch(built, /OPEN_DESIGN_|com\.better-design\.mode/, 'Only current Eidova names belong in the runtime.');
assert.ok(!/better[ -]?design|\b(?:hooky|uclips|cashmere|nexu)\b/i.test(built), 'Generated runtime copy must use Eidova branding.');
assert.equal((built.match(/globalThis\.__EIDOVA_PUBLIC_FETCH__\(/g)??[]).length,5,'Unexpected network adapter calls in compiled runtime.');
console.log('Built recovered MIT runtime with local registry adapters.');
