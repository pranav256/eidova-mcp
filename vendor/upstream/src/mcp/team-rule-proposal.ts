import { z } from "zod";

/**
 * The three parts of one proposed team rule, with lengths that keep it one
 * readable list item. The MCP tool and the v1 route both validate with it, so
 * an agent on either transport is held to the same limits. [BD-1050]
 */
export const teamRuleProposalParts = {
  rule: z.string().trim().min(1).max(500),
  why: z.string().trim().min(1).max(300),
  where: z.string().trim().min(1).max(200),
};
