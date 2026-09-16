/**
 * Data-access layer over IndexedDB. All persistence goes through a `Repo`.
 *
 * Concurrency discipline: within a single transaction we never `await`
 * between requests (that lets the tx auto-commit and go inactive). Reads that
 * feed a write are done in their own read transaction first, then the write
 * runs in a fresh transaction issuing all its requests synchronously.
 */
import { ORDER_STEP, bySortOrder, nextOrder, sequentialOrders } from './order';
import { DB_VERSION, INDEX, STORE } from './schema';
import { indexById } from '../util';
import type { Board, Card, Column, Meta, NewCard, Snapshot } from '../types';

const META_KEY = 'app';

export type CardPatch = Partial<Pick<Card, 'title' | 'url' | 'favIconUrl' | 'note' | 'completedAt'>>;

/** Persistence contract backing the in-memory store and UI. */
export interface Repo {
  listBoards(): Promise<Board[]>;
  getBoard(id: string): Promise<Board | undefined>;
  createBoard(name: string, icon?: string): Promise<Board>;
  renameBoard(id: string, name: string): Promise<Board>;
  setBoardIcon(id: string, icon?: string): Promise<Board>;
  deleteBoard(id: string): Promise<void>;
  reorderBoards(orderedIds: string[]): Promise<void>;
  listColumns(boardId: string): Promise<Column[]>;
  createColumn(boardId: string, name: string, icon?: string): Promise<Column>;
  renameColumn(id: string, name: string): Promise<Column>;
  setColumnIcon(id: string, icon?: string): Promise<Column>;
  deleteColumn(id: string): Promise<void>;
  reorderColumns(boardId: string, orderedIds: string[]): Promise<void>;
  listCards(columnId: string): Promise<Card[]>;
  getCard(id: string): Promise<Card | undefined>;
  createCard(columnId: string, data: NewCard): Promise<Card>;
  updateCard(id: string, patch: CardPatch): Promise<Card>;
  deleteCard(id: string): Promise<void>;
  reorderCards(columnId: string, orderedIds: string[]): Promise<void>;
  moveCard(cardId: string, toColumnId: string, targetOrderedIds: string[]): Promise<void>;
  getMeta(): Promise<Meta>;
  setMeta(patch: Partial<Meta>): Promise<Meta>;
  getSnapshot(): Promise<Snapshot>;
  importSnapshot(snapshot: Snapshot): Promise<void>;
  ensureSeed(): Promise<void>;
}

function reqP<T>(request: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  return promise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
  return promise;
}

function defaultMeta(): Meta {
  return { activeBoardId: null, theme: 'dark', schemaVersion: DB_VERSION };
}

