# Orvia Dashboard: UX / Product Architecture Report

**Scope:** Full structural audit of the Orvia AI receptionist dashboard.  
**Perspective:** Information architecture, operational UX, scalability, cognitive load, trust mechanics, and actionability - not visual styling.

---

## 1. Current State Inventory

### Routes & Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `overview.tsx` | Home - today's briefing |
| `/calls` | `calls.tsx` | Paginated call log |
| `/calls/:id` | `call-detail.tsx` | Single call deep dive |
| `/leads` | `leads.tsx` | Leads list with status filter |
| `/settings` | `settings.tsx` | Business + AI configuration |

### Navigation (sidebar)

```
Orvia  [AI Receptionist]
  Overview
  Calls
  Leads
  ─────────────
  Settings

[AI Agent - LIVE card]
[User dropdown]
```

### Data Architecture

**Polling intervals in use:**
- `getBriefing()` - 30 second refetch (overview page)
- `getLiveCallStatus()` - 10 second refetch (live status bar)
- `getBusinessBilling()` - 60 second refetch (billing widget)
- `getWeeklyCallStats()` - no refetch interval (static for session)

**Available API functions not surfaced in UI:**
- `getFollowUpQueue()` - leads without appointments in last 72h
- `getMissedCallQueue()` - missed calls in last 48h
- `getMissedCallHeatmap()` - by-hour missed call density (last 30 days)
- `getOutcomeBreakdown()` - all-time outcome distribution
- `getOverviewStats()` - simpler version of briefing stats

---

## 2. Information Architecture Analysis

### 2.1 Current IA (Flat)

```
Dashboard
  └── Overview (today's numbers, recent calls, schedule)
  └── Calls (log of all calls)
  └── Leads (captured leads)
  └── Settings (everything else)
```

**Problem:** This is a feature-navigation model, not an operator mental model. A plumber opening their dashboard at 8 AM does not think "I need to go to Calls." They think: "What happened overnight? Is anything broken? Who do I need to call back? When is my next job?"

The IA is structured around data entities (Calls, Leads) rather than operator workflows (Respond, Monitor, Review, Configure).

### 2.2 Structural Gaps

**Missing entirely:**
- Notification / alert center (actionable items)
- AI health / trust indicators (how is the AI performing?)
- Conversation quality signals (did the AI handle that well?)
- Caller intelligence (who calls repeatedly? what patterns?)
- Performance trends vs. targets
- Dead leads requiring follow-up surface

**Buried or absent:**
- `getFollowUpQueue()` exists in api.ts but is never rendered anywhere
- `getMissedCallQueue()` exists but is never rendered anywhere
- `getMissedCallHeatmap()` exists but is never rendered anywhere
- `markLeadContacted()` and `markLeadBooked()` are API actions with no surface in the Leads page UI (leads are read-only in the list)

---

## 3. Section-by-Section Assessment

### 3.1 Overview Page

**What works:**
- `LiveStatusBar` at the bottom is a good trust anchor ("Orvia is live and ready for calls")
- `Needs Review` exceptions section appears conditionally and immediately captures attention
- `BillingWidget` with segmented track is a smart non-alarming meter
- Greeting personalization creates warmth appropriate for SMB audience
- Skeleton loading states prevent layout shifts

**What is weak:**

**KPIs are "Today" only with no context.** 4 stat cards - Calls Handled, Appointments, Leads Captured, Avg Call Length - show today's numbers. But a business owner has no idea if 3 calls is good or bad without context. There is no delta (vs. yesterday, vs. last week), no target, no trend direction. The sparklines (7-day data from `weeklyDays`) exist but are purely decorative - they give a shape but no interpretation.

**Avg Call Length is a weak KPI for this product.** It's the least actionable of the four. An SMB owner doesn't optimize for call length. They optimize for: Did the AI book the job? Did it miss anyone important? Replace with "Booking Rate" (appointments / calls) which is already computable from existing data - it's even calculated in `WeeklyChart` as `bookingRate` but not surfaced as a hero stat.

