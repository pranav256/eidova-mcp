// The motion every design system names, and the profiles its values come from.
// See docs/adr/0010-motion-tokens-per-design-system.md. Each system's own
// globals.css holds its values; these tables are how a value is chosen, and
// what the catalog test and the generation pipeline check against.

/** The six motion tokens, in the order a design system's sheet declares them. */
export const MOTION_TOKEN_NAMES = [
  "--transition-duration-fast",
  "--transition-duration-base",
  "--transition-duration-slow",
  "--ease-out",
  "--ease-in-out",
  "--ease-in",
] as const;

/** One motion token's name. */
export type MotionTokenName = (typeof MOTION_TOKEN_NAMES)[number];

/** A full set of motion token values. */
export type MotionProfile = Record<MotionTokenName, string>;

/**
 * The three motion profiles. Every curve is from the easing reference in
 * docs/ui/animation-and-motion.md, and none overshoots, because a system's
 * default curve also times its colour and shadow transitions.
 */
export const MOTION_PROFILES = {
  /** Dense tools, terminals, industrial and brutalist systems. */
  crisp: {
    "--transition-duration-fast": "120ms",
    "--transition-duration-base": "160ms",
    "--transition-duration-slow": "220ms",
    "--ease-out": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    "--ease-in-out": "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
    "--ease-in": "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
  },
  /** Product UI, and the default for a generated system. */
  standard: {
    "--transition-duration-fast": "150ms",
    "--transition-duration-base": "200ms",
    "--transition-duration-slow": "280ms",
    "--ease-out": "cubic-bezier(0.165, 0.84, 0.44, 1)",
    "--ease-in-out": "cubic-bezier(0.645, 0.045, 0.355, 1)",
    "--ease-in": "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
  },
  /** Luxury, glass and editorial systems. */
  soft: {
    "--transition-duration-fast": "180ms",
    "--transition-duration-base": "240ms",
    "--transition-duration-slow": "300ms",
    "--ease-out": "cubic-bezier(0.19, 1, 0.22, 1)",
    "--ease-in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
    "--ease-in": "cubic-bezier(0.895, 0.03, 0.685, 0.22)",
  },
} as const satisfies Record<string, MotionProfile>;

/**
 * Tailwind v4's defaults, pointed at the tokens. A bare `transition-*` class
 * reads these, so a system's components follow its motion with no edit.
 */
export const MOTION_TAILWIND_WIRES = [
  ["--default-transition-duration", "var(--transition-duration-fast)"],
  ["--default-transition-timing-function", "var(--ease-out)"],
] as const;
