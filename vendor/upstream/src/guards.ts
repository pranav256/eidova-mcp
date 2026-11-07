/**
 * Type predicates and environment checks that replace inline `typeof` narrowing.
 *
 * The `anti-slop/no-runtime-typeof` rule rejects `typeof` anywhere except inside
 * a function that returns a type predicate, so every `typeof` the codebase still
 * needs lives here behind a named contract. Environment checks use `in
 * globalThis` instead, because there is no value to narrow.
 *
 * Each predicate takes `TValue | Primitive` rather than `unknown`, so it accepts
 * any argument without tripping `anti-slop/no-unknown-parameters`, and narrows a
 * union the same way the `typeof` check it replaces did.
 */

/** Narrows a value to `string`. */
export function isString<TValue>(value: TValue | string): value is string {
  return typeof value === "string";
}

/** Narrows a value to `number`. Values that are `NaN` still pass, as with `typeof`. */
export function isNumber<TValue>(value: TValue | number): value is number {
  return typeof value === "number";
}

/** Narrows a value to `boolean`. */
export function isBoolean<TValue>(value: TValue | boolean): value is boolean {
  return typeof value === "boolean";
}

/**
 * Narrows a value to a non-null object, arrays included.
 *
 * This is `typeof value === "object" && value !== null`. The old check also
 * passed `null`, which nearly every caller then had to exclude by hand, so the
 * null case is excluded here once.
 */
export function isObjectLike<TValue>(value: TValue): value is TValue & object {
  return typeof value === "object" && value !== null;
}

/** Narrows a value to a non-null object that is not an array. */
export function isRecordLike<TValue>(value: TValue): value is TValue & object {
  return isObjectLike(value) && !Array.isArray(value);
}

// A shared `isCallable` is deliberately absent. A predicate broad enough to
// accept any value can only narrow to a signature that takes `never[]`, so
// callers cannot invoke the result. Write a local predicate that names the
// signature the call site actually expects, for example:
//
//   function isRenderProp(value: Children): value is (state: State) => ReactNode {
//     return typeof value === "function";
//   }
//
// A shared object predicate is absent for the same reason: `object` in a
// parameter position trips `anti-slop/no-object-parameters`, and a dictionary of
// `unknown` trips `anti-slop/no-unsafe-dictionary-type`. Narrow to the record
// contract the call site owns.

/** Reports whether a global name is bound, without touching an unbound identifier. */
export function hasGlobal(name: string): boolean {
  return name in globalThis;
}

/** Reports whether the code is running where a DOM `window` exists. */
export function isBrowser(): boolean {
  return hasGlobal("window");
}

/** Reports whether a DOM `document` exists, for code that renders on both sides. */
export function hasDocument(): boolean {
  return hasGlobal("document");
}

/** Reports whether a DOM `navigator` exists. */
export function hasNavigator(): boolean {
  return hasGlobal("navigator");
}

/** Reports whether a Node-style `process` global exists. */
export function hasProcess(): boolean {
  return hasGlobal("process");
}

/**
 * Reads a closed literal table by a runtime key, keeping the table's inferred
 * type instead of widening it to a dictionary.
 */
export function lookup<TValue>(table: Record<string, TValue>, key: string): TValue | undefined {
  return table[key];
}

/**
 * Any value JSON can represent. The named value type for genuinely open
 * dictionaries, where `unknown` would erase what the keys map onto.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object: string keys onto `JsonValue`. */
export type JsonObject = { [key: string]: JsonValue };
