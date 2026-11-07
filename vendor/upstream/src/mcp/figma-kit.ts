import { z } from "zod"

/**
 * A client's Figma kit as the Better Design plugin reads it: the variables in
 * every mode, the text and effect styles, and the components with their
 * variants. An agent cannot read a Figma file itself, so this is the shape the
 * plugin hands over through the local relay. [BD-1056]
 */

const colorSchema = z.object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() })

/** One variable value in one mode: a literal, or a pointer to another variable by name. */
export const kitValueSchema = z.union([
  z.object({ color: colorSchema }),
  z.object({ number: z.number() }),
  z.object({ string: z.string() }),
  z.object({ boolean: z.boolean() }),
  z.object({ alias: z.string() }),
])

/** A variable with its value in each mode of its collection, keyed by mode name. */
export const kitVariableSchema = z.object({
  name: z.string(),
  type: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]),
  values: z.record(z.string(), kitValueSchema),
})

/** A variable collection and the names of its modes, such as Light and Dark. */
export const kitCollectionSchema = z.object({
  name: z.string(),
  modes: z.array(z.string()),
  variables: z.array(kitVariableSchema),
})

/** A local text style, with the values a component needs to set type. */
export const kitTextStyleSchema = z.object({
  name: z.string(),
  fontFamily: z.string(),
  fontStyle: z.string(),
  fontSize: z.number(),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
})

/** A local effect style: a stack of shadows or blurs. */
export const kitEffectStyleSchema = z.object({
  name: z.string(),
  effects: z.array(
    z.object({
      type: z.string(),
      color: colorSchema.optional(),
      offset: z.object({ x: z.number(), y: z.number() }).optional(),
      radius: z.number().optional(),
      spread: z.number().optional(),
    }),
  ),
})

/** A component or a component set, with the options of each variant property. */
export const kitComponentSchema = z.object({
  name: z.string(),
  key: z.string(),
  page: z.string(),
  variants: z.number(),
  properties: z.record(z.string(), z.array(z.string())),
})

/** The whole kit, as one read of the open file. */
export const figmaKitSchema = z.object({
  file: z.string(),
  collections: z.array(kitCollectionSchema),
  textStyles: z.array(kitTextStyleSchema),
  effectStyles: z.array(kitEffectStyleSchema),
  components: z.array(kitComponentSchema),
})

/** The kit as the relay and the tool carry it. */
export type FigmaKit = z.infer<typeof figmaKitSchema>

/** A kit's file name and how much it holds. [BD-1056] */
export interface KitCounts {
  file: string
  collections: number
  variables: number
  textStyles: number
  effectStyles: number
  components: number
}

/** The counts an agent reads back after a kit read or save. */
export function kitCounts(kit: FigmaKit): KitCounts {
  return {
    file: kit.file,
    collections: kit.collections.length,
    variables: kit.collections.reduce((total, collection) => total + collection.variables.length, 0),
    textStyles: kit.textStyles.length,
    effectStyles: kit.effectStyles.length,
    components: kit.components.length,
  }
}
