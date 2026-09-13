# graphite — UI / Frontend Build Specification

> **Purpose:** This document is intended to be pasted into Claude Code as the primary frontend build brief for the `graphite` hackathon project.
>
> **Goal:** Build the website from bare bones into a locally runnable React application with a polished, interactive UI that communicates graphite's core idea: **a navigation system for learning**.
>
> **Primary experience:** A student uploads course materials, enters a learning goal and time budget, and receives an evidence-backed, traversable learning path generated from a knowledge graph.
>
> **Product feeling:** Calm, tactile, intelligent, premium, academic, exploratory, and memorable — not a generic AI dashboard, LMS, or chatbot clone.

---

# 1. Product Summary

`graphite` turns a student's scattered course materials into an evidence-backed knowledge graph and computes a goal-specific route through that graph.

The core product flow is:

1. User opens a course workspace.
2. User uploads PDFs, DOCX, TXT, or Markdown notes.
3. Uploaded materials are processed and converted into graph concepts and relationships.
4. User enters a study objective such as:
   - "I have 90 minutes to study Units 1–3."
   - "My exam is tomorrow and I struggle with recursion."
5. graphite determines:
   - which concepts matter,
   - which concepts are prerequisites,
   - which order makes the most sense,
   - how much time to spend on each,
   - and which source supports each recommendation.
6. The user traverses a winding visual learning route.
7. Each step can expose:
   - source-grounded explanation,
   - flashcards,
   - practice questions,
   - citations,
   - optional ElevenLabs narration.
8. In a later iteration, the path may adapt and reroute based on mastery or quiz results.

The central product promise is:

> **Tell graphite where you need to go and how much time you have. graphite maps the concepts and finds the shortest sensible route through your own course material.**

The UI must visually communicate that the graph is functional, not decorative.

---

# 2. Frontend Technical Setup

## 2.1 Required stack

Use:

- **React**
- **TypeScript**
- **Vite**
- **Tailwind CSS**
- **React Router**
- **Lucide React** for icons
- **Framer Motion** for UI transitions and route animations
- **React Flow** for the secondary full knowledge-map view
- Native SVG for the primary winding learning route

Optional:

- `clsx`
- `tailwind-merge`
- `@radix-ui/*` or shadcn primitives if useful
- `zustand` only if shared state becomes complex

Do not introduce a large UI framework unless necessary.

---

## 2.2 Local development requirements

The frontend must run locally with:

```bash
npm install
npm run dev
```

Expected development URL:

```text
http://localhost:5173
```

Do not require authentication or cloud deployment for the MVP.

Environment variables should live in:

```text
.env.local
```

Create:

```text
.env.example
```

Example:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

The frontend should communicate only with the local backend.

---

## 2.3 Recommended project structure

```text
graphite/
└── apps/
    └── web/
        ├── src/
        │   ├── app/
        │   │   ├── App.tsx
        │   │   ├── router.tsx
        │   │   └── providers.tsx
        │   │
        │   ├── components/
        │   │   ├── layout/
        │   │   │   ├── AppShell.tsx
        │   │   │   ├── LeftSidebar.tsx
        │   │   │   ├── RightStudyRail.tsx
        │   │   │   └── MobileBottomNav.tsx
        │   │   │
        │   │   ├── route/
        │   │   │   ├── LearningRoute.tsx
        │   │   │   ├── RouteNode.tsx
        │   │   │   ├── RoutePathSvg.tsx
        │   │   │   ├── RouteBranch.tsx
        │   │   │   ├── ScrollProgressHint.tsx
        │   │   │   └── RouteMiniMap.tsx
        │   │   │
        │   │   ├── graph/
        │   │   │   ├── KnowledgeMap.tsx
        │   │   │   ├── ConceptNode.tsx
        │   │   │   └── EdgeLegend.tsx
        │   │   │
        │   │   ├── study/
        │   │   │   ├── StudyDrawer.tsx
        │   │   │   ├── LessonPanel.tsx
        │   │   │   ├── FlashcardStack.tsx
        │   │   │   ├── PracticePanel.tsx
        │   │   │   ├── CitationPill.tsx
        │   │   │   └── AudioPlayer.tsx
        │   │   │
        │   │   ├── uploads/
        │   │   │   ├── UploadDropzone.tsx
        │   │   │   ├── SourceList.tsx
        │   │   │   └── IngestionStatus.tsx
        │   │   │
        │   │   └── ui/
        │   │       ├── Button.tsx
        │   │       ├── Badge.tsx
        │   │       ├── Tabs.tsx
        │   │       ├── Drawer.tsx
        │   │       └── Tooltip.tsx
        │   │
        │   ├── pages/
        │   │   ├── HomePage.tsx
        │   │   ├── CoursePage.tsx
        │   │   ├── MapPage.tsx
        │   │   ├── SourcesPage.tsx
        │   │   ├── StudyPage.tsx
        │   │   └── SettingsPage.tsx
        │   │
        │   ├── data/
        │   │   └── mockCourse.ts
        │   │
        │   ├── hooks/
        │   │   ├── useScrollRouteProgress.ts
        │   │   └── useActiveRouteNode.ts
        │   │
        │   ├── lib/
        │   │   ├── api.ts
        │   │   ├── routeLayout.ts
        │   │   └── cn.ts
        │   │
        │   ├── styles/
        │   │   ├── globals.css
        │   │   └── paper-texture.css
        │   │
        │   ├── types/
        │   │   ├── graph.ts
        │   │   ├── course.ts
        │   │   └── study.ts
        │   │
        │   └── main.tsx
        │
        ├── public/
        │   └── textures/
        │       └── README.md
        │
        ├── index.html
        ├── package.json
        ├── tailwind.config.ts
        ├── tsconfig.json
        └── vite.config.ts
```

