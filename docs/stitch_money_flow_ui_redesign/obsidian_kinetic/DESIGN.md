---
name: Obsidian Kinetic
colors:
  surface: '#121416'
  surface-dim: '#121416'
  surface-bright: '#38393c'
  surface-container-lowest: '#0c0e10'
  surface-container-low: '#1a1c1e'
  surface-container: '#1e2022'
  surface-container-high: '#282a2c'
  surface-container-highest: '#333537'
  on-surface: '#e2e2e5'
  on-surface-variant: '#c2cab0'
  inverse-surface: '#e2e2e5'
  inverse-on-surface: '#2f3133'
  outline: '#8c947c'
  outline-variant: '#424936'
  surface-tint: '#98da27'
  primary: '#ccff80'
  on-primary: '#213600'
  primary-container: '#a3e635'
  on-primary-container: '#416400'
  inverse-primary: '#446900'
  secondary: '#4ae176'
  on-secondary: '#003915'
  secondary-container: '#00b954'
  on-secondary-container: '#004119'
  tertiary: '#ffeaea'
  on-tertiary: '#67001b'
  tertiary-container: '#ffc4c7'
  on-tertiary-container: '#b60237'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b2f746'
  primary-fixed-dim: '#98da27'
  on-primary-fixed: '#121f00'
  on-primary-fixed-variant: '#334f00'
  secondary-fixed: '#6bff8f'
  secondary-fixed-dim: '#4ae176'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005321'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#121416'
  on-background: '#e2e2e5'
  surface-variant: '#333537'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The design system embodies a high-conviction, disciplined personal finance experience. It projects technological precision, calm command over wealth, and modern prestige. Built for personal finance management, it balances deep atmospheric dark tones with razor-sharp electric accents that signal growth, momentum, and actionable insight.

The aesthetic fuses **Corporate Modern** rigor with **Subtle Glassmorphism** and ambient luminescence. Deep obsidian canvas tiers eliminate visual fatigue during intensive financial review, while vibrant chart traces and ambient electric lime radial highlights focus attention directly on liquid capital, budget trajectories, and net worth shifts. The emotional response is intentional: confident, restrained, sophisticated, and deeply empowering.

## Colors
The palette is rooted in an ultra-deep charcoal continuum accented by high-energy bio-luminescent tints. 

- **Canvas & Surface Tiering:**
  - Base background canvas: `#0D0F11` (Deep Obsidian)
  - Card & navigation background: `#131619` (Charcoal Slate)
  - Elevated modal & active hover surfaces: `#1A1E23` (Gunmetal Surface)
  - Subtle borders / separators: `rgba(255, 255, 255, 0.07)` to `rgba(255, 255, 255, 0.12)`
- **Key Accents:**
  - Primary Electric Lime (`#A3E635` / `#9AE600`): Represents wealth accumulation, positive delta indicators, active states, key interactive pill elements, and glow triggers.
  - Secondary Fiscal Green (`#22C55E`): Used for secondary success metrics and verified asset indicators.
  - Tertiary Coral Red (`#F43F5E`): Applied strictly to negative expenditure vectors, deficit indicators, and critical alerts.
- **Atmospheric Ambient Highlights:**
  - Gradient mesh and soft radial backgrounds (as seen in hero metric cards) pair `#A3E635` at 12–18% opacity fading into deep `#131619` with a 48px blur radius.
- **Typography Contrasts:**
  - Primary text: `#FFFFFF` (High emphasis)
  - Secondary/Muted text: `#94A3B8` (Mid-tone labels and axis metrics)
  - Tertiary/Ghost text: `#64748B` (Inactive metadata and subtle timestamps)

## Typography
Plus Jakarta Sans serves as the universal typeface across display, editorial, and functional data tiers. Its modern geometric curves provide legibility in numerical readouts, while its rounded terminals bring a sophisticated balance to complex financial dashboards.

- **Financial Numerals:** All primary balances, currency values, and stat figures leverage tight letter-spacing (`-0.02em` to `-0.03em`) and tabular figure settings (`tnum`) to maintain vertical alignment in ledgers and metric cards.
- **Hierarchy Structure:**
  - Large summary figures (e.g., net worth, total monthly balance) use `display-lg` with `fontWeight: 700`.
  - Section headers, card titles, and modal headers leverage `headline-md` or `title-lg`.
  - Micro-metrics, delta badges, and table headers use `label-md` or `label-sm` with upper or title casing and subtle letter tracking (`+0.02em`).

## Layout & Spacing
This design system operates on a responsive fluid 12-column grid anchored by a structured left navigation rail and a flexible content stage.

- **Desktop (1280px+):**
  - Left navigation: fixed 260px sidebar container.
  - Main canvas: fluid 12-column grid with 24px (`1.5rem`) gutters and 32px (`2rem`) outer margin.
  - Card grids: 3-column split for primary metric cards (`col-span-4`), transitioning into 8-column primary timeline / 4-column breakdown widgets below.
