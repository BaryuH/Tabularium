import './styles.css';
import { openDatabase } from './db/schema';
import { createRepo } from './db/repo';
import { createStore } from './state/store';
import { tryCreateTabAdapter, onExternalChange } from './tabs/adapter';
import { applyTheme, revealBody } from './theme';
import { createBoardView } from './ui/board/board-view';
import { createSidebarView } from './ui/sidebar/sidebar-view';
import { setupDnD } from './dnd';
import { resolveTarget } from './tabs/resolve';
import type { ThemePref } from './types';

const LAYOUT = `
  <div class="layout">
    <header class="brand header">
      <span class="brand__name">Tabularium</span>
      <span class="brand__tag">your tabs, filed away</span>
      <button id="theme-toggle" class="theme-toggle" title="Toggle theme"></button>
    </header>
    <aside class="sidebar" id="sidebar-root"></aside>
    <main class="board" id="board-root"></main>
  </div>
`;

const THEME_CYCLE: ThemePref[] = ['system', 'light', 'dark'];

async function bootstrap(): Promise<void> {
  const db = await openDatabase();
  const store = createStore(createRepo(db));
  await store.hydrate();

  // Apply theme before first paint, then reveal body (anti-FOUC).
  applyTheme(store.getState().meta.theme);
  revealBody();

  // Refresh state when the service worker saves a tab (M9 quick-save).
  onExternalChange(() => { void store.applyExternalChange(); });

  const app = document.querySelector<HTMLElement>('#app');
  if (!app) return;
  app.innerHTML = LAYOUT;

  // Board + card-click (activate matching tab or open new)
  const tabAdapter = tryCreateTabAdapter();
  const boardRoot = app.querySelector<HTMLElement>('#board-root');
  if (boardRoot) {
    createBoardView(store, {
      onCardClick: tabAdapter
        ? async (url) => {
            const tabs = await tabAdapter.queryCurrentWindow();
            const result = resolveTarget(url, tabs);
            if (result.action === 'activate') await tabAdapter.activate(result.tabId);
            else await tabAdapter.openUrl(result.url);
          }
        : (url) => { window.open(url, '_blank'); },
    }).mount(boardRoot);
  }

  // Sidebar
  const sidebarRoot = app.querySelector<HTMLElement>('#sidebar-root');
  if (sidebarRoot) createSidebarView(tabAdapter).mount(sidebarRoot);

  // Drag-and-drop (delegated on .layout, spans sidebar + board)
  const layout = app.querySelector<HTMLElement>('.layout');
  if (layout) setupDnD(layout, store);

  // Theme toggle
  const toggle = app.querySelector<HTMLButtonElement>('#theme-toggle');
  if (toggle) {
    const updateToggle = (): void => {
      const theme = store.getState().meta.theme;
      toggle.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
    };
    toggle.addEventListener('click', () => {
      const current = store.getState().meta.theme;
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
      void store.setTheme(next);
    });
    store.subscribe(() => {
      applyTheme(store.getState().meta.theme);
      updateToggle();
    });
    updateToggle();
  }

  // External change broadcast from background (e.g. quick-save shortcut)
  onExternalChange(() => {
    void store.hydrate();
  });
}

bootstrap().catch((error: unknown) => {
  console.error('[Tabularium] bootstrap failed', error);
});
