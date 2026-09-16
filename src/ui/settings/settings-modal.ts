/**
 * Settings modal dialog.
 *
 * Provides:
 * 1. Tab opening behavior preference ('new-tab' vs 'current-tab')
 * 2. Export full IndexedDB data to JSON backup file
 * 3. Import & restore full data from JSON backup file with validation & confirmation
 */
import { iconDownload, iconUpload, iconX } from '../icons';
import { showToast } from '../toast';
import { importCsvToStore, serializeSnapshotToCsv } from '../../util/csv';
import type { Store } from '../../state/store';
import type { Snapshot, TabOpenBehavior } from '../../types';

export interface SettingsModal {
  open(): void;
  close(): void;
  isOpen(): boolean;
  mount(parent: HTMLElement): void;
}

function triggerDownload(content: string, filename: string, mimeType = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function createSettingsModal(store: Store): SettingsModal {
  let container: HTMLElement | null = null;
  let isOpenState = false;

  const renderContent = (): void => {
    if (!container) return;
    const meta = store.getState().meta;
    const openBehavior: TabOpenBehavior = meta.openBehavior ?? 'new-tab';

    container.innerHTML = `
      <div class="settings-modal__backdrop" data-action="close-settings"></div>
      <div class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <header class="settings-modal__head">
          <h2 class="settings-modal__title">Settings</h2>
          <button class="icon-btn" data-action="close-settings" title="Close (Esc)">${iconX}</button>
        </header>

        <div class="settings-modal__body">
          <!-- Section 1: Tab Open Behavior -->
          <section class="settings-section">
            <h3 class="settings-section__title">Tab Opening Behavior</h3>
            <p class="settings-section__desc">Choose how links open when you click on a tab card on your board.</p>

            <div class="settings-radio-group" role="radiogroup" aria-label="Tab Opening Behavior">
              <label class="settings-radio ${openBehavior === 'new-tab' ? 'settings-radio--active' : ''}">
                <input type="radio" name="openBehavior" value="new-tab" ${openBehavior === 'new-tab' ? 'checked' : ''} />
                <span class="settings-radio__content">
                  <span class="settings-radio__label">Open in new tab (Recommended)</span>
                  <span class="settings-radio__subtext">Activates matching tab if already open, or opens a new tab. Keeps Tabularium open.</span>
                </span>
              </label>

              <label class="settings-radio ${openBehavior === 'current-tab' ? 'settings-radio--active' : ''}">
                <input type="radio" name="openBehavior" value="current-tab" ${openBehavior === 'current-tab' ? 'checked' : ''} />
                <span class="settings-radio__content">
                  <span class="settings-radio__label">Open in current tab</span>
                  <span class="settings-radio__subtext">Navigates directly in this tab without keeping Tabularium open.</span>
                </span>
              </label>
            </div>
          </section>

          <!-- Section 2: Data Backup & Restore -->
          <section class="settings-section">
            <h3 class="settings-section__title">Data Backup & Restore</h3>
            <p class="settings-section__desc">Export your boards, columns, and cards to JSON or CSV spreadsheet, or restore from a backup file.</p>

            <div class="settings-actions">
              <button class="settings-btn" data-action="export-json" title="Download JSON backup file">
                ${iconDownload}
                <span>Export JSON</span>
              </button>

              <button class="settings-btn" data-action="trigger-import" title="Restore from JSON backup file">
                ${iconUpload}
                <span>Import JSON</span>
              </button>
              <input type="file" class="settings-file-input" accept=".json" style="display: none;" />

              <button class="settings-btn" data-action="export-csv" title="Download CSV spreadsheet">
                ${iconDownload}
                <span>Export CSV</span>
              </button>

              <button class="settings-btn" data-action="trigger-import-csv" title="Import cards from CSV spreadsheet">
                ${iconUpload}
                <span>Import CSV</span>
              </button>
              <input type="file" class="settings-csv-file-input" accept=".csv,text/csv" style="display: none;" />
            </div>
          </section>
        </div>
      </div>
    `;

    // Wire Radio change
    container.querySelectorAll<HTMLInputElement>('input[name="openBehavior"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const val = radio.value as TabOpenBehavior;
        void store.setOpenBehavior(val).then(() => {
          showToast(`Tab click behavior set to: ${val === 'new-tab' ? 'New tab' : 'Current tab'}`);
          renderContent();
        });
      });
    });

    // Wire Import file input
    const fileInput = container.querySelector<HTMLInputElement>('.settings-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const parsed = JSON.parse(text) as unknown;

          if (
            !parsed ||
            typeof parsed !== 'object' ||
            !('boards' in parsed) ||
            !('columns' in parsed) ||
            !('cards' in parsed) ||
            !Array.isArray((parsed as Snapshot).boards) ||
            !Array.isArray((parsed as Snapshot).columns) ||
            !Array.isArray((parsed as Snapshot).cards)
          ) {
            showToast('Invalid backup file: missing boards, columns, or cards');
            return;
          }

          const snapshot = parsed as Snapshot;
          const count = snapshot.cards.length;
          const boardCount = snapshot.boards.length;

          if (
            !window.confirm(
              `Restore backup with ${boardCount} board${boardCount === 1 ? '' : 's'} and ${count} card${count === 1 ? '' : 's'}?\n\nThis will replace your current boards.`,
            )
          ) {
            return;
          }

          await store.importSnapshot(snapshot);
          showToast(`Successfully restored ${boardCount} board${boardCount === 1 ? '' : 's'} and ${count} cards!`);
          close();
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Failed to parse JSON file');
        } finally {
          fileInput.value = '';
        }
      });
    }

    // Wire Import CSV file input
    const csvFileInput = container.querySelector<HTMLInputElement>('.settings-csv-file-input');
    if (csvFileInput) {
      csvFileInput.addEventListener('change', async () => {
        const file = csvFileInput.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const { count } = await importCsvToStore(text, store);
          showToast(`Successfully imported ${count} card${count === 1 ? '' : 's'} from CSV!`);
          close();
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Failed to parse CSV file');
        } finally {
          csvFileInput.value = '';
        }
      });
    }
  };

  const open = (): void => {
    isOpenState = true;
    if (container) {
      renderContent();
      container.classList.add('settings-modal-container--open');
    }
  };

  const close = (): void => {
    isOpenState = false;
    if (container) {
      container.classList.remove('settings-modal-container--open');
      setTimeout(() => {
        if (!isOpenState && container) container.innerHTML = '';
      }, 200);
    }
  };

  const onGlobalKeydown = (event: KeyboardEvent): void => {
    if (!isOpenState) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;

    // Close button or backdrop
    if (target.closest('[data-action="close-settings"]')) {
      event.preventDefault();
      close();
      return;
    }

    // Export JSON
    if (target.closest('[data-action="export-json"]')) {
      event.preventDefault();
      void store.exportSnapshot().then((snapshot) => {
        const dateStr = new Date().toISOString().split('T')[0];
        const json = JSON.stringify(snapshot, null, 2);
        triggerDownload(json, `tabularium-backup-${dateStr}.json`);
        showToast('Backup file exported');
      });
      return;
    }

    // Trigger JSON Import
    if (target.closest('[data-action="trigger-import"]')) {
      event.preventDefault();
      const fileInput = container?.querySelector<HTMLInputElement>('.settings-file-input');
      fileInput?.click();
      return;
    }

    // Export CSV
    if (target.closest('[data-action="export-csv"]')) {
      event.preventDefault();
      void store.exportSnapshot().then((snapshot) => {
        const dateStr = new Date().toISOString().split('T')[0];
        const csv = serializeSnapshotToCsv(snapshot);
        triggerDownload(csv, `tabularium-export-${dateStr}.csv`, 'text/csv;charset=utf-8;');
        showToast('CSV file exported');
      });
      return;
    }

    // Trigger CSV Import
    if (target.closest('[data-action="trigger-import-csv"]')) {
      event.preventDefault();
      const csvFileInput = container?.querySelector<HTMLInputElement>('.settings-csv-file-input');
      csvFileInput?.click();
    }
  };

  return {
    open,
    close,
    isOpen: () => isOpenState,
    mount(parent) {
      container = document.createElement('div');
      container.className = 'settings-modal-container';
      parent.appendChild(container);

      container.addEventListener('click', onClick);
      window.addEventListener('keydown', onGlobalKeydown);
    },
  };
}
