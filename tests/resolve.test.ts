import { describe, expect, it } from 'vitest';
import { resolveTarget } from '../src/tabs/resolve';
import type { TabInfo } from '../src/tabs/adapter';

function tab(id: number, url: string): TabInfo {
  return { id, url, title: '', active: false };
}

describe('resolveTarget', () => {
  const open = [tab(1, 'https://example.com/docs'), tab(2, 'https://github.com/')];

  it('activates the matching open tab (exact URL)', () => {
    expect(resolveTarget('https://example.com/docs', open)).toEqual({
      action: 'activate',
      tabId: 1,
    });
  });

  it('ignores trailing slash difference', () => {
    expect(resolveTarget('https://github.com', open)).toEqual({
      action: 'activate',
      tabId: 2,
    });
  });

  it('ignores hash fragments', () => {
    expect(resolveTarget('https://example.com/docs#section', open)).toEqual({
      action: 'activate',
      tabId: 1,
    });
  });

  it('opens a new tab when no match found', () => {
    expect(resolveTarget('https://new-site.com', open)).toEqual({
      action: 'open',
      url: 'https://new-site.com',
    });
  });

  it('handles empty open tabs list', () => {
    expect(resolveTarget('https://example.com', [])).toEqual({
      action: 'open',
      url: 'https://example.com',
    });
  });
});
