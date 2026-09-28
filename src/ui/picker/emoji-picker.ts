import { EMOJI_CATEGORIES, EMOJI_DATASET, searchEmojis, type EmojiItem } from './emoji-data';
import { escapeHtml } from '../../util';

export interface PickerContext {
  type: 'board' | 'column';
  id: string;
}

function renderItemsHtml(items: EmojiItem[], context: PickerContext): string {
  if (items.length === 0) {
    return `<div class="emoji-picker__empty">No matching emojis</div>`;
  }
  const actionName = context.type === 'board' ? 'select-icon' : 'select-column-icon';
  const idAttr = context.type === 'board' ? `data-board-id="${context.id}"` : `data-column-id="${context.id}"`;

  return items
    .map(
      (item) =>
        `<button type="button" class="emoji-picker__item" data-action="${actionName}" ${idAttr} data-icon="${escapeHtml(item.emoji)}" title="${escapeHtml(item.name)}">${item.emoji}</button>`,
    )
    .join('');
}

export function renderEmojiPickerHtml(context: PickerContext): string {
  const isBoard = context.type === 'board';
  const clearAction = isBoard ? 'select-icon' : 'select-column-icon';
  const idAttr = isBoard ? `data-board-id="${context.id}"` : `data-column-id="${context.id}"`;

  // Clean, icon-only category tabs with hover tooltips
  const tabsHtml = EMOJI_CATEGORIES.map(
    (cat, index) =>
      `<button type="button" class="emoji-picker__tab ${index === 0 ? 'emoji-picker__tab--active' : ''}" data-category="${cat.id}" title="${escapeHtml(cat.name)}" aria-label="${escapeHtml(cat.name)}">
        <span class="emoji-picker__tab-icon">${cat.icon}</span>
      </button>`,
  ).join('');

  const initialItemsHtml = renderItemsHtml(EMOJI_DATASET, context);

  return `
    <div class="emoji-picker-wrapper">
      <div class="emoji-picker__backdrop" data-action="close-emoji-picker"></div>
      <div class="emoji-picker ${isBoard ? 'emoji-picker--board' : 'emoji-picker--column'}" role="dialog" aria-label="Emoji Picker">
        <div class="emoji-picker__header">
          <div class="emoji-picker__search-wrap">
            <span class="emoji-picker__search-icon">🔍</span>
            <input
              type="text"
              class="emoji-picker__search"
              placeholder="Search emojis..."
              autocomplete="off"
              spellcheck="false"
            />
            <button type="button" class="emoji-picker__search-clear" style="display: none;" title="Clear search">✕</button>
          </div>
        </div>

        <div class="emoji-picker__tabs" role="tablist" aria-label="Emoji Categories">
          ${tabsHtml}
        </div>

        <div class="emoji-picker__body">
          <div class="emoji-picker__grid">
            ${initialItemsHtml}
          </div>
        </div>

        <div class="emoji-picker__footer">
          <span class="emoji-picker__count">${EMOJI_DATASET.length} emojis</span>
          <button type="button" class="emoji-picker__clear" data-action="${clearAction}" ${idAttr} data-icon="" title="Remove current icon">
            Remove icon
          </button>
        </div>
      </div>
    </div>
  `;
}

export function attachEmojiPickerListeners(wrapperEl: HTMLElement, context: PickerContext): void {
  const searchInput = wrapperEl.querySelector<HTMLInputElement>('.emoji-picker__search');
  const clearSearchBtn = wrapperEl.querySelector<HTMLButtonElement>('.emoji-picker__search-clear');
  const gridEl = wrapperEl.querySelector<HTMLElement>('.emoji-picker__grid');
  const countEl = wrapperEl.querySelector<HTMLElement>('.emoji-picker__count');
  const tabs = wrapperEl.querySelectorAll<HTMLButtonElement>('.emoji-picker__tab');

  let activeCategory = 'all';

  const updateGrid = (): void => {
    if (!gridEl) return;
    const query = searchInput ? searchInput.value.trim() : '';
    if (clearSearchBtn) {
      clearSearchBtn.style.display = query ? 'flex' : 'none';
    }
    const results = searchEmojis(query, activeCategory);
    gridEl.innerHTML = renderItemsHtml(results, context);
    if (countEl) {
      countEl.textContent = `${results.length} emoji${results.length === 1 ? '' : 's'}`;
    }
  };

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      updateGrid();
    });

    searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchInput.value) {
          e.stopPropagation();
          searchInput.value = '';
          updateGrid();
        }
      }
    });

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus({ preventScroll: true });
        updateGrid();
      });
    }

    // Auto-focus without causing viewport scroll jump
    setTimeout(() => {
      searchInput.focus({ preventScroll: true });
    }, 10);
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      tabs.forEach((t) => t.classList.remove('emoji-picker__tab--active'));
      tab.classList.add('emoji-picker__tab--active');
      activeCategory = tab.dataset.category ?? 'all';
      updateGrid();
    });
  });
}
