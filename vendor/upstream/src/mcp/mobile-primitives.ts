import { z } from "zod";


/**
 * The stored mobile representation of one design system for one target.
 *
 * This is the phone counterpart of the Shopify primitive set (ADR 0003). It is
 * compiled from the system's component source at seed time and read verbatim
 * on request, so a caller never rebuilds a kit from React source at call time.
 *
 * One identity extraction serves both targets. The `identity` block holds the
 * system's own material in a target-neutral form, and each target's emitter
 * renders it into the files a developer takes away. Storing the neutral form
 * beside the files lets the admin tab show what was lifted without parsing
 * generated source. [BD-729, BD-734]
 */
export const MOBILE_PRIMITIVE_CONTRACT_VERSION = 1 as const;

/**
 * The marker a colour carries when it names a token rather than a value.
 * `$primary` reads the scheme's `primary`, so one stored set serves light and
 * dark. It lives here because both the extractor and the emitters read it,
 * and neither may import the other.
 */
export const TOKEN_REFERENCE_PREFIX = "$";

/** The two mobile targets a set can be compiled for. */
export const mobileTargetSchema = z.enum(["react-native", "swiftui"]);
/** One of the two mobile targets, as a stored set names it. */
export type MobileTarget = z.infer<typeof mobileTargetSchema>;

/**
 * One shadow as React Native and SwiftUI both understand it: a single layer with
 * a colour, an offset, an opacity and a blur radius. CSS stacks collapse to
 * their outermost layer, because neither runtime paints more than one.
 */
export const nativeShadowSchema = z.object({
  shadowColor: z.string().min(1),
  shadowOffset: z.object({ width: z.number(), height: z.number() }),
  shadowOpacity: z.number().min(0).max(1),
  shadowRadius: z.number().min(0),
  /** Android paints elevation instead of a shadow; SwiftUI ignores it. */
  elevation: z.number().min(0),
});
/** One shadow layer in the shape both runtimes read. */
export type NativeShadow = z.infer<typeof nativeShadowSchema>;

/**
 * A value a native style can hold. Lengths are points, colours are hex, and a
 * shadow is one layer. A string that is not a colour is a font family or a
 * font weight, which both runtimes take as text.
 */
export const nativeValueSchema = z.union([z.number(), z.string(), nativeShadowSchema]);
/** Any value a native style declaration can carry. */
export type NativeValue = z.infer<typeof nativeValueSchema>;

/**
 * One lifted declaration: which component, which native property, what value.
 *
 * `component` names the web primitive it came from (`button`, `card`) and
 * `variant` the cva variant when the material lives on one (`primary`). The
 * property uses React Native's camelCase names; the SwiftUI emitter maps them.
 */
export const identityDeclarationSchema = z.object({
  component: z.string().min(1),
  variant: z.string().optional(),
  property: z.string().min(1),
  value: nativeValueSchema,
});
/** One lifted declaration, from a web primitive to a native property. */
export type IdentityDeclaration = z.infer<typeof identityDeclarationSchema>;

const mobileFileSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1),
});
/** One file a developer writes verbatim at its path. */
export type MobileFile = z.infer<typeof mobileFileSchema>;

/** The set as stored on `design_systems` and `projects`. */
export const mobilePrimitiveSetSchema = z.object({
  contractVersion: z.literal(MOBILE_PRIMITIVE_CONTRACT_VERSION),
  target: mobileTargetSchema,
  /** The token sheet the set compiled from, kept so a reviewer can diff it. */
  tokensCss: z.string().min(1),
  /** The system's own material, lifted from its component source. */
  identity: z.array(identityDeclarationSchema),
  /** Web primitives the extraction could carry, mirroring the Shopify field. */
  coveredSourcePrimitives: z.array(z.string()),
  /** Tokens the compiler could not carry to a phone, with the scheme they came from. */
  unsupportedTokens: z.array(
    z.object({ name: z.string(), value: z.string(), mode: z.enum(["light", "dark"]) }),
  ),
  /** The files a developer takes away, read verbatim on request. */
  files: z.array(mobileFileSchema).min(1),
});
/** The stored set, validated on the way in and out of the database. */
export type MobilePrimitiveSet = z.infer<typeof mobilePrimitiveSetSchema>;

/** Validates a stored value against the mobile primitive set schema. */
export function parseMobilePrimitiveSet<TValue>(value: TValue): MobilePrimitiveSet | null {
  const parsed = mobilePrimitiveSetSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