---

# 3. Core Design Concept

The UI should be built around the mental model:

> **Google Maps for learning.**

The user has:

- a **destination** = exam / concept / learning objective,
- a **current location** = their stated weakness or mastery,
- **roads** = concept dependencies,
- a **route** = ordered learning path,
- **traffic constraints** = limited study time,
- **rerouting** = plan changes after a diagnostic or changed time budget.

The interface should make this metaphor understandable without literally imitating Google Maps.

---

# 4. Visual Direction

## 4.1 Overall tone

The website should feel:

- premium,
- intelligent,
- tactile,
- calm,
- exploratory,
- slightly analog,
- modern,
- academic without feeling institutional,
- visually memorable enough for live hackathon judging.

Avoid:

- generic SaaS dashboards,
- bright purple AI gradients everywhere,
- excessive glassmorphism,
- childish gamification,
- giant card grids,
- a ChatGPT clone,
- dense LMS interfaces,
- cyberpunk/neon visual language.

---

## 4.2 Main background

The primary application background should be an **off-white warm paper color**.

Suggested base:

```css
#F5F1E8
```

Alternative:

```css
#F3EFE5
```

The background should have a **subtle crumpled / fibrous paper texture**.

Do not use a loud photo texture.

Preferred implementation:

1. Warm off-white base color.
2. Very subtle CSS noise overlay using:
   - layered radial gradients,
   - translucent repeating gradients,
   - optional low-opacity SVG noise filter.
3. Add faint irregular tonal patches to create the feeling of paper.
4. Keep opacity low enough that text remains highly readable.

The paper background should feel like:
- sketchbook paper,
- a lightly crumpled notebook sheet,
- textured stationery.

It should NOT look:
- dirty,
- stained,
- vintage parchment,
- grunge.

The route should appear almost like it has been drawn across the paper.

---

## 4.3 Primary palette

Base background:

```text
Paper:        #F5F1E8
Paper Dark:   #E9E3D8
Ink:          #1D1D1B
Ink Soft:     #5D5B55
Border:       #D6D0C5
```

Pick one accent color as the main active-route color.

Suggested options:

```text
Deep Graphite Blue: #4056A1
Muted Forest:       #496B55
Burnt Terracotta:   #B86646
Deep Plum:          #66506D
```

Recommended initial choice:

```text
Accent: #4056A1
```

Use accent sparingly for:

- active route segment,
- current node,
- primary buttons,
- selected navigation,
- focus states.

Use softer neutral tones elsewhere.

---

## 4.4 Typography

Use clean modern typography.

Recommended:

- **Inter**
- **Geist**
- **Manrope**
- **DM Sans**

Use a subtle serif only if it enhances the paper/editorial aesthetic.

Possible pairing:

