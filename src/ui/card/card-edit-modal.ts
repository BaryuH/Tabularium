/**
 * Fast, focused modal dialog for editing a card's title and link (URL).
 *
 * Triggered by the pencil icon on card hover. Allows quick modification
 * of title and/or URL with immediate persistence to IndexedDB.
 */
import { iconPencil, iconX } from '../icons';
import { showToast } from '../toast';
import { escapeHtml } from '../../util';
import type { Store } from '../../state/store';

export interface CardEditModal {
  open(cardId: string): void;
  close(): void;
  isOpen(): boolean;
  mount(parent: HTMLElement): void;
}

export function createCardEditModal(store: Store): CardEditModal {
  let activeCardId: string | null = null;
  let container: HTMLElement | null = null;

  const renderContent = (cardId: string): void => {
    if (!container) return;
    const card = store.getState().cards[cardId];
    if (!card) return;

    const kind = card.kind ?? 'tab';
    const isTab = kind === 'tab' || Boolean(card.url);
    const title = card.title === '(untitled)' ? '' : card.title;
    const url = card.url ?? '';

    const urlSection = isTab
      ? `
        <div class="card-edit__field">
          <label class="card-edit__label" for="card-edit-url">Link (URL)</label>
          <input
            id="card-edit-url"
            class="card-edit__input"
            type="url"
            name="url"
            placeholder="https://example.com"
            value="${escapeHtml(url)}"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
      `
      : '';

    container.innerHTML = `
      <div class="card-edit-modal__backdrop" data-action="close-edit"></div>
      <div class="card-edit-modal" role="dialog" aria-modal="true" aria-label="Edit Card">
        <header class="card-edit-modal__head">
          <div class="card-edit-modal__title-row">
            ${iconPencil}
            <h2 class="card-edit-modal__title">Edit ${kind === 'task' ? 'Task' : kind === 'note' ? 'Note' : 'Card'}</h2>
          </div>
          <button class="icon-btn" data-action="close-edit" title="Close (Esc)">${iconX}</button>
        </header>

        <form class="card-edit-modal__form">
          <div class="card-edit__field">
            <label class="card-edit__label" for="card-edit-title">Title</label>
            <input
              id="card-edit-title"
              class="card-edit__input"
              type="text"
              name="title"
              placeholder="Card title..."
              value="${escapeHtml(title)}"
              autocomplete="off"
              spellcheck="false"
              required
            />
          </div>

          ${urlSection}

          <footer class="card-edit-modal__footer">
            <button type="button" class="card-edit__btn card-edit__btn--secondary" data-action="close-edit">Cancel</button>
            <button type="submit" class="card-edit__btn card-edit__btn--primary">Save Changes</button>
          </footer>
        </form>
      </div>
    `;

    const titleInput = container.querySelector<HTMLInputElement>('#card-edit-title');
    requestAnimationFrame(() => {
      if (titleInput) {
        titleInput.focus();
        titleInput.select();
      }
    });

    const form = container.querySelector<HTMLFormElement>('.card-edit-modal__form');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const tInput = form.querySelector<HTMLInputElement>('#card-edit-title');
        const uInput = form.querySelector<HTMLInputElement>('#card-edit-url');

        const newTitle = tInput?.value.trim() || uInput?.value.trim() || '(untitled)';
        const patch: { title: string; url?: string } = { title: newTitle };

        if (uInput) {
          patch.url = uInput.value.trim();
        }

        void store.updateCard(cardId, patch).then(() => {
          showToast('Card updated');
          close();
        });
      });
    }
  };

  const open = (cardId: string): void => {
    activeCardId = cardId;
    if (container) {
      renderContent(cardId);
      container.classList.add('card-edit-modal-container--open');
    }
  };

  const close = (): void => {
    activeCardId = null;
    if (container) {
      container.classList.remove('card-edit-modal-container--open');
      setTimeout(() => {
        if (!activeCardId && container) container.innerHTML = '';
      }, 200);
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
    if (target.closest('[data-action="close-edit"]')) {
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
      container.className = 'card-edit-modal-container';
      parent.appendChild(container);

      container.addEventListener('click', onClick);
      window.addEventListener('keydown', onGlobalKeydown);
    },
  };
}
