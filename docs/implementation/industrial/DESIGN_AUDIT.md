# Design Audit (pre-upgrade)

## Information architecture
- Navigation is a single flat top bar with text links; no role-aware app shell, no sidebar for
  the data-dense recruiter console, no breadcrumbs, no page headers. → Introduce `AppShell` with
  role-aware `Sidebar` + `Topbar` + `MobileNav`, `PageHeader`/`SectionHeader`.
- No dedicated dashboards; seeker/recruiter land on profile/console lists. → Add KPI dashboards
  using only existing data (profile completion, parse status, recommendations, applications,
  unread, open jobs, pipeline counts, pending interviews).

## Consistency
- Styling is ad-hoc utility classes in one `styles.css`; spacing/ål radii/shadows vary; controls
  have inconsistent heights; risk of per-page drift. → Token layer + reusable primitives covering
  all interaction states (hover/active/focus/disabled/loading/error/success).
- No icon system (text only). → `lucide-react` (tree-shakeable), no emoji.

## Responsive
- Tables (`talent`, `pipeline`) are raw `<table>` that overflow on mobile; forms use fixed rows;
  no tested breakpoints. → DataTable with mobile card/priority-column pattern; verify 320/390/768/
  1024/1440; controlled horizontal scroll only where sensible.

## Accessibility
- Some labels/`aria` present, radar has a text list, but no focus-visible system, no audited
  heading order/landmarks, dialogs (none yet) need focus trapping, status changes lack live
  regions. → WCAG 2.2 AA practices + axe gate + keyboard E2E.

## i18n
- 4 locales complete with key-parity test; server returns `messageKey`. Risks: long JA/ZH strings
  and long EN words may overflow new dense layouts; date/number/currency not centrally formatted.
  → Locale-safe layouts, `Intl`-based formatting, keep parity gate, lazy-load locales.

## Key page issues to fix
Auth (trust/clarity), seeker dashboard (missing), résumé/analysis (stepper + async status),
recommendations (card/table toggle + score explanation), job/company detail (scannable spec),
talent search (pro filter bar + DataTable + recommended highlight), candidate detail/compare
(density + sensitive-field cues), pipeline (stage visualization), messaging (conversation list +
states), notifications, and missing 403/404/500/offline.
