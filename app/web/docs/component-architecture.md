# MediaVault Component Architecture

## Layers
- `src/app/providers`
  - app-wide contexts like theme
- `src/app/layout`
  - shell, sidebar, header, dock, and structural wrappers
- `src/components/ui`
  - reusable primitives patterned after shadcn usage
- `src/features/*`
  - domain-specific views and notification modules
- `src/components`
  - existing domain components kept during migration or shared cross-feature pieces
- `src/pages`
  - route-specific pages that are not yet migrated into `features`

## Ownership Rules
- Keep API and business workflow orchestration in feature hooks or feature containers
- Keep purely visual primitives in `components/ui`
- Do not place large page sections back into `App.tsx`
- Use layout wrappers for shared spacing, headers, and cards instead of repeating large class strings

## Primitive Guidance
- Use UI primitives for:
  - buttons
  - cards
  - inputs
  - selects
  - badges
  - alerts
- Keep custom domain components for:
  - library cards
  - search result cards
  - move/preview progress cards
  - metadata assignment controls

## Migration Rule
- When moving code out of a legacy file, preserve types and behavior first.
- After logic is stable in the new location, apply visual redesign.

## App Shell Rule
- `App.tsx` should remain routing-only.
- Dashboard state and effects belong in feature hooks or dashboard feature containers.