- Headings: `DM Sans` or `Geist`
- Optional small editorial labels: `Lora`
- Body: `Inter`

Avoid decorative fonts.

---

# 5. Global App Layout

Desktop-first.

The main desktop layout should have **three vertical zones**:

```text
┌────────────────────────────────────────────────────────────────────┐
│ LEFT SIDEBAR │         MAIN LEARNING CANVAS        │ RIGHT RAIL    │
│              │                                      │               │
│ Navigation   │      winding path / graph            │ Flashcards    │
│ Sources      │                                      │ Study tools   │
│ Courses      │                                      │               │
│              │                                      │               │
└────────────────────────────────────────────────────────────────────┘
```

Suggested widths:

```text
Left sidebar:   220–250px
Main content:   flexible
Right rail:     300–340px
```

The left sidebar may be collapsible.

The right rail may collapse into a drawer on smaller screens.

The main canvas must remain visually dominant.

---

# 6. Left Sidebar

The left sidebar is for **site navigation and workspace navigation**.

It should feel calm and integrated into the paper UI.

Do not make it look like a heavy dark admin sidebar.

Use a slightly different paper tone or low-opacity panel background.

Suggested structure:

```text
graphite
────────────────

COURSE
CS 4348
Operating Systems

NAVIGATION
● Learning Path
○ Knowledge Map
○ Sources
○ Study Materials

TOOLS
○ Flashcards
○ Practice
○ Audio

────────────────
Settings
```

Navigation destinations:

## Learning Path

Route:

```text
/course/:courseId/path
```

Default page.

## Knowledge Map

Route:

```text
/course/:courseId/map
```

Full React Flow graph.

## Sources

Route:

```text
/course/:courseId/sources
```

Uploaded files and ingestion states.

## Study Materials

Route:

```text
/course/:courseId/materials
```

Generated summaries, flashcards, and questions.

## Settings

Route:

```text
/settings
```

For MVP, simple placeholder settings are enough.

Selected navigation state:

- soft background highlight,
- slightly darker text,
- small accent dot or line,
- no giant pills.

---

# 7. Right Sidebar / Study Rail

The right sidebar should be more contextual.

Its main purpose is to support **flashcards and quick study tools** without pulling the user away from the learning route.

Default title:

```text
Study Deck
```

The right rail changes based on active concept.

Example:

```text
STUDY DECK

Process States
8 cards

┌───────────────────────┐
│ What are the five     │
│ primary process       │
│ states?               │
│                       │
│      Reveal →         │
└───────────────────────┘

1 / 8

[ Previous ] [ Next ]

────────────────

Quick actions

▶ Listen
? Practice
↗ Open full lesson
```

Flashcard behavior:

- Only one card shown prominently at a time.
- Card should have a tactile paper-card appearance.
- Clicking flips or reveals the answer.
- Smooth 3D-ish flip is okay, but keep it subtle.
- Allow next / previous navigation.
- Keep card controls accessible with buttons.
- Keyboard arrows may navigate cards if focus is inside the rail.

When no concept is selected:

```text
Select a concept on your learning path to view its study deck.
```

Do not show empty fake data.

---

# 8. Main Learning Path Page

This is the most important page in the application.

Route:

```text
/course/:courseId/path
```

The page should have three zones:

1. compact header,
2. winding route,
3. persistent bottom scroll cue.

---

# 9. Learning Path Header

At the top of the central canvas:

```text
CS 4348 · Operating Systems

Exam 1 Study Route

90 minutes available
12 concepts
4 completed

Goal
“Study Units 1–3 before tomorrow's exam.”
```

The header should not be oversized.

Include:

- course,
- active goal,
- time budget,
- route progress,
- Path / Map toggle.

Example:

```text
Path    Map
────
```

The Path tab is the default.

Avoid dashboard-style KPI boxes.

Use compact text and subtle progress indicators instead.

---

# 10. The Winding Traversal Route

The main visual should NOT be:

```text
●
│
●
│
●
```

Instead, concept nodes should move left and right across the central canvas.

Example:

```text
                         ●
                  Process Basics
                        ╲
                         ╲
                            ●
                      Process States
                         CURRENT
                            ╱
                           ╱
             ●
      Context Switching
             ╲
              ╲
                    ●
             CPU Scheduling
                    ╱
                   ╱
              ●
          Round Robin
```

