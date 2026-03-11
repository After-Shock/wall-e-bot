# Mobile Sidebar + CodeMirror + Command Error UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three dashboard improvements: mobile hamburger sidebar, visible save errors with character counter on custom commands, and a CodeMirror 6 editor for the response field.

**Architecture:** GuildLayout gets `sidebarOpen` state and a hamburger button; Sidebar gets an `onClose` prop called on mobile link clicks; CustomCommandsPage gets `onError` mutation handlers, a `saveError` state display, a `{count}/2000` counter, and a CodeMirror editor replacing the textarea.

**Tech Stack:** React 18, TailwindCSS, lucide-react (existing), CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, `@codemirror/theme-one-dark`)

---

### Task 1: Install CodeMirror 6 Dependencies

**Files:**
- Modify: `dashboard/frontend/package.json`

**Step 1: Add CodeMirror packages**

Run from repo root:
```bash
cd dashboard/frontend && npm install @codemirror/view @codemirror/state @codemirror/commands @codemirror/theme-one-dark
```

**Step 2: Verify packages were added to package.json**

Check `dashboard/frontend/package.json` — you should see four `@codemirror/` entries in `dependencies`.

**Step 3: Commit**

```bash
git add dashboard/frontend/package.json package-lock.json
git commit -m "feat: add CodeMirror 6 dependencies"
```

---

### Task 2: Mobile Sidebar — Modify GuildLayout.tsx

**Files:**
- Modify: `dashboard/frontend/src/components/GuildLayout.tsx`

Current state: `GuildLayout.tsx` renders `<Sidebar />` unconditionally alongside the main content. On mobile, this takes up 256px of the 100vw, breaking layout.

**Step 1: Add imports and state**

