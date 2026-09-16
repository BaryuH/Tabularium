/**
 * Board surface: board switcher + columns + cards, with inline CRUD.
 *
 * Rendering strategy: full innerHTML re-render on every store change (data is
 * small). Interactions use event delegation via `data-action`. Inline editing
 * is driven by a transient `editing` flag; because re-renders happen only on
 * store changes (never on keystrokes), the edit <input> keeps focus while the
 * user types.
 */
import { iconPlus, iconTrash, iconX, iconTask, iconTaskDone, iconListTodo, iconNote, iconPencil, iconWindow, iconExternalLink } from '../icons';
import { escapeHtml, formatDateTag, HAS_DATE_PREFIX } from '../../util';
import { showToast } from '../toast';
import type { Board, Card, CardKind, Column } from '../../types';
import type { Store } from '../../state/store';
import type { NotePanel } from '../note/note-panel';
import type { CardEditModal } from '../card/card-edit-modal';
import type { WindowModal } from '../window/window-modal';
import type { TabAdapter } from '../../tabs/adapter';

const BOARD_ICONS = ['📁', '🏛️', '💼', '🚀', '🎯', '📚', '💡', '🛠️', '🎨', '🔬', '⚡', '🌟', '📌', '☕', '🧠', '🌿'] as const;
const COLUMN_ICONS = ['📥', '🚀', '🔬', '✅', '⚡', '📋', '📌', '💡', '📚', '🎯', '🌿', '☕', '🔥', '🛠️', '⭐', '📦'] as const;

type Editing =
  | { kind: 'new-board' }
  | { kind: 'rename-board'; id: string }
  | { kind: 'new-column' }
  | { kind: 'rename-column'; id: string }
  | { kind: 'new-task'; columnId: string }
  | { kind: 'new-note'; columnId: string }
  | { kind: 'pick-icon'; boardId: string }
  | { kind: 'pick-column-icon'; columnId: string };

export interface BoardViewOptions {
  onCardClick?: (url: string) => void;
  notePanel?: NotePanel;
  cardEditModal?: CardEditModal;
  windowModal?: WindowModal;
  tabAdapter?: TabAdapter | null;
}

export interface BoardView {
  mount(root: HTMLElement): void;
}

