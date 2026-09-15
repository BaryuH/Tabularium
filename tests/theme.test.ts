import { describe, expect, it } from 'vitest';
import { resolveEffective } from '../src/theme';

describe('resolveEffective', () => {
  it('returns light when pref is light regardless of system', () => {
    expect(resolveEffective('light', true)).toBe('light');
    expect(resolveEffective('light', false)).toBe('light');
  });

  it('returns dark when pref is dark regardless of system', () => {
    expect(resolveEffective('dark', true)).toBe('dark');
    expect(resolveEffective('dark', false)).toBe('dark');
  });

  it('follows system preference when pref is system', () => {
    expect(resolveEffective('system', false)).toBe('light');
    expect(resolveEffective('system', true)).toBe('dark');
  });
});