At the top of `GuildLayout.tsx`, add `useState` to the React import (it isn't imported yet — currently no React import, just `Outlet`/`useParams`/etc.), and add `Menu` from lucide-react.

Replace:
```tsx
import { Outlet, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Sidebar from './Sidebar';
import { ArrowLeft, Server } from 'lucide-react';
```

With:
```tsx
import { useState } from 'react';
import { Outlet, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Sidebar from './Sidebar';
import { ArrowLeft, Server, Menu } from 'lucide-react';
```

**Step 2: Add sidebarOpen state inside component**

Inside `export default function GuildLayout()`, after the `guild` const, add:
```tsx
const [sidebarOpen, setSidebarOpen] = useState(false);
```

**Step 3: Replace the JSX**

Replace the entire `return (...)` with:
```tsx
  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Desktop Sidebar — always visible on md+ */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Overlay Drawer */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Guild Header */}
        <div className="bg-discord-darker border-b border-discord-dark px-4 md:px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden text-discord-light hover:text-white transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link
              to="/dashboard"
              className="text-discord-light hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              {guild?.icon ? (
                <img
                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                  alt={guild.name}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-discord-dark flex items-center justify-center">
                  <Server className="w-5 h-5 text-discord-light" />
                </div>
              )}
              <div>
                <h1 className="font-semibold text-lg">{guild?.name || <span className="inline-block w-32 h-4 bg-discord-dark rounded animate-pulse" />}</h1>
                <p className="text-sm text-discord-light">Server Dashboard</p>
              </div>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
```

**Step 4: Commit**

```bash
git add dashboard/frontend/src/components/GuildLayout.tsx
git commit -m "feat: add mobile hamburger sidebar overlay to GuildLayout"
```

---

### Task 3: Mobile Sidebar — Modify Sidebar.tsx

**Files:**
- Modify: `dashboard/frontend/src/components/Sidebar.tsx`

Current state: `Sidebar` takes no props; `NavItemComponent` renders links without any close-on-click callback.

**Step 1: Add onClose prop to Sidebar**

The `NavItemComponent` needs to call `onClose` when a NavLink is clicked (on mobile). We'll thread it via context to avoid prop-drilling through the recursive `NavItemComponent`.

At the top of `Sidebar.tsx`, add:
```tsx
import { useState, createContext, useContext } from 'react';
```

Replace:
```tsx
import { useState } from 'react';
```

**Step 2: Add OnCloseContext**

After the imports, before the `NavItem` interface, add:
```tsx
const OnCloseContext = createContext<(() => void) | undefined>(undefined);
```

**Step 3: Call onClose in NavItemComponent's NavLink**

In `NavItemComponent`, find the `NavLink` element (around line 202-218). Update its `onClick`:

Replace:
```tsx
  return (
    <NavLink
      to={item.href}
      end={item.href.split('/').length <= 4}
      className={({ isActive }) =>
        `${baseClasses} ${isActive ? activeClasses : ''}`
      }
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
```

With:
```tsx
  const onClose = useContext(OnCloseContext);

  return (
    <NavLink
      to={item.href}
      end={item.href.split('/').length <= 4}
      onClick={onClose}
      className={({ isActive }) =>
        `${baseClasses} ${isActive ? activeClasses : ''}`
      }
      style={{ paddingLeft: `${12 + depth * 12}px` }}
    >
```

**Step 4: Add onClose prop to Sidebar export and wrap with context**

Replace:
```tsx
export default function Sidebar() {
  const { guildId } = useParams<{ guildId: string }>();

  if (!guildId) {
    return null;
  }

  const navItems = getNavItems(guildId);

  return (
    <aside className="w-64 bg-discord-darker border-r border-discord-dark shrink-0 overflow-y-auto">
      <div className="p-4">
        <h2 className="text-xs font-semibold text-discord-light uppercase tracking-wider mb-4">
          Server Settings
        </h2>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavItemComponent key={item.href} item={item} />
          ))}
        </nav>
      </div>
    </aside>
  );
}
```

With:
```tsx
export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { guildId } = useParams<{ guildId: string }>();

  if (!guildId) {
    return null;
  }

  const navItems = getNavItems(guildId);

  return (
    <OnCloseContext.Provider value={onClose}>
      <aside className="w-64 bg-discord-darker border-r border-discord-dark shrink-0 overflow-y-auto h-full">
        <div className="p-4">
          <h2 className="text-xs font-semibold text-discord-light uppercase tracking-wider mb-4">
            Server Settings
          </h2>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavItemComponent key={item.href} item={item} />
            ))}
          </nav>
        </div>
      </aside>
    </OnCloseContext.Provider>
  );
}
```

**Step 5: Build to verify no TypeScript errors**

```bash
cd dashboard/frontend && node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 6: Commit**

```bash
git add dashboard/frontend/src/components/Sidebar.tsx
git commit -m "feat: add onClose prop to Sidebar for mobile drawer close-on-navigate"
```

---

### Task 4: Custom Commands — Save Error + Character Counter

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`

Current state: `createCmd` and `updateCmd` mutations have no `onError` handler. The textarea has no character counter. Save failures are silent.

**Step 1: Add saveError state**

After line 115 (`const [searchQuery, setSearchQuery] = useState('');`), add:
```tsx
const [saveError, setSaveError] = useState<string | null>(null);
```

**Step 2: Add onError to createCmd**

Replace:
```tsx
  const createCmd = useMutation({
    mutationFn: (data: Partial<CustomCommand>) =>
      api.post(`/api/guilds/${guildId}/custom-commands`, data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });
```

With:
```tsx
  const createCmd = useMutation({
    mutationFn: (data: Partial<CustomCommand>) =>
      api.post(`/api/guilds/${guildId}/custom-commands`, data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to save command.';
      setSaveError(msg);
    },
  });
```

**Step 3: Add onError to updateCmd**

Replace:
```tsx
  const updateCmd = useMutation({
    mutationFn: ({ id, ...data }: Partial<CustomCommand> & { id: number }) =>
      api.patch(`/api/guilds/${guildId}/custom-commands/${id}`, data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });
```

With:
```tsx
  const updateCmd = useMutation({
    mutationFn: ({ id, ...data }: Partial<CustomCommand> & { id: number }) =>
      api.patch(`/api/guilds/${guildId}/custom-commands/${id}`, data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Failed to save command.';
      setSaveError(msg);
    },
  });
```

**Step 4: Clear saveError on submit**

In `saveCommand` function, add `setSaveError(null)` at the top:

Replace:
```tsx
  const saveCommand = () => {
    if (!editingCommand?.name || !editingCommand?.response) return;
```

With:
```tsx
  const saveCommand = () => {
    if (!editingCommand?.name || !editingCommand?.response) return;
    setSaveError(null);
```

**Step 5: Add character counter and error display**

The response textarea is currently at lines 348-356:
```tsx
            <div>
              <label className="block text-sm font-medium mb-2">Response</label>
              <textarea
                value={editingCommand?.response || ''}
                onChange={e => setEditingCommand(prev => prev ? { ...prev, response: e.target.value } : null)}
                className="input w-full h-32 resize-none font-mono text-sm"
                placeholder="Enter the command response..."
              />
            </div>
```

Replace with:
```tsx
            <div>
              <label className="block text-sm font-medium mb-2">Response</label>
              <div className="relative">
                <textarea
                  value={editingCommand?.response || ''}
                  onChange={e => setEditingCommand(prev => prev ? { ...prev, response: e.target.value } : null)}
                  className="input w-full h-48 resize-y font-mono text-sm"
                  placeholder="Enter the command response..."
                />
                <span className={`absolute bottom-2 right-3 text-xs pointer-events-none ${
                  (editingCommand?.response?.length ?? 0) >= 1900 ? 'text-red-400' : 'text-discord-light'
                }`}>
                  {editingCommand?.response?.length ?? 0} / 2000
                </span>
              </div>
            </div>
```

**Step 6: Display saveError below the Save button**

The actions div currently ends at line 453:
```tsx
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowEditor(false);
                setEditingCommand(null);
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={saveCommand}
              disabled={!editingCommand?.name || !editingCommand?.response || createCmd.isPending || updateCmd.isPending}
              className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {createCmd.isPending || updateCmd.isPending ? 'Saving...' : 'Save Command'}
            </button>
          </div>
```

Replace with:
```tsx
          <div className="space-y-2">
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEditor(false);
                  setEditingCommand(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={saveCommand}
                disabled={!editingCommand?.name || !editingCommand?.response || createCmd.isPending || updateCmd.isPending}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {createCmd.isPending || updateCmd.isPending ? 'Saving...' : 'Save Command'}
              </button>
            </div>
            {saveError && (
              <p className="text-sm text-red-400">{saveError}</p>
            )}
          </div>
```

**Step 7: Build check**

```bash
cd dashboard/frontend && node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 8: Commit**

```bash
git add dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx
git commit -m "feat: add save error display and character counter to custom commands editor"
```

---

### Task 5: Replace Textarea with CodeMirror Editor

**Files:**
- Modify: `dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx`

Current state: Response field is a `<textarea>`. We replace it with a CodeMirror 6 editor for better paste/edit UX.

**Step 1: Add CodeMirror imports at top of file**

After the existing imports in `CustomCommandsPage.tsx`, add:
```tsx
import { useRef, useEffect, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
```

Wait — `codemirror` (the meta-package) is not installed; we installed the individual packages. Use:
```tsx
import { useRef, useEffect, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap, lineWrapping } from '@codemirror/view';
```

Note: `lineWrapping` is a compartment/extension exported from `@codemirror/view`.

**Step 2: Replace existing React imports**

Current first line:
```tsx
import { useState, useEffect } from 'react';
```

Replace with:
```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
```

**Step 3: Add CodeMirror view imports at top**

After the React import line, add:
```tsx
import { EditorView, keymap, lineWrapping } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
```

**Step 4: Replace textarea with CodeMirror component**

In the Response field section (from Task 4), replace the `<textarea>` inside `<div className="relative">` with a CodeMirror-powered div. The full Response section should be:

```tsx
            <div>
              <label className="block text-sm font-medium mb-2">Response</label>
              <div className="relative">
                <CodeMirrorEditor
                  value={editingCommand?.response || ''}
                  onChange={value => setEditingCommand(prev => prev ? { ...prev, response: value } : null)}
                />
                <span className={`absolute bottom-2 right-3 text-xs pointer-events-none ${
                  (editingCommand?.response?.length ?? 0) >= 1900 ? 'text-red-400' : 'text-discord-light'
                }`}>
                  {editingCommand?.response?.length ?? 0} / 2000
                </span>
              </div>
            </div>
```

**Step 5: Add CodeMirrorEditor component**

Add this component function BEFORE the `export default function CustomCommandsPage()` definition (after the `Toggle` component, around line 64):

```tsx
const cmTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#dcddde',
    fontSize: '13px',
    fontFamily: 'monospace',
    minHeight: '12rem',
  },
  '.cm-content': {
    padding: '8px',
    caretColor: '#ffffff',
  },
  '.cm-editor': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'monospace',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#ffffff',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#5865f2 !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#5865f2 !important',
  },
});

function CodeMirrorEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeCb = useCallback(onChange, []); // stable ref

  useEffect(() => {
    if (!containerRef.current) return;

    const startState = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        lineWrapping,
        oneDark,
        cmTheme,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChangeCb(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only mount once

  // Sync external value changes (e.g. variable button clicks) without losing cursor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="input w-full min-h-48 p-0 overflow-hidden"
      style={{ padding: 0 }}
    />
  );
}
```

**Step 6: Build check**

```bash
cd dashboard/frontend && node_modules/.bin/tsc --noEmit
```

Expected: no errors.

**Step 7: Commit**

```bash
git add dashboard/frontend/src/pages/guild/CustomCommandsPage.tsx
git commit -m "feat: replace textarea with CodeMirror 6 editor in custom commands response field"
```

---

### Task 6: Build Verification + Deploy

**Files:** None — build + deploy step only.

**Step 1: Full frontend build**

```bash
cd dashboard/frontend && node_modules/.bin/tsc && node_modules/.bin/vite build
```

Expected: completes without errors. Emits dist/.

**Step 2: Deploy to VPS**

```bash
cd /home/plex/wall-e-bot && git push origin main
```

Then on VPS:
```bash
cd /root/wall-e-bot && git pull && docker compose build --no-cache && docker compose up -d
```

(No migrate step needed — no DB changes in this feature.)

**Step 3: Verify on mobile**

- Open wall-e.sullyflix.com on mobile
- Navigate to a guild dashboard
- Confirm sidebar is hidden, hamburger button appears
- Tap hamburger → drawer slides in from left
- Tap a nav item → drawer closes, page navigates
- Tap backdrop → drawer closes
- Open Custom Commands → create new command
- Paste a long text → character counter updates
- Paste text > 2000 chars → counter turns red, Save returns error message
- CodeMirror editor renders with dark theme
