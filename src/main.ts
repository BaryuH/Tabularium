import './styles.css';
import { showToast } from './ui/toast';
import { openDatabase } from './db/schema';
import { createRepo } from './db/repo';
import { createStore } from './state/store';
import { tryCreateTabAdapter, onExternalChange } from './tabs/adapter';
import { resolveTarget } from './tabs/resolve';
import { applyTheme, revealBody } from './theme';
import { createBoardView } from './ui/board/board-view';
import { createNotePanel } from './ui/note/note-panel';
import { createSettingsModal } from './ui/settings/settings-modal';
import { createSidebarView } from './ui/sidebar/sidebar-view';
import { iconGear } from './ui/icons';
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
      <span class="brand__tag">your tabs, filed away</span>
      <div class="brand__actions">
        <button id="theme-toggle" class="theme-toggle" title="Toggle theme"></button>
        <button id="settings-btn" class="icon-btn settings-trigger" title="Settings">${iconGear}</button>
      </div>
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

  // Note editor panel (spacious slide-over drawer)
  const notePanel = createNotePanel(store);
  notePanel.mount(app);

  // Board + card-click (activate matching tab or open new)
  const tabAdapter = tryCreateTabAdapter();
  const boardRoot = app.querySelector<HTMLElement>('#board-root');
  if (boardRoot) {
    createBoardView(store, {
      notePanel,
      onCardClick: tabAdapter
        ? async (url) => {
            const behavior = store.getState().meta.openBehavior ?? 'new-tab';
            if (behavior === 'current-tab') {
              await tabAdapter.openInCurrentTab(url);
            } else {
              const tabs = await tabAdapter.queryCurrentWindow();
              const result = resolveTarget(url, tabs);
              if (result.action === 'activate') await tabAdapter.activate(result.tabId);
              else await tabAdapter.openUrl(result.url);
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