The route should feel like the student is **traversing through the material**.

Use a smooth SVG path.

Do not use hard straight-line zigzags.

Use Bezier curves.

The path should feel organic and editorial.

---

# 11. Route Geometry

Build route positions from a layout function.

Each node should receive normalized coordinates:

```ts
type RoutePoint = {
  id: string;
  x: number;
  y: number;
};
```

Example layout:

```ts
[
  { x: 0.52, y: 0 },
  { x: 0.72, y: 320 },
  { x: 0.30, y: 660 },
  { x: 0.62, y: 1010 },
  { x: 0.40, y: 1360 },
  { x: 0.73, y: 1710 },
]
```

The vertical spacing between nodes should generally be:

```text
260–380px
```

Vary spacing slightly.

Do not alternate with perfect symmetry.

Route behavior should feel organic rather than algorithmically zigzagged.

Clamp node positions so labels never overlap sidebars.

---

# 12. Scroll-Driven Route Reveal

The route should visually **expand as the user scrolls**.

This is a major interaction.

Initial viewport:

```text
        ✓
         ╲
          ● CURRENT
           ╲
            ○

        Scroll to continue ↓
```

As the user scrolls:

1. More route nodes come into view.
2. The connecting route appears to continue downward.
3. The active route line fills behind the user.
4. New labels fade in.
5. Current node changes based on viewport or completion state.

Use either:

- `IntersectionObserver`,
- Framer Motion `useScroll`,
- or both.

Do not trigger major layout changes merely because a node enters the viewport.

---

# 13. Scroll Sign at Bottom

At the bottom of the visible canvas, show a small persistent visual cue.

Example:

```text
        Continue your route

              ↓

            scroll
```

Preferred design:

- small handwritten-style arrow or elegant chevron,
- subtle vertical bouncing motion,
- label such as:
  - "Continue your route"
  - "Explore your path"
  - "Scroll to continue"

The animation should be restrained.

When the user has scrolled significantly:

- reduce opacity,
- or hide the cue.

At the final route node, replace it with:

```text
Route complete
```

or:

```text
Ready for final review
```

---

# 14. Route Line Animation

The route has two visual layers:

## Base path

Full route:

```text
soft gray / paper-gray stroke
```

## Completed / active path

An accent-colored stroke drawn on top.

As the user progresses:

```text
completed section = accent
future section = muted gray
```

Use an SVG path.

Suggested technique:

- `stroke-dasharray`
- `stroke-dashoffset`
- or Framer Motion `pathLength`

Progress may be tied to:

- actual completed nodes,
- scroll position,
- or a hybrid.

For demo polish:

- route line can partially reveal with scroll,
- completion state controls the stronger accent.

---

# 15. Node Design

Four required node states:

## 15.1 Completed

```text
✓
Process Fundamentals
```

Appearance:

- filled small circle,
- checkmark,
- muted label,
- minimal metadata.

---

## 15.2 Current

Largest node.

Example:

```text
        ●

PROCESS STATES

Current step · 8 min

Understand how a process moves
between execution states.

[ Start lesson ] [ ▶ Listen ]
```

Current state should have:

- slightly larger circular node,
- thin accent ring,
- subtle shadow,
- optional one-time glow animation,
- no constant pulsing.

---

## 15.3 Upcoming

Example:

```text
○ Context Switching
  14 min
```

Appearance:

- hollow circle,
- muted text,
- reduced visual weight.

---

## 15.4 Review / AI-added reinforcement

Example:

```text
◌ PCB Review
  Added to reinforce prerequisite · 6 min
```

Appearance:

- dashed or dotted ring,
- different neutral tone,
- small label:
  `Added to your route`

This should be visually distinct from regular route nodes.

---

# 16. Node Interaction

Clicking any node should:

1. mark it selected,
2. update the right rail,
3. optionally open a detail panel or expand the node,
4. highlight relevant path relationships.

Do not automatically navigate away.

Hover may show:

```text
3 sources
8 min
Review
```

But every important action must also work on click/tap.

---

# 17. Expanded Node Card

Only one node at a time should be expanded in the main route.

Example:

```text
PROCESS STATES

8 min · Learn

Processes move between five core states...

Why this now?
You need Process States before Context Switching.

Sources
[ Lecture 2 · p. 7 ]
[ Unit 1 Notes ]

[ Start lesson ]
[ ▶ Listen ]
[ Why this? ]
```

