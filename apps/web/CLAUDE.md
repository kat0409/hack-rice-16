# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from `apps/web/`:

```bash
npm install
npm run dev       # vite dev server, http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview   # preview a production build
npx tsc -b --noEmit   # typecheck only, no emit — closest thing to a test suite
```

There is no test runner configured in this project. Don't go looking for one or suggest adding one unless asked.

## Status: fully wired to `graphite-rest`

Every page calls the real API through `src/lib/api.ts` (needs the backend + worker running; `VITE_API_BASE_URL` in `.env`, default `http://127.0.0.1:8000/api/v1`). The backend's DTOs are snake_case; this app's types (`src/types/`) are camelCase. Conversion happens once, in `src/lib/mappers.ts` — don't rename backend fields or frontend types to force a match.

Routes nest under `/course/:courseId/...` where `courseId` is a real backend UUID. The UI calls this container a **"subject"** (a course, a certification, an exam — anything with notes); the backend keeps the `courses` table and `/courses` routes. `HomePage` lists/creates subjects.

The newest study session for a subject is loaded into a tiny module-level store (`src/lib/sessionStore.ts`, `useSyncExternalStore`) by `useStudySession`; `RightStudyRail` and the study tools read the active step from it. Study tool pages (Materials = summary, Flashcards, Practice, Audio) take `?step=<stepId>` and fall back to the active step (`useStep`).

## Design system — read before touching visual code

All tokens live in `tailwind.config.ts`. This is a deliberate, opinionated aesthetic — don't drift from it by eyeballing individual components.

