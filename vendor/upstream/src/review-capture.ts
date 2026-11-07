import { z } from "zod";

import { isString, type JsonObject } from "./guards";
import { redactSecrets } from "./redact";
import type { TraceTarget } from "./trace-targets";

// The shapes a review tool hands the remote transport so the full review can
// be kept in R2 [BD-816]. Not the same thing as the dashboard review capture
// route (`v1/dashboard-review-capture.ts`), which screenshots a preview URL.

/**
 * Guesses the target of submitted front-end source. It reads the markup's
 * own syntax, so it holds for code a caller pasted without naming a target.
 */
export function detectCodeTarget(code: string): TraceTarget {
  if (/\{%-?\s*(schema|section|render|if|for)\b/.test(code)) return "shopify";
  if (/\bimport\s+SwiftUI\b|:\s*some\s+View\b/.test(code)) return "swiftui";
  if (/from\s+["']react-native["']|<(View|Text|Pressable)[\s>]/.test(code)) return "react-native";
  if (/\bclassName=|\bimport\s.+\sfrom\s|export\s+default\s/.test(code)) return "react";
  if (/<[a-z][\w-]*[\s>]/i.test(code)) return "html";
  return "unknown";
}

/** One review finding, reduced to what a before and after pair compares. */
export interface ReviewFindingRecord {
  /** Stable across runs of the same rule on the same page, so a pair can tell which findings went away. */
  key: string;
  severity: string;
  problem: string;
}

/**
 * The full review a tool received and returned, kept for the training copy
 * [BD-816]. Only the remote transport persists it; the stdio client never
 * sends it, so `review-ui-code`'s promise that source stays local holds.
 */
export interface ReviewCapture {
  /** The caller's name for the page, the basis of the page key. */
  page: string;
  input: JsonObject;
  output: string;
  findings: ReviewFindingRecord[];
}

const jsonObject = z.record(z.string(), z.json());

/** A tool's parsed arguments: JSON, except that optional fields may be `undefined`. */
export type ToolArgs = string | number | boolean | null | undefined | ToolArgs[] | { [key: string]: ToolArgs };

/**
 * Copies a tool's parsed arguments into plain JSON with every secret
 * redacted, keeping the shape. `undefined` fields drop out.
 */
export function toRedactedJson(args: { [key: string]: ToolArgs }): JsonObject {
  const text = JSON.stringify(args, (_key, value: ToolArgs) => (isString(value) ? redactSecrets(value) : value));
  return jsonObject.parse(JSON.parse(text));
}
