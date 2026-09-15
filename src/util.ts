/** Shared, framework-free helpers. */

/** Index a list of entities by their string `id`. */
export function indexById<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[item.id] = item;
  return out;
}
