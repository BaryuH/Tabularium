# Tabularium — v1 Implementation Plan

- **Date:** 2026-09-15
- **Spec:** `docs/superpowers/specs/2026-09-15-tabularium-v1-design.md` (authoritative)
- **Conventions:** `AGENTS.md` (branching, commits, QC gates)

This plan turns the spec into ordered, verifiable milestones. Each milestone
= one feature branch (see naming in AGENTS.md §6) and must pass every QC gate
in AGENTS.md §8 before merge to `main`.

## Global conventions

- **One branch per milestone**, branched from up-to-date `main`, rebased
  before PR, deleted after merge.
- **QC gate per merge:** `typecheck` + `lint` + `test` green, manual smoke on
  unpacked extension recorded, reviewed by a second party, no scaffolding
  left. Run lint/typecheck/test once at the end of the milestone.
- **`chrome.*` only inside `src/tabs/`.** Everything else stays mockable.
- **UI work goes through `design-taste-frontend`** (+ `minimalist-ui`,
  `high-end-visual-design`). Read the skill before styling any surface.
- **TypeScript strict**; no UI framework; no network.

## Dependency graph

```
M1 scaffold
      |
      v
M2 db  ---> M3 state
                 |
     +-----------+-----------+------------------+
     v           v           v                  v
M4 board-ui   M5 sidebar   (M7 needs M4+M6)   M8 theme
     |           |
     +-----+-----+
           v
        M6 dnd  ---> M7 card-activate
                          |
M9 shortcut (needs M2/M3) |
                          v
                    M10 polish (needs all)
```

- Sequential spine: **M1 -> M2 -> M3**.
- After M3, **M4, M5, M8 are independent** and may run in parallel branches.
- **M6** needs M4 + M5. **M7** needs M4 + M6. **M9** needs M2 + M3 (parallel
  with M4/M5). **M10** is last, needs everything.
- Parallel-branch rule (AGENTS.md §6): if two branches must touch the same
  file, name one integration owner; do not blind-merge overlapping edits.

---

## M1 - `chore/scaffold`

**Goal:** buildable, loadable empty extension.

**Tasks:**
- `package.json` with scripts: `dev`, `build`, `typecheck`, `lint`, `test`
  (see AGENTS.md §4). Deps: `typescript`, `vite`, `@crxjs/vite-plugin`,
  `vitest`, `eslint` + TS config.
- `tsconfig.json` (strict, DOM + `chrome-types`/`@types/chrome`).
- `vite.config.ts` wiring `@crxjs/vite-plugin` with `manifest.json`.
- `manifest.json` (MV3): `chrome_url_overrides.newtab = index.html`,
  `permissions: ["tabs", "commands"]`, `background.service_worker` ->
  `src/background.ts`, icons.
- `index.html` + `src/main.ts` rendering a placeholder dashboard shell.
- `src/background.ts` empty service worker (logs install).
- `public/icons/` placeholder icons (16/32/48/128).
- ESLint + `.editorconfig`.

**Acceptance:** `npm run build` produces `dist/`; load unpacked; a New Tab
shows the placeholder shell; no console errors; `typecheck`/`lint` clean.

**Manual smoke:** open New Tab -> placeholder visible; service worker
registered in `chrome://extensions`.

---

## M2 - `feat/db` (needs M1)

**Goal:** IndexedDB persistence layer + domain types.

**Tasks:**
- `src/types.ts`: `Board`, `Column`, `Card`, `Meta` exactly per spec §7.
- `src/db/schema.ts`: open DB, object stores `boards`, `columns`, `cards`,
  `meta`; indexes (`columns.by-board`, `cards.by-column`); `schemaVersion`
  + migration hook.
- `src/db/repo.ts`: CRUD for each store; `order` helpers (gap-indexed
  integers with a `reorder(list)` utility); `getSnapshot()` loading the full
  graph for hydration; seed default board + "Inbox" column on first run.
- Error surface: throw typed errors caught by callers (toast in UI later).

**Tests (Vitest, fake-indexeddb):** create/read/update/delete each entity;
ordering stays stable after insert/move; migration from empty -> v1 seeds
default board + Inbox; snapshot returns coherent graph.

**Acceptance:** all db tests green; no `chrome.*` usage in `db/`.

---

## M3 - `feat/state` (needs M2)

**Goal:** in-memory single source of truth with pub/sub, hydrated from db.

**Tasks:**
- `src/state/store.ts`: normalized state (`boards`, `columns`, `cards`,
  `meta`, derived selectors: columns-of-board, cards-of-column sorted by
  `order`). `subscribe(fn)` / `getState()`.
- Mutations wrap `db/repo` writes then update memory and notify (write-through).
- `hydrate()` loads snapshot into memory on New Tab boot.
- `applyExternalChange()` hook for the M9 broadcast refresh.

**Tests:** hydrate from a seeded db; each mutation updates memory + persists
(assert via repo); selectors return correctly ordered slices; subscribers
fire once per mutation.

**Acceptance:** state tests green; UI-agnostic (no DOM, no `chrome.*`).

---

## M4 - `feat/board-ui` (needs M3) - parallel with M5, M8

**Goal:** render + manage boards/columns/cards (no drag yet).

**Tasks:**
- `src/ui/board/` renders active board: column list, cards per column.
- Board switcher (create / rename / delete / switch; persists `activeBoardId`
  in `meta`).
