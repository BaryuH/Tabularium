/**
 * HTML5 native drag-and-drop wiring.
 *
 * Three interaction types, all delegated on a single ancestor element:
 * 1. Sidebar tab → column  (creates a card, copy semantics)
 * 2. Card ↔ card           (reorder within / move between columns)
 * 3. Column reorder        (drag header, drop relative to another column)
 *
 * During dragover only `dataTransfer.types` is readable (not data), so we
 * use custom MIME types to distinguish drag kinds. `getData` is called on
 * drop to read the payload.
 */
import type { Store } from '../state/store';

const MIME_TAB = 'application/x-tabularium-tab';
const MIME_CARD = 'application/x-tabularium-card';
const MIME_COLUMN = 'application/x-tabularium-column';

// ── Indicator management ────────────────────────────────────────────────
const INDICATOR_CLASSES = ['column--drop-target', 'card--drop-before', 'card--drop-after', 'column--dragging', 'stab--dragging'] as const;

function clearIndicators(root: HTMLElement): void {
  for (const cls of INDICATOR_CLASSES) {
    for (const el of root.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
  }
}

// ── Position helpers ────────────────────────────────────────────────────
function cardInsertIndex(container: HTMLElement, y: number): number {
  const cards = container.querySelectorAll<HTMLElement>('.card:not(.column--dragging)');
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return i;
  }
  return cards.length;
}

function columnInsertIndex(columnsContainer: HTMLElement, x: number): number {
  const cols = columnsContainer.querySelectorAll<HTMLElement>('.column:not(.column--add):not(.column--dragging)');
  for (let i = 0; i < cols.length; i++) {
    const rect = cols[i].getBoundingClientRect();
    if (x < rect.left + rect.width / 2) return i;
  }
  return cols.length;
}

function cardIdsInColumn(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('.card')].map((el) => el.dataset.id!).filter(Boolean);
}

function columnIdOf(el: HTMLElement): string | undefined {
  return el.closest<HTMLElement>('.column')?.dataset.columnId;
}

// ── Public setup ────────────────────────────────────────────────────────
export function setupDnD(root: HTMLElement, store: Store): void {
  // ── dragstart ──
  root.addEventListener('dragstart', (e) => {
    const target = e.target as HTMLElement;

    // Sidebar tab
    const stab = target.closest<HTMLElement>('.stab');
    if (stab) {
      e.dataTransfer!.setData(MIME_TAB, JSON.stringify({
        url: stab.dataset.tabUrl ?? '',
        title: stab.dataset.tabTitle ?? '',
        favIconUrl: stab.dataset.tabFavicon ?? '',
      }));
      e.dataTransfer!.effectAllowed = 'copy';
      stab.classList.add('stab--dragging');
      return;
    }

    // Card
    const card = target.closest<HTMLElement>('.card');
    if (card && card.dataset.id) {
      const colId = columnIdOf(card);
      e.dataTransfer!.setData(MIME_CARD, JSON.stringify({
        cardId: card.dataset.id,
        fromColumnId: colId ?? '',
      }));
      e.dataTransfer!.effectAllowed = 'move';
      requestAnimationFrame(() => card.classList.add('column--dragging'));
      return;
    }

    // Column header
    const head = target.closest<HTMLElement>('.column__head');
    if (head) {
      const column = head.closest<HTMLElement>('.column');
      const colId = head.querySelector<HTMLElement>('.column__name')?.dataset.id;
      if (column && colId) {
        e.dataTransfer!.setData(MIME_COLUMN, JSON.stringify({ columnId: colId }));
        e.dataTransfer!.effectAllowed = 'move';
        requestAnimationFrame(() => column.classList.add('column--dragging'));
      }
    }
  });

  // ── dragover ──
  root.addEventListener('dragover', (e) => {
    const types = e.dataTransfer?.types ?? [];
    clearIndicators(root);

    // Tab → column
    if (types.includes(MIME_TAB)) {
      const column = (e.target as HTMLElement).closest<HTMLElement>('.column:not(.column--add)');
      if (column) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'copy';
        column.classList.add('column--drop-target');
      }
      return;
    }

    // Card reorder / cross-column move
    if (types.includes(MIME_CARD)) {
      const column = (e.target as HTMLElement).closest<HTMLElement>('.column:not(.column--add)');
      if (!column) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      column.classList.add('column--drop-target');

      const cardsContainer = column.querySelector<HTMLElement>('.column__cards');
      if (!cardsContainer) return;
      const idx = cardInsertIndex(cardsContainer, e.clientY);
      const cards = cardsContainer.querySelectorAll<HTMLElement>('.card');
      if (cards[idx]) {
        cards[idx].classList.add('card--drop-before');
      } else if (cards.length > 0) {
        cards[cards.length - 1].classList.add('card--drop-after');
      }
      return;
    }

    // Column reorder
    if (types.includes(MIME_COLUMN)) {
      const columnsContainer = (e.target as HTMLElement).closest<HTMLElement>('.columns');
      if (!columnsContainer) return;
      const column = (e.target as HTMLElement).closest<HTMLElement>('.column:not(.column--add):not(.column--dragging)');
      if (column) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        column.classList.add('column--drop-target');
      }
    }
  });

  // ── drop ──
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    clearIndicators(root);

    // Tab → column → createCard
    const tabData = e.dataTransfer?.getData(MIME_TAB);
    if (tabData) {
      const column = (e.target as HTMLElement).closest<HTMLElement>('.column:not(.column--add)');
      const colId = column?.dataset.columnId;
      if (colId) {
        const { url, title, favIconUrl } = JSON.parse(tabData) as { url: string; title: string; favIconUrl: string };
        void store.createCard(colId, { url, title, favIconUrl: favIconUrl || undefined });
      }
      return;
    }

    // Card drop
    const cardData = e.dataTransfer?.getData(MIME_CARD);
    if (cardData) {
      const { cardId, fromColumnId } = JSON.parse(cardData) as { cardId: string; fromColumnId: string };
      const column = (e.target as HTMLElement).closest<HTMLElement>('.column:not(.column--add)');
      const toColId = column?.dataset.columnId;
      if (!toColId || !column) return;
      const cardsContainer = column.querySelector<HTMLElement>('.column__cards');
      if (!cardsContainer) return;

      const idx = cardInsertIndex(cardsContainer, e.clientY);
      const currentIds = cardIdsInColumn(cardsContainer).filter((id) => id !== cardId);
      currentIds.splice(idx, 0, cardId);

      if (toColId === fromColumnId) {
        void store.reorderCards(toColId, currentIds);
      } else {
        void store.moveCard(cardId, toColId, currentIds);
      }
      return;
    }

    // Column drop
    const colData = e.dataTransfer?.getData(MIME_COLUMN);
    if (colData) {
      const { columnId } = JSON.parse(colData) as { columnId: string };
      const columnsContainer = (e.target as HTMLElement).closest<HTMLElement>('.columns');
      if (!columnsContainer) return;
      const idx = columnInsertIndex(columnsContainer, e.clientX);
      const active = store.activeBoard();
      if (!active) return;
      const currentIds = store.columnsOfBoard(active.id).map((c) => c.id).filter((id) => id !== columnId);
      currentIds.splice(idx, 0, columnId);
      void store.reorderColumns(active.id, currentIds);
    }
  });

  // ── dragend ──
  root.addEventListener('dragend', () => clearIndicators(root));
}
