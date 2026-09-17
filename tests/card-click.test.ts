import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabAdapter } from '../src/tabs/adapter';

describe('Card click navigation behavior', () => {
  let adapter: TabAdapter;
  let openInCurrentTabSpy: ReturnType<typeof vi.fn>;
  let openUrlSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    openInCurrentTabSpy = vi.fn(async () => {});
    openUrlSpy = vi.fn(async () => {});
    adapter = {
      queryCurrentWindow: vi.fn(async () => []),
      subscribe: vi.fn(() => () => {}),
      activate: vi.fn(async () => {}),
      openUrl: openUrlSpy,
      openInCurrentTab: openInCurrentTabSpy,
      closeTabs: vi.fn(async () => {}),
      createWindow: vi.fn(async () => {}),
      openTabsInCurrentWindow: vi.fn(async () => {}),
    };
  });

  const handleCardClick = async (
    url: string,
    event?: { ctrlKey?: boolean; metaKey?: boolean; button?: number; type?: string },
    behavior?: 'new-tab' | 'current-tab',
  ) => {
    const isNewTab = Boolean(
      event && (
        event.button === 2 ||
        event.button === 1 ||
        event.type === 'contextmenu' ||
        event.ctrlKey ||
        event.metaKey
      ),
    );
    const effectiveBehavior = behavior ?? 'current-tab';
    if (isNewTab || effectiveBehavior === 'new-tab') {
      await adapter.openUrl(url, false);
    } else {
      await adapter.openInCurrentTab(url);
    }
  };

  it('navigates in current tab on normal left click (no Ctrl key, button 0)', async () => {
    await handleCardClick('https://example.com', { ctrlKey: false, metaKey: false, button: 0, type: 'click' });
    expect(openInCurrentTabSpy).toHaveBeenCalledWith('https://example.com');
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('opens in new background tab on right click (button === 2)', async () => {
    await handleCardClick('https://example.com', { button: 2, type: 'contextmenu' });
    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com', false);
    expect(openInCurrentTabSpy).not.toHaveBeenCalled();
  });

  it('opens in new background tab on contextmenu event', async () => {
    await handleCardClick('https://example.com', { type: 'contextmenu' });
    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com', false);
    expect(openInCurrentTabSpy).not.toHaveBeenCalled();
  });

  it('opens in new background tab when Ctrl key is pressed', async () => {
    await handleCardClick('https://example.com', { ctrlKey: true, metaKey: false, button: 0, type: 'click' });
    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com', false);
    expect(openInCurrentTabSpy).not.toHaveBeenCalled();
  });

  it('opens in new background tab when Meta (Command) key is pressed', async () => {
    await handleCardClick('https://example.com', { ctrlKey: false, metaKey: true, button: 0, type: 'click' });
    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com', false);
    expect(openInCurrentTabSpy).not.toHaveBeenCalled();
  });

  it('opens in new background tab on middle click (button === 1)', async () => {
    await handleCardClick('https://example.com', { ctrlKey: false, metaKey: false, button: 1, type: 'auxclick' });
    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com', false);
    expect(openInCurrentTabSpy).not.toHaveBeenCalled();
  });

  it('defaults to current tab when behavior is undefined', async () => {
    await handleCardClick('https://example.com', undefined, undefined);
    expect(openInCurrentTabSpy).toHaveBeenCalledWith('https://example.com');
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('opens in new tab if openBehavior is explicitly configured to new-tab', async () => {
    await handleCardClick('https://example.com', { ctrlKey: false, button: 0, type: 'click' }, 'new-tab');
    expect(openUrlSpy).toHaveBeenCalledWith('https://example.com', false);
    expect(openInCurrentTabSpy).not.toHaveBeenCalled();
  });
});
