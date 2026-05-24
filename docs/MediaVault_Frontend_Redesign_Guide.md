# MediaVault Frontend Redesign Guide

## Purpose

This document defines the UI/UX direction for redesigning MediaVault into a usable, polished, local-first media library interface.

The current application already has the core technical foundation. The redesign must **not rebuild the product from scratch**. It should keep the existing backend, data model, and implemented features, then replace the weak UI with a cleaner, media-first experience.

This guide is written for an implementation agent. Follow it as the frontend source of truth unless the project specification file says a current implementation detail makes a section impossible without backend changes.

---

## Product Context

MediaVault is a lightweight local-first web app for managing movies, series, and general videos on a PC without duplicating media files.

Current product goals:

- Manage movies, series episodes, and general videos in one place.
- Tag media by company, actor, categories, sub-categories, and custom tags.
- Keep one canonical file path per video.
- Support nested source folders.
- Generate thumbnails and short preview clips.
- Play videos in-browser or open directly in VLC.
- Stay lightweight enough for a low-resource host machine.
- Expand later toward LAN access, authentication, watch history, and streaming.

Design implication: this is **not a heavy Netflix clone** and not a full media server. The UI should feel modern, but it must stay fast, practical, and maintainable.

---

## Design Direction

### Target Feeling

The redesigned UI should feel like a private desktop media vault:

- Dark, cinematic, clean.
- Fast to scan visually.
- Large media covers and previews.
- Minimal clutter.
- Clear hierarchy.
- Useful for large local libraries.
- Comfortable on laptop screens and desktop monitors.
- Functional even before all metadata is perfect.

Use the attached inspirations as mood references:

1. **Dark streaming dashboard inspiration**
   - Strong sidebar.
   - Large hero area.
   - Red accent.
   - Cinematic cards.
   - Strong contrast.

2. **Light music dashboard inspiration**
   - Clean spacing.
   - Clear left navigation.
   - Search-first layout.
   - Table/list area that is readable and organized.

3. **Mobile dark media app inspiration**
   - Soft glass panels.
   - Rounded cards.
   - Floating playback controls.
   - Smooth but restrained visual depth.

For MediaVault, prefer the first and third inspirations. The second inspiration is useful mainly for spacing, table readability, settings pages, and admin-style screens.

---

## Visual System

### Theme

Use a dark-first UI.

Recommended base palette:

```css
--bg: #08090b;
--surface-1: #101114;
--surface-2: #17191d;
--surface-3: #202329;

--border-soft: rgba(255, 255, 255, 0.08);
--border-strong: rgba(255, 255, 255, 0.14);

--text-primary: #f4f4f5;
--text-secondary: #b5b7bd;
--text-muted: #777b84;

--accent: #d93025;
--accent-hover: #f04438;
--accent-soft: rgba(217, 48, 37, 0.16);

--success: #22c55e;
--warning: #f59e0b;
--danger: #ef4444;
```

Rules:

- Use red only for primary actions, active navigation, progress indicators, and destructive confirmations when appropriate.
- Do not make every icon red.
- Use dark neutral surfaces for most UI.
- Avoid pure black panels stacked on pure black pages; use subtle surface separation.
- Avoid heavy gradients everywhere. Use gradients mainly on hero/header areas.

### Typography

Use one clean modern font stack:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Suggested scale:

- Page title: 28-36px, 700 weight.
- Section title: 18-22px, 700 weight.
- Card title: 14-16px, 600 weight.
- Body text: 14px.
- Metadata text: 12-13px.
- Captions: 11-12px.

Rules:

- Media titles must be readable before tags.
- Do not overuse uppercase.
- Use muted text for metadata, not tiny unreadable text.
- Avoid cramming title, filename, path, duration, tags, and buttons into one card.

### Shape and Depth

- Main cards: `border-radius: 18px` to `24px`.
- Buttons: `border-radius: 12px` to `999px` depending on context.
- Inputs: `border-radius: 14px` to `18px`.
- Sidebar items: `border-radius: 12px`.
- Use soft shadows on overlay cards only.
- Prefer borders + surface contrast over strong shadows.

