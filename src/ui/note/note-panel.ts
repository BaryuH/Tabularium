/**
 * Spacious slide-over panel for rich note editing.
 *
 * Provides a dedicated, distraction-free writing surface for notes:
 * - Prominent title input
 * - Expansive body textarea with comfortable line-height (1.65)
 * - Auto-save debounced to the store
 * - Escape or click-outside to close
 * - Live character and word counts
 */
import { iconX, iconTask, iconTaskDone } from '../icons';
import { escapeHtml } from '../../util';
import type { Store } from '../../state/store';

export interface NotePanel {
  open(cardId: string): void;
  close(): void;
  isOpen(): boolean;
  mount(parent: HTMLElement): void;
}

export function createNotePanel(store: Store): NotePanel {
  let activeCardId: string | null = null;
  let container: HTMLElement | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingTitle: string | null = null;
  let pendingNote: string | null = null;

  const flushSave = (): void => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!activeCardId) return;
    if (pendingTitle !== null || pendingNote !== null) {
      const card = store.getState().cards[activeCardId];
      if (!card) return;
      const patch: { title?: string; note?: string } = {};
      if (pendingTitle !== null && pendingTitle !== card.title) patch.title = pendingTitle;
      if (pendingNote !== null && pendingNote !== (card.note ?? '')) patch.note = pendingNote;
      if (Object.keys(patch).length > 0) {
        void store.updateCard(activeCardId, patch);
      }
      pendingTitle = null;
      pendingNote = null;
    }
  };

  const scheduleSave = (title: string, note: string): void => {
    pendingTitle = title;
    pendingNote = note;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 300);
  };

  const updateCounts = (text: string): void => {
    if (!container) return;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const counter = container.querySelector<HTMLElement>('.note-panel__counts');
    if (counter) {
      counter.textContent = `${words} word${words === 1 ? '' : 's'} · ${chars} char${chars === 1 ? '' : 's'}`;
    }
  };

  const renderContent = (cardId: string): void => {
    if (!container) return;
    const card = store.getState().cards[cardId];
    if (!card) return;
    const isTask = card.kind === 'task';
    const isDone = Boolean(card.completedAt);
    const badgeLabel = isTask ? 'Task' : 'Note';
    const badgeClass = isTask ? 'note-panel__badge note-panel__badge--task' : 'note-panel__badge';
    const titlePlaceholder = isTask ? 'Task title...' : 'Note title...';
    const textareaPlaceholder = isTask ? 'Add task details, steps, or description...' : 'Write your note here...';

    const taskToggleBtn = isTask
      ? `<button class="note-panel__task-toggle${isDone ? ' note-panel__task-toggle--done' : ''}" data-action="toggle-panel-task" title="${isDone ? 'Mark uncompleted' : 'Mark completed'}">
          ${isDone ? iconTaskDone : iconTask}
          <span>${isDone ? 'Completed' : 'Mark done'}</span>
        </button>`
      : '';

    const title = card.title === '(untitled)' ? '' : card.title;
    const note = card.note ?? '';
    const dateStr = new Date(card.savedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    container.innerHTML = `
      <div class="note-panel__backdrop" data-action="close-note"></div>
      <aside class="note-panel" role="dialog" aria-modal="true" aria-label="${badgeLabel} Editor">
        <header class="note-panel__head">
          <div class="note-panel__meta">
            <span class="${badgeClass}">${badgeLabel}</span>
            ${taskToggleBtn}
            <span class="note-panel__date">${escapeHtml(dateStr)}</span>
            <span class="note-panel__counts">0 words · 0 chars</span>
          </div>
          <button class="icon-btn note-panel__close" data-action="close-note" title="Close (Esc)">${iconX}</button>
        </header>

        <div class="note-panel__body">
          <input
            class="note-panel__title-input"
            type="text"
            placeholder="${titlePlaceholder}"
            value="${escapeHtml(title)}"
            autocomplete="off"
            spellcheck="false"
          />
          <textarea
            class="note-panel__textarea"
            placeholder="${textareaPlaceholder}"
            spellcheck="true"
          >${escapeHtml(note)}</textarea>
        </div>
      </aside>
    `;
    const titleInput = container.querySelector<HTMLInputElement>('.note-panel__title-input');
    const textarea = container.querySelector<HTMLTextAreaElement>('.note-panel__textarea');

    if (titleInput && textarea) {
      updateCounts(note);

      const onInput = (): void => {
        const t = titleInput.value.trim() || '(untitled)';
        const n = textarea.value;
        updateCounts(n);
        scheduleSave(t, n);
      };

      titleInput.addEventListener('input', onInput);
      textarea.addEventListener('input', onInput);

      titleInput.addEventListener('blur', flushSave);
      textarea.addEventListener('blur', flushSave);

      // Focus title if empty, else focus body
      requestAnimationFrame(() => {
        if (!titleInput.value.trim()) {
          titleInput.focus();
        } else {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      });
    }
  };

  const close = (): void => {
    flushSave();
    activeCardId = null;
    if (container) {
      container.classList.remove('note-panel-container--open');
      setTimeout(() => {
        if (!activeCardId && container) container.innerHTML = '';
      }, 200);
    }
  };

  const open = (cardId: string): void => {
    flushSave();
    activeCardId = cardId;
    if (container) {
      renderContent(cardId);
      container.classList.add('note-panel-container--open');
    }
  };

  const onGlobalKeydown = (event: KeyboardEvent): void => {
    if (!activeCardId) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      close();
    }
  };

  const onClick = (event: MouseEvent): void => {
    const toggleBtn = (event.target as HTMLElement).closest<HTMLElement>('[data-action="toggle-panel-task"]');
    if (toggleBtn && activeCardId) {
      event.preventDefault();
      void store.toggleTaskComplete(activeCardId).then(() => {
        if (activeCardId) renderContent(activeCardId);
      });
      return;
    }
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action="close-note"]');
    if (el) {
      event.preventDefault();
      close();
    }
  };
  return {
    open,
    close,
    isOpen: () => activeCardId !== null,
    mount(parent) {
      container = document.createElement('div');
      container.className = 'note-panel-container';
      parent.appendChild(container);

      container.addEventListener('click', onClick);
      window.addEventListener('keydown', onGlobalKeydown);
    },
  };
}
