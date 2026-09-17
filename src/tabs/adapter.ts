/**
 * Adapter wrapping `chrome.tabs` for the sidebar.
 *
 * All `chrome.*` usage in the extension is isolated behind this module.
 * Consumers and tests receive `ChromeTabsApi`, a narrow structural interface
 * that `chrome.tabs` satisfies but that is trivially mockable.
 */

/** Minimal event contract (addListener + removeListener). */
interface SimpleEvent<T> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
}

/** Subset of `chrome.windows` consumed by the adapter. */
export interface ChromeWindowsApi {
  create(createData: { url?: string | string[]; focused?: boolean }): Promise<chrome.windows.Window>;
}

/** Subset of `chrome.tabs` consumed by the adapter. */
export interface ChromeTabsApi {
  query(queryInfo: { currentWindow?: boolean }): Promise<chrome.tabs.Tab[]>;
  update(tabId: number, properties: { active?: boolean; url?: string }): Promise<chrome.tabs.Tab>;
  create(properties: { url?: string; active?: boolean }): Promise<chrome.tabs.Tab>;
  remove?(tabIds: number | number[]): Promise<void>;
  onCreated: SimpleEvent<(tab: chrome.tabs.Tab) => void>;
  onRemoved: SimpleEvent<(tabId: number, info: chrome.tabs.TabRemoveInfo) => void>;
  onUpdated: SimpleEvent<(tabId: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void>;
  onActivated: SimpleEvent<(info: chrome.tabs.TabActiveInfo) => void>;
}

/** A browser tab projected to the fields the sidebar needs. */
export interface TabInfo {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  active: boolean;
}

/** Public contract for tab operations used by the sidebar and card-activate. */
export interface TabAdapter {
  queryCurrentWindow(): Promise<TabInfo[]>;
  /** Subscribe to real-time tab changes; returns an unsubscribe function. */
  subscribe(listener: (tabs: TabInfo[]) => void): () => void;
  activate(tabId: number): Promise<void>;
  openUrl(url: string): Promise<void>;
  openInCurrentTab(url: string): Promise<void>;
  /** Close tabs by ID to instantly release their RAM. */
  closeTabs(tabIds: number[]): Promise<void>;
  /** Restore a list of URLs into a new browser window. */
  createWindow(urls: string[]): Promise<void>;
  /** Restore a list of URLs directly into the current browser window. */
  openTabsInCurrentWindow(urls: string[]): Promise<void>;
}

function mapTab(tab: chrome.tabs.Tab): TabInfo | null {
  if (tab.id == null) return null;
  return {
    id: tab.id,
    url: tab.url ?? '',
    title: tab.title ?? '',
    favIconUrl: tab.favIconUrl,
    active: tab.active ?? false,
  };
}

export function createTabAdapter(api: ChromeTabsApi, windowsApi?: ChromeWindowsApi): TabAdapter {
  const queryCurrentWindow = async (): Promise<TabInfo[]> => {
    const raw = await api.query({ currentWindow: true });
    return raw.map(mapTab).filter((t): t is TabInfo => t !== null);
  };

  return {
    queryCurrentWindow,

    subscribe(listener) {
      let generation = 0;
      const refresh = (): void => {
        const gen = ++generation;
        void queryCurrentWindow().then((tabs) => {
          if (gen === generation) listener(tabs);
        });
      };
      api.onCreated.addListener(refresh);
      api.onRemoved.addListener(refresh);
      api.onUpdated.addListener(refresh);
      api.onActivated.addListener(refresh);
      return () => {
        api.onCreated.removeListener(refresh);
        api.onRemoved.removeListener(refresh);
        api.onUpdated.removeListener(refresh);
        api.onActivated.removeListener(refresh);
      };
    },

    async activate(tabId) {
      await api.update(tabId, { active: true });
    },

    async openUrl(url) {
      await api.create({ url });
    },

    async openInCurrentTab(url) {
      const tabs = await api.query({ currentWindow: true });
      const current = tabs.find((t) => t.active);
      if (current?.id != null) {
        await api.update(current.id, { url });
      } else {
        await api.create({ url });
      }
    },
    async closeTabs(tabIds: number[]) {
      if (tabIds.length === 0) return;
      if (api.remove) {
        await api.remove(tabIds);
      }
    },
    async createWindow(urls: string[]) {
      if (urls.length === 0) return;
      if (windowsApi?.create) {
        await windowsApi.create({ url: urls, focused: true });
      } else {
        for (const url of urls) {
          await api.create({ url });
        }
      }
    },
    async openTabsInCurrentWindow(urls: string[]) {
      if (urls.length === 0) return;
      for (const url of urls) {
        await api.create({ url, active: false });
      }
    },
  };
}

/**
 * Try to build a TabAdapter from the global `chrome.tabs` if available.
 * Returns `null` outside an extension context (e.g. served-dist smoke).
 * This is the only place that reads the global `chrome` object so that
 * no chrome.* leaks into UI or entry-point code (AGENTS.md §3).
 */
export function tryCreateTabAdapter(): TabAdapter | null {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;
  const windowsApi = typeof chrome.windows !== 'undefined' ? chrome.windows : undefined;
  return createTabAdapter(chrome.tabs, windowsApi);
}

/**
 * Listen for change broadcasts from the service worker (M9 quick-save).
 * Gracefully no-ops outside an extension context.
 */
export function onExternalChange(callback: () => void): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    if (msg && typeof msg === 'object' && 'type' in msg && msg.type === 'tabularium:external-change') {
      callback();
    }
  });
}