**"Coming Up Next" (ScheduleCard) is miscategorized.** It lives under "Schedule & Performance" alongside the `WeeklyChart`. But it is an operational/realtime item - it tells the owner what their day looks like. It should be at the top of the page, not buried in the second grid.

**The `LiveStatusBar` is at the very bottom.** The most important realtime signal (is the AI on a call right now?) is below the fold, rendered as a footer. This is backwards. If the AI is on a call this second, that should be the first thing the owner sees, not the last.

**`Needs Review` is conditional.** Good that it appears only when there are exceptions - but if there are no exceptions, the section disappears entirely. There is no "All clear" signal. The owner is left wondering "did it just not render, or is everything fine?"

**`recentCalls` is limited to 10.** The "Latest Calls" feed truncates at 10. This is a reasonable limit but the section title "Latest Calls" plus a "See all calls" link creates a dead-end pattern. The link goes to `/calls` which is a paginated list - there's no continuity of context.

**`GhostActivityRow` for empty state is misleading.** When there are no calls yet, three ghost rows with "Waiting for first call..." appear as if calls are loading. This creates false expectation of loading content - it should be a clear empty state, not an ambiguous skeleton.

### 3.2 Calls Page

**What works:**
- Date grouping (Today / Yesterday / specific date) is correct mental model
- Outcome badges with color coding give instant triage
- Caller avatar with outcome-colored initial is a strong visual pattern
- Empty state copy is contextually appropriate ("Orvia number" mention)

**What is weak:**

**No filtering or search.** The calls list is a flat chronological dump with pagination only. There is no ability to filter by outcome (show me all missed calls), by date range, or by service type. As call volume grows this becomes unusable. Intercom's conversation list has 8+ filter dimensions.

**Pagination without search is an anti-pattern at scale.** Page 2 of 20-call pages is meaningless. Operators need to find a specific call - "the guy who called Tuesday about the leak" - which requires search or filter, not pagination.

**No bulk actions.** Can't mark multiple calls as handled. Can't export. Can't flag.

**The page has no summary header.** Goes straight to a list. No "3 missed today" context, no "5 pending review" callout. The header just says "Calls" and a count.

**No live call indicator.** If the AI is on a call RIGHT NOW, the calls page gives no indication. The caller would appear in the list only after the call ends.

### 3.3 Call Detail Page

**What works:**
- Transcript in chat bubble format is the right approach - easy to read, follows iMessage/WhatsApp convention
- Audio player is clean and minimal
- Two-column layout (transcript left, metadata right) is correct information hierarchy for a detail view
- "Mark handled" action is surfaced appropriately
- Extracted data display logic (hiding false booleans, de-duplicating booked/lead_captured) is smart

**What is weak:**

**The hero card shows caller phone as the primary identifier** (`call.caller_phone ?? "Unknown caller"`). If the AI extracted a caller name (in `extracted_data.caller_name`), that name is buried in the sidebar "Call details" section. The name should be the headline when available.

**"Mark handled" is the only action available.** For a business owner reviewing a call, likely actions include: call this person back, create a follow-up task, flag for quality review, forward transcript. None of these exist.

**No navigation between calls.** After reviewing a call, there is no "next call" or "previous call" navigation. The only option is going back to the full list. Intercom, for contrast, allows you to step through tickets sequentially.

**No sentiment or quality signal.** The transcript is displayed but there's no automated quality indicator ("Did the AI handle this correctly?", "Caller seemed frustrated"), no confidence score, no flag for human review suggestion.

**Cost display is missing.** Each call has `cost_cents` in the data model but it is never shown. For an operator managing billing, call cost visibility is important.

### 3.4 Leads Page

**What works:**
- Status filter tabs (All / New / Contacted / Booked / Closed) match lead lifecycle
- Urgency badge system (emergency / urgent / routine / inquiry) is well-designed
- Phone number as a tappable `tel:` link is correct for mobile
- Status badges are color-coded consistently with the rest of the app

**What is weak:**

