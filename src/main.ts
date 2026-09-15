import './styles.css';

/**
 * M1 scaffold: render the static dashboard shell only.
 * Real board, sidebar, drag-and-drop, etc. arrive in later milestones.
 */
function renderShell(root: HTMLElement): void {
  root.innerHTML = `
    <div class="layout">
      <header class="brand header">
        <span class="brand__name">Tabularium</span>
        <span class="brand__tag">your tabs, filed away</span>
      </header>
      <aside class="sidebar">
        <h2 class="sidebar__title">Open tabs</h2>
        <div class="placeholder">Live tab list arrives in M5.</div>
      </aside>
      <main class="board">
        <h2 class="board__title">Board</h2>
        <div class="placeholder">Kanban board arrives in M4.</div>
      </main>
    </div>
  `;
}

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  renderShell(app);
}
