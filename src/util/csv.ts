/**
 * Robust, zero-dependency RFC 4180 CSV serializer, parser, and importer.
 *
 * Supports:
 * - Exporting Tabularium cards with Board, Column, Title, URL, Type, Note, Completed, SavedAt
 * - UTF-8 BOM prefix for seamless opening in Microsoft Excel without character corruption
 * - Proper escaping of quotes (""), commas, and multi-line strings
 * - Parsing arbitrary CSV files (case-insensitive headers, flexible columns)
 * - Bulk-importing cards into boards and columns
 */
import type { CardKind, Snapshot } from '../types';
import type { Store } from '../state/store';

function escapeCsvCell(value: string | number | undefined | null): string {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Serialize full Tabularium snapshot to RFC 4180 CSV string with UTF-8 BOM. */
export function serializeSnapshotToCsv(snapshot: Snapshot): string {
  const boardMap: Record<string, string> = {};
  for (const b of snapshot.boards) boardMap[b.id] = b.name;

  const colMap: Record<string, { name: string; boardName: string }> = {};
  for (const c of snapshot.columns) {
    colMap[c.id] = {
      name: c.name,
      boardName: boardMap[c.boardId] ?? 'General',
    };
  }

  const headers = ['Board', 'Column', 'Title', 'URL', 'Type', 'Note', 'Completed', 'SavedAt'];
  const rows: string[] = [headers.join(',')];

  for (const card of snapshot.cards) {
    const colInfo = colMap[card.columnId] ?? { name: 'Inbox', boardName: 'General' };
    const kind = card.kind ?? 'tab';
    const isCompleted = Boolean(card.completedAt);
    const dateStr = new Date(card.savedAt).toISOString();

    const row = [
      escapeCsvCell(colInfo.boardName),
      escapeCsvCell(colInfo.name),
      escapeCsvCell(card.title),
      escapeCsvCell(card.url),
      escapeCsvCell(kind),
      escapeCsvCell(card.note ?? ''),
      escapeCsvCell(isCompleted ? 'Yes' : 'No'),
      escapeCsvCell(dateStr),
    ];
    rows.push(row.join(','));
  }

  // Prepend UTF-8 BOM so Excel opens UTF-8 characters properly
  return '\uFEFF' + rows.join('\r\n');
}

/** Parse an RFC 4180 CSV string into records keyed by normalized lowercase headers. */
export function parseCsv(csvText: string): Array<Record<string, string>> {
  const text = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  const headerRow = rows[0].map((h) => h.toLowerCase().trim());
  const records: Array<Record<string, string>> = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip empty rows
    if (row.length === 1 && row[0] === '') continue;

    const record: Record<string, string> = {};
    for (let c = 0; c < headerRow.length; c++) {
      const header = headerRow[c];
      if (header) {
        record[header] = row[c] ?? '';
      }
    }
    records.push(record);
  }

  return records;
}

/**
 * Bulk import CSV records into Tabularium store.
 * Creates boards and columns if they don't already exist.
 */
export async function importCsvToStore(
  csvText: string,
  store: Store,
): Promise<{ count: number }> {
  const records = parseCsv(csvText);
  if (records.length === 0) return { count: 0 };

  const boards = store.boardsSorted();
  const activeBoard = store.activeBoard() ?? boards[0];

  // Cache existing boards by lowercase name
  const boardByName: Record<string, string> = {};
  for (const b of boards) {
    boardByName[b.name.toLowerCase()] = b.id;
  }

  let count = 0;

  for (const record of records) {
    const title = record.title || record.name || record.url || '(untitled)';
    const url = record.url || record.link || '';
    const note = record.note || record.description || record.body || '';
    const rawType = (record.type || record.kind || '').toLowerCase();
    const isDone = /^(yes|true|1|completed|done)$/i.test(record.completed || '');

    let kind: CardKind = 'tab';
    if (rawType === 'task') kind = 'task';
    else if (rawType === 'note') kind = 'note';
    else if (!url) kind = 'task';

    // Resolve Board
    const rawBoard = (record.board || '').trim();
    let boardId = rawBoard ? boardByName[rawBoard.toLowerCase()] : activeBoard?.id;
    if (!boardId && rawBoard) {
      const newBoard = await store.createBoard(rawBoard, '📁');
      boardId = newBoard.id;
      boardByName[rawBoard.toLowerCase()] = newBoard.id;
    }
    if (!boardId) {
      boardId = activeBoard?.id ?? (await store.createBoard('My Workspace', '💼')).id;
      boardByName['my workspace'] = boardId;
    }

    // Resolve Column
    const cols = store.columnsOfBoard(boardId);
    const rawCol = (record.column || '').trim();
    let col = rawCol
      ? cols.find((c) => c.name.toLowerCase() === rawCol.toLowerCase())
      : cols[0];

    if (!col && rawCol) {
      col = await store.createColumn(boardId, rawCol);
    }
    if (!col) {
      col = cols[0] ?? (await store.createColumn(boardId, 'Inbox'));
    }

    // Create card
    const card = await store.createCard(col.id, {
      title,
      url,
      kind,
      favIconUrl: '',
    });

    // Update note or completed state if specified
    const patch: { note?: string; completedAt?: number } = {};
    if (note) patch.note = note;
    if (isDone && kind === 'task') patch.completedAt = Date.now();

    if (Object.keys(patch).length > 0) {
      await store.updateCard(card.id, patch);
    }

    count++;
  }

  return { count };
}
