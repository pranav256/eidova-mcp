import { Projects } from './projects.js';
import { publicFetch, jsonResponse } from './public-fetch.js';
import { safeFetchPublic } from './safe-fetch.js';
import type { ProjectRulesStore } from './project-rules-store.js';
import { extractFromSources, formatExtraction, summarizeExtraction } from '../vendor/upstream/runtime.mjs';

export function apiDispatcher(projects: Projects, projectRules?: ProjectRulesStore): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const rulePath = url.pathname.match(/^\/api\/v1\/project-rules\/([a-f0-9-]{36})$/);
    if (rulePath && projectRules) {
      try {
        if (method === 'GET') return jsonResponse(await projectRules.getContext(rulePath[1], {
          screen:url.searchParams.get('screen') ?? undefined, parts:url.searchParams.getAll('parts'),
        }));
        if (method === 'PUT') {
          const body = JSON.parse(String(init?.body ?? '{}'));
          const outcome = await projectRules.save(rulePath[1],body,body.replaceExisting ?? false);
          return jsonResponse({outcome},outcome === 'refused' ? 409 : 200);
        }
        return jsonResponse({message:'Use GET or PUT for project rules.'},405);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Project rule operation failed';
        return jsonResponse({message},/not found|workspace key/i.test(message) ? 404 : 422);
      }
    }
    try {
      if (url.pathname.startsWith('/registry/') || url.pathname.startsWith('/icons/')) return publicFetch(url);
      if (url.pathname === '/api/projects/anonymous' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const project = await projects.create(body);
        return jsonResponse({id:project.id});
      }
      const projectPath = url.pathname.match(/^\/api\/projects\/([a-f0-9-]{36})(?:\/registry\/([a-z0-9_-]+)\.json)?$/);
      if (projectPath) {
        const project = await projects.get(projectPath[1]);
        if (!project) return jsonResponse({message:'Project not found'},404);
        if (projectPath[2]) return jsonResponse(await projects.item(project,projectPath[2]));
        return jsonResponse({name:project.name,designSystemStatus:'COMPLETED',currentStep:null,previewFragmentId:project.id});
      }
      const config = url.pathname.match(/^\/api\/fragments\/([a-f0-9-]{36})\/config$/);
      if (config) {
        const project = await projects.get(config[1]);
        if (!project) return jsonResponse({message:'Project not found'},404);
        if (method === 'GET') return jsonResponse(project.config);
        if (method === 'PATCH') {
          const body = JSON.parse(String(init?.body ?? '{}'));
          const updated = await projects.setConfig(config[1],body.config);
          return jsonResponse({config:updated.config});
        }
      }
      if (url.pathname === '/api/v1/brand-extract/from-url' && method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) return jsonResponse({message:'A URL is required'},400);
        const response = await safeFetchPublic(target);
        if (!response.ok) return jsonResponse({message:`Page returned HTTP ${response.status}`},422);
        const html = await response.text();
        const sources = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].slice(0,8).map((m,i)=>({name:`inline CSS ${i+1}`,kind:'css',content:m[1]}));
        const links = [...html.matchAll(/<link\b[^>]*>/gi)].filter(m=>/rel\s*=\s*["']stylesheet["']/i.test(m[0])).slice(0,5);
        const sheetResults = await Promise.allSettled(links.map(async link => {
          const href = link[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
          if (!href) return null;
          const sheet = await safeFetchPublic(new URL(href,target).toString(), 0, AbortSignal.timeout(15_000));
          return sheet.ok ? {name: href, kind: 'css', content: (await sheet.text()).slice(0,200000)} : null;
        }));
        for (const result of sheetResults) if (result.status === 'fulfilled' && result.value) sources.push(result.value);
        if (!sources.length) return jsonResponse({message:'No readable stylesheets found. Pass your CSS or rendered samples to extract-design-system.'},422);
        const result = extractFromSources(sources,url.searchParams.get('name') ?? new URL(target).hostname);
        return jsonResponse({markdown:formatExtraction(result),summary:summarizeExtraction(result),notes:['CSS-only extraction. This service did not render the page; computed styles and dynamic themes may differ.']});
      }
      return jsonResponse({message:'This hosted capability is not implemented. Use the advertised local tools.'},501);
    } catch (error) {
      return jsonResponse({message:error instanceof Error ? error.message : 'Local operation failed'},422);
    }
  };
}