**Leads are entirely read-only in the list.** The API has `markLeadContacted()` and `markLeadBooked()` but neither is wired into the UI. To update a lead's status, there is no mechanism at all in the UI. Clicking a lead row navigates to the related call detail - which has no lead management either.

**No lead-focused actions.** Can't log a callback attempt, can't add a note, can't set a follow-up reminder, can't assign to a team member, can't export to CRM.

**The "Details" column header is vague.** It labels urgency + phone + status + time as "Details" - this is not a meaningful column label.

**No revenue or conversion tracking.** Leads with status "booked" are conversion events. There is no total pipeline value, no conversion rate from lead to booked, no time-to-contact metric.

**`getFollowUpQueue()` is built but never used.** There is already API logic to find leads without appointments in the last 72h. This is exactly the kind of "who do I need to follow up on?" view an SMB owner needs - it's dead code.

### 3.5 Settings Page

**What works:**
- Tab-based layout with dirty state indicators (dot on dirty tab) is smart
- `SaveBar` sliding up from bottom only when dirty is correct pattern - doesn't interrupt reading
- Confirm-before-remove for services and FAQs prevents accidental deletion
- Operating hours per-day with closed toggle is the right granularity

**What is weak:**

**"AI Assistant" settings are disconnected from behavior feedback.** The owner configures `receptionist_name`, `tone`, `language_preference`, `special_instructions` in a vacuum. There is no "test this configuration" or "preview how Orvia will respond to X" capability. They are writing instructions to a black box with no feedback loop.

**"Account" tab is just read-only IDs.** Business ID, Vapi Phone ID, Display Phone, Status - this is raw system data with no user value. It reads like a debug panel dumped into the settings.

**No "Danger zone" / reset configuration.** No way to reset to defaults, no configuration history, no way to see what changed last.

**Settings don't reflect live call impact.** When `special_instructions` changes, the save confirmation says "Saved - applies to next call" which is correct. But there's no way to verify what the AI is actually saying on calls without reviewing call transcripts manually.

**No notification preferences.** There's a `notification_phone` field in `BusinessSettings` type but it has no UI surface. The owner cannot configure "call me when there's a missed call" or "text me when someone books an emergency service."

---

## 4. Cognitive Load Analysis

### 4.1 The Scroll Problem

The overview page renders in this vertical order:
1. Header / greeting
2. "Today at a glance" (4 stat cards)
3. Billing widget
4. "Needs Review" exceptions (conditional)
5. "Schedule & Performance" (appointments + weekly chart)
6. "Recent Call Activity" (call feed)
7. Live status footer

An operator arriving in the morning has to scroll through 6 sections to get context. The most operationally urgent items (live status, exceptions) are not at the top. This is backwards for a product whose primary value is operational peace of mind.

### 4.2 The Passive vs. Active Problem

Most of the dashboard is passive - it shows data. Very little is active - only "Mark handled" on a call detail exists as a meaningful action. The dashboard is a viewer, not a control panel. For an operator whose job is to manage the AI, this is a significant gap.

### 4.3 The Trust Problem

A business owner trusting an AI to run their phones needs ongoing confidence signals:
- Is the AI saying the right things?
- Did it handle that emergency call correctly?
- How often does it fail or transfer?

Currently, the dashboard shows outcomes (booked, missed, transferred) but not quality. There is no "AI accuracy" or "exception rate" indicator. The "Needs Review" section shows transferred and failed calls, but there's no systemic quality narrative.

### 4.4 The "Did it work?" Gap

The AI books appointments. But there's no tracking of:
- Did the customer actually show up?
- Did the booked appointment convert to revenue?
- How many booked appointments were cancelled?

The `Appointment` type has `status` (confirmed, cancelled, completed, no_show) but this is never surfaced in the dashboard. The owner has no closure loop.

---

## 5. Realtime vs. Historical Separation

### 5.1 What should be realtime

