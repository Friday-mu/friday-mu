# Mobile Staff UX Research Notes — FAD

Date: 2026-05-20
Worktree: `/Users/judith/repos/friday-admin-dashboard/.claude/worktrees/fad-design-os`

## Context

FAD is not a consumer app and should not behave like a generic SaaS dashboard on mobile. The high-frequency users are Friday staff working under time pressure:

- Field staff: TeamInbox, My Tasks, calendar/roster, task photos, expense capture, task comments.
- Ops/admin staff: guest inbox, team inbox, calendar, reservations, properties, operations.
- Directors/managers: escalation, approvals, finance/admin visibility, cross-module review.

The mobile design target is therefore a daily operating tool: fast, role-scoped, interruption-safe, and legible outdoors/in motion.

## Sources Checked

- Google Android Accessibility: touch targets should generally be at least `48dp`, and icon visuals can be smaller if the hit region is expanded. Source: https://support.google.com/accessibility/android/answer/7101858
- Apple Human Interface Guidelines: buttons should have at least a `44x44 pt` hit region. Source: https://developer.apple.com/design/human-interface-guidelines/buttons
- W3C WCAG 2.2: target size minimum is `24x24 CSS px` at AA, with stricter `44x44` enhanced guidance. Source: https://www.w3.org/TR/WCAG22/#target-size-minimum and https://w3c.github.io/wcag/understanding/target-size-enhanced.html
- Microsoft Dynamics 365 Field Service mobile guidance: test with end-user security roles, avoid broad offline data, surface the most relevant fields first, and measure performance. Source: https://www.microsoft.com/en-us/dynamics-365/blog/it/2021/04/21/5-tips-for-implementing-the-field-service-dynamics-365-mobile-app/
- Breezeway mobile app positioning: field staff need task notifications, offline checklists, updates, pictures, comments, job details, access codes, and property-specific details. Source: https://apps.apple.com/us/app/breezeway-property-care/id1266431363 and https://www.breezeway.io/checklists-mobile-app
- Mobile usability practitioner study: recurring mobile app issues cluster around information architecture, UI design, performance, interaction patterns, and aesthetics. Source: https://arxiv.org/abs/2502.05120
- UI display issue research: text overlap, component occlusion, and missing images are common real-world GUI failures that hurt usability and can be detected from screenshots. Source: https://arxiv.org/abs/2205.13945

## Working Principles For FAD Mobile

1. Role-scoped home beats module browsing.
   - Field staff should not start from the full FAD IA.
   - Their default surface should be Today / My Tasks / Team messages / Calendar.
   - Admin modules should be unavailable and invisible unless explicitly needed.

2. Daily task execution must be one-handed and interruption-safe.
   - Start task, pause/stop, add photo, add comment, expense capture, and complete must be large, stable controls.
   - Avoid controls that shift position when counts, text, loading states, or chips update.

3. Touch targets must be designed as hit regions, not visible icon size.
   - Primary touch targets: aim for `44-48px` minimum hit area.
   - Dense icon-only controls can remain visually small only if the button area is large.
   - Controls like notification dots, close icons, calendar arrows, task action icons, upload buttons, and chip rows need explicit min dimensions.

4. Offline-tolerant field workflows are product requirements, not polish.
   - My Tasks should cache today’s assigned jobs, property details, checklist, access notes, and previous comments.
   - Photos, comments, expenses, and time tracking should queue when offline and show sync state.
   - Never let a field user believe a photo/comment/expense is saved when it is only local and unsynced.

5. Capture flows need to minimize metadata burden.
   - A task photo should inherit task id, property, room/area, timestamp, user, and checklist item where possible.
   - Expense capture inside a task should know the task/property/vendor context before asking for extra fields.

6. Messaging needs separate mental models.
   - Guest inbox: external, high-risk, send truth and channel rules matter.
   - TeamInbox: internal, fast, mention/reply/photo/task links matter.
   - Field staff default to TeamInbox; guest inbox is not part of their daily surface.

7. Calendar must be operational, not decorative.
   - Mobile calendar should answer: where am I going, what time, who is involved, what property/task/reservation is linked.
   - Week/month visual density is less important than an agenda view for today and next few days.

8. AI-generated UI risk for FAD.
   - Common agent-built UI failures in this app class: too many cards, generic dashboards, hidden state, small icon buttons, scroll traps, desktop-first tables, untested long names, role leaks, fake empty states, missing offline/error states.
   - Visual polish can hide workflow failure. Test with real content, long names, slow network, missing backend, field role, director role, and mobile screenshots.

## Audit Framework

Every high-frequency mobile surface should be audited against:

- Role: director, ops manager, field.
- Viewport: 375x812, 390x844, 430x932.
- Data states: empty, normal, overloaded, error, offline, loading.
- Touch: all visible controls have `44-48px` practical hit areas or spacing.
- Scroll: no horizontal document overflow; sticky regions do not trap content.
- Text: no clipping for long guest/property/staff names.
- Safety: no restricted modules, prompts, notifications, or data visible to the wrong role.
- Persistence: send/save/capture actions have truthful pending/success/failure states.
- Recovery: every blocked action says why and gives the next manual or retry path.

## Proposed Product Direction

Priority mobile surfaces:

1. Field Home / My Tasks
   - Today’s assigned tasks.
   - Start / pause / complete.
   - Checklist.
   - Photos.
   - Comments and mentions.
   - Expense capture.
   - Offline queue and sync state.

2. TeamInbox
   - Mentions, DMs, task-linked threads.
   - Fast reply with photo attachment.
   - Clear unread and mention counts.

3. Guest Inbox
   - External-message risk controls.
   - Channel/send truth.
   - WhatsApp window/template handling.
   - Draft and stale-draft truth.

4. Calendar / Agenda
   - Today-first agenda.
   - Linked reservations/tasks/properties.
   - Staff assignment visibility.

5. Website Unlock Data Flow
   - Guesty availability/pricing/reservation facts into FAD.
   - FAD exposes clean website-facing data.
   - Website inquiries land as actionable inbox conversations.

