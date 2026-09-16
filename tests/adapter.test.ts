import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTabAdapter, type ChromeTabsApi, type TabAdapter } from '../src/tabs/adapter';

/** Minimal mock event with fire(). */
function mockEvent<T>() {
  const listeners: T[] = [];
  return {
    addListener(cb: T) { listeners.push(cb); },
    removeListener(cb: T) {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
    fire() {
      for (const fn of listeners) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        (fn as Function)();
      }
    },
    get count() { return listeners.length; },
  };
}

function fakeTab(id: number, url: string, title: string, active = false): chrome.tabs.Tab {
  return { id, url, title, active, favIconUrl: '', index: 0, pinned: false, highlighted: false, windowId: 1, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 };
}

let api: ChromeTabsApi & {
  onCreated: ReturnType<typeof mockEvent>;
  onRemoved: ReturnType<typeof mockEvent>;
  onUpdated: ReturnType<typeof mockEvent>;
  onActivated: ReturnType<typeof mockEvent>;
  _tabs: chrome.tabs.Tab[];
};
let adapter: TabAdapter;

beforeEach(() => {
  const tabs = [fakeTab(1, 'https://a.com', 'A', true), fakeTab(2, 'https://b.com/page', 'B')];
  api = {
    _tabs: tabs,
    query: vi.fn(async () => api._tabs),
    update: vi.fn(async (id, props) => {
      const t = api._tabs.find((x) => x.id === id);
      if (t && props.active != null) t.active = props.active;
      return t!;
    }),
    create: vi.fn(async (props) => {
      const t = fakeTab(99, props.url ?? '', '');
      api._tabs.push(t);
      return t;
    }),
    onCreated: mockEvent(),
    onRemoved: mockEvent(),
    onUpdated: mockEvent(),
    onActivated: mockEvent(),
  };
  adapter = createTabAdapter(api);
});

describe('queryCurrentWindow', () => {
  it('maps chrome.tabs.Tab to TabInfo, filtering tabs without id', async () => {
    api._tabs.push({ url: 'x', title: 'no-id' } as chrome.tabs.Tab); // id undefined
    const result = await adapter.queryCurrentWindow();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, url: 'https://a.com', title: 'A', favIconUrl: '', active: true });
    expect(result[1]).toEqual({ id: 2, url: 'https://b.com/page', title: 'B', favIconUrl: '', active: false });
  });
});

describe('subscribe', () => {
  it('fires the listener with refreshed tabs when any chrome event fires', async () => {
    const listener = vi.fn();
    adapter.subscribe(listener);
    api.onCreated.fire();
    // wait for the async re-query Promise to resolve
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(listener).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 1 })]));
  });

  it('stops delivering after unsubscribe (all four events detached)', async () => {
    const listener = vi.fn();
    const unsub = adapter.subscribe(listener);
    unsub();
    expect(api.onCreated.count).toBe(0);
    expect(api.onRemoved.count).toBe(0);
    expect(api.onUpdated.count).toBe(0);
    expect(api.onActivated.count).toBe(0);
  });
});

describe('activate', () => {
  it('calls chrome.tabs.update with active: true', async () => {
    await adapter.activate(2);
    expect(api.update).toHaveBeenCalledWith(2, { active: true });
  });
});

describe('openUrl', () => {
  it('calls chrome.tabs.create with the given url', async () => {
    await adapter.openUrl('https://new.com');
    expect(api.create).toHaveBeenCalledWith({ url: 'https://new.com' });
  });
});

describe('openInCurrentTab', () => {
  it('updates the currently active tab with the given url', async () => {
    await adapter.openInCurrentTab('https://update-current.com');
    expect(api.update).toHaveBeenCalledWith(1, { url: 'https://update-current.com' });
  });
});