| Signal | Current | Should be |
|---|---|---|
| Live call in progress | 10s polling (hidden at bottom) | Persistent visible banner, top of page |
| AI status (live/offline) | Header pill + sidebar card | Both (correct) |
| New call arrived (last 5 min) | In recent calls feed, 30s lag | Push-style notification / badge |
| Exception / transfer just happened | In "Needs Review" on next 30s refresh | Immediate alert |

### 5.2 What should be historical

| Signal | Current | Should be |
|---|---|---|
| Weekly call chart | Session-cached only, no auto-refresh | Historical, refresh on demand |
| Outcome breakdown | Not surfaced | Historical analytics tab |
| Missed call heatmap | Not surfaced | Historical analytics |
| Cost per call | Not surfaced | Historical billing view |
| Lead conversion funnel | Not surfaced | Historical pipeline view |

### 5.3 The Polling Problem

`getBriefing()` fires every 30 seconds to get today's counts. This is expensive (7 parallel Supabase queries on every poll) and blunt. The right architecture is:
- Supabase realtime subscriptions for `status = 'in_progress'` calls
- Polling only for aggregate counts (daily totals) at longer intervals (2-5 min)
- Push notification via `owner_phone` for high-urgency events

---

## 6. Comparison Against Strong SaaS / Operator Platforms

### 6.1 What Intercom does that Orvia should

- **Inbox model for actionable items.** Intercom's core is a unified inbox where every conversation that needs attention is surfaced. Orvia needs a similar "action required" inbox - missed calls, follow-up queue, exceptions - not just a list of all calls.
- **Conversation quality signals.** Intercom shows CSAT ratings, resolution time, first response time. Orvia needs AI quality indicators.
- **Saved views / filters.** Intercom lets you create custom inbox views. Orvia's calls page needs filter presets.

### 6.2 What Linear does that Orvia should

- **Triage-first landing page.** Linear's homepage is "what needs my attention now?" not "here's all your issues." Orvia's overview should lead with the action queue, not with vanity stats.
- **Keyboard-first navigation.** Linear's `G then C` for cycles, `G then B` for backlog. For a power user checking in daily, keyboard shortcuts reduce friction.
- **Clear state machine per item.** Linear's issue states are explicit and owned. Lead states in Orvia (new / contacted / booked) exist but have no transitions in the UI.

### 6.3 What Stripe does that Orvia should

- **Event stream.** Stripe's event log shows every significant action in chronological order with context. Orvia needs a business event stream: call received, booking created, lead captured, exception flagged, AI transferred call - all in one timeline.
- **Drill-down without context loss.** Stripe lets you click an event and expand it inline without losing your place. Orvia navigates away to a new page for every call detail.
- **Revenue framing.** Stripe makes every metric feel like it connects to money. Orvia's metrics feel disconnected from the business owner's actual goal (more revenue from inbound calls).

### 6.4 What Vapi's own dashboard does

Vapi shows call logs, cost per call, transcripts, latency metrics - but it's a developer tool, not a business owner tool. Orvia's opportunity is to take the raw Vapi data and frame it in business language: "3 jobs booked, $2,100 in potential revenue captured" rather than "3 calls completed, average latency 340ms."

### 6.5 What HubSpot does that Orvia should not do

HubSpot has dozens of tabs, nested views, custom object managers, and pipeline configuration. This is exactly the wrong model for an SMB home service operator. The risk as Orvia adds features is going HubSpot-heavy. Every new feature should ask: "Would a plumber who works 10 hours a day understand this in 5 seconds?"

---

## 7. What Existing Dashboard Elements are Weak or Unnecessary

| Element | Problem | Recommendation |
|---|---|---|
| Avg Call Length stat card | Not actionable for SMB operators | Replace with Booking Rate |
| `GhostActivityRow` empty state | Looks like loading state, confusing | Replace with clear empty state |
| "Account" settings tab | Just raw system IDs, no user value | Collapse into Preferences tab or remove |
| `LiveStatusBar` at page bottom | Critical info buried below fold | Move to top of page as persistent banner |
| "Today at a glance" as first section | Stats without context or deltas | Add week-over-week delta, make KPIs interpretable |
| Weekly chart without booking rate as a headline | Booking rate is the money metric | Surface bookingRate as a hero KPI |
| Leads page as read-only | Actions exist in API, not in UI | Add inline status transitions |
| Call detail with phone as hero identifier | Name is known from extracted_data | Use name as headline, phone as secondary |