Do not attach full cards to every node.

The route should remain visually clean.

---

# 18. Branching

Support occasional route branches.

Example:

```text
                    ● CPU Scheduling
                     /            \
                    /              \
                 ○ FCFS           ○ SJF
                    \              /
                     \            /
                     ○ Round Robin
```

Branches should only appear when graph relationships genuinely support them.

Design guideline:

```text
~80% single route
~20% branches
```

Do not produce a spiderweb.

---

# 19. Path / Map View Toggle

The route page should have:

```text
Path | Map
```

## Path

Answers:

> What should I do next?

## Map

Answers:

> How does everything connect?

The Map tab can either navigate to `/map` or switch views in place.

---

# 20. Full Knowledge Map

Use React Flow.

Do not render the entire graph with random force-directed physics.

Use an intentional layout.

Recommended:

- top-to-bottom,
- or left-to-right hierarchical.

Nodes should show:

```text
Concept name
Concept type
Mastery / status
```

Clicking a node opens source-backed details.

Clicking an edge shows:

- relationship type,
- confidence,
- rationale,
- source evidence.

---

# 21. Map Edge Types

Show a small legend.

Supported relationship types include:

- REQUIRES
- PART_OF
- EXAMPLE_OF
- CONTRASTS_WITH
- APPLIED_IN
- DERIVED_FROM
- RELATED_TO

However, avoid rendering seven highly different colors.

For the MVP:

## Hard prerequisite

`REQUIRES` / `DERIVED_FROM`

- solid stroke,
- stronger contrast.

## Supporting / semantic relation

other relations

- softer stroke,
- optional dash pattern.

Low-confidence edge:

- lower opacity,
- dashed.

Color must not be the only indicator.

---

# 22. Prerequisite Highlight Interaction

When a user selects a concept such as:

```text
Round Robin
```

Fade unrelated concepts.

Highlight:

```text
Processes
    ↓
Process States
    ↓
CPU Scheduling
    ↓
Round Robin
```

The user should visually understand:

> These are the concepts required to get here.

This should be one of the key judge-demo interactions.

---

# 23. Bottom Objective Composer

The user should always have a way to create or change the study objective.

Possible location:

- bottom of main page,
- or top under the route title.

Example:

```text
What are you studying for?

┌────────────────────────────────────────────┐
│ I have an exam tomorrow covering Units    │
│ 1–3 and I struggle with scheduling...     │
└────────────────────────────────────────────┘

Available time
[ 90 ] minutes

[ Build my route ]
```

Do not rely on extracting time from the user's text.

Use a numeric time control.

---

# 24. Upload / Empty State

Before a course graph exists:

```text
Turn your notes into a path.

Upload what your class actually gave you.
Tell graphite where you're trying to go.
We'll map the concepts and find the shortest sensible route.

┌───────────────────────────────┐
│                               │
│ Drop course files here        │
│                               │
│ PDF · DOCX · TXT · Markdown   │
│                               │
└───────────────────────────────┘
```

After files are uploaded, show processing state.

---

# 25. Ingestion Status

Represent ingestion with stage labels, not fake percentages.

Example:

```text
Lecture1.pdf
✓ Ready

Unit2.pdf
Embedding...

ExamReview.md
Extracting concepts...
```

Supported stages:

```text
UPLOADED
PARSING
CHUNKING
EMBEDDING
EXTRACTING
RESOLVING
READY
FAILED
```

Completed files remain visible while others process.

---

# 26. Sources Page

Route:

```text
/course/:courseId/sources
```

Show:

- file name,
- file type,
- page count if available,
- ingestion status,
- date added,
- retry action if failed.

Clicking a file opens a compact details panel.

No need to build a full document editor.

---

# 27. Study Mode

Route:

```text
/study/:stepId
```

Or use a drawer from the route.

Focus on **one concept at a time**.

Structure:

```text
Process States

Objective
Understand the five core process states.

LEARN | PRACTICE | RECALL
```

## Learn

- short explanation,
- key points,
- common confusion,
- citations.

## Practice

- 2–5 questions,
- self-check,
- answer explanation.

## Recall

- flashcards.

Do not show all three simultaneously.

---