- **Tablet (768px – 1279px):**
  - Left rail collapses to a thin 72px icon bar or sliding sheet.
  - 8-column layout with 16px (`1rem`) gutters and 24px margins. Stat cards reflow to a 2-column pattern (`col-span-4`).
- **Mobile (<768px):**
  - Single column (`col-span-12`) reflow. Outer margins reduce to 16px (`1rem`).
  - Top app bar replaces the persistent sidebar; complex charts switch to horizontally scrollable viewports or simplified aggregated sparklines.

## Elevation & Depth
Depth is realized through translucent layered dark surfaces, crisp inner borders, and targeted ambient backdrops rather than conventional heavy drop shadows.

- **Tier 0 (Base Canvas):** Solid `#0D0F11`.
- **Tier 1 (Cards, Sidebars, Panels):** Background `#131619` with a subtle 1px border styled as `border: 1px solid rgba(255, 255, 255, 0.08)`. Subtle backdrop blur (`backdrop-filter: blur(16px)`).
- **Tier 2 (Interactive Floating Elements, Modals, Menus):** Background `#1A1E23` elevated with an ultra-soft diffused ambient shadow: `box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12)`.
- **Luminescent Accent Glows:** Active cards or high-priority stats incorporate an internal top-right radial glow: `radial-gradient(circle at top right, rgba(163, 230, 53, 0.14) 0%, transparent 65%)`. Data tooltips on charts float over canvas layers with a 1px lime-tinted border (`rgba(163, 230, 53, 0.3)`).

## Shapes
The design system employs a refined curvature language that feels architectural yet ergonomic.

- **Cards & Data Containers:** Standardized at `rounded-xl` (1.25rem / 20px) to provide soft framing around metrics and complex vector charts.
- **Buttons, Badges & Search Inputs:** Pill-shaped (`rounded-full` / 9999px) for search bars, action buttons, active tab indicators, and status badges, creating an immediate tactile contrast with the structural perimeter of the cards.
- **Sub-elements & Nested Containers:** Icon tiles and internal dropdown fields use `rounded-lg` (0.75rem / 12px) to preserve nested concentric alignment within parent cards.

## Components

### Buttons & Pills
- **Primary Pill:** High-contrast background (either solid `#FFFFFF` with `#0D0F11` bold text, or `#A3E635` with `#0D0F11` text). Fully rounded (`rounded-full`), padded `px-5 py-2.5`, with smooth micro-scale interactions on press (`scale: 0.98`).
- **Secondary Ghost Pill:** Transparent background, 1px border `rgba(255, 255, 255, 0.15)`, text `#FFFFFF`, hovering to `rgba(255, 255, 255, 0.06)`.
- **Icon Action Buttons:** Circular or rounded-xl buttons with `#181C20` base, housing minimalist 18px stroke icons in `#94A3B8`.

### Metric & Insight Cards
- Standard cards feature a top icon pill or category indicator on the left and a contextual triple-dot overflow menu on the right.
- Numerical values are prominently rendered using `headline-lg` (`28px`) with integrated trend pill badges (e.g., green-tinted background `rgba(163, 230, 53, 0.12)` with `+12.5%` label in `#A3E635`).
- Contextual supporting copy resides below the balance in muted `#64748B`.

### Navigation Rails & Tab Bars
- Left navigation features a distinct pill highlight for the active item: solid `#FFFFFF` background with dark text, or soft dark surface with an electric lime indicator strip.
- Inactive nav items show `#94A3B8` text and clean mono-line iconography, transitioning smoothly to white on hover.
- Segmented controls and sub-tabs sit inside an enclosed dark pill tray (`#0D0F11` with 4px inner padding).

### Input Fields & Search Bars
- Search inputs feature deep inset dark backgrounds (`#181C20`), pill styling, left-aligned search icons, and subtle placeholder text in `#64748B`.
- Focused state applies a delicate `border-color: rgba(163, 230, 53, 0.5)` with zero harsh outer drop shadow.

### Charting & Data Visualizations
- Smooth cubic bezier splines with gradient area fills fading from `rgba(163, 230, 53, 0.25)` to total transparency at the x-axis.
- Comparison plots display dual-stroke treatments: solid `#A3E635` for the current fiscal period versus a muted translucent stroke (`rgba(255, 255, 255, 0.3)`) for previous periods.
- Vertical indicator scrubbers appear as dashed low-contrast white lines with glowing anchor dots on hover.
- Revenue/Asset breakdowns use glowing concentric or bubble proportion charts featuring tonal lime-family shades (`#A3E635`, `#65A30D`, `#365314`).

### Badges & Micro Status
- Compact trend badges (`px-2 py-0.5`, `rounded-full`) embedded beside stats to convey percentage change.
- Upward momentum displays an arrow up glyph with `#A3E635` text and dark green translucent backing.
- Downward/burn rate metrics display a downward glyph with `#F43F5E` text and dark red translucent backing (`rgba(244, 63, 94, 0.12)`).