/**
 * MV3 service worker.
 *
 * Handles the global "save-active-tab" command (Alt+S): reads the active tab,
 * writes a Card to the active board's Inbox column via the db repo, then
 * broadcasts a change notice so open New Tab pages refresh.
 *
 * This file is the extension's chrome-event entry point and intentionally
 * uses chrome.* directly (the tabs/adapter isolation is for page-side code).
 */
import { openDatabase } from './db/schema';
import { createRepo, type Repo } from './db/repo';

let repoPromise: Promise<Repo> | null = null;

function getRepo(): Promise<Repo> {
  if (!repoPromise) repoPromise = openDatabase().then((db) => createRepo(db));
  return repoPromise;
}

chrome.runtime.onInstalled.addListener((details) => {
  console.info('[Tabularium] installed:', details.reason);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-active-tab') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) return;

    const repo = await getRepo();
    await repo.ensureSeed();
    const meta = await repo.getMeta();

    // Resolve target board
    let boardId = meta.activeBoardId;
    if (!boardId) {
      const boards = await repo.listBoards();
      if (boards.length === 0) return;
      boardId = boards[0].id;
    }

    // Resolve Inbox column (fallback to first column)
    const columns = await repo.listColumns(boardId);
    const inbox = columns.find((c) => c.name === 'Inbox') ?? columns[0];
    if (!inbox) return;

    await repo.createCard(inbox.id, {
      url: tab.url,
      title: tab.title ?? '',
      favIconUrl: tab.favIconUrl,
    });

    // Notify open New Tab pages (no-op if none are open)
    chrome.runtime.sendMessage({ type: 'tabularium:external-change' }).catch(() => {});
  } catch (err) {
    console.error('[Tabularium] save-active-tab failed:', err);
  }
});