# 28. ElevenLabs Audio UI

Audio should feel like a real part of the product.

Custom component:

```text
AUDIO LESSON

▶ ━━━━━━━●━━━━━━━━━━━━ 2:14 / 4:38

Process States

1x        Transcript
```

Required:

- play,
- pause,
- seek,
- duration,
- transcript or source text access.

If narration is unavailable:

```text
Narration unavailable. Continue in text mode.
```

Never block studying because audio failed.

---

# 29. Right-Rail Flashcard Design

Flashcard visual:

```text
┌───────────────────────────────┐
│ PROCESS STATES                │
│                               │
│ What happens when a process   │
│ is waiting for I/O?           │
│                               │
│                               │
│          Reveal answer        │
└───────────────────────────────┘
```

After reveal:

```text
The process moves into the waiting/blocked state until...
```

Show citation beneath:

```text
Lecture 2 · p. 7
```

Add:

```text
← 2 / 8 →
```

Optional mastery buttons:

```text
Again
Got it
```

Only add if time allows.

---

# 30. Evidence / Citation Design

Every important generated statement should visually expose provenance.

Use compact evidence pills:

```text
Lecture 3 · p. 12
```

Clicking should open:

```text
Source preview

Lecture 3 · page 12

“...excerpt from course material...”
```

The user should never need to wonder:

> Where did graphite get this?

---

# 31. "Why This?" Interaction

Each route step has:

```text
Why this?
```

Example result:

```text
CPU Scheduling appears here because Process States
is a prerequisite and you already completed it.

Supported by:
Lecture 3 · p. 9
Lecture 4 · p. 2
```

This is critical to differentiate graphite from generic study-plan generation.

---

# 32. Adaptive Reroute Interaction

Future/P1 behavior:

Original route:

```text
● Process States
 ╲
  ○ Context Switching
```

After a weak diagnostic:

```text
● Process States
 ╲
  ◌ PCB Review
     ╲
      ○ Context Switching
```

Animate the new node into the route.

Show:

```text
Your path changed.

We added a 6-minute PCB review because
your diagnostic showed a prerequisite gap.
```

This should be designed now even if backend rerouting is initially mocked.

---

# 33. Main Page Scroll Experience

The learning route should be long enough to encourage traversal.

Do NOT place it inside a short internal scroll container.

Use the natural page scroll.

As the user scrolls:

1. Header scrolls away or becomes compact/sticky.
2. Left navigation can stay sticky.
3. Right study rail can stay sticky.
4. Main route keeps extending downward.
5. Route path visually draws.
6. Active node changes.
7. Bottom scroll hint fades after initial movement.

Do not lock page height to `100vh`.

---

# 34. Sticky Behavior

Desktop:

```text
Left sidebar:
position: sticky;
top: 0;

Right rail:
position: sticky;
top: 24px;
```

Main learning canvas:

natural document flow.

Do not make all three columns separately scrollable.

That will make the experience feel fragmented.

---

# 35. Subtle Paper UI Details

To support the paper concept:

- cards may have slightly warm backgrounds,
- borders may resemble graphite-pencil linework,
- route stroke can look slightly imperfect,
- selected node may resemble a drawn annotation,
- tiny labels can use uppercase letter spacing,
- shadows should be soft and diffuse.

Optional subtle details:

- faint hand-drawn squiggle near section labels,
- lightly irregular circle edges,
- micro-texture inside cards.

Do NOT make the UI literally hand-drawn or messy.

The app must still feel modern and engineered.

---

# 36. Motion Guidelines

Use motion to clarify state.

Good motion:

- route drawing,
- card reveal,
- node selection,
- drawer slide,
- flashcard flip,
- branch highlighting,
- reroute insertion.

Avoid:

- constant floating,
- constant pulsing,
- huge spring effects,
- bouncing every element,
- confetti everywhere.

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

---

# 37. Loading States

The app must never appear frozen.

Examples:

## Route generation

```text
Mapping concepts...
Finding prerequisites...
Fitting route to 90 minutes...
Building your study path...
```

These may update sequentially.

## Graph extraction

Show document-specific stages.

Never show fake precision like:

```text
73%
```

unless the backend provides real progress.

---

# 38. Error States

Every failure should tell the user:

1. what happened,
2. what they can do next.

Examples:

