import { z } from 'zod';

const color = z.string().max(100).regex(/^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:oklch|oklab|rgb|rgba|hsl|hsla)\([\d\s.%+,/\-]+\)|[a-zA-Z]+)$/);
export const designConfigSchema = z.object({
  colors: z.partialRecord(z.enum(['primary','primaryForeground','secondary','secondaryForeground','accent','accentForeground','muted','mutedForeground','destructive','destructiveForeground','background','foreground','card','cardForeground','popover','popoverForeground','border','input','ring']), color).optional(),
  radius: z.string().max(30).regex(/^\d+(?:\.\d+)?(?:px|rem|em)$/).optional(),
  font: z.object({sans: z.string().regex(/^[A-Za-z0-9 _,-]{1,100}$/).optional(), mono: z.string().regex(/^[A-Za-z0-9 _,-]{1,100}$/).optional()}).optional(),
  icons: z.object({libraryId: z.literal('lucide').optional(), variant: z.enum(['outline']).nullable().optional()}).optional(),
  density: z.enum(['compact','comfortable','spacious']).optional(),
}).strict();
export type DesignConfig = z.infer<typeof designConfigSchema>;

export const PROJECT_RULE_MAX_BYTES = 4 * 1024;
export const TEAM_RULES_MAX_BYTES = 32 * 1024;
export const PROJECT_RULE_NAME_MAX_CHARS = 120;
export const PROJECT_RULES_MAX_PER_PROJECT = 500;
export const projectRuleKindValues = ['guidelines', 'use', 'never', 'pairing', 'spec'] as const;
