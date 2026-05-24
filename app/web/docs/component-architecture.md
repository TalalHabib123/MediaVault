# MediaVault Component Architecture

## Layers

- `src/app/providers`: app-wide context such as theme.
- `src/app/layout`: persistent shell, sidebar, top bar, and notification dock.
- `src/components/ui`: small reusable primitives for buttons, cards, inputs, selects, badges, and alerts.
- `src/features/*`: domain screens, feature components, and workflow state.
- `src/lib`: shared utilities and API wrapper.

## Feature Ownership

- `features/dashboard`: route container, dashboard shell orchestration, and shared controller hook.
- `features/library`: library grid/table cards, media detail drawer, bulk tagging drawer, and media formatting helpers.
- `features/scanner`: source scan and preview job operations.
- `features/bulk`: selected item review and bulk action entry point.
- `features/search`: tagged search and result cards.
- `features/metadata`: catalog option creation.
- `features/settings`: local paths, preview cache, playback, and tool configuration.
- `features/player`: focused browser playback route.
- `features/auth`: setup, login, sessions, LAN/security settings.

## Rules

- `App.tsx` stays a routing export only.
- Dashboard state and API orchestration stay in `useDashboardController`.
- Domain UI belongs in feature folders, not in legacy root-level wrappers.
- Add new primitives only when multiple features share behavior.
- Do not reintroduce `src/pages` or large one-off components in `src/components`.
