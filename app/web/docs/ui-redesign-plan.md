# MediaVault UI Redesign Plan

## Goal
- Refresh the frontend into a cinematic media-vault experience without changing backend contracts or user workflows.
- Keep all current features operational while the presentation layer is restructured around reusable components and a sidebar shell.
- Treat functionality as frozen unless a small fix is required to preserve current behavior during refactor.

## Rollout Order
1. Foundation
   - Theme provider with `light`, `dark`, and `system`
   - CSS token system
   - `components.json`, `cn()` helper, and shadcn-style primitives
2. Shell
   - Sidebar navigation
   - Dashboard header
   - shared alert region
   - notification dock
3. Core surfaces
   - Library page
   - Tagged search page
   - preview and move job notifications
   - media cards and search result cards
4. Management surfaces
   - media detail drawer
   - bulk tagging drawer
   - metadata manager
   - settings page
5. Secondary polish
   - player visual alignment
   - empty states
   - responsive tuning

## Guardrails
- Preserve current routes, query-string behavior, and request payloads.
- Keep existing success and error handling semantics.
- Reuse domain logic first, then replace styling and layout around it.
- Prefer extracting logic from `App.tsx` before redesigning visual details.
- Add primitives and wrappers before redesigning page-level components.

## Regression Checklist
- Library scan, refresh, filter, selection, bulk tag, bulk move
- Preview regeneration and move progress notifications
- Tagged search filters, paging, and item actions
- Metadata create flows
- Settings save flow
- Media detail edit, move, and delete flows
- Player navigation and back-link behavior

## Deliverables
- Tokenized theme system
- Sidebar-driven dashboard shell
- Reusable UI primitives and layout wrappers
- Refactored `App.tsx` that only wires routes
- Documentation for design system and component boundaries
