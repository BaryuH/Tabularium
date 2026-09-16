import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/schema';
import { createRepo, type Repo } from '../src/db/repo';
import { createStore, type Store } from '../src/state/store';
import { importCsvToStore, parseCsv, serializeSnapshotToCsv } from '../src/util/csv';
import type { Snapshot } from '../src/types';

describe('serializeSnapshotToCsv', () => {
  it('serializes snapshot to RFC 4180 CSV with UTF-8 BOM and escaped fields', () => {
    const snapshot: Snapshot = {
      boards: [{ id: 'b1', name: 'Work, "Main"', order: 1000, createdAt: 1, updatedAt: 1 }],
      columns: [{ id: 'c1', boardId: 'b1', name: 'To Do, ASAP', order: 1000 }],
      cards: [
        {
          id: 'cd1',
          columnId: 'c1',
          order: 1000,
          url: 'https://example.com/test?a=1,b=2',
          title: 'Hello "World"',
          note: 'Line 1\nLine 2 with, comma',
          kind: 'task',
          completedAt: 12345678,
          savedAt: 1000,
        },
      ],
      meta: { activeBoardId: 'b1', theme: 'dark', schemaVersion: 1 },
    };

    const csv = serializeSnapshotToCsv(snapshot);
    expect(csv.startsWith('\uFEFF')).toBe(true); // UTF-8 BOM
    expect(csv).toContain('Board,Column,Title,URL,Type,Note,Completed,SavedAt');
    expect(csv).toContain('"Work, ""Main"""');
    expect(csv).toContain('"To Do, ASAP"');
    expect(csv).toContain('"Hello ""World"""');
    expect(csv).toContain('task');
    expect(csv).toContain('Yes');
  });
});

describe('parseCsv', () => {
  it('parses standard CSV rows and ignores BOM', () => {
    const input = '\uFEFFTitle,URL,Type\nGoogle,https://google.com,tab\nGitHub,https://github.com,tab';
    const records = parseCsv(input);
    expect(records).toHaveLength(2);
    expect(records[0].title).toBe('Google');
    expect(records[0].url).toBe('https://google.com');
    expect(records[1].title).toBe('GitHub');
  });

  it('handles quotes, commas, and newlines inside quoted fields', () => {
    const input = 'Title,Note,Completed\n"Fix bug, urgent","Line 1\nLine 2 with ""quotes""",yes';
    const records = parseCsv(input);
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('Fix bug, urgent');
    expect(records[0].note).toBe('Line 1\nLine 2 with "quotes"');
    expect(records[0].completed).toBe('yes');
  });

  it('handles empty and malformed lines gracefully', () => {
    const input = 'Title,URL\n\nSingle\n';
    const records = parseCsv(input);
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('Single');
  });
});

describe('importCsvToStore', () => {
  let repo: Repo;
  let store: Store;

  beforeEach(async () => {
    const db = await openDatabase(`test-csv-${crypto.randomUUID()}`);
    repo = createRepo(db);
    store = createStore(repo);
    await store.hydrate();
  });

  it('imports CSV rows into boards and columns', async () => {
    const csv = `Board,Column,Title,URL,Type,Note,Completed
My Workspace,General,MDN Web Docs,https://developer.mozilla.org,tab,,No
My Workspace,Research,Finish PR Review,,task,"Review commits, approve",yes
Design Ideas,Inspiration,Minimalist UI,,note,Use subtle borders,No`;

    const { count } = await importCsvToStore(csv, store);
    expect(count).toBe(3);

    // Verify boards created
    const boards = store.boardsSorted();
    expect(boards.map((b) => b.name)).toContain('My Workspace');
    expect(boards.map((b) => b.name)).toContain('Design Ideas');

    // Verify task with completion and note
    const myWorkspace = boards.find((b) => b.name === 'My Workspace')!;
    const researchCol = store.columnsOfBoard(myWorkspace.id).find((c) => c.name === 'Research')!;
    const taskCard = store.cardsOfColumn(researchCol.id).find((c) => c.title.includes('PR Review'));
    expect(taskCard?.kind).toBe('task');
    expect(taskCard?.completedAt).toBeTypeOf('number');
    expect(taskCard?.note).toContain('Review commits');
  });
});
