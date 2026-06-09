# iChing Deck Builder & Reader - Architecture & Conventions

## Overview

A desktop-first web application for managing iChing master data, label groups, and drawing cards onto a spread area.

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS 4.
- **UI Components:** shadcn/ui, Lucide React, Motion (for animations).
- **Backend:** Supabase Postgres, Supabase Auth, and Supabase Edge Functions.
- **Hosting:** Firebase Hosting for static deployment only.
- **State Management:** React Hooks (useState, useReducer, useContext) + Supabase Realtime listeners.

## Data Model (Supabase)

### `iching_cards_master`

- `id`: string (e.g., "hexagram-1")
- `number`: number (1-64)
- `vietnameseName`: string
- `englishName`: string
- `link1`: string
- `link2`: string
- `link3`: string
- `content1`: string
- `content2`: string
- `content3`: string
- `imgPath`: string (URL or path to hexagram symbol)

### `label_groups`

- `id`: string
- `name`: string
- `createdAt`: timestamp

### `labels`

- `id`: string
- `name`: string
- `color`: string (optional)

### `spread_cards`

- `id`: string
- `cardId`: string (reference to `iching_cards_master`)
- `x`: number
- `y`: number
- `labels`: string[] (array of label IDs)
- `instanceId`: string (to allow multiple instances of the same card)

## Project Conventions

- **Components:** Functional components with TypeScript.
- **Styling:** Tailwind CSS utility classes.
- **Icons:** Lucide React.
- **Animations:** Motion for drag-and-drop and transitions.
- **Persistence:** All master data and spread state are persisted in Supabase Postgres.
- **Real-time:** Use the Supabase adapter `onSnapshot` wrapper for realtime updates across sessions.

## Key Features

- **Infinite Canvas:** Panning with right-click drag, scrollbars.
- **Deck Modes:**
  - **Random:** Stacked/Fan UI, multiple decks support.
  - **Order:** 64-card grid for direct picking.
- **Interaction:**
  - Left-click for details/edit.
  - Right-click for custom context menu (label assignment).
  - Drag back to deck to remove from canvas.
- **Undo/Redo:** Support for card movements on the canvas.
