import './styles.css';
import { openDatabase } from './db/schema';
import { createRepo } from './db/repo';
import { createStore } from './state/store';
import { createBoardView } from './ui/board/board-view';

const LAYOUT = `
  <div class="layout">
    <header class="brand header">
      <span class="brand__name">Tabularium</span>
      <span class="brand__tag">your tabs, filed away</span>
    </header>
    <aside class="sidebar">
      <h2 class="sidebar__title">Open tabs</h2>
      <div class="placeholder">Live tab list arrives in M5.</div>
    </aside>
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

  const boardRoot = app.querySelector<HTMLElement>('#board-root');
  if (boardRoot) createBoardView(store).mount(boardRoot);
}

bootstrap().catch((error: unknown) => {
  console.error('[Tabularium] bootstrap failed', error);
});
