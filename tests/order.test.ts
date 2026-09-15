import { describe, expect, it } from 'vitest';
import { ORDER_STEP, bySortOrder, nextOrder, sequentialOrders } from '../src/db/order';

describe('order helpers', () => {
  it('nextOrder returns ORDER_STEP for an empty group', () => {
    expect(nextOrder([])).toBe(ORDER_STEP);
  });

  it('nextOrder appends past the current max regardless of input order', () => {
    expect(nextOrder([{ order: 1000 }, { order: 3000 }, { order: 2000 }])).toBe(4000);
  });

  it('sequentialOrders produces an ascending gap-indexed sequence', () => {
    expect(sequentialOrders(3)).toEqual([1000, 2000, 3000]);
    expect(sequentialOrders(0)).toEqual([]);
  });

  it('bySortOrder sorts ascending by order', () => {
    const xs = [{ order: 30 }, { order: 10 }, { order: 20 }];
    expect([...xs].sort(bySortOrder).map((x) => x.order)).toEqual([10, 20, 30]);
  });
});
