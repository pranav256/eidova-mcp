export function normalizePrincipleTopic(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^principle-/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