- Column CRUD (add / rename / delete-with-confirm).
- Card render (favicon + title + host); card delete; empty-state visuals.
- Styling via `design-taste-frontend` + `minimalist-ui`.

**Tests:** rendering logic that is pure (e.g. host extraction from URL,
card view-model builder) unit-tested; DOM wiring verified by manual smoke.

**Acceptance:** create board -> add columns -> cards render; switch board
persists across reload; visuals pass the taste skill; manual smoke recorded.

---

## M5 - `feat/sidebar` (needs M3) - parallel with M4, M8

**Goal:** live current-window tab list.

**Tasks:**
- `src/tabs/adapter.ts`: `queryCurrentWindow()`, `onChange(cb)` subscribing to
  `onCreated/onRemoved/onUpdated/onActivated` scoped to current window,
  `activate(tabId)`, `openUrl(url)`. All `chrome.*` isolated here; injectable
  `chrome` for tests.
- `src/ui/sidebar/` renders the tab list (favicon + title), reflecting live
  changes; each item is drag-source-ready (data attributes for M6).

**Tests:** adapter unit tests with a mock `chrome` (query maps correctly;
event add/remove/update mutate the list; window scoping filters other
windows). Live update verified by manual smoke.

**Acceptance:** sidebar mirrors real tabs; opening/closing/renaming a tab
updates it within a frame; manual smoke recorded.

---

## M6 - `feat/dnd` (needs M4 + M5)

**Goal:** HTML5 native drag-and-drop.

**Tasks:**
- `src/dnd/` wiring:
  - sidebar tab -> column: create a `Card` from tab (url/title/favIconUrl)
    via state mutation; **source tab stays open** (copy semantics).
  - card <-> card: reorder within a column and move across columns
    (update `columnId` + `order`).
  - column reorder within a board.
- Drop indicators + drag ghost styled per taste skill.

**Tests:** pure reorder/move logic (order recomputation, cross-column move)
unit-tested; DnD interaction verified by manual smoke.

**Acceptance:** drag a sidebar tab into a column creates a card, tab remains
open; cards reorder/move; columns reorder; order persists across reload;
manual smoke recorded.

---

## M7 - `feat/card-activate` (needs M4 + M6)

**Goal:** click a card -> activate matching open tab, else open new.

**Tasks:**
- `src/tabs/resolve.ts`: pure `resolveTarget(url, openTabs)` -> `{action:
  'activate', tabId}` or `{action: 'open', url}` (URL match rules: exact,
  ignore trailing slash/hash policy documented inline).
- Wire card click -> resolve -> `adapter.activate` / `adapter.openUrl`.

**Tests:** `resolveTarget` matrix (match present -> activate; absent -> open;
hash/trailing-slash cases per documented policy). Pure, `chrome` mocked.

**Acceptance:** clicking a card focuses an existing tab or opens a new one
correctly; manual smoke recorded.

---

## M8 - `feat/theme` (needs M3) - parallel with M4, M5

**Goal:** dark mode.

**Tasks:**
- `src/theme/`: apply `system` (via `prefers-color-scheme`) / `light` /
  `dark`; toggle in UI; persist in `meta.theme`; no flash on load
  (apply before first paint).
- CSS variables/tokens aligned with the taste skill for both modes.

**Tests:** pure theme-resolution (`system` -> effective mode from a mocked
media query) unit-tested.

**Acceptance:** toggle switches modes, persists across reload, no FOUC;
both modes pass the taste skill; manual smoke recorded.

---

## M9 - `feat/shortcut` (needs M2 + M3) - parallel with M4/M5

**Goal:** global quick-save of the active tab.

**Tasks:**
- `manifest.json` `commands`: e.g. `save-active-tab` with a suggested key.
- `src/background.ts`: on command, read active tab, write a `Card` to the
  active board's **Inbox** column via `db/repo` (create Inbox if missing),
  then `chrome.runtime.sendMessage` a change notice.
- New Tab page listens and calls `state.applyExternalChange()` to refresh.

**Tests:** background handler logic factored into a pure function
(`buildCardFromTab`, `targetInboxColumn(state)`) unit-tested; end-to-end via
manual smoke.

**Acceptance:** pressing the shortcut on any page adds a card to Inbox; an
open New Tab reflects it live; manual smoke recorded.

---

## M10 - `chore/polish` (needs all)

**Goal:** ship-quality pass.

**Tasks:**
- Full `design-taste-frontend` pass: typography, spacing, motion, empty
  states, focus states, keyboard a11y.
- Error toasts wired per spec §10 (favicon fallback, IndexedDB failure).
- Final icon set; README quickstart (install/build/load unpacked).
- Remove any dead code / debug logs.

**Acceptance:** all QC gates green across the whole extension; full manual
smoke of every user flow recorded; visuals pass the taste skill.

---

## v1 Definition of Done

- New Tab shows the Kanban dashboard with a live current-window sidebar.
- Drag a tab into a column saves a card (tab stays open); card click
  activates-or-opens; boards/columns/cards CRUD + reorder persist in
  IndexedDB across restarts.
- Dark mode works and persists; global shortcut quick-saves to Inbox.
- No v1 non-goals implemented (no gather/freeze/sync/notes/todo/private/
  multi-drag/all-windows).
- `typecheck` + `lint` + `test` green; every flow manually smoke-tested;
  all branches merged to `main` via reviewed PRs.
