/**
 * Sidebar: live list of tabs in the current browser window.
 *
 * Supports expanded (280px) and collapsed (56px icon rail) modes.
 * Displays only tab titles (link/host hidden per user preference).
 * In collapsed mode, titles are hidden and only favicons/icons are shown
 * with tooltips; dragging tabs into columns works identically in both modes.
 */
import { iconChevronLeft, iconSidebar, iconWindow } from '../icons';
import { escapeHtml } from '../../util';
import { showToast } from '../toast';
import type { TabAdapter, TabInfo } from '../../tabs/adapter';
import type { Store } from '../../state/store';

export interface SidebarView {
  mount(root: HTMLElement): void;
}

export function createSidebarView(adapter: TabAdapter | null, store: Store): SidebarView {
  let root: HTMLElement | null = null;
  let tabs: TabInfo[] = [];

  const isCollapsed = (): boolean => Boolean(store.getState().meta.sidebarCollapsed);

  const tabHtml = (tab: TabInfo): string => {
    const favicon = tab.favIconUrl
      ? `<img class="stab__fav" src="${escapeHtml(tab.favIconUrl)}" alt="" width="16" height="16" />`
      : `<span class="stab__fav stab__fav--placeholder"></span>`;
    const label = tab.title.trim() || tab.url;
    const cls = tab.active ? 'stab stab--active' : 'stab';
    return `<div class="${cls}" draggable="true"
      title="${escapeHtml(label)}"
      data-tab-id="${tab.id}"
      data-tab-url="${escapeHtml(tab.url)}"
      data-tab-title="${escapeHtml(tab.title)}"
      data-tab-favicon="${escapeHtml(tab.favIconUrl ?? '')}">
      ${favicon}
      <span class="stab__body">
        <span class="stab__title">${escapeHtml(label)}</span>
      </span>
    </div>`;
  };

  const render = (): void => {
    if (!root) return;
    const collapsed = isCollapsed();
    root.classList.toggle('sidebar--collapsed', collapsed);

    const toggleIcon = collapsed ? iconSidebar : iconChevronLeft;
    const toggleTitle = collapsed ? 'Expand open tabs' : 'Collapse open tabs';
    const toggleBtn = `<button class="icon-btn icon-btn--sm sidebar__toggle" data-action="toggle-sidebar" title="${toggleTitle}">${toggleIcon}</button>`;

    if (!adapter) {
      const header = collapsed
        ? `<div class="sidebar__header sidebar__header--collapsed">${toggleBtn}</div>`
        : `<div class="sidebar__header">
            <span class="sidebar__title-text">Open tabs</span>
            ${toggleBtn}
          </div>`;
      root.innerHTML = `${header}<div class="placeholder">Load as extension to see live tabs.</div>`;
      return;
    }

    const count = `<span class="sidebar__count">${tabs.length}</span>`;
    const stashBtn = !collapsed && tabs.length
      ? `<button class="icon-btn icon-btn--sm" data-action="stash-sidebar-window" title="Stash all open tabs into first column (free RAM)">${iconWindow}</button>`
      : '';
    const header = collapsed
      ? `<div class="sidebar__header sidebar__header--collapsed">${toggleBtn}</div>`
      : `<div class="sidebar__header">
          <span class="sidebar__title-text">Open tabs ${count}</span>
          <div class="sidebar__header-actions" style="display: flex; gap: 4px;">
            ${stashBtn}
            ${toggleBtn}
          </div>
        </div>`;
    root.innerHTML = `
      ${header}
      <div class="stab-list">${tabs.length ? tabs.map(tabHtml).join('') : '<p class="stab-empty">No tabs open.</p>'}</div>
    `;

    root.querySelectorAll<HTMLImageElement>('img.stab__fav').forEach((img) => {
      img.addEventListener('error', () => img.classList.add('stab__fav--broken'));
    });
  };

  const stashWindowFromSidebar = async (): Promise<void> => {
    if (!adapter) {
      showToast('Open tabs adapter unavailable in preview mode.');
      return;
    }
    const active = store.activeBoard();
    if (!active) return;
    const columns = store.columnsOfBoard(active.id);
    const targetCol = columns[0];
    if (!targetCol) return;

    const openTabs = await adapter.queryCurrentWindow();
    const stashable = openTabs.filter(
      (t) =>
        !t.url.startsWith('chrome://') &&
        !t.url.startsWith('chrome-extension://') &&
        !t.url.includes(location.host) &&
        t.url.trim() !== '',
    );
    if (stashable.length === 0) {
      showToast('No external tabs open in this window.');
      return;
    }

    const items = stashable.map((t) => ({
      id: String(t.id),
      url: t.url,
      title: t.title,
      favIconUrl: t.favIconUrl,
    }));

    await store.saveWindowSession(targetCol.id, items);
    await adapter.closeTabs(stashable.map((t) => t.id));
    showToast(`Stashed ${items.length} tabs to ${targetCol.name} · 0% RAM consumed`);
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-action="stash-sidebar-window"]')) {
      event.preventDefault();
      void stashWindowFromSidebar();
      return;
    }
    if (target.closest('[data-action="toggle-sidebar"]')) {
      event.preventDefault();
      void store.setSidebarCollapsed(!isCollapsed());
    }
  };

  return {
    mount(el) {
      root = el;
      el.addEventListener('click', onClick);
      store.subscribe(render);

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
