import { beforeEach, expect, it } from 'vitest';
import { openDatabase } from '../src/db/schema';
import { createRepo, type Repo } from '../src/db/repo';

let repo: Repo;

beforeEach(async () => {
  // Unique DB per test keeps them isolated within the shared fake-indexeddb.
  const db = await openDatabase(`test-${crypto.randomUUID()}`);
  repo = createRepo(db);
});

it('ensureSeed creates My Workspace with 3 columns (General, Projects, Research) and sets activeBoardId', async () => {
  await repo.ensureSeed();
  const boards = await repo.listBoards();
  expect(boards).toHaveLength(1);
  expect(boards[0].name).toBe('My Workspace');
  expect(boards[0].icon).toBe('💼');
  const columns = await repo.listColumns(boards[0].id);
  expect(columns.map((c) => c.name)).toEqual(['General', 'Projects', 'Research']);
  expect((await repo.getMeta()).activeBoardId).toBe(boards[0].id);
});

it('ensureSeed is idempotent', async () => {
  await repo.ensureSeed();
  await repo.ensureSeed();
  expect(await repo.listBoards()).toHaveLength(1);
});

it('createBoard appends in order and auto-adds an Inbox column', async () => {
  const a = await repo.createBoard('A');
  const b = await repo.createBoard('B');
  expect(b.order).toBeGreaterThan(a.order);
  expect((await repo.listColumns(a.id)).map((c) => c.name)).toEqual(['Inbox']);
});

it('renameBoard updates name and bumps updatedAt', async () => {
  const board = await repo.createBoard('A');
  const renamed = await repo.renameBoard(board.id, 'A2');
  expect(renamed.name).toBe('A2');
  expect(renamed.updatedAt).toBeGreaterThanOrEqual(board.updatedAt);
  expect((await repo.getBoard(board.id))?.name).toBe('A2');
});

it('reorderBoards applies the given order', async () => {
  const a = await repo.createBoard('A');
  const b = await repo.createBoard('B');
  const c = await repo.createBoard('C');
  await repo.reorderBoards([c.id, a.id, b.id]);
  expect((await repo.listBoards()).map((x) => x.id)).toEqual([c.id, a.id, b.id]);
});

it('columns can be created, renamed, and cascade-delete their cards', async () => {
  const board = await repo.createBoard('B');
  const column = await repo.createColumn(board.id, 'Todo');
  const card = await repo.createCard(column.id, { url: 'https://x', title: 'X' });
  const renamed = await repo.renameColumn(column.id, 'Doing');
  expect(renamed.name).toBe('Doing');

  await repo.deleteColumn(column.id);
  const remaining = await repo.listColumns(board.id);
  expect(remaining.some((c) => c.id === column.id)).toBe(false);
  expect(await repo.getCard(card.id)).toBeUndefined();
});

it('cards can be created, updated, and deleted', async () => {
  const board = await repo.createBoard('B');
  const inbox = (await repo.listColumns(board.id))[0];
  const card = await repo.createCard(inbox.id, {
    url: 'https://a',
    title: 'A',
    favIconUrl: 'https://a/favicon.ico',
  });
  const updated = await repo.updateCard(card.id, { title: 'A2' });
  expect(updated.title).toBe('A2');
  expect(updated.url).toBe('https://a'); // untouched fields preserved
  await repo.deleteCard(card.id);
  expect(await repo.getCard(card.id)).toBeUndefined();
});

it('reorderCards applies the given order within a column', async () => {
  const board = await repo.createBoard('B');
  const inbox = (await repo.listColumns(board.id))[0];
  const c1 = await repo.createCard(inbox.id, { url: '1', title: '1' });
  const c2 = await repo.createCard(inbox.id, { url: '2', title: '2' });
  const c3 = await repo.createCard(inbox.id, { url: '3', title: '3' });
  await repo.reorderCards(inbox.id, [c3.id, c1.id, c2.id]);
  expect((await repo.listCards(inbox.id)).map((c) => c.id)).toEqual([c3.id, c1.id, c2.id]);
});

it('moveCard relocates a card into another column with new ordering', async () => {
  const board = await repo.createBoard('B');
  const inbox = (await repo.listColumns(board.id))[0];
  const todo = await repo.createColumn(board.id, 'Todo');
  const a = await repo.createCard(inbox.id, { url: 'a', title: 'a' });
  const t1 = await repo.createCard(todo.id, { url: 't1', title: 't1' });

  await repo.moveCard(a.id, todo.id, [t1.id, a.id]);

  expect(await repo.listCards(inbox.id)).toEqual([]);
  const todoCards = await repo.listCards(todo.id);
  expect(todoCards.map((c) => c.id)).toEqual([t1.id, a.id]);
  expect(todoCards.every((c) => c.columnId === todo.id)).toBe(true);
});

it('deleteBoard cascades to its columns and cards', async () => {
  const board = await repo.createBoard('B');
  const inbox = (await repo.listColumns(board.id))[0];
  const card = await repo.createCard(inbox.id, { url: 'a', title: 'a' });
  await repo.deleteBoard(board.id);
  expect(await repo.getBoard(board.id)).toBeUndefined();
  expect(await repo.listColumns(board.id)).toEqual([]);
  expect(await repo.getCard(card.id)).toBeUndefined();
});

it('getSnapshot returns the full sorted graph plus meta', async () => {
  await repo.ensureSeed();
  const board = (await repo.listBoards())[0];
  const inbox = (await repo.listColumns(board.id))[0];
  await repo.createCard(inbox.id, { url: 'a', title: 'a' });
  const snapshot = await repo.getSnapshot();
  expect(snapshot.boards).toHaveLength(1);
  expect(snapshot.columns).toHaveLength(3);
  expect(snapshot.cards).toHaveLength(1);
  expect(snapshot.meta.activeBoardId).toBe(board.id);
});

it('importSnapshot replaces current database with backup data', async () => {
  await repo.ensureSeed();
  const backup = {
    boards: [{ id: 'b-new', name: 'Restored Board', order: 1000, createdAt: 1, updatedAt: 1 }],
    columns: [{ id: 'c-new', boardId: 'b-new', name: 'Restored Col', order: 1000 }],
    cards: [{ id: 'cd-new', columnId: 'c-new', order: 1000, url: 'https://example.com', title: 'Restored Card', savedAt: 1 }],
    meta: { activeBoardId: 'b-new', theme: 'dark' as const, schemaVersion: 1, openBehavior: 'current-tab' as const },
  };

  await repo.importSnapshot(backup);

  const boards = await repo.listBoards();
  expect(boards).toHaveLength(1);
  expect(boards[0].name).toBe('Restored Board');
  const cards = await repo.listCards('c-new');
  expect(cards).toHaveLength(1);
  expect(cards[0].title).toBe('Restored Card');
  const meta = await repo.getMeta();
  expect(meta.activeBoardId).toBe('b-new');
  expect(meta.openBehavior).toBe('current-tab');
});

it('getMeta returns defaults before anything is written', async () => {
  expect(await repo.getMeta()).toEqual({
    activeBoardId: null,
    theme: 'system',
    schemaVersion: 1,
  });
});

it('setMeta persists a partial patch', async () => {
  await repo.setMeta({ theme: 'dark' });
  const meta = await repo.getMeta();
  expect(meta.theme).toBe('dark');
  expect(meta.activeBoardId).toBeNull();
});
