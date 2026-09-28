import { EMOJI_CATEGORIES, searchEmojis, type EmojiItem } from './emoji-data';
import { escapeHtml } from '../../util';
import { iconX } from '../icons';
import type { Store } from '../../state/store';

export interface OpenEmojiPickerParams {
  type: 'board' | 'column';
  id: string;
  anchorEl?: HTMLElement;
}

export interface EmojiPickerModal {
  open(params: OpenEmojiPickerParams): void;
  close(): void;
  isOpen(): boolean;
  mount(parent: HTMLElement): void;
}

export function createEmojiPickerModal(store: Store): EmojiPickerModal {
  let container: HTMLElement | null = null;
  let activeParams: OpenEmojiPickerParams | null = null;
  let activeCategory = 'all';

  const renderItems = (items: EmojiItem[]): string => {
    if (items.length === 0) {
      return `<div class="emoji-picker__empty">No matching emojis found</div>`;
    }
    return items
      .map(
        (item) =>
          `<button type="button" class="emoji-picker__item" data-action="pick-emoji" data-icon="${escapeHtml(item.emoji)}" title="${escapeHtml(item.name)}">${item.emoji}</button>`,
      )
      .join('');
  };

  const renderContent = (params: OpenEmojiPickerParams): void => {
    if (!container) return;

    const targetName = params.type === 'board'
      ? store.getState().boards[params.id]?.name
      : store.getState().columns[params.id]?.name;
    const titleText = targetName ? `Choose Icon · ${targetName}` : 'Choose Icon';

    const tabsHtml = EMOJI_CATEGORIES.map(
      (cat) =>
        `<button type="button" class="emoji-picker__tab ${cat.id === activeCategory ? 'emoji-picker__tab--active' : ''}" data-category="${cat.id}" title="${escapeHtml(cat.name)}" aria-label="${escapeHtml(cat.name)}">
          <span class="emoji-picker__tab-icon">${cat.icon}</span>
        </button>`,
    ).join('');

    const initialItems = searchEmojis('', activeCategory);

    container.innerHTML = `
      <div class="emoji-picker-modal-backdrop" data-action="close-emoji-modal"></div>
      <div class="emoji-picker-modal" role="dialog" aria-modal="true" aria-label="Choose Icon">
        <header class="emoji-picker__head">
          <div class="emoji-picker__title-row">
            <h3 class="emoji-picker__title">${escapeHtml(titleText)}</h3>
          </div>
          <button type="button" class="icon-btn" data-action="close-emoji-modal" title="Close (Esc)">${iconX}</button>
        </header>

        <div class="emoji-picker__search-wrap">
          <span class="emoji-picker__search-icon">🔍</span>
          <input
            type="text"
            class="emoji-picker__search"
            placeholder="Search emojis (e.g. fire, rocket, code, coffee)..."
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="emoji-picker__search-clear" style="display: none;" title="Clear search">✕</button>
        </div>

        <div class="emoji-picker__tabs" role="tablist" aria-label="Emoji Categories">
          ${tabsHtml}
        </div>

        <div class="emoji-picker__body">
          <div class="emoji-picker__grid">
            ${renderItems(initialItems)}
          </div>
        </div>

        <div class="emoji-picker__footer">
          <span class="emoji-picker__count">${initialItems.length} emojis</span>
          <button type="button" class="emoji-picker__clear" data-action="clear-emoji" title="Remove current icon">
            Remove icon
          </button>
        </div>
      </div>
    `;

    // Wiring
    const searchInput = container.querySelector<HTMLInputElement>('.emoji-picker__search');
    const clearSearchBtn = container.querySelector<HTMLButtonElement>('.emoji-picker__search-clear');
    const gridEl = container.querySelector<HTMLElement>('.emoji-picker__grid');
    const countEl = container.querySelector<HTMLElement>('.emoji-picker__count');
    const tabs = container.querySelectorAll<HTMLButtonElement>('.emoji-picker__tab');

    const updateGrid = (): void => {
      if (!gridEl) return;
      const query = searchInput ? searchInput.value.trim() : '';
      if (clearSearchBtn) {
        clearSearchBtn.style.display = query ? 'flex' : 'none';
      }
      const results = searchEmojis(query, activeCategory);
      gridEl.innerHTML = renderItems(results);
      if (countEl) {
        countEl.textContent = `${results.length} emoji${results.length === 1 ? '' : 's'}`;
      }
    };

    if (searchInput) {
      searchInput.addEventListener('input', () => updateGrid());
      if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
          searchInput.value = '';
          searchInput.focus({ preventScroll: true });
          updateGrid();
        });
      }
      setTimeout(() => {
        searchInput.focus({ preventScroll: true });
      }, 15);
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
  };

  const close = (): void => {
    activeParams = null;
    activeCategory = 'all';
    if (container) {
      container.classList.remove('emoji-picker-container--open');
      setTimeout(() => {
        if (!activeParams && container) container.innerHTML = '';
      }, 150);
    }
  };

  const open = (params: OpenEmojiPickerParams): void => {
    activeParams = params;
    activeCategory = 'all';
    if (container) {
      renderContent(params);
      container.classList.add('emoji-picker-container--open');
    }
  };

  const onGlobalKeydown = (e: KeyboardEvent): void => {
    if (!activeParams) return;
    if (e.key === 'Escape') {
      const searchInput = container?.querySelector<HTMLInputElement>('.emoji-picker__search');
      if (searchInput && searchInput.value) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        return;
      }
      e.preventDefault();
      close();
    }
  };

  const onClick = (e: MouseEvent): void => {
    if (!activeParams) return;
    const target = e.target as HTMLElement;

    // Click backdrop or close button
    if (target.closest('[data-action="close-emoji-modal"]')) {
      e.preventDefault();
      close();
      return;
    }

    // Pick emoji item
    const itemBtn = target.closest<HTMLElement>('[data-action="pick-emoji"]');
    if (itemBtn && itemBtn.dataset.icon) {
      e.preventDefault();
      const emoji = itemBtn.dataset.icon;
      const { type, id } = activeParams;
      close();
      if (type === 'board') {
        void store.setBoardIcon(id, emoji);
      } else {
        void store.setColumnIcon(id, emoji);
      }
      return;
    }

    // Clear emoji
    if (target.closest('[data-action="clear-emoji"]')) {
      e.preventDefault();
      const { type, id } = activeParams;
      close();
      if (type === 'board') {
        void store.setBoardIcon(id, undefined);
      } else {
        void store.setColumnIcon(id, undefined);
      }
    }
  };

  return {
    open,
    close,
    isOpen: () => activeParams !== null,
    mount(parent) {
      container = document.createElement('div');
      container.className = 'emoji-picker-container';
      parent.appendChild(container);

      container.addEventListener('click', onClick);
      window.addEventListener('keydown', onGlobalKeydown);
    },
  };
}
