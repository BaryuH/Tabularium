# Tabularium — v1 Design Spec

- **Date:** 2026-09-15
- **Status:** Approved for planning
- **Scope:** v1 (local-first). Sync / accounts / notes / todo / private space deferred to v2.

## 1. Vision

Tabularium turns the browser's New Tab page into a Kanban dashboard for
organizing browser tabs into projects. The name evokes the Roman public
records office: an orderly, trustworthy archive. The product feeling is a
calm "digital library" — minimal, fast, and reassuring that "nothing gets
lost."

## 2. Problem

Heavy browser users drown in tabs: the tab strip gets cluttered, tabs are
hard to find again, and closing a tab loses its context. Tabularium gives
back control by letting the user drag live tabs into a visual, persistent
Kanban board organized by project.

## 3. Goals / Non-goals

### Goals (v1)
- New Tab override rendering a Kanban dashboard.
- A live **sidebar** mirroring the current window's open tabs in real time.
- Drag a tab from the sidebar into a column to **save it as a card**
  (URL + title + favicon). The original tab stays open.
- Click a saved card to **activate** the matching open tab, or open a new
  tab if none is open.
- Multiple boards (`Board -> Column -> Card`), full CRUD + reordering.
- Local-first persistence in **IndexedDB** (no network).
- Dark mode (system default + manual toggle).
- A global keyboard shortcut to quick-save the active tab.

### Non-goals (explicitly out of v1)
- **No** tab gathering / freezing / discard / RAM-optimization mechanics.
  The browser (Memory Saver) already discards inactive tabs; Tabularium
  solves clutter + lost context, not memory.
- No cloud sync, no user accounts.
- No notes, no per-column todo lists.
- No private/hidden space.
- No multi-tab (batch) drag; single-tab drag only.
- Sidebar covers the **current window** only, not all windows.

## 4. Locked decisions

| # | Decision |
|---|----------|
| 1 | v1 is local-first minimal; no backend. |
| 2 | Stack: **Vanilla TypeScript + Vite** with `@crxjs/vite-plugin`, **Manifest V3**. |
| 3 | No gather/freeze/RAM feature. |
| 4 | Sidebar reflects the **current window's** tabs, updated live. |
| 5 | Drag one tab from sidebar into a column => create a card. Drop is a **copy**; the source tab stays open. |
| 6 | Clicking a card **activates** an already-open matching tab; otherwise opens a new tab. |
| 7 | Hierarchy is one level: `Board -> Column -> Card`. "Workspace" == "Board". |
| 8 | Every new Board gets a default **"Inbox"** column (quick-save target). |
| 9 | `Card.note` field reserved but unused in v1. |

## 5. Architecture

Two runtime contexts sharing one IndexedDB database (same extension origin):

- **New Tab page (SPA)** — the entire dashboard. Being an extension page,
  it calls `chrome.tabs` / `chrome.windows` directly; no proxying through
  the service worker is needed for normal operation.
- **Service worker (`background.ts`)** — thin. Handles the global
  `chrome.commands` shortcut ("save active tab") from any tab: reads the
  active tab, writes a card to the active board's Inbox column in
  IndexedDB, then broadcasts a `chrome.runtime` message so any open New
  Tab pages refresh.

## 6. Modules (single responsibility each)

- `db/` — IndexedDB layer. Object stores: `boards`, `columns`, `cards`,
  `meta`. CRUD, `order` maintenance, schema versioning / migrations.
- `state/` — in-memory store with pub/sub, hydrated from `db/`. Single
  source of truth for the UI.
- `tabs/` — `chrome.tabs` adapter: query current window; subscribe to
  `onCreated` / `onRemoved` / `onUpdated` / `onActivated`; `activate(tabId)`;
  `openUrl(url)`. Wraps `chrome.*` so it is mockable in tests.
- `ui/board/` — board switcher, columns, cards; column & card CRUD, rename,
  delete.
- `ui/sidebar/` — the live tab list.
- `dnd/` — HTML5 native drag-and-drop wiring: sidebar->column (create
  card), card<->card (reorder / move between columns), column reorder.
