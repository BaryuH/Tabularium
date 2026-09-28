import { describe, expect, it } from 'vitest';
import { formatCardAsMarkdown } from '../src/util';
import type { Card } from '../src/types';

describe('formatCardAsMarkdown', () => {
  it('formats a note card as clean Markdown with header and metadata', () => {
    const card: Card = {
      id: 'c1',
      columnId: 'col1',
      order: 1000,
      title: '[28/09] Project Architecture Notes',
      url: '',
      note: 'Here are the key architecture decisions.\n- Fast New Tab\n- IndexedDB local first',
      kind: 'note',
      savedAt: new Date('2026-09-28T10:00:00Z').getTime(),
    };

    const { filename, content } = formatCardAsMarkdown(card);

    expect(filename).toBe('2026-09-28-project-architecture-notes.md');
    expect(content).toContain('# [28/09] Project Architecture Notes');
    expect(content).toContain('> **Type:** Note');
    expect(content).toContain('> **Date:** 2026-09-28');
    expect(content).toContain('---');
    expect(content).toContain('Here are the key architecture decisions.');
    expect(content).toContain('- Fast New Tab');
  });

  it('formats a completed task card with task status', () => {
    const card: Card = {
      id: 'c2',
      columnId: 'col1',
      order: 2000,
      title: 'Review pull request',
      url: '',
      note: 'Checked all unit tests and bundle size.',
      kind: 'task',
      completedAt: Date.now(),
      savedAt: new Date('2026-09-28T12:00:00Z').getTime(),
    };

    const { filename, content } = formatCardAsMarkdown(card);

    expect(filename).toBe('2026-09-28-review-pull-request.md');
    expect(content).toContain('> **Type:** Task');
    expect(content).toContain('> **Status:** Completed');
    expect(content).toContain('Checked all unit tests and bundle size.');
  });

  it('includes clickable markdown source link when card has url', () => {
    const card: Card = {
      id: 'c3',
      columnId: 'col1',
      order: 3000,
      title: 'Vite documentation',
      url: 'https://vite.dev/guide',
      note: 'Study build plugins',
      kind: 'note',
      savedAt: new Date('2026-09-28T14:00:00Z').getTime(),
    };

    const { content } = formatCardAsMarkdown(card);

    expect(content).toContain('> **Source:** [https://vite.dev/guide](https://vite.dev/guide)');
  });

  it('handles empty note content gracefully with placeholder', () => {
    const card: Card = {
      id: 'c4',
      columnId: 'col1',
      order: 4000,
      title: 'Empty note',
      url: '',
      note: '',
      kind: 'note',
      savedAt: new Date('2026-09-28T15:00:00Z').getTime(),
    };

    const { content } = formatCardAsMarkdown(card);

    expect(content).toContain('_No content_');
  });
});
