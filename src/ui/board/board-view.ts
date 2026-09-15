/**
 * Board surface: board switcher + columns + cards, with inline CRUD.
 *
 * Rendering strategy: full innerHTML re-render on every store change (data is
 * small). Interactions use event delegation via `data-action`. Inline editing
 * is driven by a transient `editing` flag; because re-renders happen only on
 * store changes (never on keystrokes), the edit <input> keeps focus while the
 * user types.
 */
import { iconPlus, iconTrash, iconX } from '../icons';
import { escapeHtml, hostOf } from '../../util';
import type { Board, Card, Column } from '../../types';
import type { Store } from '../../state/store';

type Editing =
  | { kind: 'new-board' }
  | { kind: 'rename-board'; id: string }
  | { kind: 'new-column' }
  | { kind: 'rename-column'; id: string };

export interface BoardView {
  mount(root: HTMLElement): void;
}

export function createBoardView(store: Store): BoardView {
  let root: HTMLElement | null = null;
  let editing: Editing | null = null;

  const inputHtml = (value: string, placeholder: string): string =>
    `<input class="editing-input" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false" />`;

  const cardHtml = (card: Card): string => {
    const favicon = card.favIconUrl
      ? `<img class="card__fav" src="${escapeHtml(card.favIconUrl)}" alt="" width="16" height="16" />`
      : `<span class="card__fav card__fav--placeholder"></span>`;
    const label = card.title.trim() || card.url;
    return `<article class="card" draggable="true" data-id="${card.id}">
      ${favicon}
      <span class="card__body">
        <span class="card__title">${escapeHtml(label)}</span>
        <span class="card__host">${escapeHtml(hostOf(card.url))}</span>
      </span>
      <button class="icon-btn icon-btn--sm card__del" data-action="delete-card" data-id="${card.id}" title="Remove">${iconX}</button>
    </article>`;
  };

  const columnHtml = (column: Column): string => {
    const cards = store.cardsOfColumn(column.id);
    const name =
      editing?.kind === 'rename-column' && editing.id === column.id
        ? inputHtml(column.name, 'Column name')
        : `<button class="column__name" data-action="rename-column" data-id="${column.id}" title="Rename column">${escapeHtml(column.name)}</button>`;
    const body = cards.length
      ? cards.map(cardHtml).join('')
      : `<p class="column__empty">No tabs yet</p>`;
    return `<section class="column" data-column-id="${column.id}">
      <header class="column__head" draggable="true">
        ${name}
        <span class="column__count">${cards.length}</span>
        <button class="icon-btn icon-btn--sm column__del" data-action="delete-column" data-id="${column.id}" title="Delete column">${iconTrash}</button>
      </header>
      <div class="column__cards">${body}</div>
    </section>`;
  };

  const switcherHtml = (boards: Board[], active: Board | undefined): string => {
    const pills = boards
      .map((board) => {
        if (active && board.id === active.id) {
          const name =
            editing?.kind === 'rename-board' && editing.id === board.id
              ? inputHtml(board.name, 'Board name')
              : `<button class="board-pill__name" data-action="rename-board" data-id="${board.id}" title="Rename board">${escapeHtml(board.name)}</button>`;
          return `<div class="board-pill board-pill--active">${name}<button class="icon-btn icon-btn--sm" data-action="delete-board" data-id="${board.id}" title="Delete board">${iconTrash}</button></div>`;
        }
        return `<button class="board-pill" data-action="switch-board" data-id="${board.id}">${escapeHtml(board.name)}</button>`;
      })
      .join('');
    const adder =
      editing?.kind === 'new-board'
        ? inputHtml('', 'Board name')
        : `<button class="icon-btn" data-action="add-board" title="New board">${iconPlus}</button>`;
    return `<div class="switcher__boards">${pills}${adder}</div>`;
  };

  const columnsHtml = (active: Board): string => {
    const columns = store.columnsOfBoard(active.id).map(columnHtml).join('');
    const adder =
      editing?.kind === 'new-column'
        ? `<div class="column column--add">${inputHtml('', 'Column name')}</div>`
        : `<div class="column column--add"><button class="add-column" data-action="add-column">${iconPlus}<span>Add column</span></button></div>`;
    return `<div class="columns">${columns}${adder}</div>`;
  };

  const viewHtml = (): string => {
    const boards = store.boardsSorted();
    const active = store.activeBoard();
    return `<div class="switcher">${switcherHtml(boards, active)}</div>
      <div class="board-body">${active ? columnsHtml(active) : ''}</div>`;
  };

  const render = (): void => {
    if (!root) return;
    root.innerHTML = viewHtml();
    const input = root.querySelector<HTMLInputElement>('.editing-input');
    if (input) {
      input.focus();
      input.select();
    }
    root.querySelectorAll<HTMLImageElement>('img.card__fav').forEach((img) => {
      img.addEventListener('error', () => img.classList.add('card__fav--broken'));
    });
  };

  const setEditing = (next: Editing | null): void => {
    editing = next;
    render();
  };

  const applyEdit = async (current: Editing, name: string): Promise<void> => {
    switch (current.kind) {
      case 'new-board': {
        const board = await store.createBoard(name);
        await store.setActiveBoard(board.id);
        break;
      }
      case 'rename-board':
        await store.renameBoard(current.id, name);
        break;
      case 'new-column': {
        const active = store.activeBoard();
        if (active) await store.createColumn(active.id, name);
        break;
      }
      case 'rename-column':
        await store.renameColumn(current.id, name);
        break;
    }
  };

  const commit = (value: string): void => {
    const current = editing;
    if (!current) return;
    editing = null; // idempotent: a trailing focusout after Enter is a no-op
    const name = value.trim();
    if (name === '') {
      render();
      return;
    }
    void applyEdit(current, name);
  };

  const handleDeleteBoard = async (id: string): Promise<void> => {
    if (store.boardsSorted().length <= 1) {
      window.alert('Keep at least one board.');
      return;
    }
    if (!window.confirm('Delete this board with its columns and cards?')) return;
    await store.deleteBoard(id);
    if (!store.activeBoard()) {
      const next = store.boardsSorted()[0];
      if (next) await store.setActiveBoard(next.id);
    }
  };

  const handleDeleteColumn = async (id: string): Promise<void> => {
    if (!window.confirm('Delete this column and its cards?')) return;
    await store.deleteColumn(id);
  };

  const onClick = (event: MouseEvent): void => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || !root?.contains(el)) return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'switch-board':
        if (id) void store.setActiveBoard(id);
        break;
      case 'add-board':
        setEditing({ kind: 'new-board' });
        break;
      case 'rename-board':
        if (id) setEditing({ kind: 'rename-board', id });
        break;
      case 'delete-board':
        if (id) void handleDeleteBoard(id);
        break;
      case 'add-column':
        setEditing({ kind: 'new-column' });
        break;
      case 'rename-column':
        if (id) setEditing({ kind: 'rename-column', id });
        break;
      case 'delete-column':
        if (id) void handleDeleteColumn(id);
        break;
      case 'delete-card':
        if (id) void store.deleteCard(id);
        break;
    }
  };

  const onKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    if (!target.matches('.editing-input')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      commit((target as HTMLInputElement).value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditing(null);
    }
  };

  const onFocusOut = (event: FocusEvent): void => {
    const target = event.target as HTMLElement;
    if (target.matches('.editing-input')) commit((target as HTMLInputElement).value);
  };

  return {
    mount(el) {
      root = el;
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKeydown);
      el.addEventListener('focusout', onFocusOut);
      store.subscribe(render);
      render();
    },
  };
}
