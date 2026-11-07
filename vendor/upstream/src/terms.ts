/**
 * The Terms of Service version a signup or an agent key accepts. Change it
 * whenever the terms change: new signups and new keys record the new value,
 * and a row holding an older value shows which text that person agreed to.
 * The value is the date the revision takes effect, so it sorts. [BD-822]
 */
export const CURRENT_TERMS_VERSION = "2026-09-22";

/** The effective date of `CURRENT_TERMS_VERSION`, as the terms page prints it. */
export const TERMS_EFFECTIVE_DATE = "22 September 2026";

/** Where the current terms live, for responses that leave the web app. */
export const TERMS_URL = "https://better-design.com/terms";
