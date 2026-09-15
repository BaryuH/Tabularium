/**
 * Sidebar: live list of tabs in the current browser window.
 *
 * Each tab item is rendered with `draggable="true"` and `data-tab-*`
 * attributes so M6 (drag-and-drop) can read tab metadata on dragstart.
 * Drag handling itself lives in src/dnd/ and is wired in M6.
 */
import { escapeHtml, hostOf } from '../../util';
import type { TabAdapter, TabInfo } from '../../tabs/adapter';

export interface SidebarView {
  mount(root: HTMLElement): void;
}

export function createSidebarView(adapter: TabAdapter | null): SidebarView {
  let root: HTMLElement | null = null;
  let tabs: TabInfo[] = [];

  const tabHtml = (tab: TabInfo): string => {
    const favicon = tab.favIconUrl
      ? `<img class="stab__fav" src="${escapeHtml(tab.favIconUrl)}" alt="" width="16" height="16" />`
      : `<span class="stab__fav stab__fav--placeholder"></span>`;
    const label = tab.title.trim() || tab.url;
    const cls = tab.active ? 'stab stab--active' : 'stab';
    return `<div class="${cls}" draggable="true"
      data-tab-id="${tab.id}"
      data-tab-url="${escapeHtml(tab.url)}"
      data-tab-title="${escapeHtml(tab.title)}"
      data-tab-favicon="${escapeHtml(tab.favIconUrl ?? '')}">
      ${favicon}
      <span class="stab__body">
        <span class="stab__title">${escapeHtml(label)}</span>
        <span class="stab__host">${escapeHtml(hostOf(tab.url))}</span>
      </span>
    </div>`;
  };

  const render = (): void => {
    if (!root) return;
    if (!adapter) {
      root.innerHTML = `<h2 class="sidebar__title">Open tabs</h2>
        <div class="placeholder">Load as extension to see live tabs.</div>`;
      return;
    }
    const count = `<span class="sidebar__count">${tabs.length}</span>`;
    root.innerHTML = `<h2 class="sidebar__title">Open tabs ${count}</h2>
      <div class="stab-list">${tabs.length ? tabs.map(tabHtml).join('') : '<p class="stab-empty">No tabs open.</p>'}</div>`;
    root.querySelectorAll<HTMLImageElement>('img.stab__fav').forEach((img) => {
      img.addEventListener('error', () => img.classList.add('stab__fav--broken'));
    });
  };

  return {
    mount(el) {
      root = el;
      if (!adapter) {
        render();
        return;
      }
      // Chain: query settles → render → subscribe (no race with initial fetch).
      void adapter.queryCurrentWindow().then((result) => {
        tabs = result;
        render();
        adapter.subscribe((updated) => {
          tabs = updated;
          render();
        });
      });
    },
  };
}