```text
We couldn't extract text from this PDF.

Try exporting it as a text-searchable PDF.
```

```text
No relevant concepts were found for this goal.

Try broadening the unit range or selecting more source files.
```

```text
Audio is unavailable.

You can continue this lesson in text mode.
```

No dead ends.

---

# 39. Responsive Behavior

Desktop is the main hackathon demo target.

## Desktop

Three-column shell.

## Tablet

Left sidebar collapses to icons.
Right rail becomes a narrower panel.

## Mobile

- left sidebar becomes bottom navigation or drawer,
- right rail becomes bottom sheet,
- winding path remains the primary view,
- node x-offsets become smaller,
- labels stay readable.

Do not attempt a complex three-column mobile layout.

---

# 40. Accessibility

Required:

- all buttons keyboard accessible,
- visible focus states,
- color is not the only state indicator,
- route graph also exists in accessible list form,
- flashcards usable without hover,
- audio has equivalent text,
- reduced motion respected,
- minimum interactive target ~44px.

---

# 41. Mock Data for Initial Frontend

Before backend integration, create local mock data.

Example:

```ts
export const mockRoute = [
  {
    id: "process-basics",
    name: "Process Fundamentals",
    status: "complete",
    minutes: 10,
    activityType: "LEARN",
    sourceCount: 2
  },
  {
    id: "process-states",
    name: "Process States",
    status: "active",
    minutes: 8,
    activityType: "LEARN",
    sourceCount: 3
  },
  {
    id: "pcb",
    name: "Process Control Block",
    status: "todo",
    minutes: 7,
    activityType: "REVIEW",
    sourceCount: 2
  },
  {
    id: "context-switching",
    name: "Context Switching",
    status: "todo",
    minutes: 14,
    activityType: "LEARN",
    sourceCount: 2
  },
  {
    id: "cpu-scheduling",
    name: "CPU Scheduling",
    status: "todo",
    minutes: 18,
    activityType: "LEARN",
    sourceCount: 4
  },
  {
    id: "round-robin",
    name: "Round Robin",
    status: "todo",
    minutes: 12,
    activityType: "PRACTICE",
    sourceCount: 2
  }
];
```

Use this mock route to build the entire UI before API integration.

---

# 42. Required Demo State

Create a predefined local demo course:

```text
CS 4348
Operating Systems
Exam 1
90 minutes available
```

Goal:

```text
I have an exam tomorrow covering Units 1–3.
I want to focus on processes and CPU scheduling.
```

Files:

```text
Lecture 1.pdf
Processes.md
Scheduling.pdf
```

The frontend should be able to load this mocked state instantly for visual development.

---

# 43. Main Demo Story

The frontend should support this live-judging sequence:

1. Open graphite.
2. Show uploaded sources.
3. Enter:
   ```text
   I have 90 minutes to prepare for Exam 1 and I struggle with CPU scheduling.
   ```
4. Click:
   ```text
   Build my route
   ```
5. Show winding learning path.
6. Highlight:
   ```text
   Process States
   ```
7. Click:
   ```text
   Why this?
   ```
8. Show prerequisite explanation and source evidence.
9. Open flashcard in right rail.
10. Click Listen to demonstrate ElevenLabs.
11. Switch:
    ```text
    Path → Map
    ```
12. Click Round Robin.
13. Fade unrelated nodes and highlight prerequisite chain.
14. Optional:
    show adaptive reroute inserting a review node.

The entire UI should be designed around making this flow clear in under two minutes.

---

# 44. Design Principle Checklist

Every screen should answer at least one:

```text
What should I do next?
Why am I doing this?
How does this connect?
Where did this come from?
How much time will this take?
```

If a component answers none of these, question whether it belongs in the MVP.

---

# 45. First Build Order

Build in this exact order.

## Phase 1 — App shell

Implement:

- Vite + React + TypeScript,
- Tailwind,
- React Router,
- global typography,
- paper background,
- left sidebar,
- right study rail,
- responsive three-column layout.

Goal:

```text
npm run dev
```

produces a polished shell on localhost.

---

## Phase 2 — Winding route

Implement:

- mock route data,
- native SVG curved path,
- concept nodes,
- left/right node layout,
- route scroll height,
- current/completed/upcoming states.

This is the most important visual milestone.

---

