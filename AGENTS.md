# AGENTS.md — Tabularium

Operating manual for any agent or contributor working in this repository.
Read this fully before making changes. The authoritative product design is
`docs/superpowers/specs/2026-09-15-tabularium-v1-design.md`.

---

## 1. What this project is

Tabularium is a **Chrome Extension (Manifest V3)** that overrides the New
Tab page with a **Kanban dashboard** for organizing browser tabs into
projects. v1 is **local-first** (IndexedDB, no backend). See the spec for
the full vision, scope, and locked decisions.

**Product feeling:** a calm "digital library" — minimal, fast, orderly,
reassuring. Every UI change must protect that feeling.

## 2. Tech stack (do not change without a new decision)

- **Language:** TypeScript (strict).
- **UI:** Vanilla TS + DOM. **No React/Vue/Svelte.** Keep the New Tab page
  lightweight and instant.
- **Build:** Vite + `@crxjs/vite-plugin`, targeting MV3.
- **Storage:** IndexedDB (local-first). No network in v1.
- **Tests:** Vitest.
- **Drag & drop:** HTML5 native DnD.

## 3. Repository layout

See spec §12. Key rule: **one module = one responsibility**
(`db/`, `state/`, `tabs/`, `ui/`, `dnd/`, `theme/`, `commands/`). Wrap all
`chrome.*` calls inside the `tabs/` adapter so logic stays mockable. Do not
scatter `chrome.*` calls across UI code.

## 4. Commands

> Scaffolding is created in the `chore/scaffold` milestone; these are the
> canonical scripts the `package.json` must expose.

```bash
npm install            # install deps
npm run dev            # Vite dev build with HMR (crxjs)
npm run build          # production build -> dist/
npm run typecheck      # tsc --noEmit, must pass with zero errors
npm run lint           # eslint, must pass with zero errors
npm test               # vitest run
```

**Load unpacked (manual QC):** Chrome -> `chrome://extensions` -> enable
Developer mode -> "Load unpacked" -> select `dist/`. Open a New Tab to
exercise the change.

## 5. Frontend design authority

All UI work MUST go through the installed taste skills. Primary:
**`design-taste-frontend`**. Complementary for this product's aesthetic:
**`minimalist-ui`** and **`high-end-visual-design`**.

- Read the skill before building or restyling any surface.
- No generic/templated look. Follow the skill's typography, spacing, color,
  and motion discipline.
- The dashboard is the product; treat it like a shipped design, not a demo.

## 6. Branching model (feature-per-branch)

`main` is always releasable and is **protected**: no direct commits.

- One feature or fix per branch, branched from up-to-date `main`.
- Branch naming (Conventional): `feat/<scope>`, `fix/<scope>`,
  `chore/<scope>`, `docs/<scope>`, `refactor/<scope>`, `test/<scope>`.
  Scope matches a module or milestone, e.g. `feat/sidebar`, `feat/dnd`.
- Keep branches small and focused; map them to the milestones in spec §13.
- Rebase on `main` before opening a PR; resolve conflicts on the branch.
- Delete the branch after merge.

**Parallel work:** independent milestones may run on separate branches at
the same time. Before two branches touch the same file, coordinate and name
one integration owner for that file — do not blind-merge overlapping edits.

## 7. Commit conventions

Use **Conventional Commits**: `type(scope): summary`.
Examples: `feat(dnd): drag sidebar tab into column`,
`fix(db): keep card order stable on move`. Imperative mood, present tense,
one logical change per commit.

## 8. QC gates (professional, non-negotiable)

A branch may be merged into `main` **only** when every item passes:

1. `npm run typecheck` — zero errors.
2. `npm run lint` — zero errors.
3. `npm test` — all unit tests green.
4. **Manual smoke** on the unpacked extension for the changed surface,
   with the result (what was exercised + outcome) recorded in the PR.
   UI changes require visual confirmation in an actual New Tab.
5. **Code review by a second party** (a reviewer agent or a human) — no
   self-merge of unreviewed code. Use the `reviewer` agent for automated
   review passes.
6. No leftover scaffolding: no `TODO: implement`, stubs, dead code, commented
   blocks, `console.log` debugging, or shims/aliases from a partial cutover.
7. Tests defend observable behavior (fail on a plausible bug), not
   implementation details. Do not add filler tests just to have tests.

Run lint/typecheck/test **once at the end** of a change, not repeatedly
mid-edit.

## 9. Code review checklist (reviewer applies this)

- Correctness first, then maintainability six months out.
- Module boundaries respected; `chrome.*` only inside `tabs/`.
- Matches an existing pattern; no second convention beside an existing one.
- Exported-symbol changes: all callsites updated (use LSP references).
- Error paths handled per spec §10 (favicon fallback, IndexedDB toast,
  no crashes).
- UI matches the design-taste skill; no generic look; dark mode intact.
- Data-model changes preserve `order` invariants and schema versioning.

## 10. Scope discipline

- Implement exactly what the spec/decision says. **No** unrequested
  features, retries, telemetry, or abstraction "while you're at it."
- v1 explicitly excludes: tab gathering/freezing/RAM mechanics, sync,
  accounts, notes, per-column todos, private space, multi-tab drag,
  all-windows sidebar. Do not build these under v1.
- New capability beyond the spec => a new spec -> plan -> implementation
  cycle, not an inline addition.

## 11. Never

- Never commit directly to `main`.
- Never merge with a failing QC gate.
- Never commit `node_modules/`, `dist/`, secrets, or `.env`.
- Never introduce a UI framework or a network dependency in v1.
- Never leave the tree with placeholders or half-done cutovers.
