# I Ching App

A desktop-first React application for exploring I Ching and Tarot cards, placing cards on an infinite canvas, organizing labels, and saving readings.

## Features

- I Ching master-card data and Tarot deck support
- Random and ordered deck modes
- Drag-and-drop card drawing on a canvas
- Card notes, labels, and label groups
- Import/export of canvas files
- Saved canvases with Supabase persistence
- Supabase authentication and real-time updates
- Versioned master-data synchronization

## Tech stack

- React 19, TypeScript, and Vite
- Tailwind CSS 4 with shadcn/ui and Base UI primitives
- Supabase Auth, PostgreSQL, and Realtime
- Firebase Hosting for static frontend deployment only

## Architecture

```text
Browser
  -> React + Vite
      -> Supabase Auth
      -> Supabase PostgreSQL / Realtime

Firebase Hosting serves the built `dist/` directory and rewrites routes to `index.html`.
```

## Prerequisites

- Node.js 18 or newer
- npm
- A Supabase project for authenticated persistence
- Firebase CLI only when deploying to Firebase Hosting

## Environment variables

Create `.env.local` from `.env.example`:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The browser uses the publishable/anonymous Supabase key. Keep service-role credentials out of client code and local files that could be committed.

## Installation and development

```bash
npm install
npm run dev
```

The Vite server listens on port 3000 by default.

## Build, preview, test, and type-check

```bash
npm run build
npm run preview
npm test
npm run lint
```

`npm run lint` runs TypeScript with `tsc --noEmit`.

## Deployment

```bash
npm run build
firebase deploy
```

Firebase is used for static hosting only; authentication and application data remain in Supabase.

## Supabase data model

- `iching_cards_master`: I Ching card metadata and content
- `label_groups` and `labels`: user-managed label taxonomy
- `canvases`: working and saved canvas metadata, notes, and file metadata
- `canvas_cards`: card positions, labels, draw order, and card state for each canvas
- `random_decks` and `random_deck_cards`: random-deck state and card locations
- `app_cache`: master-data version marker used for synchronization
- `auto_draw_runs`: metadata for automated drawing runs

Database migrations live in `supabase/migrations/`. Apply them with the Supabase CLI or your normal migration workflow before using a fresh project.

## Legacy master-data import

The one-off importer is retained for environments that still need to migrate JSONL exports:

```bash
npm run import:legacy-master-data -- --dir "C:\path\to\legacy-jsonl"
```

It requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment. Remove or rotate the service-role key after the migration; never expose it to the browser.

## Project structure

```text
src/                 Application pages, features, assets, and domain types
components/          Shared UI primitives (including shadcn/Base UI)
lib/                  Shared UI utilities
scripts/              Data migration utilities
supabase/migrations/  PostgreSQL schema, RLS, and RPC migrations
docs/                 Feature and data-model notes
firebase.json         Firebase Hosting configuration
```

## Security notes

- Do not commit `.env.local`, service-role keys, or other secrets.
- `VITE_SUPABASE_ANON_KEY` is a browser-visible client credential; access control must come from Supabase Auth and row-level security policies.
- Review and apply the SQL migrations before exposing tables through the Supabase Data API.

## License

See the source headers and repository history for licensing information.
