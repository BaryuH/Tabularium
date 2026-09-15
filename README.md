
# Tabularium

A Chrome extension that turns your New Tab into a Kanban dashboard for organizing browser tabs. Save tabs as cards, create tasks and notes, drag-and-drop to organize, and never lose context again.

The name evokes the Roman *tabularium* (public records archive): an orderly, trustworthy place to file everything away.

## Features (v1)

- **Kanban board** on every New Tab: boards, columns, cards.
- **Live sidebar** mirrors your current window's open tabs in real time.
- **Drag tabs into columns** to save them as cards (tab stays open).
- **Add tasks and notes** per column: quick-capture for action items and reference.
- **Click a card** to jump to the matching open tab, or open a new one.
- **Board/column CRUD**: create, rename, delete, reorder via drag.
- **Dark mode** with system/light/dark toggle (no flash on load).
- **Global shortcut** (Alt+S / Cmd+Shift+S) to quick-save the active tab to Inbox.
- **Local-first**: all data in IndexedDB, no network, no account required.

## Quick start

Prerequisites: Node.js 20+, npm.

```bash
git clone https://github.com/BaryuH/Tabularium.git
cd Tabularium
npm install
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` folder
4. Open a new tab

## Development

```bash
npm run dev         # Vite dev build with HMR (crxjs)
npm run build       # Production build -> dist/
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm test            # Vitest (38 tests)
npm run preview     # Serve dist/ on localhost:5055 for smoke testing
```

## Tech stack

- TypeScript (strict), Vanilla DOM (no framework)
- Vite + @crxjs/vite-plugin, Manifest V3
- IndexedDB (local-first persistence)
- HTML5 native drag-and-drop
- Vitest + fake-indexeddb

## Architecture

See `AGENTS.md` for conventions and `docs/superpowers/specs/` for the design spec.

```
src/
  main.ts          # New Tab bootstrap
  background.ts    # Service worker (quick-save shortcut)
  types.ts         # Domain types (Board, Column, Card, Meta)
  db/              # IndexedDB schema + repo (CRUD, ordering, cascade)
  state/           # In-memory store (pub/sub, selectors, write-through)
  tabs/            # chrome.tabs adapter (mockable) + URL resolver
  theme/           # Dark mode (data-theme, anti-FOUC)
  dnd/             # HTML5 drag-and-drop wiring
  ui/              # Board view, sidebar view, icons, toast
```

## License

MIT