### Icons

Use a single icon library consistently. Recommended:

- `react-icons`
- Phosphor-style or Heroicons-style icons are acceptable if already installed.

Do not mix random icon styles across pages.

---

## App Shell

### Desktop Layout

Use a persistent app shell:

```text
┌─────────────────────────────────────────────────────────────┐
│ Sidebar │ Top Bar                                           │
│         ├───────────────────────────────────────────────────┤
│         │ Page Content                                      │
│         │                                                   │
└─────────┴───────────────────────────────────────────────────┘
```

### Sidebar

Width:

- Expanded desktop: 240px to 280px.
- Collapsed desktop: 72px.
- Mobile/tablet: drawer.

Required nav groups:

1. Library
   - Dashboard
   - All Videos
   - Movies
   - Series
   - General Videos

2. Browse
   - Companies
   - Actors / Performers
   - Categories
   - Tags

3. Tools
   - Scanner
   - Bulk Actions
   - Generated Views

4. System
   - Settings
   - Storage Health

Design rules:

- Active nav item must be obvious.
- Keep sidebar sticky.
- Include app name and compact status indicator near the top.
- Show scan status subtly if a scan is running.
- Do not put noisy stats in the sidebar.

### Top Bar

Top bar should include:

- Back/forward navigation where useful.
- Global search.
- Quick filters button.
- Scan button or scan status.
- Settings shortcut.
- Optional compact storage/status badge.

Search should be prominent. MediaVault is a local library tool, so searching should be a primary interaction.

Top bar desktop layout:

```text
[Back] [Forward]        [Search everything...]          [Scan] [Filters] [Settings]
```

Mobile layout:

```text
[Menu] [Search icon / input] [Scan/status]
```

---

## Core Pages

## 1. Dashboard / Home

Purpose: quick access to library state and recently relevant media.

Sections:

1. Hero / Featured Area
2. Continue Watching
3. Recently Added
4. Recently Scanned
5. Library Summary
6. Quick Browse

### Hero / Featured Area

Should show one selected media item or a useful fallback if no media has poster/backdrop.

Layout:

```text
┌────────────────────────────────────────────────────────────┐
│ Backdrop / gradient                                         │
│                                                            │
│ Title                                                      │
│ Type · Duration · Resolution · Year/Date if available      │
│ Tags / categories                                          │
│                                                            │
│ [Play] [Open in VLC] [Details]                             │
└────────────────────────────────────────────────────────────┘
```

Rules:

- If no poster/backdrop exists, use generated thumbnail with gradient overlay.
- Do not show raw filesystem paths in the hero.
- Show only high-value metadata.
- Primary action is Play.

### Continue Watching

Use wide horizontal cards.

Card content:

- Thumbnail.
- Progress bar.
- Title.
- Remaining time or last watched timestamp.
- Episode info if series.

Fallback: if watch history is not implemented yet, hide this section or show “Recently Played” only if data exists. Do not create fake data.

### Recently Added / Recently Scanned

Use poster/grid cards.

Each card:

- Thumbnail.
- Type badge.
- Duration.
- Title.
- 1-line metadata.
- Hover actions:
  - Play
  - Details
  - More

### Library Summary

Compact stat cards:

- Total videos.
- Movies.
- Series episodes.
- Missing files.
- Preview cache size.
- Last scan time.

Do not make these oversized. They are supporting information.

---

## 2. Library Listing Page

Purpose: browse and filter all media.

This is the most important page.

### Layout

Desktop:

```text
┌─────────────────────────────────────────────────────────────┐
│ Page Header                                                  │
│ Search + filters                                             │
├─────────────────────────────────────────────────────────────┤
│ Filter Rail / Drawer │ Content Grid or Table                 │
└──────────────────────┴──────────────────────────────────────┘
```

### View Modes

Provide at least two view modes:

1. Grid View
2. Table View

Grid view is default for normal browsing.

Table view is important for management tasks.

### Grid View Card

Card dimensions:

- Desktop: 180-220px wide.
- Large desktop: allow responsive grid.
- Mobile: 2 columns where possible, otherwise 1.

Card structure:

```text
[Thumbnail 16:9 or poster crop]
[Title]
[Type · Duration]
[Tags/categories row]
```

Hover/focus overlay:

```text
[Play] [Details] [More]
```

Rules:

- Cards must not become overloaded with metadata.
- Missing thumbnails should use a generated dark placeholder with file initials or media type.
- Broken/missing files should have a visible warning badge.

### Table View

Columns:

- Thumbnail
- Title
- Type
- Duration
- Company
- Categories
- Tags
- Path status
- Last scanned
- Actions

Rules:

- Do not show full file paths by default. Use tooltip or expandable row.
- Support sorting.
- Support multi-select.
- Keep row height comfortable.

### Filters

Primary filters:

- Type: Movie / Series / General
- Company
- Actor / Performer
- Category
- Sub-category
- Tags
- Has preview: Yes/No
- Missing file: Yes/No
- Source folder
- Duration range
- Date added / scanned

Filtering UX:

- Use filter chips for active filters.
- Make filters removable in one click.
- Do not force users into a huge advanced form for basic filtering.
- Advanced filters can live in a slide-over panel.

---

## 3. Media Detail Page

Purpose: inspect, edit metadata, and play a single item.

Layout desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ Large preview / player area                                  │
├─────────────────────────────┬────────────────────────────────┤
│ Main metadata + tags         │ Actions / file info            │
│ Related media / same series  │ Technical details              │
└─────────────────────────────┴────────────────────────────────┘
```

### Top Preview Area

Show:

- Video player if user clicked Play.
- Otherwise thumbnail / preview clip.
- Floating controls:
  - Play in browser
  - Open in VLC
  - Reveal in folder
  - More actions

### Metadata Panel

Editable fields:

- Title / display name.
- Media type.
- Company.
- Actors / performers.
- Categories.
- Sub-categories.
- Free tags.
- Series.
- Season.
- Episode.
- Absolute order.

Use tag pickers with autocomplete. Do not use plain text inputs for multi-value relationships unless the backend only supports that today.

### File Info Panel

Show:

- File name.
- Canonical path.
- File size.
- Duration.
- Codec/resolution if available.
- Last scan time.
- Missing/orphan status.
- Mode: Reference / Managed if applicable.

Make path copyable. Long paths must wrap or collapse.

### Dangerous Actions

Destructive actions must be isolated:

- Permanently delete file.
- Remove database record only.
- Rebuild previews.
- Move/rename if implemented.

Use confirmation dialogs with exact consequence text.

---

## 4. Video Player Page / Modal

Purpose: focused watching experience.

Use a dedicated player view or modal, not a tiny embedded player.

### Player Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Top overlay: Back, title, metadata, open in VLC              │
│                                                              │
│ Video                                                        │
│                                                              │
│ Bottom overlay: timeline, controls, volume, fullscreen       │
└──────────────────────────────────────────────────────────────┘
```

Controls:

- Play / pause.
- Seek timeline.
- Current time / duration.
- Volume.
- Mute.
- Playback speed.
- Fullscreen.
- Open in VLC.
- Next / previous episode when series context exists.

Rules:

- Controls appear on hover/mouse move and remain available for keyboard users.
- Space toggles play/pause.
- Left/right arrows seek.
- Esc exits modal/fullscreen view.
- Player must work without custom controls if browser limitations appear; do not break native video behavior.

### VLC Action

VLC is a host-machine action.

For now:

- On the host PC, “Open in VLC” can call backend logic to open local VLC with the canonical path.
- For remote/LAN clients, do not assume VLC can open the file path. Show this as a capability that needs LAN design later.

The UI should display a clear state:

- Available: Open in VLC
- Unavailable on this device: “VLC open is only available on host machine”
- Unknown: Try open / configure VLC path

---

## 5. Series Manager

Purpose: manage grouped episodes.

Layout:

- Series header with title, poster/backdrop if available.
- Season tabs or season accordion.
- Episode list/table.
- Bulk edit options.
- Missing episode/order warnings.

Episode row:

- Thumbnail.
- SxxEyy.
- Title.
- Duration.
- Tags.
- Play.
- Edit.

Rules:

- Keep series ordering obvious.
- Support absolute order if the backend already tracks it.
- Do not make users edit episodes one by one for simple series metadata changes.

---

## 6. Scanner Page

Purpose: manage source scanning and ingestion.

Sections:

1. Source folders
2. Scan controls
3. Current scan progress
4. Scan results
5. Conflicts / warnings

### Scan Controls

Buttons:

- Scan all sources.
- Scan selected source.
- Stop scan if supported.
- Refresh library.

### Scan Progress

Show:

- Current folder/file.
- Files found.
- New items.
- Updated items.
- Missing/orphaned items.
- Errors.

Use a log viewer for detailed output. Do not dump raw logs into the main page.

### Scan Results

Use a table:

- File
- Status
- Reason
- Action

Statuses:

- Added
- Updated
- Skipped
- Duplicate
- Missing
- Error

---

## 7. Settings Page

Purpose: configure app safely.

Sections:

1. Library
   - Source folders
   - Destination library
   - Reference vs Managed mode

2. Preview Cache
   - Cache path
   - Generate previews on scan
   - Generate on demand
   - Clear cache

3. Playback
   - Browser playback
   - VLC path
   - Test VLC
   - Supported formats note

4. Appearance
   - Theme: dark/system if implemented
   - Density: comfortable/compact

5. System
   - Database location
   - Export/import metadata if available
   - Storage health

Rules:

- Settings must be understandable.
- Dangerous settings require confirmation.
- Path pickers should validate paths where possible.
- Show current values clearly.

---

## 8. Bulk Actions Page / Mode

Purpose: edit many media items quickly.

Support:

- Multi-select from library table/grid.
- Bulk add/remove tags.
- Bulk assign company.
- Bulk assign category/sub-category.
- Bulk assign actor/performer.
- Bulk mark type.
- Bulk rebuild previews.
- Bulk cleanup missing entries.

Rules:

- Always show selected count.
- Preview changes before applying.
- For destructive actions, require confirmation.
- Avoid accidental edits to large selections.

---

## Components To Build Or Refactor

### App Shell Components

- `AppLayout`
- `Sidebar`
- `TopBar`
- `MobileNavDrawer`
- `GlobalSearch`
- `CommandMenu` if feasible

### Media Components

- `MediaCard`
- `MediaGrid`
- `MediaTable`
- `MediaHero`
- `MediaPreview`
- `MediaBadges`
- `MediaActionsMenu`
- `PathStatusBadge`
- `MissingFileBadge`

### Player Components

- `VideoPlayerView`
- `PlayerControls`
- `VlcOpenButton`
- `EpisodeNavigation`

### Metadata Components

- `TagPicker`
- `CategoryPicker`
- `ActorPicker`
- `CompanyPicker`
- `SeriesEpisodeEditor`
- `MetadataForm`

### Utility Components

- `EmptyState`
- `LoadingSkeleton`
- `ConfirmDialog`
- `StatusToast`
- `FilterChips`
- `AdvancedFilterDrawer`
- `ScanProgressPanel`
- `LogViewer`

---

## UX States That Must Be Designed

Every core screen must handle:

1. Loading
2. Empty state
3. Error state
4. No search results
5. Missing thumbnail
6. Missing file
7. Long title
8. Very long path
9. Large tag list
10. Backend unavailable
11. Scan running
12. Low metadata item

Do not only design the happy path.

---

## Responsive Behavior

### Desktop

- Full sidebar.
- Grid can show 4-6 cards depending on width.
- Detail pages use two-column layout.
- Tables are allowed.

### Tablet

- Collapsible sidebar or drawer.
- Grid 2-3 columns.
- Detail page can stack.

### Mobile

- Drawer navigation.
- Sticky top search.
- Grid 1-2 columns.
- Avoid large tables; use card/list rows.
- Player should become full-screen-first.