---

## 8. Proposed Future Information Architecture

### 8.1 Navigation Structure (Recommended)

```
Orvia
  [LIVE indicator - persistent]
  ─────────────────────────
  HOME            [default: today's briefing]
  ACTION QUEUE    [badge count: items needing attention]
  CALLS           [full log with filters]
  LEADS           [pipeline with transitions]
  ─────────────────────────
  PERFORMANCE     [analytics, trends, AI quality]
  ─────────────────────────
  SETTINGS
  ─────────────────────────
  [AI Agent status mini-card]
  [User dropdown]
```

### 8.2 Section / Module Recommendations

#### Home (Today's Briefing)
- **Persistent live call banner** - top of page, prominent, shows caller phone + elapsed time when active
- **Action queue strip** - "2 missed calls need follow-up | 1 lead uncontacted for 4h" with direct action buttons
- **3 hero KPIs** - Calls Today, Booked Today (with booking rate %), Exceptions (with trend)
- **Next appointment** - single next upcoming appointment, large, time-until prominent
- **Today's call feed** - live-updating, most recent 5, link to full log
- **Billing meter** - same segmented design, moved to sidebar or bottom

#### Action Queue (New page - highest priority addition)
- Missed calls from last 48h (uses `getMissedCallQueue()`)
- Follow-up queue: leads without appointments from last 72h (uses `getFollowUpQueue()`)
- Exceptions: transferred + failed calls today
- Each item has a primary action button inline (Call back / Mark contacted / Mark handled)
- Empty state: "All clear. Nothing needs your attention." - explicit success state.

#### Calls (Enhanced)
- Outcome filter bar (All / Booked / Missed / Transferred / Lead)
- Date range picker (Today / This Week / Custom)
- Search by phone or caller name
- Live call indicator at top when call is in progress
- Each row: add quick actions on hover (Mark handled, Call back)
- Remove pagination in favor of infinite scroll or virtual list

#### Leads (Enhanced)
- Kanban-style status columns or enhanced list with inline status transitions
- "Follow up now" quick action - open phone app with `tel:` for each lead
- Time since capture prominence ("4h ago" in red if > 2h uncontacted)
- Conversion funnel mini-chart at top (X new → Y contacted → Z booked)

#### Performance (New page)
- Booking rate over time (line chart)
- Missed call heatmap by hour (uses `getMissedCallHeatmap()`)
- Outcome breakdown (uses `getOutcomeBreakdown()`)
- AI exception rate trend
- Cost per booked appointment (cost_cents / appointments)
- Top services requested (from extracted_data)

#### Settings (Restructured)
- Remove "Account" tab or merge into Preferences
- Add "Notifications" section for SMS/call alerts
- Add "Test your AI" button - triggers a simulated call or shows example responses
- AI Assistant tab: add "Preview" panel showing sample conversation based on current config

---

## 9. Mission Control Layout (Recommended)

The ideal Orvia home screen is a **mission control panel**, not an analytics page. The mental model is: the owner should be able to determine in 5 seconds whether anything needs their attention, and if not, close the tab.

