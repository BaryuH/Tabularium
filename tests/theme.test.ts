import { describe, expect, it } from 'vitest';
import { resolveEffective } from '../src/theme';

describe('resolveEffective', () => {
  it('always returns dark mode', () => {
    expect(resolveEffective()).toBe('dark');
  });
});
