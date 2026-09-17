import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/schema';
import { createRepo } from '../src/db/repo';
import { createStore, type Store } from '../src/state/store';

describe('Stash restore and tab removal', () => {
  let store: Store;
  let boardId: string;
  let columnId: string;

  beforeEach(async () => {
    const db = await openDatabase();
    store = createStore(createRepo(db));
    await store.hydrate();
    const board = await store.createBoard('Test Board');
    boardId = board.id;
    const col = await store.createColumn(boardId, 'Test Col');
    columnId = col.id;
  });

  it('removes the single tab from the stash card when opened', async () => {
    const tabs = [
      { id: '1', url: 'https://site1.com', title: 'Site 1' },
      { id: '2', url: 'https://site2.com', title: 'Site 2' },
    ];
    const card = await store.saveWindowSession(columnId, tabs, 'Window (2 tabs)');
    expect(store.getState().cards[card.id].tabs?.length).toBe(2);

    // Remove 1 tab (mimicking opening Site 1)
    const updatedTabs = [...(store.getState().cards[card.id].tabs ?? [])];
    updatedTabs.splice(0, 1);
    await store.updateCard(card.id, {
      tabs: updatedTabs,
      title: card.title.replace(/\(\d+\s+tabs\)/, `(${updatedTabs.length} tabs)`),
    });

    const refreshedCard = store.getState().cards[card.id];
    expect(refreshedCard.tabs?.length).toBe(1);
    expect(refreshedCard.tabs?.[0].url).toBe('https://site2.com');
  });

  it('deletes the stash card when the last tab is opened', async () => {
    const tabs = [{ id: '1', url: 'https://site1.com', title: 'Site 1' }];
    const card = await store.saveWindowSession(columnId, tabs, 'Window (1 tabs)');

    // Opening the only tab -> delete card
    await store.deleteCard(card.id);
    expect(store.getState().cards[card.id]).toBeUndefined();
  });

  it('deletes the stash card when all tabs are restored', async () => {
    const tabs = [
      { id: '1', url: 'https://site1.com', title: 'Site 1' },
      { id: '2', url: 'https://site2.com', title: 'Site 2' },
    ];
    const card = await store.saveWindowSession(columnId, tabs, 'Window (2 tabs)');

    // Restore all -> delete stash card
    await store.deleteCard(card.id);
    expect(store.getState().cards[card.id]).toBeUndefined();
  });

  it('automatically deletes the stash column when all its cards are deleted', async () => {
    const col = await store.stashWindowToNewColumn(boardId, [
      { id: '1', url: 'https://site1.com', title: 'Site 1' },
      { id: '2', url: 'https://site2.com', title: 'Site 2' },
    ]);
    expect(store.getState().columns[col.id]).toBeDefined();
    const cards = store.cardsOfColumn(col.id);
    expect(cards.length).toBe(2);

    // Delete first card -> column still exists with 1 card
    await store.deleteCard(cards[0].id);
    expect(store.getState().columns[col.id]).toBeDefined();
    expect(store.cardsOfColumn(col.id).length).toBe(1);

    // Delete second (last) card -> stash column is automatically deleted
    await store.deleteCard(cards[1].id);
    expect(store.getState().columns[col.id]).toBeUndefined();
  });

  it('does not delete normal non-stash columns when their cards are deleted', async () => {
    const normalCol = await store.createColumn(boardId, 'Normal Col', '📋');
    const card = await store.createCard(normalCol.id, { url: 'https://site.com', title: 'Site' });
    expect(store.getState().columns[normalCol.id]).toBeDefined();

    await store.deleteCard(card.id);
    // Normal column must stay intact even when 0 cards
    expect(store.getState().columns[normalCol.id]).toBeDefined();
    expect(store.cardsOfColumn(normalCol.id).length).toBe(0);
  });
});
