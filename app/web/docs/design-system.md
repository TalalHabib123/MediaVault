# MediaVault Design System

## Visual Direction

- Tone: dark cinematic local media vault
- Mood: private desktop library, not a generic admin panel
- Density: media-first browsing with compact management controls
- Accent: restrained red for primary actions, active navigation, and progress

## Theme

- Dark is the primary experience.
- Light mode remains available for accessibility and system preference, but it uses neutral grays rather than a separate brand palette.

## Tokens

- Background: `#08090b`
- Surfaces: `#101114`, `#17191d`, `#202329`
- Text: `#f4f4f5`, `#b5b7bd`, `#777b84`
- Accent: `#d93025`
- Success/warning/danger: green, amber, red semantic colors

## Typography

- Single modern sans stack based on Inter and system UI.
- Page titles: 28-36px, bold.
- Section titles: 18-22px, bold.
- Card titles: 14-16px, semibold.
- Metadata and captions: 11-13px.

## Components

- `AppLayout` behavior is split across `DashboardShell`, `SidebarNav`, and `DashboardHeader`.
- Library browsing uses `LibraryPage`, `LibraryCard`, and table mode inside the feature module.
- Details, bulk tagging, scanner, metadata, settings, and player live under `src/features`.
- Reusable primitives stay under `src/components/ui`.

## Rules

- Do not show full filesystem paths on cards or table rows by default.
- Use thumbnails and hover previews as the main visual signal.
- Keep destructive actions isolated in the detail drawer danger zone.
- Keep host-only VLC and reveal-folder actions disabled when capabilities say unavailable.
- Avoid restoring legacy wrappers under `src/components` or route pages under `src/pages`.