- **Headings and eyebrow labels go through `src/components/ui/Heading.tsx` and `Eyebrow.tsx` — never hand-type `font-display text-... font-...` or `uppercase tracking-widest2 ...` again.** This isn't a style preference, it's fixing a repeat bug: the page-header eyebrow was independently styled two different ways before being consolidated, "Process States" rendered at two different sizes in two places visible on screen at once (`RouteNode`'s active-step card vs. `RightStudyRail`), and a page title was once left on a completely different font from every other page's after a one-off change. All three happened because the styling was retyped per-file instead of shared. Concretely:
  - `<Heading as="h1" size="page">` — every page-level title (`text-2xl font-bold sm:text-3xl`).
  - `<Heading as="h2" size="section">` — a card/section title within a page (`text-xl font-bold`).
  - `<Heading as="h3" size="concept">` (or `as="p"` where a heading tag isn't semantically right) — a single concept/entity name: route-step cards, the study rail, graph node detail cards, a prominent instruction line (`text-base font-semibold`). If you add a fourth place that displays "a concept's name" as a heading, use `size="concept"` — don't invent a new size for it.
  - `<Eyebrow>` (default `size="page"`, `text-xs`) — the small uppercase caption above a page's `<h1>`. `<Eyebrow size="card">` (`text-[11px]`) — the same role inside a card ("Question", "Narrated recap", "Legend", the sidebar's "Course"/"Navigation"/"Tools" labels). Both default to `text-ink-soft/60`; pass `className` to override color only (e.g. an accent-tinted eyebrow like "You're here") — never touch the weight/tracking/casing.
  - Both components take `as` to render a different tag and `className` for one-off additions (`cn`-merged, so a color override wins over the default). Don't add a new heading size or eyebrow size without checking whether an existing one already fits — that's exactly the drift this refactor removed.
  - `font-display` (Architects Daughter — pencil/architect-notebook handwriting) is what `Heading` uses internally; `font-sans` (Inter) is the default for everything else (body copy, nav items, badges); `font-serif` (Lora) is for citations/quotes only. Architects Daughter only ships weight 400 — `font-bold`/`font-semibold` on it triggers browser-synthesized bold, which is intentional (reads as heavier pencil pressure), not a bug to fix.
  - History: Kalam (a bubbly, rounded handwriting font) was tried first and explicitly rejected as "too pastel/unserious." Don't reintroduce it or anything in that same bubble-letter family (e.g. Shantell Sans).
  - `font-retro` = Press Start 2P (an 8-bit NES-era pixel-block game font — the free stand-in for "the Mario font," which is proprietary). Deliberately scoped to exactly one spot, applied directly (not through `Heading`, since it's a brand wordmark, not a page/section/concept title): the "graphite" wordmark in `LeftSidebar.tsx`. It was also briefly applied to a page's `<h1>` and explicitly reverted — that title goes through `Heading` like every other page's, full stop. Sized well below normal heading scale (`text-sm`, not `text-2xl`+) because Press Start 2P's glyphs are much wider per character than a normal typeface. Don't extend `font-retro` anywhere else without re-checking width at whatever size you use it.
- **Shadows**: `shadow-chunky`, `shadow-chunky-sm`, `shadow-chunky-accent` are a deliberate "Wii channel" look — a hard offset edge plus a soft ambient shadow, not a modern blur-only shadow. Use one of these (plus `border-2 border-ink/10` or `border-ink/15` and a **solid** `bg-paper`) for any new panel, card, or floating control.
  - Translucent chrome (`bg-paper/70`, `bg-paper/90`, `backdrop-blur`) was explicitly rejected as "too sleek/modern/glassy." Sidebars, rails, nav bars, cards, and overlays should all be opaque.
- **Page headers**: every page wraps its header in its own bordered/shadowed toolbar card (`rounded-2xl border-2 border-ink/10 bg-paper px-5 py-4 shadow-chunky`), with a real gap (`gap-8` on the page's outer flex column) before the content below. This was a deliberate fix for headers feeling flush/cramped against content — keep new pages consistent with it.
- **Background texture** (`src/styles/paper-texture.css`): the grid, dot markers, cursor-follow glow, and grain noise are ALL just `background-*` layers on `.paper-surface` itself (applied once, wrapping `<RouterProvider>` in `App.tsx`) — there is no separate `.paper-dots`/`.paper-spotlight`/`.paper-grain` element. **Keep it that way; don't split them back out into sibling `position: fixed` divs.** That was the original implementation, and it doesn't work: a `position: fixed` element is checked for paint order against the *entire document*, and empirically (screenshot-tested in this repo, not just reasoned about) such a layer can still bleed a faint version of itself through later, opaque, higher-in-normal-flow content — this reproduced with every one of the four layers (grid, dots, grain, and the cursor spotlight), even at `z-index: 0`, in this project's dev/test environment. A single element's own `background-image` layers have no such ambiguity — the spec guarantees they always paint behind that element's children, full stop. The tradeoffs this created, if you're touching this code:
  - The cursor spotlight (`useCursorSpotlight.ts`) can no longer fade via a CSS `opacity` transition on its own element (there's no separate element). It instead animates two CSS custom properties (`--spotlight-alpha-1`/`-2`, the gradient's two color-stop alphas) via `requestAnimationFrame`, referenced directly in the gradient's `rgba(..., var(--spotlight-alpha-1, 0))`. If you need to retune the fade, edit the constants in that hook, not a CSS `transition`.
  - The grain noise SVG bakes its own opacity into the `<rect opacity="0.09">` inside the data-URI (matching how `.graph-paper`'s noise layer already did this), rather than relying on an element-level `opacity` — `background-blend-mode: multiply` alone would otherwise multiply the *full-contrast* noise against the page and visibly gray out the whole background (this regressed once during the fix; if the background ever looks unexpectedly washed-out/gray again, check this opacity is still baked into the SVG rect).
  - `background-image`/`background-size`/`background-position`/`background-blend-mode` on `.paper-surface` are parallel comma-separated lists — the Nth entry in each must correspond to the same layer. Adding/removing/reordering a layer means updating all of them in lockstep.
  - `background-attachment: fixed` (set once, applies to every layer) is what keeps the pattern visually pinned to the viewport instead of scrolling with page content — same effect the old `position: fixed` divs had, achieved without them.
  - `.graph-paper` (behind the knowledge-graph canvas only) does NOT have this problem — it's a local, non-fixed background on one bounded, normal-flow container, and its children (nodes/edges/overlays) are ordinary DOM content painting on top of it. It didn't need to change.
- **No translucent surfaces, anywhere a card/box/panel sits at rest.** A `bg-paper-dark/40`-style translucent fill was used on a few static boxes (dropzones, revealed-answer states) and, at least for ones sitting directly on the page background, visibly let the grid show through — same underlying complaint as above, different mechanism (alpha blending, not stacking). Fixed by switching them to solid `bg-paper-dark`. Momentary `:hover` tints (e.g. `hover:bg-paper-dark/60` on nav items) are fine and were left alone — the rule is about static/persistent surfaces, not transient interaction feedback.
- `src/index.css` is dead leftover from the original Vite template — it is **not** imported by `main.tsx` (which imports `src/styles/globals.css`) and has stale color tokens. Ignore it; don't edit it thinking it's live.

## Knowledge graph internals

`src/pages/MapPage.tsx` + `src/components/graph/*` + `src/lib/{graphLayout,sketch,graphTheme}.ts`.

- Layout (`graphLayout.ts`): nodes are tiered left-to-right by longest-path depth over "hierarchical" relation types only (`REQUIRES`, `PART_OF`, `DERIVED_FROM`, `APPLIED_IN`, `EXAMPLE_OF`); `CONTRASTS_WITH`/`RELATED_TO` are drawn as cross-links but don't affect tiering.
- Hand-drawn look (`sketch.ts`): node blobs and edge lines are wobbled deterministically via `seededRandom(id)`. Never swap in `Math.random()` there — it would make shapes jitter on every re-render instead of staying stable.
- `GraphCanvas.tsx`'s outer container **must** stay `overflow-clip`, not `overflow-hidden`. A real bug hit this session: Chromium will still natively `scrollIntoView`-scroll an `overflow:hidden` container (e.g. from a click on an off-screen node, or keyboard focus), which desyncs the pinned zoom/legend overlays from the pan/zoom transform state. `overflow-clip` disables that. Panning/zooming is handled entirely by the component's own `view` state (`GraphCanvas.tsx`) — there should never be a second, browser-native scroll position on that element.
- The canvas fits itself to the container on mount (`fitToView`) and re-centers on node selection (`focusNode`) — both read `containerRef.current.clientWidth/Height`, so they only work correctly once the container has laid out; don't call them before that.

## Scroll-driven UI

`CoursePage.tsx`'s bottom-of-route hint (`ScrollProgressHint`) is purely scroll-position-driven, not data-driven: a 1px sentinel div sits right after `<LearningRoute />`, watched by `useIsInView` (`src/hooks/useIsInView.ts`, IntersectionObserver-based). While that sentinel is on screen it shows "Done with your study route — good job!"; scrolling away from it (in either direction) reverts to "Continue your route ↓". It deliberately ignores whether the steps are actually marked complete — don't reintroduce a data-derived `isRouteComplete` check here, that was tried and explicitly replaced.

## Study tool pages

`MaterialsPage` (summary), `FlashcardsPage`, `PracticePage`, and `AudioPage` generate their content per route step via `POST /study-steps/{id}/artifacts` (`useArtifact`); the backend caches one artifact per (step, type), so a second visit is instant. `AudioPage` narrates the step's summary through `POST /study-artifacts/{id}/narration` and plays it with a real `<audio>` element; its transcribe box calls the real speech-to-text endpoint. `PreviewBanner` (`src/components/ui/PreviewBanner.tsx`) is no longer used anywhere but kept for future preview features.

`SourcesPage` uploads to `POST /api/v1/courses/{course_id}/documents` and polls `GET .../documents` every 1.5s while any row is non-terminal; status badges are real (the worker drives them). A document at `EMBEDDING` with an `error_code` shows a "Retry extraction" action.
