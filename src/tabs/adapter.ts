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

/** Subset of `chrome.tabs` consumed by the adapter. */
export interface ChromeTabsApi {
  query(queryInfo: { currentWindow?: boolean }): Promise<chrome.tabs.Tab[]>;
  update(tabId: number, properties: { active?: boolean }): Promise<chrome.tabs.Tab>;
  create(properties: { url?: string }): Promise<chrome.tabs.Tab>;
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

export function createTabAdapter(api: ChromeTabsApi): TabAdapter {
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
  return createTabAdapter(chrome.tabs);
}