export function createBoardView(store: Store, opts?: BoardViewOptions): BoardView {
  let root: HTMLElement | null = null;
  let editing: Editing | null = null;

  const inputHtml = (value: string, placeholder: string): string =>
    `<input class="editing-input" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false" />`;

  const cardHtml = (card: Card): string => {
    const kind: CardKind = card.kind ?? 'tab';
    const isDone = Boolean(card.completedAt);
    let indicator: string;
    if (kind === 'task') {
      indicator = `<button class="card__check" data-action="toggle-task" data-id="${card.id}" title="${isDone ? 'Mark uncompleted' : 'Mark completed'}" aria-label="${isDone ? 'Mark uncompleted' : 'Mark completed'}">${isDone ? iconTaskDone : iconTask}</button>`;
    } else if (kind === 'note') {
      indicator = `<span class="card__icon card__icon--note">${iconNote}</span>`;
    } else if (kind === 'window') {
      indicator = `<span class="card__icon card__icon--window">${iconWindow}</span>`;
    } else {
      indicator = card.favIconUrl
        ? `<img class="card__fav" src="${escapeHtml(card.favIconUrl)}" alt="" width="16" height="16" />`
        : `<span class="card__fav card__fav--placeholder"></span>`;
    }
    const rawLabel = card.title.trim() || card.url || '(untitled)';
    let titleHtml: string;
    if (kind === 'task' || kind === 'note' || kind === 'window') {
      const match = rawLabel.match(HAS_DATE_PREFIX);
      if (match) {
        const dateTag = match[0].trim();
        const text = rawLabel.slice(match[0].length).trim();
        titleHtml = `<span class="card__date">${escapeHtml(dateTag)}</span><span class="card__title-text">${escapeHtml(text || rawLabel)}</span>`;
      } else {
        const autoDate = formatDateTag(card.savedAt);
        titleHtml = `<span class="card__date">${escapeHtml(autoDate)}</span><span class="card__title-text">${escapeHtml(rawLabel)}</span>`;
      }
    } else {
      titleHtml = `<span class="card__title-text">${escapeHtml(rawLabel)}</span>`;
    }

    const windowMeta =
      kind === 'window' && card.tabs?.length
        ? `<span class="card__window-meta">
            <span class="card__tab-count">${card.tabs.length} tabs</span>
            <span class="card__fav-strip">${card.tabs
              .slice(0, 5)
              .map((t) =>
                t.favIconUrl
                  ? `<img class="card__fav-mini" src="${escapeHtml(t.favIconUrl)}" alt="" width="12" height="12" />`
                  : '',
              )
              .join('')}</span>
          </span>`
        : '';

    const doneCls = isDone ? ' card--done' : '';
    const restoreBtn =
      kind === 'window'
        ? `<button class="icon-btn icon-btn--sm card__action-btn card__restore" data-action="restore-window" data-id="${card.id}" title="Restore window (${card.tabs?.length ?? 0} tabs)">${iconExternalLink}</button>`
        : '';

    return `<article class="card card--${kind}${doneCls}" draggable="true" tabindex="0" role="${kind === 'task' ? 'checkbox' : 'link'}" ${kind === 'task' ? `aria-checked="${isDone}"` : ''} data-id="${card.id}">
      ${indicator}
      <span class="card__body">
        <span class="card__title">${titleHtml}</span>
        ${windowMeta}
      </span>
      <span class="card__actions">
        ${restoreBtn}
        <button class="icon-btn icon-btn--sm card__action-btn card__edit" data-action="edit-card" data-id="${card.id}" title="Edit title or link">${iconPencil}</button>
        <button class="icon-btn icon-btn--sm card__action-btn card__del" data-action="delete-card" data-id="${card.id}" title="Remove">${iconX}</button>
      </span>
    </article>`;
  };

  const columnFooterHtml = (columnId: string): string => {
    if (editing?.kind === 'new-task' && editing.columnId === columnId) {
      return `<div class="column__add-row">${inputHtml('', 'Task title')}</div>`;
    }
    if (editing?.kind === 'new-note' && editing.columnId === columnId) {
      return `<div class="column__add-row">${inputHtml('', 'Note')}</div>`;
    }
    return `<div class="column__add-row">
      <button class="column__add-btn" data-action="add-task" data-id="${columnId}" title="Add task">${iconListTodo}<span>Task</span></button>
      <button class="column__add-btn" data-action="add-note" data-id="${columnId}" title="Add note">${iconNote}<span>Note</span></button>
    </div>`;
  };

  const columnIconPickerHtml = (columnId: string): string => {
    const items = COLUMN_ICONS.map(
      (ico) => `<button class="icon-picker__item" data-action="select-column-icon" data-column-id="${columnId}" data-icon="${ico}" title="${ico}">${ico}</button>`,
    ).join('');
    return `<div class="icon-picker icon-picker--column" role="dialog" aria-label="Choose column icon">
      <div class="icon-picker__grid">${items}</div>
      <button class="icon-picker__clear" data-action="select-column-icon" data-column-id="${columnId}" data-icon="">Remove icon</button>
    </div>`;
  };

  const columnHtml = (column: Column): string => {
    const cards = store.cardsOfColumn(column.id);
    const iconBtn = `<button class="column__icon-btn" data-action="pick-column-icon" data-id="${column.id}" title="Change column icon">${column.icon ? escapeHtml(column.icon) : '📋'}</button>`;
    const name =
      editing?.kind === 'rename-column' && editing.id === column.id
        ? inputHtml(column.name, 'Column name')
        : `<button class="column__name" data-action="rename-column" data-id="${column.id}" title="Rename column">${escapeHtml(column.name)}</button>`;
    const body = cards.length
      ? cards.map(cardHtml).join('')
      : `<p class="column__empty">Drop tabs here, or add a task / note below.</p>`;
    const picker =
      editing?.kind === 'pick-column-icon' && editing.columnId === column.id
        ? columnIconPickerHtml(column.id)
        : '';
    return `<section class="column" data-column-id="${column.id}">
      <header class="column__head" draggable="true">
        ${iconBtn}
        ${name}
        <span class="column__count">${cards.length}</span>
        ${cards.length ? `<button class="icon-btn icon-btn--sm column__restore" data-action="restore-column-window" data-id="${column.id}" title="Open all tabs in this column as a new window (${cards.length} tabs)">${iconExternalLink}</button>` : ''}
        <button class="icon-btn icon-btn--sm column__del" data-action="delete-column" data-id="${column.id}" title="Delete column">${iconTrash}</button>
      </header>
      ${picker}
      <div class="column__cards">${body}</div>
      ${columnFooterHtml(column.id)}
    </section>`;
  };

  const iconPickerHtml = (boardId: string): string => {
    const items = BOARD_ICONS.map(
      (ico) => `<button class="icon-picker__item" data-action="select-icon" data-board-id="${boardId}" data-icon="${ico}" title="${ico}">${ico}</button>`,
    ).join('');
    return `<div class="icon-picker" role="dialog" aria-label="Choose board icon">
      <div class="icon-picker__grid">${items}</div>
      <button class="icon-picker__clear" data-action="select-icon" data-board-id="${boardId}" data-icon="">Remove icon</button>
    </div>`;
  };

  const switcherHtml = (boards: Board[], active: Board | undefined): string => {
    const pills = boards
      .map((board) => {
        const iconBtn = `<button class="board-pill__icon-btn" data-action="pick-icon" data-id="${board.id}" title="Change icon">${board.icon ? escapeHtml(board.icon) : '📁'}</button>`;
        if (active && board.id === active.id) {
          const name =
            editing?.kind === 'rename-board' && editing.id === board.id
              ? inputHtml(board.name, 'Board name')
              : `<button class="board-pill__name" data-action="rename-board" data-id="${board.id}" title="Rename board">${escapeHtml(board.name)}</button>`;
          return `<div class="board-pill board-pill--active">${iconBtn}${name}<button class="icon-btn icon-btn--sm" data-action="delete-board" data-id="${board.id}" title="Delete board">${iconTrash}</button></div>`;
        }
        return `<div class="board-pill">${iconBtn}<button class="board-pill__name-btn" data-action="switch-board" data-id="${board.id}">${escapeHtml(board.name)}</button></div>`;
      })
      .join('');
    const adder =
      editing?.kind === 'new-board'
        ? inputHtml('', 'Board name')
        : `<button class="icon-btn" data-action="add-board" title="New board">${iconPlus}</button>`;
    const picker = editing?.kind === 'pick-icon' ? iconPickerHtml(editing.boardId) : '';
    return `<div class="switcher__boards">${pills}${adder}</div>${picker}`;
  };

  const columnsHtml = (active: Board): string => {
    const columns = store.columnsOfBoard(active.id).map(columnHtml).join('');
    const adder =
      editing?.kind === 'new-column'
        ? `<div class="column column--add">${inputHtml('', 'Column name')}</div>`
        : `<div class="column column--add">
            <button class="add-column" data-action="add-column">${iconPlus}<span>Add column</span></button>
            <button class="add-column add-column--stash" data-action="stash-window-new-column" title="Stash current window as a new column (0% RAM)">${iconWindow}<span>Stash window</span></button>
          </div>`;
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
        const board = await store.createBoard(name, '📁');
        await store.setActiveBoard(board.id);
        break;
      }
      case 'rename-board':
        await store.renameBoard(current.id, name);
        break;
      case 'new-column': {
        const active = store.activeBoard();
        if (active) await store.createColumn(active.id, name, '📋');
        break;
      }
      case 'rename-column':
        await store.renameColumn(current.id, name);
        break;
      case 'new-task':
        await store.createCard(current.columnId, { url: '', title: name, kind: 'task' });
        break;
      case 'new-note':
        await store.createCard(current.columnId, { url: '', title: name, kind: 'note' });
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
    const target = event.target as HTMLElement;
    if (editing?.kind === 'pick-icon' && !target.closest('.icon-picker') && !target.closest('[data-action="pick-icon"]')) {
      setEditing(null);
    }
    const actionEl = target.closest<HTMLElement>('[data-action]');
    if (actionEl && root?.contains(actionEl)) {
      handleAction(actionEl);
      return;
    }
    if (editing?.kind === 'pick-column-icon' && !target.closest('.icon-picker') && !target.closest('[data-action="pick-column-icon"]')) {
      setEditing(null);
    }
    // Card body click (no data-action ancestor)
    const card = (event.target as HTMLElement).closest<HTMLElement>('.card');
    if (card?.dataset.id) {
      const cardData = store.getState().cards[card.dataset.id];
      if (cardData) {
        if (cardData.kind === 'window') {
          opts?.windowModal?.open(card.dataset.id);
          return;
        }
        if (cardData.kind === 'task' || cardData.kind === 'note') {
          opts?.notePanel?.open(card.dataset.id);
          return;
        }
        if (opts?.onCardClick) opts.onCardClick(cardData.url);
      }
    }
  };

  const stashCurrentWindowToColumn = async (boardId: string): Promise<void> => {
    if (!opts?.tabAdapter) {
      showToast('Open tabs adapter unavailable in preview mode.');
      return;
    }
    const openTabs = await opts.tabAdapter.queryCurrentWindow();
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

    const col = await store.stashWindowToNewColumn(boardId, items);
    const tabIds = stashable.map((t) => t.id);
    await opts.tabAdapter.closeTabs(tabIds);
    showToast(`Stashed ${items.length} tabs into "${col.name}" · 0% RAM consumed`);
  };
  const handleAction = (el: HTMLElement): void => {
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
      case 'restore-window':
        if (id) {
          const card = store.getState().cards[id];
          const urls = card?.tabs?.map((t) => t.url).filter(Boolean) ?? [];
          if (urls.length > 0) {
            if (opts?.tabAdapter) {
              void opts.tabAdapter.createWindow(urls);
            } else {
              for (const u of urls) window.open(u, '_blank');
            }
            showToast(`Restoring ${urls.length} tabs in a new window`);
          }
        }
        break;
      case 'restore-column-window':
        if (id) {
          const cards = store.cardsOfColumn(id);
          const urls = cards.map((c) => c.url).filter(Boolean);
          if (urls.length > 0) {
            if (opts?.tabAdapter) {
              void opts.tabAdapter.createWindow(urls);
            } else {
              for (const u of urls) window.open(u, '_blank');
            }
            showToast(`Restoring ${urls.length} tabs in a new window`);
          } else {
            showToast('No web tabs to restore in this column.');
          }
        }
        break;
      case 'stash-window-new-column': {
        const active = store.activeBoard();
        if (active) void stashCurrentWindowToColumn(active.id);
        break;
      }
      case 'rename-column':
        if (id) setEditing({ kind: 'rename-column', id });
        break;
      case 'delete-column':
        if (id) void handleDeleteColumn(id);
        break;
      case 'delete-card':
        if (id) void store.deleteCard(id);
        break;
      case 'edit-card':
        if (id) opts?.cardEditModal?.open(id);
        break;
      case 'add-task':
        if (id) {
          if (opts?.notePanel) {
            opts.notePanel.openNew(id, 'task');
          } else {
            setEditing({ kind: 'new-task', columnId: id });
          }
        }
        break;
      case 'add-note':
        if (id) {
          if (opts?.notePanel) {
            opts.notePanel.openNew(id, 'note');
          } else {
            setEditing({ kind: 'new-note', columnId: id });
          }
        }
        break;
      case 'toggle-task':
        if (id) void store.toggleTaskComplete(id);
        break;
      case 'pick-icon':
        if (id) {
          if (editing?.kind === 'pick-icon' && editing.boardId === id) {
            setEditing(null);
          } else {
            setEditing({ kind: 'pick-icon', boardId: id });
          }
        }
        break;
      case 'select-icon': {
        const boardId = el.dataset.boardId;
        const icon = el.dataset.icon || undefined;
        if (boardId) {
          void store.setBoardIcon(boardId, icon);
          setEditing(null);
        }
        break;
      }
      case 'pick-column-icon':
        if (id) {
          if (editing?.kind === 'pick-column-icon' && editing.columnId === id) {
            setEditing(null);
          } else {
            setEditing({ kind: 'pick-column-icon', columnId: id });
          }
        }
        break;
      case 'select-column-icon': {
        const columnId = el.dataset.columnId;
        const icon = el.dataset.icon || undefined;
        if (columnId) {
          void store.setColumnIcon(columnId, icon);
          setEditing(null);
        }
        break;
      }
    }
  };

  const onKeydown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    // Editing input
    if (target.matches('.editing-input')) {
      if (event.key === 'Enter') { event.preventDefault(); commit((target as HTMLInputElement).value); }
      else if (event.key === 'Escape') { event.preventDefault(); setEditing(null); }
      return;
    }
    // Card keyboard activation (a11y: Enter or Space for task)
    if (event.key === ' ' && target.closest('.card--task') && !target.closest('[data-action]')) {
      const card = target.closest<HTMLElement>('.card');
      if (card?.dataset.id) {
        event.preventDefault();
        void store.toggleTaskComplete(card.dataset.id);
        return;
      }
    }
    if (event.key === 'Enter' && target.closest('.card') && !target.closest('[data-action]')) {
      const card = target.closest<HTMLElement>('.card');
      if (card?.dataset.id) {
        const cardData = store.getState().cards[card.dataset.id];
        if (cardData) {
          if (cardData.kind === 'task' || cardData.kind === 'note') {
            event.preventDefault();
            opts?.notePanel?.open(card.dataset.id);
            return;
          }
          if (opts?.onCardClick) opts.onCardClick(cardData.url);
        }
      }
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
