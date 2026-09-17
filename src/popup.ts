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

    render();
  } catch (err) {
    console.error('[Tabularium Popup] init failed', err);
    if (app) {
      app.innerHTML = `<div class="fast-note"><p style="color: var(--text-muted); text-align: center; padding: 20px;">Failed to load Tabularium database.</p></div>`;
    }
  }
}

function render(): void {
  if (!app) return;

  if (state.saved) {
    const col = state.columns.find((c) => c.id === state.selectedColumnId);
    const colName = col ? col.name : 'your board';
    app.innerHTML = `
      <div class="fast-note__success">
        <div class="fast-note__success-icon">✓</div>
        <div class="fast-note__success-title">Note Saved!</div>
        <div class="fast-note__success-sub">Saved to "${escapeHtml(colName)}" in Tabularium</div>
      </div>
    `;
    return;
  }

  const isTask = state.kind === 'task';
  const columnOptions = state.columns
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}" ${c.id === state.selectedColumnId ? 'selected' : ''}>${c.icon ? `${escapeHtml(c.icon)} ` : ''}${escapeHtml(c.name)}</option>`,
    )
    .join('');

  const attachHtml = state.activeTab
    ? `<div class="fast-note__attach">
        <div class="fast-note__attach-info">
          ${state.activeTab.favIconUrl ? `<img src="${escapeHtml(state.activeTab.favIconUrl)}" alt="" width="14" height="14" />` : '🌐'}
          <span class="fast-note__attach-title" title="${escapeHtml(state.activeTab.title)}">${escapeHtml(state.activeTab.title || state.activeTab.url)}</span>
        </div>
        <button type="button" class="fast-note__attach-toggle" data-action="toggle-attach">
          ${state.attachTab ? 'Remove' : '+ Attach Tab'}
        </button>
      </div>`
    : '';

  const defaultDatePrefix = `${formatDateTag()} `;

  app.innerHTML = `
    <div class="fast-note">
      <div class="fast-note__header">
        <div class="fast-note__brand">
          <span class="fast-note__logo">${iconNote}</span>
          <span class="fast-note__title">Fast Note</span>
        </div>
        <div class="fast-note__kind-switch">
          <button type="button" class="fast-note__kind-btn ${!isTask ? 'fast-note__kind-btn--active' : ''}" data-action="set-kind" data-kind="note">
            ${iconNote}<span>Note</span>
          </button>
          <button type="button" class="fast-note__kind-btn ${isTask ? 'fast-note__kind-btn--active' : ''}" data-action="set-kind" data-kind="task">
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
          placeholder="${isTask ? 'Task title...' : 'Note title...'}"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="fast-note__field">
        <textarea
          class="fast-note__textarea"
          id="note-textarea"
          placeholder="${isTask ? 'Add task details, checklist or steps...' : 'Capture quick thoughts, links or snippets...'}"
          spellcheck="false"
        ></textarea>
      </div>

      ${attachHtml}

      <div class="fast-note__footer">
        <span class="fast-note__hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> to save</span>
        <div class="fast-note__actions">
          <button type="button" class="fast-note__btn fast-note__btn--primary" id="save-btn" ${state.saving ? 'disabled' : ''}>
            ${state.saving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  `;

  // Focus textarea for immediate writing
  const textarea = app.querySelector<HTMLTextAreaElement>('#note-textarea');
  if (textarea) {
    textarea.focus();
  }

  // Attach event listeners
  const colSelect = app.querySelector<HTMLSelectElement>('#column-select');
  if (colSelect) {
    colSelect.addEventListener('change', () => {
      state.selectedColumnId = colSelect.value;
    });
  }

  const saveBtn = app.querySelector<HTMLButtonElement>('#save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      void save();
    });
  }

  app.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const kindBtn = target.closest<HTMLElement>('[data-action="set-kind"]');
    if (kindBtn?.dataset.kind) {
      state.kind = kindBtn.dataset.kind as CardKind;
      render();
      return;
    }
    const attachBtn = target.closest<HTMLElement>('[data-action="toggle-attach"]');
    if (attachBtn) {
      state.attachTab = !state.attachTab;
      render();
    }
  });

  window.addEventListener('keydown', onKeydown);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    window.close();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    void save();
  }
}

async function save(): Promise<void> {
  if (!repo || state.saving) return;

  const titleInput = app?.querySelector<HTMLInputElement>('#title-input');
  const textarea = app?.querySelector<HTMLTextAreaElement>('#note-textarea');
  if (!titleInput || !textarea) return;

  const rawTitle = titleInput.value.trim();
  const noteBody = textarea.value.trim();

  // If both title and body are empty (or only default date tag)
  const isOnlyDateTag = /^\[[A-Za-z]{3}\s+\d{1,2}\]$/.test(rawTitle);
  if ((!rawTitle || isOnlyDateTag) && !noteBody && !state.attachTab) {
    textarea.focus();
    return;
  }

  const title = rawTitle || (state.attachTab && state.activeTab?.title ? state.activeTab.title : '(untitled)');
  const columnId = state.selectedColumnId || state.columns[0]?.id;
  if (!columnId) return;

  state.saving = true;
  const saveBtn = app?.querySelector<HTMLButtonElement>('#save-btn');
  if (saveBtn) saveBtn.textContent = 'Saving...';

  try {
    const url = state.attachTab && state.activeTab ? state.activeTab.url : '';
    await repo.createCard(columnId, {
      title,
      note: noteBody,
      kind: state.kind,
      url,
    });

    // Broadcast change to any open Tabularium New Tab pages
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'tabularium:external-change' }).catch(() => {});
    }

    state.saved = true;
    render();

    // Auto-close popup after short visual confirmation
    setTimeout(() => {
      window.close();
    }, 600);
  } catch (err) {
    console.error('[Tabularium Popup] Save failed', err);
    state.saving = false;
    if (saveBtn) saveBtn.textContent = 'Save Note';
  }
}

void init();