## Phase 3 — Scroll interaction

Implement:

- scroll-driven path reveal,
- active-node detection,
- bottom scroll hint,
- progress line.

---

## Phase 4 — Node details

Implement:

- node selection,
- expanded current concept,
- right rail update,
- Why This panel,
- source pills.

---

## Phase 5 — Flashcards

Implement:

- right-rail deck,
- reveal/flip,
- previous/next.

---

## Phase 6 — Map view

Add React Flow.

Implement:

- node click,
- edge click,
- prerequisite highlight,
- path/map toggle.

---

## Phase 7 — Upload and objective flows

Implement:

- file drop zone,
- mock ingestion statuses,
- goal composer,
- time input,
- Build My Route action.

---

## Phase 8 — Backend wiring

Replace mock data with API calls.

Keep UI state shape as close as possible to backend DTOs.

---

# 46. API Shapes the UI Should Expect

Example route data:

```ts
type StudyStep = {
  id: string;
  position: number;
  conceptId: string;
  conceptName: string;
  allocatedMinutes: number;
  activityType: "LEARN" | "REVIEW" | "PRACTICE" | "CHECK";
  reason: string;
  status: "TODO" | "ACTIVE" | "COMPLETE" | "SKIPPED";
  citations: Citation[];
};

type Citation = {
  chunkId: string;
  documentId: string;
  label: string;
  excerpt: string;
};
```

Graph:

```ts
type GraphNode = {
  id: string;
  name: string;
  type: "CONCEPT" | "SKILL" | "FORMULA" | "PROCESS" | "EXAMPLE";
  description: string;
  importance: number;
  confidence: number;
  sourceCount: number;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  relationType:
    | "REQUIRES"
    | "PART_OF"
    | "EXAMPLE_OF"
    | "CONTRASTS_WITH"
    | "APPLIED_IN"
    | "DERIVED_FROM"
    | "RELATED_TO";
  confidence: number;
  rationale: string;
  evidence: Citation[];
};
```

---

# 47. Non-Negotiable UI Requirements

Do not remove:

- winding visual route,
- route-to-map distinction,
- evidence citations,
- time budget,
- source visibility,
- Why This explanation,
- left navigation,
- contextual right flashcard rail,
- scroll-driven exploration,
- off-white tactile paper background.

Do not replace the main path with a generic vertical stepper.

Do not replace the whole product with a chat interface.

Chat may exist as a secondary helper later.

---

# 48. Product Copy Suggestions

Homepage:

```text
Turn your notes into a path.
```

Supporting:

```text
Upload what your class actually gave you.
Tell graphite where you're trying to go and how much time you have.
We'll map the concepts and find the shortest sensible route.
```

Goal composer:

```text
Where are you trying to get?
```

Placeholder:

```text
I have an exam tomorrow covering Units 1–3 and I struggle with recursion...
```

Primary CTA:

```text
Build my route
```

Current node:

```text
You're here
```

Prerequisite:

```text
Why this comes first
```

Source area:

```text
From your course
```

Scroll cue:

```text
Continue your route
```

Final node:

```text
Destination reached
```

---

# 49. Final UI Goal

The screenshot someone remembers should look like:

```text
warm textured paper canvas

        graphite sidebar

                    ✓
                    ╲
                     ╲
                        ●
                 Process States
                    YOU'RE HERE
                       ╱
                      ╱
            ○
       Context Switching
              ╲
               ╲
                    ○
              CPU Scheduling


                            flashcard rail
```

The path should visually communicate motion, direction, and progress.

The user should feel that they are not browsing notes.

They are **traveling through a route toward understanding**.

That is the central design concept.

---

# 50. Claude Code Execution Instruction

When implementing from this specification:

1. Begin with the frontend shell and mock data.
2. Make the localhost experience visually complete before backend wiring.
3. Use reusable components and TypeScript types.
4. Keep the winding learning route as the visual priority.
5. Do not overbuild secondary pages before the core route feels excellent.
6. Ensure `npm install && npm run dev` works from the frontend directory.
7. Avoid placeholder controls that do nothing.
8. If a backend endpoint is unavailable, preserve the UI using mock adapters rather than breaking the flow.
9. Keep source/evidence structures in the component model from day one.
10. Optimize for a polished two-minute hackathon demo first, then completeness.
