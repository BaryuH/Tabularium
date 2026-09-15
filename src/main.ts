import './styles.css';
import { openDatabase } from './db/schema';
import { createRepo } from './db/repo';
import { createStore } from './state/store';
import { tryCreateTabAdapter } from './tabs/adapter';
import { createBoardView } from './ui/board/board-view';
import { createSidebarView } from './ui/sidebar/sidebar-view';

const LAYOUT = `
  <div class="layout">
    <header class="brand header">
      <span class="brand__name">Tabularium</span>
      <span class="brand__tag">your tabs, filed away</span>
    </header>
    <aside class="sidebar" id="sidebar-root"></aside>
    <main class="board" id="board-root"></main>
  </div>
`;

async function bootstrap(): Promise<void> {
  const db = await openDatabase();
  const store = createStore(createRepo(db));
  await store.hydrate();

  const app = document.querySelector<HTMLElement>('#app');
  if (!app) return;
  app.innerHTML = LAYOUT;

  // Board
  const boardRoot = app.querySelector<HTMLElement>('#board-root');
  if (boardRoot) createBoardView(store).mount(boardRoot);

  // Sidebar (graceful null when chrome.tabs absent — e.g. served dist smoke)
  const sidebarRoot = app.querySelector<HTMLElement>('#sidebar-root');
  if (sidebarRoot) createSidebarView(tryCreateTabAdapter()).mount(sidebarRoot);
}

bootstrap().catch((error: unknown) => {
  console.error('[Tabularium] bootstrap failed', error);
});
