import type {
  McpServer,
  RegisteredTool,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";

/**
 * The JSON Schema dialect every advertised tool schema declares.
 *
 * The MCP SDK converts each Zod schema for `tools/list` with a hardcoded
 * `draft-7` target, so Zod stamped `$schema: "http://json-schema.org/draft-07/schema#"`
 * on every `inputSchema` and `outputSchema` we publish. `tools/list` still
 * succeeds, so the tools look registered. A host that validates tool output
 * against 2020-12 then fails the call instead: Claude Code refused
 * `preview-design-system` with "JSON Schema declares an unsupported dialect".
 * Ajv reads 2020-12 only unless the host hands it a draft-7 instance, and we
 * cannot reach into the host to do that.
 *
 * Our schema bodies say the same thing in both dialects, so the fix is to
 * declare the dialect the hosts read. SEP-1613 already makes 2020-12 the MCP
 * default, which is what the SDK contradicts. The test in
 * `mcp-schema-dialect.test.ts` keeps that claim honest.
 *
 * DELETE THIS WRAPPER once the SDK ships its own fix. The bug is upstream and
 * still open in 1.30.0, with two patches waiting:
 * - modelcontextprotocol/typescript-sdk#2677 (the Zod v4 report)
 * - modelcontextprotocol/typescript-sdk#2084 (the SEP-1613 regression)
 * - PR #2085 passes the target at both call sites; PR #2653 moves the default
 * The SDK v2 line already hardcodes `target: 'draft-2020-12'`, so migrating
 * there also retires this file.
 */
export const ADVERTISED_JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/**
 * Keywords that mean something else, or nothing, under 2020-12. Zod's draft-7
 * emitter writes `definitions` for a reused schema and `additionalItems` for a
 * tuple; 2020-12 spells those `$defs` and `prefixItems`. No tool schema uses
 * them today, and the test fails the build if one starts to.
 */
export const DRAFT_7_ONLY_KEYWORDS = ["definitions", "additionalItems", "dependencies"] as const;

/** The map of named Zod fields `registerTool` accepts in place of an object. */
type ToolFieldMap = Record<string, AnySchema>;

/** A tool schema in either form `registerTool` accepts: built, or a field map. */
type ToolSchema = AnySchema | ToolFieldMap;

/**
 * The `registerTool` config. It names only the two fields this file replaces;
 * the title, description, annotations and `_meta` a caller passes ride along
 * through the spread untouched.
 */
interface ToolConfig {
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
}

/** `registerTool` with its generics fixed, so a wrapper can forward a call. */
type RegisterTool = (
  name: string,
  config: ToolConfig,
  handler: ToolCallback<ToolFieldMap>,
) => RegisteredTool;

/**
 * Returns the schema carrying our dialect in its metadata. Zod copies metadata
 * onto the converted document after it stamps the target dialect, so this
 * overrides the SDK's draft-7 default without forking the SDK. `meta` clones, so
 * the shared schema constants stay untouched, and the clone still carries the
 * title and description its parent registered.
 */
function withDialect(schema: ToolSchema | undefined): ToolSchema | undefined {
  if (schema === undefined) return undefined;

  // The SDK wraps a field map in an object schema before it converts one, so
  // wrap it the same way here and hand the SDK the finished object.
  // SAFETY: a value that is not a Zod schema is the other form registerTool
  // accepts, a map of Zod fields, and every tool builds those with this Zod.
  const object =
    schema instanceof z.ZodType ? schema : z.object(schema as Record<string, z.ZodType>);

  return object.meta({ $schema: ADVERTISED_JSON_SCHEMA_DIALECT });
}

/**
 * Makes every tool this server registers from now on advertise its input and
 * output schema under {@link ADVERTISED_JSON_SCHEMA_DIALECT}. Call it once,
 * before the first `registerTool`, so no tool can miss it: a host that drops a
 * tool over its dialect never says which registration forgot the tag.
 */
export function declareAdvertisedSchemaDialect(server: McpServer): void {
  // SAFETY: the wrapper only forwards its arguments, so it needs the method's
  // shared contract, not the per-tool generics TypeScript cannot carry through.
  const register = server.registerTool.bind(server) as RegisterTool;

  const registerWithDialect: RegisterTool = (name, config, handler) =>
    register(
      name,
      {
        ...config,
        inputSchema: withDialect(config.inputSchema),
        outputSchema: withDialect(config.outputSchema),
      },
      handler,
    );

  // SAFETY: each schema is replaced by an equivalent Zod object, so the wrapper
  // registers exactly the tool the caller described.
  server.registerTool = registerWithDialect as McpServer["registerTool"];
}
