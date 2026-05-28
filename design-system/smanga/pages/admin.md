# Admin Page Overrides

> **PROJECT:** SManga
> **Generated:** 2026-05-28 21:44:01
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1400px or full-width
- **Grid:** 12-column grid for data flexibility
- **Sections:** 1. Hero (Value Prop + Form), 2. Recent Issues/Archives, 3. Social Proof (Subscriber count), 4. About Author

### Spacing Overrides

- **Content Density:** High — optimize for information display

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Minimalist. Paper-like background. Text focus. Accent color for Subscribe.

### Component Overrides

- Avoid: Wide tables breaking layout
- Avoid: Use arbitrary large z-index values
- Avoid: Single row actions only

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Hover tooltips, chart zoom on click, row highlighting on hover, smooth filter animations, data loading spinners
- Responsive: Use horizontal scroll or card layout
- Layout: Define z-index scale system (10 20 30 50)
- Data Entry: Allow multi-select and bulk edit
- CTA Placement: Hero inline form + Sticky header form
