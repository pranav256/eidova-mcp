// One redaction policy for every free-text trace field, on both sinks. [BD-697]
//
// The patterns and `redactSecrets` used to live in `mcp-trace.ts`, so only the
// writes that went through that module were covered. Three paths were not:
// `ds_search_queries.query`, which stored the raw query; PostHog's
// `$ai_input_state` and `$ai_output_state`, which only ever had a length cap;
// and the `$ai_input` on every traced completion. Redaction belongs beside the
// sanitizer that everything already calls, not beside one writer, so a new
// trace field inherits it instead of opting in.

/**
 * Secret shapes worth removing from free-text telemetry.
 *
 * Ordered longest-prefix-first so a token that starts with a shorter pattern is
 * still matched whole. Each entry is anchored on a distinctive prefix rather
 * than on entropy, because guessing at "this looks random" removes legitimate
 * query text and still misses the short secrets.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bbd_(?:live|test)_[A-Za-z0-9_-]{8,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  // Stripe live and test keys and webhook secrets, and Google API keys. A
  // full review source can carry them, and that copy is kept past 180 days.
  // [BD-816]
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bwhsec_[A-Za-z0-9]{16,}/g,
  /\bAIza[A-Za-z0-9_-]{30,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
];

/**
 * Credential values after a key name or an auth scheme. They run first and
 * take the whole value, dots and all, so no other marker can split it.
 */
const CREDENTIAL_VALUE_PATTERNS: RegExp[] = [
  // An Authorization header with any scheme, in a header dump, a curl
  // argument or JSON: the scheme word and the whole credential after it go
  // together. It runs before the key=value form, which took the scheme word
  // as the value and left the token, and before the bearer form, which knows
  // only three schemes. A quoted value is taken whole, as the key=value form
  // takes it, so `'Token token="..."'` keeps no inner part. The scheme word
  // cannot hold whitespace or `%`, so the separator ends it and the match
  // stays linear. [BD-979]
  /(?:\b|_)authorization["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|["']?[A-Za-z][A-Za-z0-9_-]*(?:\s+|%20)[^\s"'<>]+)/gi,
  // key=value forms for the names that carry credentials. A quoted value is
  // taken whole, so a passphrase with spaces and a short password both go:
  // the old form needed eight characters and no spaces, which let
  // `password="hunter2"` and `password="correct horse battery staple"`
  // through into a corpus held for 180 days. [BD-697]
  /(?:\b|_)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret(?:[_-]?key)?|password|passwd|authorization)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[A-Za-z0-9._~+/-]+)/gi,
  // Authorization headers separate the scheme from the token with a space.
  /\b(?:bearer|basic|token)\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  // A token in a query string, such as the claim link an agent gets when its
  // free budget runs out. That link hands the agent's keys to whoever opens
  // it. [BD-956]
  /[?&]token=[A-Za-z0-9_-]{16,}/gi,
];

/**
 * A JWT: three dot-separated segments, the first starting `eyJ` where a word
 * starts, as `\b` required. It may follow a hyphen, as in `x-eyJ...`, but not
 * a letter, a digit or an underscore: an underscore start would let
 * `x_eyJ...` take the next token's segments or cut a longer value short.
 *
 * A match starts only where a run of token characters starts, and the
 * lookahead checks the three-segment shape once for that run. Group 1 keeps
 * whatever part of the run comes before the `eyJ`. With `\b` in front of the
 * `eyJ`, a long `eyJ-eyJ-` run had a start before every `e` and each start
 * rescanned the rest of the run, so the time grew with the square of the
 * input: 240,000 characters took about 2 seconds under Bun. [BD-954]
 */
const JWT_PATTERN =
  /(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-])([A-Za-z0-9_-]*?)(?<![A-Za-z0-9_])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g;

/**
 * Email addresses, redacted as personal data rather than as a credential.
 * A match starts only where a run of address characters starts. With `\b`, a
 * long `a.a.a` run with no `@` was rescanned from every letter, so the time
 * grew with the square of the input: 240,000 characters took over 8 seconds,
 * and full MCP arguments now reach this pattern. [BD-819]
 */
const EMAIL_PATTERN = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Digit runs long enough to be a payment card, with the separators a person
 * types. The match alone does not redact: `looksLikeCard` runs the Luhn check
 * first, because a bare 16-digit run is just as likely to be an order id, and
 * removing those would cost the corpus more than it protects.
 */
const CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/g;

/**
 * Telephone numbers in the forms a person writes them: an international number
 * with its plus sign, or a grouped national number. A separator or a leading
 * plus is required, so a plain digit string stays in the corpus. Version
 * strings such as `1.2.3` have too few digits per group to match.
 */
const PHONE_PATTERNS: RegExp[] = [
  /\+\d[\d\s().-]{7,17}\d/g,
  /\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
];

/**
 * Runs the Luhn checksum over the digits of a candidate. Every payment card
 * satisfies it and an arbitrary identifier satisfies it about one time in ten,
 * so this is the cheap test that keeps ordinary long numbers out of the
 * redaction.
 */
export function looksLikeCard(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let value = digits.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Removes credentials and personal data from caller-supplied trace text.
 *
 * These fields hold whatever an agent typed or whatever an error happened to
 * carry, so a key or a customer's email pasted into a request would otherwise
 * be stored in full and shown in the admin UI. Masking at render time is not
 * enough: the value has already been written by then, and the table outlives
 * the screen. Each kind of match keeps its own placeholder, so the text stays
 * readable for analysis and a reader can see what was taken out.
 */
export function redactSecrets(value: string): string {
  // Strip NUL first. Postgres rejects the byte so it is removed before the
  // insert either way, which means a caller can hide a key from the patterns
  // by splitting it: `sk-\u0000proj-...` matches nothing here, and the byte is
  // then dropped, storing the reassembled credential in cleartext.
  let out = value.replace(/\u0000/g, "");
  // Whole credential values go first, then the JWT, so a prefix pattern such
  // as `bd_live_` cannot take its first segment and leave the rest behind.
  for (const pattern of CREDENTIAL_VALUE_PATTERNS) out = out.replace(pattern, "[redacted]");
  out = out.replace(JWT_PATTERN, "$1[redacted]");
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[redacted]");
  out = out.replace(EMAIL_PATTERN, "[redacted-email]");
  out = out.replace(CARD_CANDIDATE_PATTERN, (match) =>
    looksLikeCard(match) ? "[redacted-card]" : match,
  );
  for (const pattern of PHONE_PATTERNS) out = out.replace(pattern, "[redacted-phone]");
  return out;
}

/**
 * Keeps a URL's site and path and drops its query and fragment. A query string
 * can carry signed tokens or user identifiers, and credentials never belong in
 * a log or a training copy.
 */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // A data: or javascript: URL has no site, and its path is the payload.
    if (u.protocol !== "http:" && u.protocol !== "https:") return "[redacted]";
    return `${u.origin}${u.pathname}`;
  } catch {
    // Not an error path: an unparsable URL is exactly what must never reach a
    // log, so the redaction is the correct silent result.
    return "[redacted]";
  }
}
