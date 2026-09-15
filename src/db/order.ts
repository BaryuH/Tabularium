/**
 * Ordering helpers. Siblings are gap-indexed by `order` (multiples of
 * ORDER_STEP) so appends are cheap; drag-reorder rewrites a sibling group
 * to a clean sequence via `sequentialOrders`.
 */

export const ORDER_STEP = 1000;

/** Order value for appending after the given siblings. */
export function nextOrder(items: ReadonlyArray<{ order: number }>): number {
  if (items.length === 0) return ORDER_STEP;
  let max = items[0].order;
  for (const item of items) if (item.order > max) max = item.order;
  return max + ORDER_STEP;
}

/** A clean ascending sequence of `count` order values. */
export function sequentialOrders(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push((i + 1) * ORDER_STEP);
  return out;
}

/** Comparator sorting by ascending `order`. */
export function bySortOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}
