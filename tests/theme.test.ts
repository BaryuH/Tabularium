import { describe, expect, it } from 'vitest';
import { resolveEffective } from '../src/theme';

describe('resolveEffective', () => {
  it('returns light when pref is light', () => {
    expect(resolveEffective('light')).toBe('light');
  });

  it('returns dark when pref is dark', () => {
    expect(resolveEffective('dark')).toBe('dark');
  });
});
