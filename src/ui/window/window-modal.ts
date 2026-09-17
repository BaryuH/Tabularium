/**
 * Modal dialog for inspecting, managing, and restoring a saved Window Session.
 *
 * Allows viewing individual tabs, deleting specific tabs before restore,
 * launching individual tabs, or restoring the entire window with 1 click.
 */
import { iconExternalLink, iconTrash, iconWindow, iconX } from '../icons';
import { showToast } from '../toast';
import { escapeHtml } from '../../util';
import type { Store } from '../../state/store';
import type { TabAdapter } from '../../tabs/adapter';

export interface WindowModal {
  open(cardId: string): void;
  close(): void;
  isOpen(): boolean;
  mount(parent: HTMLElement): void;
}

export function createWindowModal(store: Store, adapter: TabAdapter | null): WindowModal {
  let activeCardId: string | null = null;
  let container: HTMLElement | null = null;

  const renderContent = (cardId: string): void => {
    if (!container) return;
    const card = store.getState().cards[cardId];
    if (!card || card.kind !== 'window') return;

    const tabs = card.tabs ?? [];
    const title = card.title || `Window (${tabs.length} tabs)`;
    const dateStr = new Date(card.savedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const tabRowsHtml = tabs.length
      ? tabs
          .map(
            (t, index) => `
            <div class="window-modal__tab-row" data-tab-index="${index}" data-tab-url="${escapeHtml(t.url)}">
              ${
                t.favIconUrl
                  ? `<img class="window-modal__fav" src="${escapeHtml(t.favIconUrl)}" alt="" width="16" height="16" />`
                  : `<span class="window-modal__fav window-modal__fav--placeholder"></span>`
              }
              <div class="window-modal__tab-info">
                <span class="window-modal__tab-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title || t.url)}</span>
                <span class="window-modal__tab-url" title="${escapeHtml(t.url)}">${escapeHtml(t.url)}</span>
              </div>
              <div class="window-modal__tab-actions">
                <button class="icon-btn icon-btn--sm" data-action="open-single-tab" data-url="${escapeHtml(t.url)}" title="Open tab in background">${iconExternalLink}</button>
                <button class="icon-btn icon-btn--sm" data-action="remove-single-tab" data-index="${index}" title="Remove tab from session">${iconTrash}</button>
              </div>
            </div>
          `,
          )
          .join('')
      : '<p class="window-modal__empty">No tabs left in this session.</p>';

    container.innerHTML = `
      <div class="window-modal__backdrop" data-action="close-window-modal"></div>
      <div class="window-modal" role="dialog" aria-modal="true" aria-label="Window Session">
        <header class="window-modal__head">
          <div class="window-modal__title-row">
            <span class="window-modal__icon">${iconWindow}</span>
            <div>
              <h3 class="window-modal__title">${escapeHtml(title)}</h3>
              <div class="window-modal__meta-text">Saved ${escapeHtml(dateStr)} · ${tabs.length} tab${tabs.length === 1 ? '' : 's'} (0% RAM)</div>
            </div>
          </div>
          <button class="icon-btn window-modal__close" data-action="close-window-modal" title="Close (Esc)">${iconX}</button>
        </header>

        <div class="window-modal__toolbar">
          <button class="window-modal__restore-btn" data-action="restore-all-window" ${tabs.length === 0 ? 'disabled' : ''}>
            ${iconExternalLink}
            <span>Restore all tabs (${tabs.length})</span>
          </button>
        </div>

        <div class="window-modal__body">
          <div class="window-modal__tab-list">
            ${tabRowsHtml}
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll<HTMLImageElement>('img.window-modal__fav').forEach((img) => {
      img.addEventListener('error', () => img.classList.add('window-modal__fav--broken'));
    });
  };

  const close = (): void => {
    activeCardId = null;
    if (container) {
      container.classList.remove('window-modal-container--open');
      setTimeout(() => {
        if (!activeCardId && container) container.innerHTML = '';
      }, 200);
    }
  };

  const open = (cardId: string): void => {
    activeCardId = cardId;
    if (container) {
      renderContent(cardId);
      container.classList.add('window-modal-container--open');
    }
  };

  const restoreAll = async (): Promise<void> => {
    if (!activeCardId) return;
    const card = store.getState().cards[activeCardId];
    if (!card || !card.tabs || card.tabs.length === 0) return;

    const urls = card.tabs.map((t) => t.url).filter(Boolean);
    if (urls.length === 0) return;

    const behavior = store.getState().meta.stashedOpenBehavior ?? 'new-tab';
    if (adapter) {
      if (behavior === 'current-tab') {
        if (urls.length > 1) {
          await adapter.openTabsInCurrentWindow(urls.slice(1));
        }
        await adapter.openInCurrentTab(urls[0]);
      } else {
        await adapter.openTabsInCurrentWindow(urls);
      }
    } else {
      if (behavior === 'current-tab') {
        for (let i = 1; i < urls.length; i++) window.open(urls[i], '_blank');
        window.location.href = urls[0];
      } else {
        for (const url of urls) {
          window.open(url, '_blank');
        }
      }
    }
    showToast(`Restored ${urls.length} tabs in this window`);
    close();
  };

  const removeSingleTab = async (index: number): Promise<void> => {
    if (!activeCardId) return;
    const card = store.getState().cards[activeCardId];
    if (!card || !card.tabs) return;

    const updatedTabs = [...card.tabs];
    updatedTabs.splice(index, 1);

    await store.updateCard(activeCardId, {
      tabs: updatedTabs,
      title: card.title.replace(/\(\d+\s+tabs\)/, `(${updatedTabs.length} tabs)`),
    });

    if (activeCardId) {
      renderContent(activeCardId);
    }
  };

  const onGlobalKeydown = (event: KeyboardEvent): void => {
    if (!activeCardId) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-action="close-window-modal"]')) {
      event.preventDefault();
      close();
      return;
    }

    if (target.closest('[data-action="restore-all-window"]')) {
      event.preventDefault();
      void restoreAll();
      return;
    }

    const removeBtn = target.closest<HTMLElement>('[data-action="remove-single-tab"]');
    if (removeBtn) {
      event.preventDefault();
      const idx = parseInt(removeBtn.dataset.index ?? '-1', 10);
      if (idx >= 0) void removeSingleTab(idx);
      return;
    }

    const openBtn = target.closest<HTMLElement>('[data-action="open-single-tab"]');
    if (openBtn) {
      event.preventDefault();
      const url = openBtn.dataset.url;
      if (url) {
        const behavior = store.getState().meta.stashedOpenBehavior ?? 'new-tab';
        if (adapter) {
          if (behavior === 'current-tab') {
            void adapter.openInCurrentTab(url);
          } else {
            void adapter.openUrl(url);
          }
        } else {
          if (behavior === 'current-tab') {
            window.location.href = url;
          } else {
            window.open(url, '_blank');
          }
        }
      }
    }
  };

  return {
    open,
    close,
    isOpen: () => activeCardId !== null,
    mount(parent) {
      container = document.createElement('div');
      container.className = 'window-modal-container';
      parent.appendChild(container);

      container.addEventListener('click', onClick);
      window.addEventListener('keydown', onGlobalKeydown);
    },
  };
}
