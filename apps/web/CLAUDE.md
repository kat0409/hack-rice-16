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

## Status: mock-data-only, no backend wiring

Every page reads from local mock data in `src/data/` (`mockCourse.ts`, `mockGraph.ts`, `mockStudyMaterials.ts`). Nothing calls a network API. A real backend exists at `../../graphite-rest` (FastAPI, see its own `CLAUDE.md`) implementing part of the `design-doc.md` §11 contract, but frontend integration hasn't started. When that work begins: the backend's DTOs are snake_case (`source_count`, `relation_type`); this app's types (`src/types/`) are camelCase. Adapt at the fetch boundary — don't rename backend fields or frontend types to force a match.

`DEMO_COURSE_ID` (from `mockCourse.ts`) is the only course that exists; all routes are nested under `/course/:courseId/...`.

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

## Preview-only feature pages

`FlashcardsPage`, `PracticePage`, and `AudioPage` (linked from the sidebar "Tools" section and from `MaterialsPage`) are real, interactive UI (card flip, MCQ grading, a fake audio player, an upload-to-transcribe mock) built entirely against local mock data (`src/data/mockStudyMaterials.ts`) or fake timers. They are intentionally not wired to `graphite-rest`. Each carries a `PreviewBanner` (`src/components/ui/PreviewBanner.tsx`) saying so — keep that banner on any page in this category, and don't present their content as real generated study material.

`SourcesPage`'s drag-and-drop upload zone is the same kind of preview: it simulates the `documents` status pipeline (`UPLOADED → PARSING → CHUNKING → EMBEDDING → EXTRACTING → RESOLVING → READY`, matching `SourceFile['status']` in `src/types/course.ts`) with `setTimeout`, not a real call to `graphite-rest`'s `POST /api/v1/courses/{course_id}/documents`.
