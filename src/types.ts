/** Domain types for Tabularium. See spec §7. */

export interface Board {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  order: number;
}

export interface Card {
  id: string;
  columnId: string;
  order: number;
  url: string;
  title: string;
  favIconUrl?: string;
  savedAt: number;
  /** Reserved for v2 (notes); never written in v1. */
  note?: string;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Meta {
  activeBoardId: string | null;
  theme: ThemePref;
  schemaVersion: number;
}

/** Full persisted graph, used to hydrate the in-memory store. */
export interface Snapshot {
  boards: Board[];
  columns: Column[];
  cards: Card[];
  meta: Meta;
}

/** Fields captured when saving a tab as a card. */
export type NewCard = Pick<Card, 'url' | 'title'> & Partial<Pick<Card, 'favIconUrl'>>;
