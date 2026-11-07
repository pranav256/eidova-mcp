import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export function createMcpServer(options: Record<string, unknown>): McpServer;
export function registerReviewTool(server: McpServer, onToolUsage?: (...args: unknown[]) => void): void;
export function extractFromSources(sources: {name: string; kind?: string; content: string}[], name?: string): unknown;
export function formatExtraction(result: unknown): string;
export function summarizeExtraction(result: unknown): Record<string, unknown>;
export const VIDEO_COMPONENT_CATALOG: {name:string;type:string;description:string;dependencies:string[];registryDependencies:string[];externalRegistryDependencies:string[];files:{path:string;target:string;type:string}[]}[];
export const VIDEO_COMPONENT_FILES: Record<string,string>;
