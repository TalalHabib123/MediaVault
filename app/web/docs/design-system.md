# MediaVault Design System

## Visual Direction
- Tone: cinematic vault, editorial, polished, local-first
- Mood: premium archive rather than generic admin panel
- Density: compact enough for management work, spacious enough for browsing

## Theme Modes
- `system`: follow OS preference
- `dark`: default vault presentation with layered charcoal, steel, and bronze accents
- `light`: parchment-and-stone interpretation of the same system, not a flat white dashboard

## Tokens
- Backgrounds
  - app background
  - soft ambient background
  - primary surface
  - secondary surface
  - elevated surface
- Borders
  - default border
  - strong border
  - accent border
- Text
  - primary text
  - muted text
  - inverted text
- Status
  - success
  - warning
  - danger
  - info
- Brand
  - bronze accent
  - steel accent
  - vault glow

## Typography
- Display: classic serif stack for product identity and page titles
- Interface: clean sans stack for controls and metadata
- Keep headings bold and short; body copy should stay restrained and readable

## Surfaces
- Use layered cards instead of flat panels
- Keep rounded corners generous but not playful
- Prefer soft inner highlights and faint shadows over heavy borders
- Use gradients sparingly for shell/background only

## Navigation
- Sidebar is the primary dashboard navigation
- Desktop: persistent rail with clear active state
- Mobile: collapsible overlay sheet
- Page header carries title, context text, and utility controls like theme switching

## Motion
- Quick transitions on hover, opacity, and progress bars
- No large spring animations or delayed interactions
- Keep motion decorative, not structural

## Notifications
- Long-running jobs live in a dock
- Success/error messages appear in a shared alert region
- Progress cards should clearly show title, counts, current item, and completion state