```
┌─────────────────────────────────────────────────────────┐
│ ORVIA  [AI LIVE ●]                    [Action Queue: 2] │
├─────────────┬──────────────────────────────────────────┤
│ Home        │                                           │
│ Action Q [2]│  Good morning, Ahmed.  Thursday May 29   │
│ Calls       │  Orvia is live · 4 calls handled · 2 booked (50%) ← inline status │
│ Leads       │                                           │
│ ──────────  │  ┌── 2 ITEMS NEED ATTENTION ──────────┐  │
│ Performance │  │ Missed call  · John D. · 2h ago [Call back]│  │
│ ──────────  │  │ Follow-up   · Sarah M.· 4h ago [Mark contacted]│
│ Settings    │  └──────────────────────────────────────┘  │
│             │                                           │
│ [AI LIVE ●] │  Today ─────────────────────────────────  │
│  Handling   │  Calls: 4    Booked: 2    Leads: 1        │
│  calls 24/7 │  Booking rate: 50% ↑ (was 38% last week)  │
│ [Configure] │                                           │
│             │  Coming up next ──────────────────────────│
│ [User]      │  10:00 AM  Sarah Mitchell · Drain Cleaning │
│             │  2:30 PM   Carlos Rivera · Water Heater   │
│             │                                           │
│             │  Recent Calls ────────────────────────────│
│             │  ...                                      │
└─────────────┴──────────────────────────────────────────┘
```

Key principles:
- Action items are the first content below the greeting - not the last
- KPIs include context (delta vs. last week)
- Booking rate is front and center
- Upcoming schedule is immediately below KPIs (operational, not analytical)
- Recent calls is last (review, not triage)

---

## 10. Alerting and Intervention System

### 10.1 What should trigger alerts

| Event | Urgency | Channel |
|---|---|---|
| AI fails to handle a call | High | In-app banner + SMS to owner_phone |
| Emergency caller detected | Critical | SMS immediately |
| Missed call (no answer at all) | Medium | In-app badge |
| Lead uncontacted for > 2h | Medium | In-app banner |
| Call minutes running low (< 30 min) | High | In-app banner |
| Call minutes exhausted | Critical | In-app banner + SMS |
| AI offline (no vapi_phone_id) | High | Persistent error state |

### 10.2 Current alerting gaps

- The `notification_phone` field exists in `BusinessSettings` but has no UI for configuration
- `owner_phone` exists in the `businesses` table but no alert system uses it
- The only alerting in the UI is the "Needs Review" section on the overview page - and it requires the user to already be on the page

### 10.3 Recommended alert architecture

1. **In-app action queue badge** (already recommended above) - covers "check now" urgency
2. **SMS via `owner_phone`** for critical events (emergency call, minutes exhausted, AI failure) - no app open required
3. **Browser push notification** (opt-in) for medium events - new missed call while tab is open
4. **Email digest** - daily summary of calls, bookings, exceptions - for async review

---

## 11. Data Business Owners Actually Care About

Ranked by SMB home service operator mental priority:

1. **Did anyone call that I missed?** (Missed call queue)
2. **How many jobs did the AI book today?** (Appointments today + booking rate)
3. **Is there anyone I need to call back right now?** (Action queue)
4. **What's coming up today?** (Today's appointments)
5. **Is the AI working?** (Live status)
6. **How many calls came in this week?** (Weekly chart - secondary)
7. **Who called about what?** (Call log with notes - for context, not daily)
8. **Are my minutes running out?** (Billing meter)

**Data business owners mostly do NOT care about day-to-day:**
- Avg call length (not actionable)
- Outcome breakdown chart (analytical, monthly review)
- Missed call heatmap (quarterly strategic)
- Raw call counts without conversion framing

---

## 12. Conversation Intelligence Opportunities

The `transcript` field on each call contains the full AI-human conversation. The `extracted_data` field contains structured AI analysis. These are currently used only for display. Opportunities:

### 12.1 AI Quality Score

Derive from transcript: Did the AI collect name? Did it resolve the caller's need? Did it avoid incorrect information? Surface as a simple 1-5 star or color indicator on each call row.

### 12.2 Common Patterns Surface

Aggregate `extracted_data.service_requested` across calls. Surface: "Most requested service this week: Drain Cleaning (8 calls)." This helps owners stock inventory and staff appropriately.

### 12.3 Sentiment Detection

Even simple keyword analysis of transcripts can flag negative sentiment ("this is ridiculous", "you're not helping me") for human review. Operators need to know when callers are frustrated.

### 12.4 Script Compliance

