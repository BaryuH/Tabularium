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
  icon?: string;
  order: number;
}

export type CardKind = 'tab' | 'task' | 'note' | 'window';

/** Single tab entry within a saved window session. */
export interface WindowTabItem {
  id: string;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface Card {
  id: string;
  columnId: string;
  order: number;
  url: string;
  title: string;
  favIconUrl?: string;
  savedAt: number;
  /** Card type: 'tab' (single tab), 'task' (to-do), 'note' (memo), 'window' (stashed window session). */
  kind?: CardKind;
  /** Timestamp when a task was marked completed. */
  completedAt?: number;
  /** Reserved for v2 (rich notes body). */
  note?: string;
  /** List of tabs in a saved window session (kind: 'window'). */
  tabs?: WindowTabItem[];
}

export type ThemePref = 'light' | 'dark';
export type TabOpenBehavior = 'new-tab' | 'current-tab';

export interface Meta {
  activeBoardId: string | null;
  theme: ThemePref;
  schemaVersion: number;
  openBehavior?: TabOpenBehavior;
  stashedOpenBehavior?: TabOpenBehavior;
  sidebarCollapsed?: boolean;
}

/** Full persisted graph, used to hydrate the in-memory store. */
export interface Snapshot {
  boards: Board[];
  columns: Column[];
  cards: Card[];
  meta: Meta;
}

/** Fields captured when saving a tab or window session as a card. */
export type NewCard = Pick<Card, 'url' | 'title'> & Partial<Pick<Card, 'favIconUrl' | 'kind' | 'note' | 'tabs'>>;
