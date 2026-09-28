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
import { iconX, iconTask, iconTaskDone, iconListTodo, iconNote, iconExternalLink, iconDownload } from '../icons';
import { escapeHtml, formatDateTag, HAS_DATE_PREFIX, triggerDownload, formatCardAsMarkdown } from '../../util';
import { showToast } from '../toast';
import type { Store } from '../../state/store';

export interface NotePanel {
  open(cardId: string): void;
  openNew(columnId: string, kind: 'task' | 'note'): void;
  close(): void;
  isOpen(): boolean;
  mount(parent: HTMLElement): void;
}

export function createNotePanel(store: Store, onCardClick?: (url: string) => void): NotePanel {
  let activeCardId: string | null = null;
  let pendingNew: { columnId: string; kind: 'task' | 'note' } | null = null;
  let container: HTMLElement | null = null;
  let saveTimer: number | NodeJS.Timeout | undefined;
  let pendingTitle: string | null = null;
  let pendingNote: string | null = null;
  const flushSave = (): void => {
    clearTimeout(saveTimer);
    saveTimer = undefined;

    if (container) {
      const titleInput = container.querySelector<HTMLInputElement>('.note-panel__title-input');
      const textarea = container.querySelector<HTMLTextAreaElement>('.note-panel__textarea');
      if (titleInput) {
        const val = titleInput.value.trim() || '(untitled)';
        pendingTitle = val;
      }
      if (textarea) {
        pendingNote = textarea.value;
      }
    }

    if (pendingNew) {
      const cleanTitle = (pendingTitle ?? '').replace(HAS_DATE_PREFIX, '').trim();
      const rawNote = (pendingNote ?? '').trim();
      if (cleanTitle || rawNote) {
        const cur = pendingNew;
        pendingNew = null;
        const title = (pendingTitle ?? '').trim() || '(untitled)';
        const note = pendingNote ?? '';
        pendingTitle = null;
        pendingNote = null;
        void store.createCard(cur.columnId, {
          url: '',
          title,
          note,
          kind: cur.kind,
        }).then((created) => {
          activeCardId = created.id;
        });
      }
      return;
    }

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

  const renderContent = (cardId?: string): void => {
    if (!container) return;
    const card = cardId ? store.getState().cards[cardId] : null;
    if (cardId && !card) return;

    const kind = card ? card.kind : (pendingNew?.kind ?? 'note');
    const isTask = kind === 'task';
    const isDone = Boolean(card?.completedAt);
    const badgeLabel = isTask ? 'Task' : 'Note';
    const badgeIcon = isTask ? iconListTodo : iconNote;
    const badgeClass = isTask ? 'note-panel__badge note-panel__badge--task' : 'note-panel__badge note-panel__badge--note';
    const titlePlaceholder = isTask ? 'Task title...' : 'Note title...';
    const textareaPlaceholder = isTask ? 'Add task details, steps, or description...' : 'Write your note here...';

    const taskToggleBtn = isTask && card
      ? `<button class="note-panel__task-toggle${isDone ? ' note-panel__task-toggle--done' : ''}" data-action="toggle-panel-task" title="${isDone ? 'Mark uncompleted' : 'Mark completed'}">
          ${isDone ? iconTaskDone : iconTask}
          <span>${isDone ? 'Completed' : 'Mark done'}</span>
        </button>`
      : '';
    const defaultTag = `${formatDateTag()} `;
    const title = card ? (card.title === '(untitled)' ? '' : card.title) : defaultTag;
    const note = card?.note ?? '';
    const dateStr = new Date(card?.savedAt ?? Date.now()).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    let attachedLinkHtml = '';
    if (card?.url) {
      let hostname = '';
      try {
        hostname = new URL(card.url).hostname.replace(/^www\./, '');
      } catch {
        hostname = card.url;
      }
      const fav = card.favIconUrl
        ? `<img class="note-panel__embed-fav" src="${escapeHtml(card.favIconUrl)}" alt="" width="14" height="14" />`
        : '🔗';
      attachedLinkHtml = `
        <div class="note-panel__embed-card">
          <div class="note-panel__embed-info" data-action="open-embed-link" data-url="${escapeHtml(card.url)}" title="Open: ${escapeHtml(card.url)}">
            <span class="note-panel__embed-icon">${fav}</span>
            <div class="note-panel__embed-text">
              <span class="note-panel__embed-host">${escapeHtml(hostname)}</span>
              <span class="note-panel__embed-url">${escapeHtml(card.url)}</span>
            </div>
          </div>
          <div class="note-panel__embed-actions">
            <button type="button" class="note-panel__embed-btn" data-action="open-embed-link" data-url="${escapeHtml(card.url)}" title="Open link">
              ${iconExternalLink}
              <span>Open</span>
            </button>
            <button type="button" class="note-panel__embed-btn note-panel__embed-btn--remove" data-action="remove-embed-link" title="Remove link">
              ${iconX}
            </button>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="note-panel__backdrop" data-action="close-note"></div>
      <aside class="note-panel" role="dialog" aria-modal="true" aria-label="${badgeLabel} Editor">
        <header class="note-panel__head">
          <div class="note-panel__meta">
            <span class="${badgeClass}">${badgeIcon}<span>${badgeLabel}</span></span>
            ${taskToggleBtn}
            <span class="note-panel__date">${escapeHtml(dateStr)}</span>
            <span class="note-panel__counts">0 words · 0 chars</span>
          </div>
          <div class="note-panel__head-actions">
            ${activeCardId ? `<button type="button" class="icon-btn note-panel__export-btn" data-action="export-note-md" title="Export as Markdown (.md)">${iconDownload}</button>` : ''}
            <button type="button" class="icon-btn note-panel__close" data-action="close-note" title="Close (Esc)">${iconX}</button>
          </div>
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
          ${attachedLinkHtml}
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
        const rawTitle = titleInput.value.trim();
        const rawNote = textarea.value;
        updateCounts(rawNote);

        if (pendingNew) {
          const cleanTitle = rawTitle.replace(HAS_DATE_PREFIX, '').trim();
          if (cleanTitle || rawNote.trim()) {
            scheduleSave(rawTitle || '(untitled)', rawNote);
          } else {
            pendingTitle = null;
            pendingNote = null;
            clearTimeout(saveTimer);
          }
          return;
        }

        const t = rawTitle || '(untitled)';
        scheduleSave(t, rawNote);
      };

      titleInput.addEventListener('input', onInput);
      textarea.addEventListener('input', onInput);

      titleInput.addEventListener('blur', flushSave);
      textarea.addEventListener('blur', flushSave);

      titleInput.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      });

      // Focus title, placing cursor after default date tag
      requestAnimationFrame(() => {
        titleInput.focus();
        titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
      });
    }
  };

  const close = (): void => {
    flushSave();
    const wasActive = activeCardId;
    activeCardId = null;
    pendingNew = null;
    if (wasActive) {
      const card = store.getState().cards[wasActive];
      if (card) {
        const cleanTitle = card.title.replace(HAS_DATE_PREFIX, '').trim();
        const note = (card.note ?? '').trim();
        const url = (card.url ?? '').trim();
        if ((!cleanTitle || cleanTitle === '(untitled)') && !note && !url) {
          void store.deleteCard(wasActive);
        }
      }
    }
    pendingTitle = null;
    pendingNote = null;
    if (container) {
      container.classList.remove('note-panel-container--open');
      setTimeout(() => {
        if (!activeCardId && !pendingNew && container) container.innerHTML = '';
      }, 200);
    }
  };

  const open = (cardId: string): void => {
    flushSave();
    activeCardId = cardId;
    pendingNew = null;
    pendingTitle = null;
    pendingNote = null;
    if (container) {
      renderContent(cardId);
      container.classList.add('note-panel-container--open');
    }
  };

  const openNew = (columnId: string, kind: 'task' | 'note'): void => {
    flushSave();
    activeCardId = null;
    pendingNew = { columnId, kind };
    pendingTitle = null;
    pendingNote = null;
    if (container) {
      renderContent();
      container.classList.add('note-panel-container--open');
    }
  };

  const onGlobalKeydown = (event: KeyboardEvent): void => {
    if (!activeCardId && !pendingNew) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      close();
    }
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const exportBtn = target.closest<HTMLElement>('[data-action="export-note-md"]');
    if (exportBtn && activeCardId) {
      event.preventDefault();
      flushSave();
      const currentCard = store.getState().cards[activeCardId];
      if (currentCard) {
        const { filename, content } = formatCardAsMarkdown(currentCard);
        triggerDownload(content, filename, 'text/markdown;charset=utf-8;');
        showToast(`Exported "${filename}"`);
      }
      return;
    }
    const openLink = target.closest<HTMLElement>('[data-action="open-embed-link"]');
    if (openLink) {
      event.preventDefault();
      const url = openLink.dataset.url;
      if (url) {
        if (onCardClick) onCardClick(url);
        else window.open(url, '_blank');
      }
      return;
    }
    const removeLink = target.closest<HTMLElement>('[data-action="remove-embed-link"]');
    if (removeLink && activeCardId) {
      event.preventDefault();
      void store.updateCard(activeCardId, { url: '', favIconUrl: undefined }).then(() => {
        if (activeCardId) renderContent(activeCardId);
      });
      return;
    }
    const toggleBtn = target.closest<HTMLElement>('[data-action="toggle-panel-task"]');
    if (toggleBtn && activeCardId) {
      event.preventDefault();
      void store.toggleTaskComplete(activeCardId).then(() => {
        if (activeCardId) renderContent(activeCardId);
      });
      return;
    }
    const el = target.closest<HTMLElement>('[data-action="close-note"]');
    if (el) {
      event.preventDefault();
      close();
    }
  };
  return {
    open,
    openNew,
    close,
    isOpen: () => activeCardId !== null || pendingNew !== null,
    mount(parent) {
      container = document.createElement('div');
      container.className = 'note-panel-container';
      parent.appendChild(container);

      container.addEventListener('click', onClick);
      window.addEventListener('keydown', onGlobalKeydown);
    },
  };
}
