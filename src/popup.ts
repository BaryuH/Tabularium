import '@fontsource-variable/geist';
import './popup.css';
import { openDatabase } from './db/schema';
import { createRepo, type Repo } from './db/repo';
import { formatDateTag, escapeHtml } from './util';
import { iconNote, iconListTodo } from './ui/icons';
import type { CardKind, Column } from './types';

interface PopupState {
  columns: Column[];
  selectedColumnId: string;
  kind: CardKind;
  attachTab: boolean;
  activeTab: { url: string; title: string; favIconUrl?: string } | null;
  saving: boolean;
  saved: boolean;
}

const state: PopupState = {
  columns: [],
  selectedColumnId: '',
  kind: 'note',
  attachTab: false,
  activeTab: null,
  saving: false,
  saved: false,
};

let repo: Repo | null = null;
const app = document.getElementById('popup-app');

function isWebUrl(url?: string): boolean {
  if (!url) return false;
  return !url.startsWith('chrome://') &&
    !url.startsWith('chrome-extension://') &&
    !url.startsWith('edge://') &&
    !url.startsWith('about:');
}

async function init(): Promise<void> {
  try {
    const db = await openDatabase();
    repo = createRepo(db);
    await repo.ensureSeed();

    const meta = await repo.getMeta();
    const theme = meta.theme ?? 'dark';
    document.documentElement.setAttribute('data-theme', theme);

    let boardId = meta.activeBoardId;
    if (!boardId) {
      const boards = await repo.listBoards();
      if (boards.length > 0) boardId = boards[0].id;
    }

    if (boardId) {
      state.columns = await repo.listColumns(boardId);
      if (state.columns.length > 0) {
        state.selectedColumnId = state.columns[0].id;
      }
    }

    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && isWebUrl(tab.url)) {
        state.activeTab = {
          url: tab.url,
          title: tab.title ?? '',
          favIconUrl: tab.favIconUrl,
        };
      }
    }

    buildUI();
  } catch (err) {
    console.error('[Tabularium Popup] init failed', err);
    if (app) {
      app.innerHTML = `<div class="fast-note"><p style="color: var(--text-muted); text-align: center; padding: 20px;">Failed to load Tabularium database.</p></div>`;
    }
  }
}

function buildUI(): void {
  if (!app) return;

  const defaultDatePrefix = `${formatDateTag()} `;
  const columnOptions = state.columns
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}" ${c.id === state.selectedColumnId ? 'selected' : ''}>${c.icon ? `${escapeHtml(c.icon)} ` : ''}${escapeHtml(c.name)}</option>`,
    )
    .join('');

  const attachSectionHtml = state.activeTab
    ? `<div class="fast-note__attach" id="attach-container">
        <div class="fast-note__attach-info">
          ${state.activeTab.favIconUrl ? `<img src="${escapeHtml(state.activeTab.favIconUrl)}" alt="" width="14" height="14" />` : '🌐'}
          <span class="fast-note__attach-title" title="${escapeHtml(state.activeTab.title)}">${escapeHtml(state.activeTab.title || state.activeTab.url)}</span>
        </div>
        <button type="button" class="fast-note__attach-toggle" id="attach-toggle-btn">+ Attach Tab</button>
      </div>`
    : '';

  app.innerHTML = `
    <div class="fast-note">
      <div class="fast-note__header">
        <div class="fast-note__brand">
          <span class="fast-note__logo">${iconNote}</span>
          <span class="fast-note__title">Fast Note</span>
        </div>
        <div class="fast-note__kind-switch">
          <button type="button" class="fast-note__kind-btn fast-note__kind-btn--active" id="kind-note-btn" data-kind="note">
            ${iconNote}<span>Note</span>
          </button>
          <button type="button" class="fast-note__kind-btn" id="kind-task-btn" data-kind="task">
            ${iconListTodo}<span>Task</span>
          </button>
        </div>
      </div>

      <div class="fast-note__target">
        <span class="fast-note__target-label">Save to:</span>
        <select class="fast-note__select" id="column-select" aria-label="Destination Column">
          ${columnOptions}
        </select>
      </div>

      <div class="fast-note__field">
        <input
          type="text"
          class="fast-note__input"
          id="title-input"
          value="${escapeHtml(defaultDatePrefix)}"
          placeholder="Note title..."
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="fast-note__field">
        <textarea
          class="fast-note__textarea"
          id="note-textarea"
          placeholder="Capture quick thoughts, links or snippets..."
          spellcheck="false"
        ></textarea>
      </div>

      ${attachSectionHtml}

      <div class="fast-note__footer">
        <span class="fast-note__hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save</span>
        <div class="fast-note__actions">
          <button type="button" class="fast-note__btn fast-note__btn--primary" id="save-btn">
            Save Note
          </button>
        </div>
      </div>
    </div>
  `;

  // Elements
  const textarea = app.querySelector<HTMLTextAreaElement>('#note-textarea');
  const titleInput = app.querySelector<HTMLInputElement>('#title-input');
  const colSelect = app.querySelector<HTMLSelectElement>('#column-select');
  const saveBtn = app.querySelector<HTMLButtonElement>('#save-btn');
  const kindNoteBtn = app.querySelector<HTMLButtonElement>('#kind-note-btn');
  const kindTaskBtn = app.querySelector<HTMLButtonElement>('#kind-task-btn');
  const attachContainer = app.querySelector<HTMLElement>('#attach-container');
  const attachToggleBtn = app.querySelector<HTMLButtonElement>('#attach-toggle-btn');

  // Focus textarea immediately
  if (textarea) {
    textarea.focus();
  }

  // Column select
  if (colSelect) {
    colSelect.addEventListener('change', () => {
      state.selectedColumnId = colSelect.value;
    });
  }

  // Kind toggle (Note vs Task) without re-rendering DOM
  const updateKindUI = (kind: CardKind): void => {
    state.kind = kind;
    const isTask = kind === 'task';
    kindNoteBtn?.classList.toggle('fast-note__kind-btn--active', !isTask);
    kindTaskBtn?.classList.toggle('fast-note__kind-btn--active', isTask);
    if (titleInput) {
      titleInput.placeholder = isTask ? 'Task title...' : 'Note title...';
    }
    if (textarea) {
      textarea.placeholder = isTask
        ? 'Add task details, checklist or steps...'
        : 'Capture quick thoughts, links or snippets...';
    }
    if (saveBtn && !state.saving) {
      saveBtn.textContent = isTask ? 'Save Task' : 'Save Note';
    }
  };

  kindNoteBtn?.addEventListener('click', () => updateKindUI('note'));
  kindTaskBtn?.addEventListener('click', () => updateKindUI('task'));

  // Attach / Remove Tab toggle without re-rendering DOM
  if (attachToggleBtn && attachContainer && state.activeTab) {
    attachToggleBtn.addEventListener('click', () => {
      state.attachTab = !state.attachTab;
      attachContainer.classList.toggle('fast-note__attach--active', state.attachTab);
      attachToggleBtn.textContent = state.attachTab ? 'Remove' : '+ Attach Tab';

      if (titleInput) {
        const curVal = titleInput.value.trim();
        const tabTitle = state.activeTab?.title ?? '';
        if (state.attachTab) {
          // If title was only date prefix or empty, auto-populate tab title
          if (curVal === '' || curVal === defaultDatePrefix.trim()) {
            titleInput.value = `${defaultDatePrefix}${tabTitle}`;
          }
        } else {
          // If title was auto-populated with tab title, revert to date prefix
          if (curVal === `${defaultDatePrefix}${tabTitle}`.trim()) {
            titleInput.value = defaultDatePrefix;
          }
        }
      }
    });
  }

  // Save button
  saveBtn?.addEventListener('click', () => {
    void save();
  });

  // Keyboard shortcut listener (bound once)
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.close();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void save();
    }
  });
}

