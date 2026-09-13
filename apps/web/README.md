# graphite — web frontend

React + TypeScript + Vite frontend for graphite, described in
[`../../graphite-rest/docs/graphite_ui_frontend_build_spec.md`](../../graphite-rest/docs/graphite_ui_frontend_build_spec.md).

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. It redirects straight into the demo course's
learning path (`/course/cs-4348/path`), built from local mock data in
[`src/data/mockCourse.ts`](src/data/mockCourse.ts) — no backend required yet.

Copy `.env.example` to `.env.local` to point the frontend at a local API once
backend wiring begins.

## Status

- **Phase 1 — App shell:** done. Paper-textured three-column layout, left
  nav, right study rail, mobile bottom nav.
- **Phase 2 — Winding route:** done. SVG bezier learning path with
  complete/current/upcoming/reinforcement node states, driven by mock data.
- Later phases (scroll-driven reveal, node detail panels, flashcards,
  knowledge map, uploads, backend wiring) are not yet implemented — see the
  build spec for the full phase order.

## Stack

React · TypeScript · Vite · Tailwind CSS · React Router · Lucide icons ·
Framer Motion (installed, not yet used) · React Flow (planned for the
knowledge map phase).
