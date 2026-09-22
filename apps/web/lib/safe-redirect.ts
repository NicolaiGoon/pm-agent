/**
 * `next` arrives from a query string, so it is attacker-controlled. Anything
 * other than a path on this origin would turn the auth callback into an open
 * redirect — a convincing phishing step, since the victim really did just sign
 * in to the genuine site.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  // "//evil.com" and "/\evil.com" are protocol-relative URLs, not local paths.
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // A backslash can be normalised to a slash by some clients.
  if (value.includes("\\")) return fallback;
  return value;
}