async function save(): Promise<void> {
  if (!repo || state.saving) return;

  const titleInput = app?.querySelector<HTMLInputElement>('#title-input');
  const textarea = app?.querySelector<HTMLTextAreaElement>('#note-textarea');
  const saveBtn = app?.querySelector<HTMLButtonElement>('#save-btn');
  if (!titleInput || !textarea || !saveBtn) return;

  const rawTitle = titleInput.value.trim();
  const noteBody = textarea.value.trim();

  // Validate: if both title and body are empty (or only default date tag)
  const isOnlyDateTag = /^\[[A-Za-z]{3}\s+\d{1,2}\]$/.test(rawTitle);
  if ((!rawTitle || isOnlyDateTag) && !noteBody && !state.attachTab) {
    textarea.focus();
    textarea.style.borderColor = 'var(--note-accent)';
    setTimeout(() => {
      textarea.style.borderColor = '';
    }, 600);
    return;
  }

  const defaultDate = `${formatDateTag()} `;
  let title = rawTitle;
  if (!title || isOnlyDateTag) {
    if (state.attachTab && state.activeTab?.title) {
      title = `${defaultDate}${state.activeTab.title}`;
    } else {
      title = title || '(untitled)';
    }
  }

  const columnId = state.selectedColumnId || state.columns[0]?.id;
  if (!columnId) return;

  state.saving = true;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const url = state.attachTab && state.activeTab ? state.activeTab.url : '';
    await repo.createCard(columnId, {
      title,
      note: noteBody,
      kind: state.kind,
      url,
    });

    // Broadcast change notice to open Tabularium New Tab pages
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'tabularium:external-change' }).catch(() => {});
    }

    // Smooth success feedback
    saveBtn.style.background = '#22c55e';
    saveBtn.style.borderColor = '#22c55e';
    saveBtn.textContent = '✓ Saved!';

    setTimeout(() => {
      window.close();
    }, 380);
  } catch (err) {
    console.error('[Tabularium Popup] Save failed', err);
    state.saving = false;
    saveBtn.disabled = false;
    saveBtn.style.background = '';
    saveBtn.style.borderColor = '';
    saveBtn.textContent = state.kind === 'task' ? 'Save Task' : 'Save Note';
  }
}

void init();
