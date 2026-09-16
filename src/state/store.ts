/**
 * In-memory single source of truth for the UI. Hydrated from the `Repo`;
 * every mutation writes through to the repo and then re-reads the snapshot so
 * memory mirrors persistence exactly (including repo-assigned ids and the
 * recomputed `order` values from reorder/move). Subscribers are notified on
 * every change.
 */
import { bySortOrder } from '../db/order';
import { DB_VERSION } from '../db/schema';
import { indexById } from '../util';
import type { CardPatch, Repo } from '../db/repo';
import type { Board, Card, Column, Meta, NewCard, ThemePref } from '../types';

export interface StoreState {
  boards: Record<string, Board>;
  columns: Record<string, Column>;
  cards: Record<string, Card>;
  meta: Meta;
}

/** Public store contract consumed by the UI. */
export interface Store {
  getState(): StoreState;
  /** Subscribe to change notifications; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Seed (first run) and load persisted state into memory. */
  hydrate(): Promise<void>;
  /** Re-read persisted state (e.g. after a service-worker broadcast). */
  applyExternalChange(): Promise<void>;

  boardsSorted(): Board[];
  columnsOfBoard(boardId: string): Column[];
  cardsOfColumn(columnId: string): Card[];
  activeBoard(): Board | undefined;

  createBoard(name: string): Promise<Board>;
  renameBoard(id: string, name: string): Promise<void>;
  deleteBoard(id: string): Promise<void>;
  setActiveBoard(id: string): Promise<void>;
  reorderBoards(orderedIds: string[]): Promise<void>;

  createColumn(boardId: string, name: string): Promise<Column>;
  renameColumn(id: string, name: string): Promise<void>;
  deleteColumn(id: string): Promise<void>;
  reorderColumns(boardId: string, orderedIds: string[]): Promise<void>;

  createCard(columnId: string, data: NewCard): Promise<Card>;
  updateCard(id: string, patch: CardPatch): Promise<void>;
  toggleTaskComplete(cardId: string): Promise<void>;
  deleteCard(id: string): Promise<void>;
  reorderCards(columnId: string, orderedIds: string[]): Promise<void>;
  moveCard(cardId: string, toColumnId: string, targetOrderedIds: string[]): Promise<void>;

  setTheme(theme: ThemePref): Promise<void>;
}

export function createStore(repo: Repo): Store {
  let state: StoreState = {
    boards: {},
    columns: {},
    cards: {},
    meta: { activeBoardId: null, theme: 'system', schemaVersion: DB_VERSION },
  };
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const refresh = async (): Promise<void> => {
    const snapshot = await repo.getSnapshot();
    state = {
      boards: indexById(snapshot.boards),
      columns: indexById(snapshot.columns),
      cards: indexById(snapshot.cards),
      meta: snapshot.meta,
    };
    notify();
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async hydrate() {
      await repo.ensureSeed();
      await refresh();
    },

    applyExternalChange: refresh,

    boardsSorted: () => Object.values(state.boards).sort(bySortOrder),

    columnsOfBoard: (boardId) =>
      Object.values(state.columns)
        .filter((column) => column.boardId === boardId)
        .sort(bySortOrder),

    cardsOfColumn: (columnId) =>
      Object.values(state.cards)
        .filter((card) => card.columnId === columnId)
        .sort(bySortOrder),

    activeBoard: () => {
      const id = state.meta.activeBoardId;
      return id ? state.boards[id] : undefined;
    },

    async createBoard(name) {
      const board = await repo.createBoard(name);
      await refresh();
      return board;
    },

    async renameBoard(id, name) {
      await repo.renameBoard(id, name);
      await refresh();
    },

    async deleteBoard(id) {
      await repo.deleteBoard(id);
      await refresh();
    },

    async setActiveBoard(id) {
      await repo.setMeta({ activeBoardId: id });
      await refresh();
    },

    async reorderBoards(orderedIds) {
      await repo.reorderBoards(orderedIds);
      await refresh();
    },

    async createColumn(boardId, name) {
      const column = await repo.createColumn(boardId, name);
      await refresh();
      return column;
    },

    async renameColumn(id, name) {
      await repo.renameColumn(id, name);
      await refresh();
    },

    async deleteColumn(id) {
      await repo.deleteColumn(id);
      await refresh();
    },

    async reorderColumns(boardId, orderedIds) {
      await repo.reorderColumns(boardId, orderedIds);
      await refresh();
    },

    async createCard(columnId, data) {
      const card = await repo.createCard(columnId, data);
      await refresh();
      return card;
    },

    async updateCard(id, patch) {
      await repo.updateCard(id, patch);
      await refresh();
    },

    async toggleTaskComplete(cardId) {
      const card = state.cards[cardId];
      if (!card) return;
      const completedAt = card.completedAt ? undefined : Date.now();
      await repo.updateCard(cardId, { completedAt });
      await refresh();
    },

    async deleteCard(id) {
      await repo.deleteCard(id);
      await refresh();
    },

    async reorderCards(columnId, orderedIds) {
      await repo.reorderCards(columnId, orderedIds);
      await refresh();
    },

    async moveCard(cardId, toColumnId, targetOrderedIds) {
      await repo.moveCard(cardId, toColumnId, targetOrderedIds);
      await refresh();
    },

    async setTheme(theme) {
      await repo.setMeta({ theme });
      await refresh();
    },
  };
}
