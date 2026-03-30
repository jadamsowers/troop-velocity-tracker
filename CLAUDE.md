# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server with HMR and API proxy
- `npm run build` — TypeScript check + Vite production build
- `npm run lint` — ESLint across the project
- `npm run preview` — Serve the production build locally

No test framework is configured.

## Architecture

This is a React 19 + TypeScript PWA (Vite + vite-plugin-pwa) that tracks BSA Scout advancement toward Eagle rank. It fetches data from the Scouting America API (`api.scouting.org`) and displays each scout's rank progress on a visual timeline.

### Data flow

1. **Auth** (`src/api/auth.ts`) — Stores a JWT Bearer token and unit GUID in localStorage. The token is decoded client-side to extract `userId`/`personGuid`.
2. **API client** (`src/api/scoutingClient.ts`) — Wraps `fetch` calls to the Scouting API. In dev, Vite proxies `/scouting-api` to `https://api.scouting.org` to avoid CORS. Endpoints: roster, ranks, merit badges, profile.
3. **Cache** (`src/api/cache.ts`) — localStorage cache with 1-hour TTL, keyed by unit GUID.
4. **App.tsx** — Orchestrator: loads roster, fans out parallel requests per scout (ranks + merit badges + profile), filters out 18+ and Eagle scouts, then renders `ScoutRow` cards.

### Core logic

`src/logic/advancement.ts` contains all BSA advancement rules:
- **Status engine** (`getStatus`) — Returns `red`/`yellow`/`green` based on: months until 18, velocity (time since last rank), wait-period overdue checks, and merit badge counts. This is the heart of the app.
- **RANK_ORDER** / **WAIT_TIMES** / **MERIT_BADGE_REQUIREMENTS** — BSA rank progression constants.
- **`calculateMissingEagleRequired`** — Checks earned badges against the 13 Eagle-required merit badge buckets (some are OR-choices like "Emergency Preparedness OR Lifesaving").
- **`generateProgressReport`** — Produces a text email body for mailto: links.

### UI components

- **ScoutRow** (`src/components/ScoutRow.tsx`) — The main card component. Renders a time-scaled SVG-like timeline from age 11 to 18, with earned/projected rank milestones, wait-zone stripes, birthday markers, and a "today" line. Includes a merit badge popover and mailto: draft button.
- **Setup** (`src/components/Setup.tsx`) — Token + unit configuration form.
- **ScoutSelectCheckbox** — Checkbox for scout comparison mode.

### Theme system

`src/theme/` — Light/dark mode toggle using CSS custom properties. Colors derive from the official BSA brand palette defined in `bsaPalette.ts`. Theme preference is persisted to localStorage. CSS variables are in `theme.css`.

### Styling

All styles use CSS custom properties (defined in `src/theme/theme.css` and `src/index.css`). Colors reference the BSA palette. Status colors (`--green`, `--yellow`, `--red`) map to `var()` tokens used by scout cards with `color-mix()` for tints. No CSS framework — plain CSS with BEM-ish class names like `scout-card__body`, `scout-timeline__track`.