- `theme/` — dark mode (system default + toggle, persisted in `meta`).
- `commands/` + `background.ts` — keyboard shortcuts.

## 7. Data model

```ts
interface Board  { id: string; name: string; order: number; createdAt: number; updatedAt: number; }
interface Column { id: string; boardId: string; name: string; order: number; }
interface Card   { id: string; columnId: string; order: number; url: string; title: string; favIconUrl?: string; savedAt: number; note?: string; }
interface Meta   { activeBoardId: string | null; theme: 'system' | 'light' | 'dark'; schemaVersion: number; }
```

- `order` is a sortable number per sibling group (float or gap-indexed
  integer) to keep drag-reorder O(1) without renumbering everything.
- `note` is present in the schema but never written in v1.

## 8. Data flow

- **New Tab load:** hydrate `state/` from IndexedDB -> query current
  window's tabs -> render board + sidebar.
- **Tab events:** `tabs/` listeners update sidebar in real time.
- **Drag tab -> column:** create a `Card` (db + state) -> re-render column.
- **Click card:** search current window for a tab with the same URL; found
  -> `activate`; not found -> `tabs.create`.
- **Shortcut (from any tab):** service worker reads active tab -> writes a
  `Card` to the active board's Inbox column -> broadcasts a runtime message
  -> open New Tab pages refresh.

## 9. Manifest & permissions (MV3)

- `chrome_url_overrides.newtab = index.html`.
- `permissions`: `tabs` (read url/title/favicon; activate/create),
  `commands` (global shortcut).
- No `host_permissions`, no network access.

## 10. Error handling

- Missing/broken favicon -> fallback icon.
- IndexedDB failure -> non-blocking toast; keep working from in-memory
  state; retry on next mutation.
- Duplicate URL on a board -> allowed in v1 (no dedupe / no blocking).
- `chrome.tabs` permission/edge errors -> caught in the `tabs/` adapter and
  surfaced as a toast, never a crash.

## 11. Testing

- **Unit (Vitest):**
  - `db/` CRUD + ordering invariants + migration.
  - `state/` reducers / selectors.
  - activate-or-open resolution logic (pure, `chrome` mocked).
- **Manual smoke (required per UI-change verification):** load unpacked in
  Chrome, verify sidebar liveness, drag-to-save, card click activate/open,
  shortcut quick-save, dark mode. Record the result in the PR.
- No test is written merely so the change "has tests"; each unit test must
  fail on a plausible bug in the behavior it covers.

## 12. Project structure

```
manifest.json
index.html                # New Tab page entry
vite.config.ts
tsconfig.json
package.json
src/
  main.ts                 # New Tab bootstrap
  background.ts           # service worker
  types.ts
  db/
  state/
  tabs/
  ui/
    board/
    sidebar/
  dnd/
  theme/
  commands/
public/
  icons/
tests/
docs/superpowers/specs/2026-09-15-tabularium-v1-design.md
```

## 13. Suggested implementation milestones (branch-per-feature)

1. `chore/scaffold` — Vite + crxjs + TS + MV3 manifest + empty New Tab.
2. `feat/db` — IndexedDB layer + types + migrations + tests.
3. `feat/state` — in-memory store + hydration.
4. `feat/board-ui` — board switcher, columns, cards, CRUD (no DnD yet).
5. `feat/sidebar` — live current-window tab list via `tabs/` adapter.
6. `feat/dnd` — drag tab->column, card reorder/move, column reorder.
7. `feat/card-activate` — click-to-activate-or-open resolution.
8. `feat/theme` — dark mode + toggle.
9. `feat/shortcut` — global quick-save command + background broadcast.
10. `chore/polish` — design-taste pass, empty states, error toasts.

## 14. Deferred to v2 (not designed here)

Cloud sync + accounts, notes (per tab/column + floating notepad), per-column
todo lists, private/hidden encrypted space, multi-tab drag, all-windows
sidebar. Each becomes its own spec -> plan -> implementation cycle. The
data model already leaves room (e.g. `Board.workspaceId` can be added
without breaking v1).
