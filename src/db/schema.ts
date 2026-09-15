/** IndexedDB schema, connection, and migrations. */

export const DB_NAME = 'tabularium';
export const DB_VERSION = 1;

export const STORE = {
  boards: 'boards',
  columns: 'columns',
  cards: 'cards',
  meta: 'meta',
} as const;

export const INDEX = {
  columnsByBoard: 'by-board',
  cardsByColumn: 'by-column',
} as const;

/** Open (creating/upgrading as needed) the Tabularium database. */
export function openDatabase(name: string = DB_NAME): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const request = indexedDB.open(name, DB_VERSION);
  request.onupgradeneeded = (event) => migrate(request.result, event.oldVersion);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('Tabularium DB upgrade blocked by another connection'));
  return promise;
}

function migrate(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore(STORE.boards, { keyPath: 'id' });
    const columns = db.createObjectStore(STORE.columns, { keyPath: 'id' });
    columns.createIndex(INDEX.columnsByBoard, 'boardId');
    const cards = db.createObjectStore(STORE.cards, { keyPath: 'id' });
    cards.createIndex(INDEX.cardsByColumn, 'columnId');
    db.createObjectStore(STORE.meta); // key-value, out-of-line keys
  }
  // Future: if (oldVersion < 2) { ... }
}
