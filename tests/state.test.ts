import { beforeEach, expect, it } from 'vitest';
import { openDatabase } from '../src/db/schema';
import { createRepo, type Repo } from '../src/db/repo';
import { createStore, type Store } from '../src/state/store';

let repo: Repo;
let store: Store;

beforeEach(async () => {
  const db = await openDatabase(`test-${crypto.randomUUID()}`);
  repo = createRepo(db);
  store = createStore(repo);
  await store.hydrate();
});

it('hydrate seeds and loads default board My Workspace with 3 columns', () => {
  const boards = store.boardsSorted();
  expect(boards).toHaveLength(1);
  expect(boards[0].name).toBe('My Workspace');
  expect(boards[0].icon).toBe('💼');
  expect(store.columnsOfBoard(boards[0].id).map((c) => c.name)).toEqual(['General', 'Projects', 'Research']);
  expect(store.activeBoard()?.id).toBe(boards[0].id);
});

it('createBoard reflects in state and persists', async () => {
  await store.createBoard('Work');
  expect(store.boardsSorted().map((b) => b.name)).toContain('Work');

  // A second store over the same repo observes the persisted board.
  const other = createStore(repo);
  await other.applyExternalChange();
  expect(other.boardsSorted().map((b) => b.name)).toContain('Work');
});

it('notifies subscribers on mutation and stops after unsubscribe', async () => {
  const boardId = store.boardsSorted()[0].id;
  let calls = 0;
  const unsubscribe = store.subscribe(() => {
    calls += 1;
  });
  await store.createColumn(boardId, 'Todo');
  expect(calls).toBeGreaterThan(0);

  unsubscribe();
  const settled = calls;
  await store.createColumn(boardId, 'Done');
  expect(calls).toBe(settled);
});

it('createColumn with icon and setColumnIcon updates column icon', async () => {
  const boardId = store.boardsSorted()[0].id;
  const col = await store.createColumn(boardId, 'Doing', '⚡');
  expect(col.icon).toBe('⚡');
  expect(store.columnsOfBoard(boardId).find((c) => c.id === col.id)?.icon).toBe('⚡');

  await store.setColumnIcon(col.id, '🔥');
  expect(store.columnsOfBoard(boardId).find((c) => c.id === col.id)?.icon).toBe('🔥');

  // Remove icon
  await store.setColumnIcon(col.id, undefined);
  expect(store.columnsOfBoard(boardId).find((c) => c.id === col.id)?.icon).toBeUndefined();
});

it('createCard and reorderCards yield ordered cards', async () => {
  const inbox = store.columnsOfBoard(store.boardsSorted()[0].id)[0];
  const a = await store.createCard(inbox.id, { url: 'a', title: 'a' });
  const b = await store.createCard(inbox.id, { url: 'b', title: 'b' });
  expect(store.cardsOfColumn(inbox.id).map((c) => c.id)).toEqual([a.id, b.id]);

  await store.reorderCards(inbox.id, [b.id, a.id]);
  expect(store.cardsOfColumn(inbox.id).map((c) => c.id)).toEqual([b.id, a.id]);
});

it('moveCard relocates a card across columns in state', async () => {
  const boardId = store.boardsSorted()[0].id;
  const inbox = store.columnsOfBoard(boardId)[0];
  const todo = await store.createColumn(boardId, 'Todo');
  const card = await store.createCard(inbox.id, { url: 'a', title: 'a' });

  await store.moveCard(card.id, todo.id, [card.id]);
  expect(store.cardsOfColumn(inbox.id)).toEqual([]);
  expect(store.cardsOfColumn(todo.id).map((c) => c.id)).toEqual([card.id]);
});

it('createCard supports task kind and toggleTaskComplete toggles completedAt', async () => {
  const inbox = store.columnsOfBoard(store.boardsSorted()[0].id)[0];
  const task = await store.createCard(inbox.id, { url: '', title: 'Buy milk', kind: 'task' });
  expect(task.kind).toBe('task');
  expect(task.completedAt).toBeUndefined();

  await store.toggleTaskComplete(task.id);
  const doneTask = store.cardsOfColumn(inbox.id).find((c) => c.id === task.id);
  expect(doneTask?.completedAt).toBeTypeOf('number');

  // Toggle again to uncomplete
  await store.toggleTaskComplete(task.id);
  const undoneTask = store.cardsOfColumn(inbox.id).find((c) => c.id === task.id);
  expect(undoneTask?.completedAt).toBeUndefined();
});

it('setActiveBoard and setTheme update meta', async () => {
  const second = await store.createBoard('Second');
  await store.setActiveBoard(second.id);
  expect(store.activeBoard()?.id).toBe(second.id);

  await store.setTheme('dark');
  expect(store.getState().meta.theme).toBe('dark');
});

it('deleteBoard removes it from state', async () => {
  const second = await store.createBoard('Second');
  await store.deleteBoard(second.id);
  expect(store.boardsSorted().some((b) => b.id === second.id)).toBe(false);
});

it('createBoard with icon and setBoardIcon update board icon', async () => {
  const board = await store.createBoard('Project X', '🚀');
  expect(board.icon).toBe('🚀');
  expect(store.boardsSorted().find((b) => b.id === board.id)?.icon).toBe('🚀');

  await store.setBoardIcon(board.id, '🎯');
  expect(store.boardsSorted().find((b) => b.id === board.id)?.icon).toBe('🎯');

  // Remove icon
  await store.setBoardIcon(board.id, undefined);
  expect(store.boardsSorted().find((b) => b.id === board.id)?.icon).toBeUndefined();
});