If `special_instructions` say "always ask for ZIP code first" - verify in transcripts whether the AI is actually doing it. Flag deviations. This closes the settings-to-behavior feedback loop.

### 12.5 Repeat Caller Intelligence

`is_repeat_caller` is already computed but only shown as a "RETURN" tag. Surface it more prominently: "This customer has called 3 times this month. Previous calls: [links]." Operators want to know who their repeat customers are.

---

## 13. Progressive Disclosure Recommendations

The dashboard serves two modes: **morning scan** (3-5 seconds, "is anything wrong?") and **deep review** (10-15 minutes, "let me understand what happened"). Currently it only serves deep review mode.

### 13.1 Layer 1 - Glance (immediate, no scroll)

- AI status (live/offline)
- Action queue count
- Today's booking count + booking rate
- Next appointment

### 13.2 Layer 2 - Scan (scroll, 30 seconds)

- Action queue items (expandable)
- Today's call feed (last 5)
- Billing meter

### 13.3 Layer 3 - Review (click-through, minutes)

- Full call log with filters
- Individual call transcripts
- Lead pipeline
- Weekly performance chart

### 13.4 Layer 4 - Analyze (periodic, not daily)

- Performance tab: trends, heatmaps, conversion funnels
- Cost analysis
- AI quality review

---

## 14. Visual Hierarchy Problems

(Structural, not cosmetic)

**Problem 1 - Equal weight on everything.** All 4 stat cards have equal visual weight. Booking rate (the conversion metric) should be 2x the size of avg call length (operational detail). Hierarchy communicates priority.

**Problem 2 - "Needs Review" section is fragile.** When exceptions list is empty, the section disappears. The empty success state should be explicit, not invisible.

**Problem 3 - The live call indicator is a text line.** When a call is actively happening, the entire page should subtly communicate this - not just a 6px dot at the bottom. A gentle top banner, a sidebar animation, something that persists while scrolling.

**Problem 4 - Settings Save Bar** uses full viewport-width black bar for a contextual save action. This is visually jarring. Intercom uses an inline save button at the section level. Notion uses a subtle top bar. The current approach treats every setting change as a high-drama event.

**Problem 5 - Empty states are inconsistent.** `GhostActivityRow` looks like loading. The calls empty state is a centered icon + text. The leads empty state is identical but different copy. These should follow a unified empty state system.

---

## 15. Sidebar / Navigation Scalability

### 15.1 Current problem

The sidebar has 4 destinations: Overview, Calls, Leads, Settings. This is fine for V1. But the `AI Agent - LIVE` card already clutters the sidebar with a duplicated status indicator. As the product grows, the sidebar will become crowded without a clear organization principle.

### 15.2 Recommended structure as product grows

```
PRIMARY (daily use)
  Home
  Action Queue  [badge]
  Calls
  Leads

SECONDARY (weekly use)
  Performance

TERTIARY (infrequent)
  Settings

SYSTEM (pinned bottom)
  [AI Status mini-badge - not a full card]
  [User avatar / dropdown]
```

The current "AI Agent" card in the sidebar should shrink to a one-line status indicator with a green/red dot, not a 100px card with a "Configure" button. The Configure button should live in Settings.

### 15.3 Scalability principle

Each top-level nav item should represent a distinct operator workflow:
- **Home** - What's happening now?
- **Action Queue** - What do I need to do?
- **Calls** - What happened?
- **Leads** - Who are my prospects?
- **Performance** - How are we trending?
- **Settings** - How is the AI configured?

Never add a nav item that is a data entity (no "Appointments" as top-level). Always add a nav item that is a workflow.

---

## 16. Vanity Metrics vs. Actionable Metrics

### 16.1 Current vanity metrics

| Metric | Why it's weak |
|---|---|
| Total calls today | No context, no target |
| Avg call length | Not actionable for SMB |
| Total leads (count) | Without conversion rate, meaningless |
| Weekly bar chart (calls only) | No goal line, no trend interpretation |

### 16.2 Metrics that should replace or augment them

