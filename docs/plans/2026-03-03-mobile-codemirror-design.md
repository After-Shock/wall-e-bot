# Mobile Layout + CodeMirror + Command Error UX Design

## Goal
Three improvements to the dashboard frontend: (1) mobile-friendly sidebar, (2) visible save errors on custom commands, (3) CodeMirror editor for the response field.

## Architecture

### 1. Mobile Sidebar — Overlay Drawer
- `GuildLayout.tsx` gets a `sidebarOpen` boolean state (default false)
- On `md+` breakpoints, sidebar is always visible (current behaviour)
- On `< md`, sidebar is hidden; a hamburger button appears in the guild header bar
- Tapping hamburger sets `sidebarOpen = true` → renders a fixed overlay drawer from the left + dark semi-transparent backdrop
- Tapping any nav link or the backdrop closes the drawer (`sidebarOpen = false`)
- `Sidebar.tsx` receives an `onClose` prop; calls it after navigation on mobile
- No change to desktop layout

### 2. Custom Command Save Errors + Character Counter
- `createCmd` and `updateCmd` mutations get `onError` handlers that extract the first human-readable message from the Axios error response and store it in local `saveError` state
- Error displayed in red below the Save button
- Error clears on next submission attempt
- Response field gets a live character counter: `{count} / 2000` shown bottom-right of the editor, turns red when ≥ 1900

### 3. CodeMirror 6 Plain-Text Editor
- Install: `@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, `@codemirror/theme-one-dark`
- Replace the `<textarea>` in the response field with a `<CodeMirrorEditor>` wrapper component
- Plain text mode (no language): just the editing UX benefits (line numbers off, word wrap on, proper paste, monospace)
- Editor value syncs to React state via `onChange` callback
- Styled to match the existing dark discord theme (transparent background, no border-radius mismatch)
- Character counter reads from the same state value

## Files Modified
- `dashboard/frontend/src/components/GuildLayout.tsx` — add sidebarOpen state + hamburger button
- `dashboard/frontend/src/components/Sidebar.tsx` — accept onClose prop, call it on mobile link click
- `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx` — onError handlers, saveError display, char counter, CodeMirror
- `dashboard/frontend/package.json` — add CodeMirror 6 dependencies

## Tech Stack
- React 18, TailwindCSS, lucide-react (existing)
- CodeMirror 6: `@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, `@codemirror/theme-one-dark`