it('createCard with note kind and updateCard persists note content', async () => {
  const inbox = store.columnsOfBoard(store.boardsSorted()[0].id)[0];
  const card = await store.createCard(inbox.id, { url: '', title: 'Meeting Notes', kind: 'note' });
  expect(card.kind).toBe('note');
  expect(card.note).toBeUndefined();

  await store.updateCard(card.id, {
    title: 'Q3 Product Roadmap',
    note: '# Goals\n- Ship v2 rich notes\n- Add search',
  });

  const updated = store.cardsOfColumn(inbox.id).find((c) => c.id === card.id);
  expect(updated?.title).toBe('Q3 Product Roadmap');
  expect(updated?.note).toContain('Ship v2 rich notes');

  // Verify persistence across store re-read
  const otherStore = createStore(repo);
  await otherStore.applyExternalChange();
  const persisted = otherStore.cardsOfColumn(inbox.id).find((c) => c.id === card.id);
  expect(persisted?.title).toBe('Q3 Product Roadmap');
  expect(persisted?.note).toContain('Ship v2 rich notes');
});

it('updateCard updates title and url', async () => {
  const inbox = store.columnsOfBoard(store.boardsSorted()[0].id)[0];
  const card = await store.createCard(inbox.id, { url: 'https://old.com', title: 'Old Title' });

  await store.updateCard(card.id, {
    title: 'New Title',
    url: 'https://new.com/page',
  });

  const updated = store.cardsOfColumn(inbox.id).find((c) => c.id === card.id);
  expect(updated?.title).toBe('New Title');
  expect(updated?.url).toBe('https://new.com/page');
});

it('applyExternalChange re-reads writes made directly against the repo', async () => {
  const inbox = store.columnsOfBoard(store.boardsSorted()[0].id)[0];
  await repo.createCard(inbox.id, { url: 'ext', title: 'ext' }); // bypasses the store
  expect(store.cardsOfColumn(inbox.id)).toHaveLength(0); // not yet in memory

  await store.applyExternalChange();
  expect(store.cardsOfColumn(inbox.id).map((c) => c.title)).toEqual(['ext']);
});

it('setOpenBehavior updates meta.openBehavior', async () => {
  expect(store.getState().meta.openBehavior).toBeUndefined();
  await store.setOpenBehavior('current-tab');
  expect(store.getState().meta.openBehavior).toBe('current-tab');

  await store.setOpenBehavior('new-tab');
  expect(store.getState().meta.openBehavior).toBe('new-tab');
});

it('store.importSnapshot refreshes in-memory state with imported data', async () => {
  const backup = {
    boards: [{ id: 'imp-b', name: 'Imported', order: 1000, createdAt: 1, updatedAt: 1 }],
    columns: [{ id: 'imp-c', boardId: 'imp-b', name: 'Col', order: 1000 }],
    cards: [{ id: 'imp-cd', columnId: 'imp-c', order: 1000, url: 'https://x.com', title: 'Card X', savedAt: 1 }],
    meta: { activeBoardId: 'imp-b', theme: 'light' as const, schemaVersion: 1 },
  };

  await store.importSnapshot(backup);
  expect(store.boardsSorted().map((b) => b.name)).toEqual(['Imported']);
  expect(store.cardsOfColumn('imp-c').map((c) => c.title)).toEqual(['Card X']);
  expect(store.activeBoard()?.id).toBe('imp-b');
});

it('setSidebarCollapsed updates meta.sidebarCollapsed', async () => {
  expect(store.getState().meta.sidebarCollapsed).toBeUndefined();
  await store.setSidebarCollapsed(true);
  expect(store.getState().meta.sidebarCollapsed).toBe(true);

  await store.setSidebarCollapsed(false);
  expect(store.getState().meta.sidebarCollapsed).toBe(false);
});

it('saveWindowSession creates a card with kind window and tabs array', async () => {
  const colId = store.columnsOfBoard(store.boardsSorted()[0].id)[0].id;
  const tabs = [
    { id: '1', url: 'https://github.com', title: 'GitHub' },
    { id: '2', url: 'https://linear.app', title: 'Linear' },
  ];
  const card = await store.saveWindowSession(colId, tabs, 'Dev Session');
  expect(card.kind).toBe('window');
  expect(card.title).toBe('Dev Session');
  expect(card.tabs).toHaveLength(2);
  expect(card.tabs![0].title).toBe('GitHub');

  const inCol = store.cardsOfColumn(colId);
  expect(inCol.find((c) => c.id === card.id)?.tabs).toHaveLength(2);
});

it('stashWindowToNewColumn creates a new column and populates tabs as cards', async () => {
  const boardId = store.boardsSorted()[0].id;
  const tabs = [
    { id: '10', url: 'https://news.ycombinator.com', title: 'Hacker News' },
    { id: '11', url: 'https://docs.github.com', title: 'Docs' },
  ];
  const col = await store.stashWindowToNewColumn(boardId, tabs, 'HN & Docs');
  expect(col.name).toBe('HN & Docs');
  expect(col.icon).toBe('🪟');

  const cards = store.cardsOfColumn(col.id);
  expect(cards).toHaveLength(2);
  expect(cards[0].title).toBe('Hacker News');
  expect(cards[1].title).toBe('Docs');
});