| Metric | Why it's strong |
|---|---|
| Booking rate (%) with delta | Shows AI effectiveness, comparable week to week |
| Follow-up response rate | Did you call back leads promptly? |
| Missed call rate (%) | Inverse of AI reliability |
| Average time-to-contact (for leads) | Operational performance metric |
| Cost per booking | Connects to ROI, justifies the product |
| Exception rate (transfers + failures / total) | AI quality monitoring |

---

## 17. Recommended Principles for AI Receptionist Operational Dashboards

1. **Triage before analytics.** The homepage is an action queue, not a metrics page. Operators need to know what demands their attention before they see how last week went.

2. **Trust is built through transparency, not numbers.** Show what the AI said (transcripts), show when it got it wrong (exceptions), show quality indicators. A high booking number means nothing if the owner doesn't trust how the AI got there.

3. **Realtime state must be persistent and above the fold.** Is the AI alive? Is it on a call? This cannot be a footer. It must be immediately visible at all times.

4. **Actions belong where data is discovered.** If the owner sees a missed call in the feed, they should be able to call back from that same row. Don't make them navigate to a separate CRM flow.

5. **Empty states are success states.** "Nothing needs your attention" is the best possible state for an AI receptionist platform. Design empty states as celebrations, not vacuums.

6. **Every metric needs a frame.** "4 calls" is information. "4 calls, 2 booked (50%, up from 33% last week)" is intelligence. Always provide context alongside numbers.

7. **Settings should predict behavior.** When an owner writes a special instruction, they should be able to see (or simulate) how it affects the AI's responses. Configuration without feedback is a black box that erodes trust.

8. **Mobile-first for check-ins, desktop-first for review.** An SMB owner checks their dashboard on their phone while on-site. The glance layer (status + action queue) must be thumb-navigable. The review layer (call transcripts, weekly charts) is OK on desktop.

9. **Surface what the AI cannot do.** If a caller asked about something outside the service area, or a service not in the list, or spoke a language not configured - surface these as learning moments, not silent failures.

10. **Revenue framing over volume framing.** "2 jobs booked" is good. "2 jobs booked, estimated $800-1,400 in revenue" (using price ranges from `service_details`) is what business owners actually care about.

---

## 18. Prioritized Recommendations

### P0 - Immediately valuable (this sprint)

1. Move `LiveStatusBar` to the top of the overview page as a persistent banner
2. Wire `getFollowUpQueue()` and `getMissedCallQueue()` into an "Action Queue" section on the overview
3. Add booking rate as a hero stat (replacing avg call length or adding as 5th card)
4. Add week-over-week delta to all stat cards
5. Fix "Needs Review" empty state - show explicit "All clear" when list is empty
6. Add inline status transitions to Leads page (mark contacted / mark booked buttons)

### P1 - High value (next 2 sprints)

7. Add call log filtering by outcome and date range
8. Add search to calls list (by phone, caller name)
9. Add "Action Queue" as a top-level navigation destination with badge count
10. Use caller name (from extracted_data) as hero identifier in call detail
11. Add next/previous call navigation in call detail
12. Surface `notification_phone` configuration in Settings > Notifications

### P2 - Strategic features (next milestone)

13. Performance analytics page (missed call heatmap, outcome breakdown, cost per booking)
14. AI quality signals on call rows (basic transcript completeness indicator)
15. "Test your AI" configuration in AI Assistant settings
16. Revenue framing for booked appointments using service price ranges
17. Browser push notifications for high-urgency events
18. Kanban or inline pipeline view for Leads

### P3 - Long-term platform capabilities

19. Conversation intelligence: common service patterns, sentiment detection, script compliance
20. SMS alerts via owner_phone for critical events
21. Repeat caller profile with full call history
22. Daily email digest
23. Export functionality (CSV, CRM integration)
24. Multi-staff support (role-based visibility)

---

*Report generated from full codebase review of scalyft-orvia. All findings are grounded in the actual component code, API functions, and data models as they exist today.*
