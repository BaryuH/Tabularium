/** Domain types for Tabularium. See spec §7. */

export interface Board {
  id: string;
  name: string;
  icon?: string;
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

export type CardKind = 'tab' | 'task' | 'note';

export interface Card {
  id: string;
  columnId: string;
  order: number;
  url: string;
  title: string;
  favIconUrl?: string;
  savedAt: number;
  /** Card type: 'tab' (saved browser tab), 'task' (user-created action item), 'note' (free-form reference). */
  kind?: CardKind;
  /** Timestamp when a task was marked completed. */
  completedAt?: number;
  /** Reserved for v2 (rich notes body). */
  note?: string;
}

export type ThemePref = 'light' | 'dark';
export type TabOpenBehavior = 'new-tab' | 'current-tab';

export interface Meta {
  activeBoardId: string | null;
  theme: ThemePref;
  schemaVersion: number;
  openBehavior?: TabOpenBehavior;
  sidebarCollapsed?: boolean;
}

/** Full persisted graph, used to hydrate the in-memory store. */
export interface Snapshot {
  boards: Board[];
  columns: Column[];
  cards: Card[];
  meta: Meta;
}

/** Fields captured when saving a tab as a card. */
export type NewCard = Pick<Card, 'url' | 'title'> & Partial<Pick<Card, 'favIconUrl' | 'kind'>>;