export function createRepo(db: IDBDatabase): Repo {
  // ── Boards ────────────────────────────────────────────────────────────
  const listBoards = async (): Promise<Board[]> => {
    const tx = db.transaction(STORE.boards, 'readonly');
    const rows = await reqP<Board[]>(tx.objectStore(STORE.boards).getAll());
    return rows.sort(bySortOrder);
  };

  const getBoard = async (id: string): Promise<Board | undefined> => {
    const tx = db.transaction(STORE.boards, 'readonly');
    return reqP<Board | undefined>(tx.objectStore(STORE.boards).get(id));
  };

  const createBoard = async (name: string, icon?: string): Promise<Board> => {
    const boards = await listBoards();
    const now = Date.now();
    const board: Board = {
      id: crypto.randomUUID(),
      name,
      icon,
      order: nextOrder(boards),
      createdAt: now,
      updatedAt: now,
    };
    // Spec decision 8: board + its default Inbox column are written atomically.
    const inbox: Column = {
      id: crypto.randomUUID(),
      boardId: board.id,
      name: 'Inbox',
      icon: '📥',
      order: ORDER_STEP,
    };
    const tx = db.transaction([STORE.boards, STORE.columns], 'readwrite');
    tx.objectStore(STORE.boards).put(board);
    tx.objectStore(STORE.columns).put(inbox);
    await txDone(tx);
    return board;
  };

  const renameBoard = async (id: string, name: string): Promise<Board> => {
    const board = await getBoard(id);
    if (!board) throw new Error(`Board not found: ${id}`);
    board.name = name;
    board.updatedAt = Date.now();
    const tx = db.transaction(STORE.boards, 'readwrite');
    tx.objectStore(STORE.boards).put(board);
    await txDone(tx);
    return board;
  };

  const setBoardIcon = async (id: string, icon?: string): Promise<Board> => {
    const board = await getBoard(id);
    if (!board) throw new Error(`Board not found: ${id}`);
    if (icon) {
      board.icon = icon;
    } else {
      delete board.icon;
    }
    board.updatedAt = Date.now();
    const tx = db.transaction(STORE.boards, 'readwrite');
    tx.objectStore(STORE.boards).put(board);
    await txDone(tx);
    return board;
  };

  const deleteBoard = async (id: string): Promise<void> => {
    const columns = await listColumns(id);
    const cardLists = await Promise.all(columns.map((c) => listCards(c.id)));
    const cardIds = cardLists.flat().map((c) => c.id);
    const tx = db.transaction([STORE.boards, STORE.columns, STORE.cards], 'readwrite');
    tx.objectStore(STORE.boards).delete(id);
    const colStore = tx.objectStore(STORE.columns);
    for (const c of columns) colStore.delete(c.id);
    const cardStore = tx.objectStore(STORE.cards);
    for (const cid of cardIds) cardStore.delete(cid);
    await txDone(tx);
  };

  const reorderBoards = async (orderedIds: string[]): Promise<void> => {
    const byId = indexById(await listBoards());
    const orders = sequentialOrders(orderedIds.length);
    const tx = db.transaction(STORE.boards, 'readwrite');
    const store = tx.objectStore(STORE.boards);
    orderedIds.forEach((id, i) => {
      const board = byId[id];
      if (board) {
        board.order = orders[i];
        store.put(board);
      }
    });
    await txDone(tx);
  };

  // ── Columns ───────────────────────────────────────────────────────────
  const listColumns = async (boardId: string): Promise<Column[]> => {
    const tx = db.transaction(STORE.columns, 'readonly');
    const index = tx.objectStore(STORE.columns).index(INDEX.columnsByBoard);
    const rows = await reqP<Column[]>(index.getAll(boardId));
    return rows.sort(bySortOrder);
  };

  const createColumn = async (boardId: string, name: string, icon?: string): Promise<Column> => {
    const columns = await listColumns(boardId);
    const column: Column = {
      id: crypto.randomUUID(),
      boardId,
      name,
      icon,
      order: nextOrder(columns),
    };
    const tx = db.transaction(STORE.columns, 'readwrite');
    tx.objectStore(STORE.columns).put(column);
    await txDone(tx);
    return column;
  };

  const renameColumn = async (id: string, name: string): Promise<Column> => {
    const rtx = db.transaction(STORE.columns, 'readonly');
    const column = await reqP<Column | undefined>(rtx.objectStore(STORE.columns).get(id));
    if (!column) throw new Error(`Column not found: ${id}`);
    column.name = name;
    const tx = db.transaction(STORE.columns, 'readwrite');
    tx.objectStore(STORE.columns).put(column);
    await txDone(tx);
    return column;
  };


  const setColumnIcon = async (id: string, icon?: string): Promise<Column> => {
    const rtx = db.transaction(STORE.columns, 'readonly');
    const column = await reqP<Column | undefined>(rtx.objectStore(STORE.columns).get(id));
    if (!column) throw new Error(`Column not found: ${id}`);
    if (icon) {
      column.icon = icon;
    } else {
      delete column.icon;
    }
    const tx = db.transaction(STORE.columns, 'readwrite');
    tx.objectStore(STORE.columns).put(column);
    await txDone(tx);
    return column;
  };
  const deleteColumn = async (id: string): Promise<void> => {
    const cards = await listCards(id);
    const tx = db.transaction([STORE.columns, STORE.cards], 'readwrite');
    tx.objectStore(STORE.columns).delete(id);
    const cardStore = tx.objectStore(STORE.cards);
    for (const c of cards) cardStore.delete(c.id);
    await txDone(tx);
  };

  const reorderColumns = async (boardId: string, orderedIds: string[]): Promise<void> => {
    const byId = indexById(await listColumns(boardId));
    const orders = sequentialOrders(orderedIds.length);
    const tx = db.transaction(STORE.columns, 'readwrite');
    const store = tx.objectStore(STORE.columns);
    orderedIds.forEach((id, i) => {
      const column = byId[id];
      if (column) {
        column.order = orders[i];
        store.put(column);
      }
    });
    await txDone(tx);
  };

  // ── Cards ─────────────────────────────────────────────────────────────
  const listCards = async (columnId: string): Promise<Card[]> => {
    const tx = db.transaction(STORE.cards, 'readonly');
    const index = tx.objectStore(STORE.cards).index(INDEX.cardsByColumn);
    const rows = await reqP<Card[]>(index.getAll(columnId));
    return rows.sort(bySortOrder);
  };

  const getCard = async (id: string): Promise<Card | undefined> => {
    const tx = db.transaction(STORE.cards, 'readonly');
    return reqP<Card | undefined>(tx.objectStore(STORE.cards).get(id));
  };

  const createCard = async (columnId: string, data: NewCard): Promise<Card> => {
    const cards = await listCards(columnId);
    const card: Card = {
      id: crypto.randomUUID(),
      columnId,
      order: nextOrder(cards),
      url: data.url,
      title: data.title,
      favIconUrl: data.favIconUrl,
      kind: data.kind,
      note: data.note,
      savedAt: Date.now(),
    };
    const tx = db.transaction(STORE.cards, 'readwrite');
    tx.objectStore(STORE.cards).put(card);
    await txDone(tx);
    return card;
  };

  const updateCard = async (id: string, patch: CardPatch): Promise<Card> => {
    const card = await getCard(id);
    if (!card) throw new Error(`Card not found: ${id}`);
    const updated: Card = { ...card, ...patch };
    if ('completedAt' in patch && patch.completedAt === undefined) {
      delete updated.completedAt;
    }
    const tx = db.transaction(STORE.cards, 'readwrite');
    tx.objectStore(STORE.cards).put(updated);
    await txDone(tx);
    return updated;
  };

  const deleteCard = async (id: string): Promise<void> => {
    const tx = db.transaction(STORE.cards, 'readwrite');
    tx.objectStore(STORE.cards).delete(id);
    await txDone(tx);
  };

  const reorderCards = async (columnId: string, orderedIds: string[]): Promise<void> => {
    const byId = indexById(await listCards(columnId));
    const orders = sequentialOrders(orderedIds.length);
    const tx = db.transaction(STORE.cards, 'readwrite');
    const store = tx.objectStore(STORE.cards);
    orderedIds.forEach((id, i) => {
      const card = byId[id];
      if (card) {
        card.order = orders[i];
        store.put(card);
      }
    });
    await txDone(tx);
  };

  /**
   * Move `cardId` into `toColumnId`, applying `targetOrderedIds` as the full
   * ordering of the destination column (must include `cardId`).
   */
  const moveCard = async (
    cardId: string,
    toColumnId: string,
    targetOrderedIds: string[],
  ): Promise<void> => {
    const [moving, targetCards] = await Promise.all([getCard(cardId), listCards(toColumnId)]);
    if (!moving) throw new Error(`Card not found: ${cardId}`);
    const byId = indexById(targetCards);
    byId[cardId] = moving;
    const orders = sequentialOrders(targetOrderedIds.length);
    const tx = db.transaction(STORE.cards, 'readwrite');
    const store = tx.objectStore(STORE.cards);
    targetOrderedIds.forEach((id, i) => {
      const card = byId[id];
      if (card) {
        card.order = orders[i];
        card.columnId = toColumnId;
        store.put(card);
      }
    });
    await txDone(tx);
  };

  // ── Meta ──────────────────────────────────────────────────────────────
  const getMeta = async (): Promise<Meta> => {
    const tx = db.transaction(STORE.meta, 'readonly');
    const meta = await reqP<Meta | undefined>(tx.objectStore(STORE.meta).get(META_KEY));
    return meta ?? defaultMeta();
  };

  const setMeta = async (patch: Partial<Meta>): Promise<Meta> => {
    const current = await getMeta();
    const next: Meta = { ...current, ...patch };
    const tx = db.transaction(STORE.meta, 'readwrite');
    tx.objectStore(STORE.meta).put(next, META_KEY);
    await txDone(tx);
    return next;
  };

  // ── Aggregate / bootstrap ─────────────────────────────────────────────
  const getSnapshot = async (): Promise<Snapshot> => {
    const tx = db.transaction(
      [STORE.boards, STORE.columns, STORE.cards, STORE.meta],
      'readonly',
    );
    const boardsReq = reqP<Board[]>(tx.objectStore(STORE.boards).getAll());
    const columnsReq = reqP<Column[]>(tx.objectStore(STORE.columns).getAll());
    const cardsReq = reqP<Card[]>(tx.objectStore(STORE.cards).getAll());
    const metaReq = reqP<Meta | undefined>(tx.objectStore(STORE.meta).get(META_KEY));
    const [boards, columns, cards, meta] = await Promise.all([
      boardsReq,
      columnsReq,
      cardsReq,
      metaReq,
    ]);
    return {
      boards: boards.sort(bySortOrder),
      columns: columns.sort(bySortOrder),
      cards: cards.sort(bySortOrder),
      meta: meta ?? defaultMeta(),
    };
  };

  const importSnapshot = async (snapshot: Snapshot): Promise<void> => {
    if (!snapshot || !Array.isArray(snapshot.boards) || !Array.isArray(snapshot.columns) || !Array.isArray(snapshot.cards)) {
      throw new Error('Invalid backup file format');
    }
    const tx = db.transaction(
      [STORE.boards, STORE.columns, STORE.cards, STORE.meta],
      'readwrite',
    );
    const bStore = tx.objectStore(STORE.boards);
    const cStore = tx.objectStore(STORE.columns);
    const cdStore = tx.objectStore(STORE.cards);
    const mStore = tx.objectStore(STORE.meta);

    // Clear existing data
    bStore.clear();
    cStore.clear();
    cdStore.clear();
    mStore.clear();

    // Put backup data
    for (const b of snapshot.boards) bStore.put(b);
    for (const c of snapshot.columns) cStore.put(c);
    for (const cd of snapshot.cards) cdStore.put(cd);
    if (snapshot.meta) {
      mStore.put(snapshot.meta, META_KEY);
    }
    await txDone(tx);
  };

  /**
   * Seed a default board (+ Inbox) and active-board pointer on first run.
   * The empty-check and writes share one readwrite transaction so concurrent
   * callers (e.g. a New Tab page and the service worker) cannot double-seed:
   * IndexedDB serializes readwrite transactions on the same store.
   */
  const ensureSeed = async (): Promise<void> => {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction([STORE.boards, STORE.columns, STORE.meta], 'readwrite');
    const boardsStore = tx.objectStore(STORE.boards);
    const countReq = boardsStore.count();
    countReq.onsuccess = () => {
      if (countReq.result > 0) return;
      const now = Date.now();
      const boardId = crypto.randomUUID();
      const board: Board = {
        id: boardId,
        name: 'My Workspace',
        icon: '💼',
        order: ORDER_STEP,
        createdAt: now,
        updatedAt: now,
      };
      boardsStore.put(board);

      const columnsStore = tx.objectStore(STORE.columns);
      const defaultColumns: Array<{ name: string; icon: string }> = [
        { name: 'General', icon: '📥' },
        { name: 'Projects', icon: '🚀' },
        { name: 'Research', icon: '🔬' },
      ];
      defaultColumns.forEach((colSpec, index) => {
        const col: Column = {
          id: crypto.randomUUID(),
          boardId,
          name: colSpec.name,
          icon: colSpec.icon,
          order: (index + 1) * ORDER_STEP,
        };
        columnsStore.put(col);
      });
      const meta: Meta = { activeBoardId: boardId, theme: 'dark', schemaVersion: DB_VERSION };
      tx.objectStore(STORE.meta).put(meta, META_KEY);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    return promise;
  };

  return {
    listBoards,
    getBoard,
    createBoard,
    renameBoard,
    setBoardIcon,
    deleteBoard,
    reorderBoards,
    listColumns,
    createColumn,
    renameColumn,
    setColumnIcon,
    deleteColumn,
    reorderColumns,
    listCards,
    getCard,
    createCard,
    updateCard,
    deleteCard,
    reorderCards,
    moveCard,
    getMeta,
    setMeta,
    getSnapshot,
    importSnapshot,
    ensureSeed,
  };
}
