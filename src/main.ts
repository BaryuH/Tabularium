import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import { showToast } from './ui/toast';
import { openDatabase } from './db/schema';
import { createRepo } from './db/repo';
import { createStore } from './state/store';
import { tryCreateTabAdapter, onExternalChange } from './tabs/adapter';
import { applyTheme, revealBody } from './theme';
import { createBoardView } from './ui/board/board-view';
import { createCardEditModal } from './ui/card/card-edit-modal';
import { createNotePanel } from './ui/note/note-panel';
import { createSettingsModal } from './ui/settings/settings-modal';
import { createSidebarView } from './ui/sidebar/sidebar-view';
import { createWindowModal } from './ui/window/window-modal';
import { iconGear, iconMoon, iconSun } from './ui/icons';
import { setupDnD } from './dnd';
import type { ThemePref } from './types';

// Global error surface: show a non-blocking toast for unhandled async errors.
window.addEventListener('unhandledrejection', (event) => {
  showToast(event.reason instanceof Error ? event.reason.message : 'Something went wrong');
  event.preventDefault();
});

const LAYOUT = `
  <div class="layout">
    <header class="brand header">
      <span class="brand__name">Tabularium</span>
      <div class="brand__actions">
        <button id="theme-toggle" class="icon-btn theme-toggle" title="Toggle theme"></button>
        <button id="settings-btn" class="icon-btn settings-trigger" title="Settings">${iconGear}</button>
      </div>
    </header>
    <aside class="sidebar" id="sidebar-root"></aside>
    <main class="board" id="board-root"></main>
  </div>
`;

const CACHE_THEME_KEY = 'tabularium_theme';
const CACHE_SIDEBAR_KEY = 'tabularium_sidebar';

function getCachedTheme(): ThemePref {
  const cached = localStorage.getItem(CACHE_THEME_KEY);
  return cached === 'light' ? 'light' : 'dark';
}

function getCachedSidebar(): boolean {
  return localStorage.getItem(CACHE_SIDEBAR_KEY) === '1';
}

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app) return;

  // ── 1. Synchronous Instant Shell Render (0ms critical path) ──────────────
  // Render shell, apply cached theme, restore sidebar rail, reveal body immediately.
  const initialTheme = getCachedTheme();
  applyTheme(initialTheme);

  const initialSidebar = getCachedSidebar();
  app.innerHTML = LAYOUT;

  const layout = app.querySelector<HTMLElement>('.layout');
  if (layout && initialSidebar) {
    layout.classList.add('layout--sidebar-collapsed');
  }
  revealBody();

  // ── 2. Asynchronous Store & DB Hydration (runs in background) ────────────
  const db = await openDatabase();
  const store = createStore(createRepo(db));
  await store.hydrate();

  // Reconcile and cache theme & sidebar state from IndexedDB
  const currentTheme = store.getState().meta.theme;
  applyTheme(currentTheme);
  localStorage.setItem(CACHE_THEME_KEY, currentTheme);

  const currentSidebar = Boolean(store.getState().meta.sidebarCollapsed);
  layout?.classList.toggle('layout--sidebar-collapsed', currentSidebar);
  localStorage.setItem(CACHE_SIDEBAR_KEY, currentSidebar ? '1' : '0');

  store.subscribe(() => {
    const nextTheme = store.getState().meta.theme;
    localStorage.setItem(CACHE_THEME_KEY, nextTheme);
    const nextSidebar = Boolean(store.getState().meta.sidebarCollapsed);
    localStorage.setItem(CACHE_SIDEBAR_KEY, nextSidebar ? '1' : '0');
  });

  // Refresh state when the service worker saves a tab (M9 quick-save).
  onExternalChange(() => { void store.applyExternalChange(); });

  // Note editor panel (spacious slide-over drawer)
  const notePanel = createNotePanel(store);
  notePanel.mount(app);

  // Card edit modal (title & link editing)
  const cardEditModal = createCardEditModal(store);
  cardEditModal.mount(app);

  // Board + card-click (activate matching tab or open new)
  const tabAdapter = tryCreateTabAdapter();

  // Window session inspector & restore modal
  const windowModal = createWindowModal(store, tabAdapter);
  windowModal.mount(app);

  const boardRoot = app.querySelector<HTMLElement>('#board-root');
  if (boardRoot) {
    createBoardView(store, {
      notePanel,
      cardEditModal,
      windowModal,
      tabAdapter,
      onCardClick: tabAdapter
        ? async (url) => {
            const behavior = store.getState().meta.openBehavior ?? 'new-tab';
            if (behavior === 'current-tab') {
              await tabAdapter.openInCurrentTab(url);
            } else {
              await tabAdapter.openUrl(url, false);
            }
          }
        : (url) => {
            const behavior = store.getState().meta.openBehavior ?? 'new-tab';
            if (behavior === 'current-tab') {
              window.location.href = url;
            } else {
              window.open(url, '_blank');
            }
          },
    }).mount(boardRoot);
  }

  // Sidebar
  const sidebarRoot = app.querySelector<HTMLElement>('#sidebar-root');
  if (sidebarRoot) createSidebarView(tabAdapter, store).mount(sidebarRoot);

  // Drag-and-drop & layout collapse state
  if (layout) {
    setupDnD(layout, store);
    const updateLayout = (): void => {
      const collapsed = Boolean(store.getState().meta.sidebarCollapsed);
      layout.classList.toggle('layout--sidebar-collapsed', collapsed);
    };
    updateLayout();
    store.subscribe(updateLayout);
  }

  // Theme toggle
  const toggle = app.querySelector<HTMLButtonElement>('#theme-toggle');
  if (toggle) {
    const updateToggle = (): void => {
      const theme = store.getState().meta.theme;
      if (theme === 'light') {
        toggle.innerHTML = iconMoon;
        toggle.title = 'Switch to dark mode';
      } else {
        toggle.innerHTML = iconSun;
        toggle.title = 'Switch to light mode';
      }
    };
    toggle.addEventListener('click', () => {
      const current = store.getState().meta.theme;
      const next: ThemePref = current === 'light' ? 'dark' : 'light';
      void store.setTheme(next);
    });
    store.subscribe(() => {
      applyTheme(store.getState().meta.theme);
      updateToggle();
    });
    updateToggle();
  }

  // Settings modal
  const settingsModal = createSettingsModal(store);
  settingsModal.mount(app);

  const settingsBtn = app.querySelector<HTMLButtonElement>('#settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      settingsModal.open();
    });
  }

  // External change broadcast from background (e.g. quick-save shortcut)
  onExternalChange(() => {
    void store.hydrate();
  });
}

bootstrap().catch((error: unknown) => {
  console.error('[Tabularium] bootstrap failed', error);
});