MediaVault may mostly be used on desktop, but the UI should not collapse badly on phones.

---

## Accessibility Requirements

- All interactive elements must be keyboard accessible.
- Visible focus states are required.
- Buttons need labels, not only icons.
- Color cannot be the only signal for status.
- Dialogs must trap focus.
- Video controls must be reachable by keyboard.
- Text contrast must remain readable on dark backgrounds.
- Hover actions need equivalent touch/click access.

---

## Performance Requirements

This is a local-first media manager and may have many videos.

Rules:

- Do not render thousands of cards at once.
- Use pagination or virtualization for large lists.
- Lazy-load images.
- Use thumbnail URLs, not raw full video files, for cards.
- Debounce search input.
- Cache filter option lists where reasonable.
- Avoid global state updates on every hover.
- Keep animation subtle and cheap.
- Prefer CSS transitions over heavy animation libraries unless already installed.

### Image/Thumbnail Handling

- Use `loading="lazy"` for images.
- Use fixed aspect-ratio containers to avoid layout shift.
- Use placeholder skeletons while loading.
- Handle broken image URLs.

---

## API Integration Rules

Before redesigning data fetching, inspect the existing frontend API layer.

Do not invent endpoints unless the backend lacks required support and the gap is documented.

The agent must map:

- Existing endpoints.
- Existing request/response types.
- Current media item shape.
- Current tag/category/company shapes.
- Current scan APIs.
- Current playback/VLC APIs.
- Current settings APIs.

If required data is missing, create a `BACKEND_GAPS.md` section or issue list rather than silently hardcoding fake data.

---

## Implementation Plan

### Phase 1: Stabilize Frontend Foundation

- Identify current routing structure.
- Identify current API client.
- Add or clean up global layout.
- Add design tokens/CSS variables.
- Add base components:
  - Button
  - Input
  - Badge
  - Card
  - Dialog
  - Dropdown
  - Tabs
  - Skeleton
- Remove inconsistent old styling.

Deliverable:

- App shell works.
- Sidebar/top bar present.
- Existing pages still reachable.

### Phase 2: Redesign Library Browsing

- Build `MediaCard`.
- Build responsive `MediaGrid`.
- Build filters and active filter chips.
- Build table view if current data shape supports it.
- Add empty/loading/error states.

Deliverable:

- All Videos / Movies / Series / General pages are usable.

### Phase 3: Redesign Detail And Player

- Build media detail layout.
- Add preview/player area.
- Add metadata editor sections.
- Add file info and actions.
- Add focused player view/modal.

Deliverable:

- User can inspect, edit, play, open VLC, and manage one media item.

### Phase 4: Redesign Scanner And Settings

- Build scanner page with progress/log/result sections.
- Build settings page with clear sections.
- Add path/status validation display if APIs exist.

Deliverable:

- Operational pages are no longer ugly admin dumps.

### Phase 5: Polish And QA

- Responsive pass.
- Keyboard pass.
- Empty/error state pass.
- Long data pass.
- Loading skeleton pass.
- Large library performance pass.

Deliverable:

- UI is ready for daily use.

---

## Non-Negotiables

- Do not break existing backend behavior.
- Do not replace the app with a generic template.
- Do not use fake data in production pages.
- Do not show raw filesystem paths everywhere.
- Do not overload cards with metadata.
- Do not hide destructive actions beside normal actions.
- Do not implement LAN authentication inside this redesign pass.
- Do not build remote VLC behavior yet. Mark it as a future capability.
- Do not introduce heavy dependencies without a clear reason.

---

## Definition Of Done

The redesign is acceptable when:

- The library page is useful with real data.
- Media cards are visually clear and clickable.
- Search/filtering is easy to find.
- Detail page supports real metadata editing.
- Playback path is clear: browser play and host VLC where supported.
- Settings and scanner pages are understandable.
- Empty, loading, and error states exist.
- UI works on desktop and does not break on mobile.
- Styling is consistent across pages.
- The app still respects the local-first, lightweight product direction.
