# Money Flow — architecture and experience review

An end-to-end review of the app as it stands, and a proposal for what it should
become. Written against `docs/SCREENS.md` and verified against the source, not
taken on trust — several figures the app prints today are wrong, and two of
them contradict each other on the same screen.

Nothing here removes a feature. Nothing here changes the palette, the type, or
the Paper/Ink identity. This is the same product, better organised and
honestly calculated.

**Second pass.** This version merges a second redesign spec written against the
same source document. Where that spec found something I missed, it is folded in
and credited in place (1.3.8–1.3.10 are all its finds, and the mobile
navigation in 2.2 is its solution, which is better than mine was). Where the
two specs disagree, I have not quietly picked one — **Part 8** lays out each
disagreement and argues the call, so you can overrule it.

---

# Part 1 — What is wrong today

## 1.1 The structural problem: the app is organised by noun, not by question

The six screens are named after *things* — transactions, investments, people,
analytics. But nobody opens a money app thinking "I would like to look at some
analytics." They open it with a question, and the questions have a shape:

| The question | Time horizon | Where it lives today |
| --- | --- | --- |
| Can I afford this? | now | Dashboard, partly |
| How is this month going? | this month | Dashboard *and* Analytics |
| Am I getting better at this? | all time | Dashboard *and* Analytics |
| Am I going to hit my goal? | future | Investments, at the bottom |
| Where does my money come from? | recurring | Settings (!) |
| What did I spend on the 4th? | a point | Transactions |

Three of those questions are answered in two places each, and one — income —
is answered inside a settings screen. **The dashboard and Analytics are 60%
the same content at different densities**: both open with a spend hero, a flow
curve, a delta, a stat strip, a category donut and a person breakdown. That is
not two screens. That is one screen and its own summary.

Meanwhile the app mixes time horizons *within* single screens. Today's
dashboard carries a monthly tally and a lifetime total stacked on top of each
other; Analytics carries "what a Thursday costs this month" and "12 months of
spending" in the same scroll. The reader has to keep re-orienting.

**The fix is to sort by time horizon, not by noun.** Now, this month, all time,
the future. That single move creates the Monthly and Lifetime pages you asked
for, and it does it by *separating things that are already there* rather than
inventing content.

## 1.2 Things in the wrong place

| What | Where it is | Where it belongs | Why |
| --- | --- | --- | --- |
| **Income** | A section inside Settings | Its own page | Income is data you log monthly, not a preference you set once. Putting it in Settings is why it took three attempts to make it findable. |
| **Budget progress** | A card inside Settings | Monthly | A budget *limit* is a setting. A budget *bar filling up* is this month's most actionable analytic, and it is currently three taps from the dashboard. |
| **Goals** | Bottom of Investments, plus a strip on the dashboard | Its own page, first | A goal is the only forward-looking object in the app. It should not be a subsection of a contributions log. |
| **Lifetime in hand** | Dashboard | Lifetime | It is the one card that ignores the month picker sitting directly above it. That is confusing by construction. |
| **Signals** | Dashboard sidebar | Monthly | Six derived one-liners is analysis, not a glance. |
| **Lending totals** | Split across Dashboard stat strip, People, Analytics | People (owned), summarised elsewhere | Fine as is, but the *definition* needs fixing — see 1.3.6. |

## 1.3 Calculations that are wrong

I checked every derived figure in the documentation against the code. These
are the ones that do not say what they claim to.

### 1.3.1 Two contradictory "vs last month" figures on the same page — **bug**

Analytics prints a delta twice, computed two different ways.

- The **hero delta** comes from `flow.pace.deltaPct`, which compares
  month-to-date against *the same days of last month*
  (`src/lib/flow.ts` — `prevSameDayMinor`). This is correct.
- The **stat strip "Vs last month"** comes from `summary.changePct`, which
  compares month-to-date against *the whole of last month*
  (`src/lib/analytics.ts` — `getSummary`). This is not.

On the 5th of a month, the hero can say "+12% against this day last month"
while the strip beside it says "−82% vs last month". Both are on screen at
once. The second one is wrong for every day of the month except the last.

**Fix:** delete `changePct` and have the strip read `flow.pace.deltaPct`. If a
full-month comparison is genuinely wanted for a *completed* month, gate it —
`isCurrentMonth ? sameDay : fullMonth` — and label which one is showing.

### 1.3.2 Momentum compares a part-month against full months — **bug**

`flow.momentum` sets `thisMinor` to month-to-date spending per category and
`baselineMinor` to the trailing three months divided by three — a full-month
average. On the 5th, every category is 80% "cooling down". The card
confidently draws red and green bars off a comparison that is structurally
biased for 29 days out of 30.

**Fix:** in the current month, pro-rate the baseline to the elapsed fraction:

```
baseline = (trailing3Total / 3) × (elapsedDays / monthDays)
```

and label the card "so far this month, against the usual pace by now".

### 1.3.3 "What a weekday costs" divides by the wrong denominator — **bug**

`weekdayTotals` computes `days` as `COUNT(DISTINCT expense_date)` — days that
*had spending*. So if there were four Thursdays and you spent on one of them,
the average is the whole of that one day.

The insight built on it then reads *"A Thursday costs ₹3,645 on average,
against ₹1,894 on every other day"* — a sentence that is false whenever your
spending is bursty, which is exactly when someone would look at this chart.

**Fix:** divide by the number of that weekday that has *occurred* in the
window (capped at today for the current month). Add a second, smaller figure —
"on the N Thursdays you spent" — if the conditional average is still wanted;
they answer different questions and both are interesting.

### 1.3.4 "Today" and "This week" ignore the month you are looking at — **bug**

`getSummary` computes `todayMinor` and `weekMinor` from the real calendar date,
not from the requested month. Browse to August and the dashboard prints
*"Today ₹71 · This week ₹1,884"* — September figures, inside an August page,
under an August heading.

**Fix:** two options, and I would take the first.
1. **Remove the month picker from Home entirely.** Home is *now*; month
   browsing belongs on Monthly. This makes the bug impossible rather than
   fixed, and it is the right IA anyway (see 2.2).
2. If the picker stays, blank these two tiles for a non-current month and
   substitute something month-appropriate — "busiest day", "quiet days".

### 1.3.5 The Transactions stat strip totals the page, not the month — **bug**

`totals` is computed from `data.items`, which the API caps at `limit` (150,
raised 150 at a time by **Load more**). A month with 200 transactions shows a
"Spent" figure that is missing 50 of them, and silently corrects itself when
you scroll. The `N shown` sub-label hints at it, but the number is presented
as a stat, not a running subtotal.

**Fix:** have the transactions endpoint return aggregate totals for the *full
filtered set* alongside the paged rows. The strip then always describes the
filter, and the list is free to page.

### 1.3.6 "Lifetime in hand" claims to be cash but ignores the ledger — **bug**

The card subtracts investments and explains why: *"this is cash, not net
worth"*. But `getLifetimeTally` joins only `expenses` and `categories`.
`ledger_entries` is a separate table and is not touched.

So money you lent out — which has genuinely left your account — is not
subtracted, and money you borrowed is not added. With ₹12,350 lent out, the
card overstates your cash by ₹12,350 while explaining its own rigour.

**Fix:** either
- include the ledger: `in − spent − invested − lent + borrowed`, or
- rename it to something the arithmetic supports and show the ledger position
  as a fourth line.

I would do both — see the **Net position** block in 3.4, which is the honest
version of this card and resolves it properly.

### 1.3.7 "What you keep" averages percentages, not money — **wrong, and mine**

`SavingsHistory` computes its footer as the unweighted mean of the monthly
rates. A ₹5,000 month at 90% counts exactly as much as a ₹50,000 month at 20%.

**Fix:** pool it — `Σsaved ÷ Σincome` — and label it "across N months with
income logged". Keep the per-month rates as they are; only the footer is wrong.

### 1.3.8 The sweep compares months of different length — **bug**

`getSweep` subtracts one month's raw total from another's. February has 28
days and March has 31, so a March that was genuinely 10% lighter per day can
report a *smaller* underspend than a flat February — purely arithmetic on the
calendar, presented as a behaviour change.

**Fix:** normalise the comparison by day count —
`(prevTotal / prevDays) − (thisTotal / thisDays)` scaled back up — for the
*framing*. Keep the raw rupee figure as the amount offered to sweep, because
that is the cash that actually exists. Only the "you underspent" claim needs
the correction, not the transfer.

### 1.3.9 Momentum penalises categories younger than its own window — **bug**

Separate from 1.3.2, and both are live.

`baselineMinor = trailing3MonthTotal / 3`. A category created five weeks ago
has at most two months inside that window, so its baseline is divided by three
regardless — roughly a third of its true typical spend. The card then reports
it as heating up, every month, until the category is three months old.

The `isNew` flag does not catch this: it only fires when the baseline is
exactly zero, and a five-week-old category has a non-zero one.

**Fix:** divide by the number of months the category actually existed and was
active inside the window. `categories.created_at` is already on the table
(`src/db/schema.ts`), so this needs no migration. Below two eligible months,
fall back to the `new` label the card already has rather than computing a delta
from thin evidence.

### 1.3.10 Category projection extrapolates lumpy categories — **bug**

`src/app/api/insights/category/[id]/route.ts` projects a category's month-end
as `(monthTotal / daysElapsed) × daysInMonth`, flat, with no gate.

For rent — one ₹18,000 charge on the 1st — that reads ₹5,58,000 on day 1,
₹2,79,000 on day 2, and keeps falling all month. It is never once right.

**Fix:** apply the honesty gate the app already uses for goal pace. Below four
transactions in the trailing three months, show no projection and say why.
Above it, weight by that category's own day-of-month distribution rather than
assuming an even burn.

### 1.3.11 Definitions that are defensible but unlabelled

Not bugs, but each will be read wrongly at least once:

| Figure | What it actually is | What to do |
| --- | --- | --- |
| Investments **"Monthly average"** | Lifetime ÷ *months that had a contribution*. Skipping three months does not lower it. | Label it "per active month", or show both. |
| **"Under ₹200"** small-ticket total | A hardcoded constant (`SMALL_TICKET_MINOR`), not derived from your data. ₹200 is pocket change for one household and the median transaction for another. | Derive it per user — the 25th percentile of the trailing three months — with the constant as the cold-start fallback, and allow an override in Settings. |
| **First half / second half** | Splits at `ceil(monthDays/2)` regardless of today. On the 8th, the second half is always ₹0. | Hide in the current month until the midpoint passes. |
| **Projected month end** | Straight-line extrapolation of the daily rate. | Fine, but it ignores that rent lands on the 1st. Once recurring detection is trustworthy, project `spent + remaining recurring + (discretionary rate × days left)`. |
| Person **"share"** | Correct and well documented — shares partition the month. | Nothing. This one is genuinely right, and it is the best idea in the app. |

## 1.4 UX problems, screen by screen

**Dashboard** is nine stacked blocks, three of which duplicate Analytics. There
is no single answer at the top — you have to read four cards to know if the
month is going well.

**Transactions** is the strongest screen in the app: sticky day headings,
clustering, shift-click to filter, undo on delete. Its gaps are range (month
only), search scope (notes only), and no bulk operations.

**Investments** buries the only forward-looking thing in the app (goals) under
a contributions hero, and mixes "how much did I put in" with "will I get
there" — two different questions.

**People** is well designed and correctly conservative about never adding the
two figures. It lacks any sense of *time*: no "owed since", no ageing.

**Analytics** is a 15-section scroll with no navigation inside it. Finding
"what you keep" means scrolling past nine cards.

**Settings** is doing three jobs: preferences, income data entry, and budget
reporting. Two of those are not settings.

---

# Part 2 — The proposed structure

## 2.1 The organising principle

> **Sort by time horizon. Record on the left, understand on the right.**

Four horizons, and every figure in the app belongs to exactly one:

```
   NOW            THIS MONTH          ALL TIME           AHEAD
   Home           Month               Lifetime           Goals
```

Plus three **record** surfaces — the places you put data in: Ledger, Income,
People — and Settings for configuration.

The test for any new figure: *which horizon is this?* If the answer is "two",
it belongs on the more specific one, with a link from the other.

## 2.2 Navigation

**Desktop sidebar — grouped, 8 destinations:**

```
  ▸ Home

  RECORD
  ▸ Ledger
  ▸ Income
  ▸ People

  UNDERSTAND
  ▸ This month
  ▸ Lifetime
  ▸ Goals

  ─────────────
  Sid · Settings · Sign out
```

The group labels do real work: they tell a new user that the app has an *in*
side and an *out* side, which is the one thing the current flat list hides.

**Mobile — five tabs:**

```
  Home   Ledger   Goals   Insights ▾   People
```

Eight destinations, five slots. My first cut dropped Lifetime out of the bar
entirely; **the second spec's solution is better and is the one adopted here**
— *Insights* is one tab holding both analytics pages, with a segmented control
at the top switching Month / Lifetime.

That works because it introduces no new navigation idea. The app already
teaches segmented switching on the dashboard's Category/Person toggle and on
the add sheet's four kinds. Two routes, one tab, a control the user has already
learned.

**Income** stays out of the bar and lives in the mobile header beside Settings
— it is a monthly-or-rarer visit, and Home carries a card that links to it.

**Routes** keep the analytics namespace, which makes the pairing legible in the
URL and in the file tree:

| Page | Route |
| --- | --- |
| Dashboard | `/dashboard` |
| Income | `/income` |
| Ledger | `/expenses` *(kept — renaming a working route buys nothing)* |
| Goals & Investments | `/goals` |
| Monthly analytics | `/analytics/month` |
| Lifetime analytics | `/analytics/lifetime` |
| People | `/people` |
| Settings | `/settings` |
| Import | `/settings/import` *(sub-flow, not nav)* |

**Rules for the shell:**
- **Home has no month picker.** Home is now. This is what kills 1.3.4.
- The month picker lives on Month, Ledger and People, and those three
  **share one month selection** so stepping to July on Month and then opening
  the Ledger does not silently reset you to September.
- Lifetime and Goals have no month picker at all.

## 2.3 What moves

| Content | From | To |
| --- | --- | --- |
| Income section + sheet | Settings | **Income** |
| Budget progress card | Settings | **Month** (setting the limit stays in the category sheet) |
| Lifetime in hand | Dashboard | **Lifetime** (Home keeps a one-line summary that links) |
| Signals | Dashboard | **Month** |
| Category donut, person split | Dashboard *and* Analytics | **Month** (Home keeps top 3) |
| Goals | Bottom of Investments | **Goals**, first thing |
| Investment contributions | Investments | **Goals**, below the goals |
| "The long view", "What you keep" | Analytics | **Lifetime** |
| Rhythm, tickets, repeats, momentum | Analytics | **Month** |

Nothing is deleted. Every card in `SCREENS.md` has a destination.

---

# Part 3 — Each page, section by section

## 3.1 Home — `/`

> One question: **is this month going well, and is there anything I should do
> about it?** Everything else is a link.

Target: **five blocks**, readable in one screen on desktop and two thumb-flicks
on mobile.

### 1. The answer
The month tally, promoted to the top and given the whole width.

```
SEPTEMBER · SO FAR                              ₹40,000 came in
₹14,634  left in hand
▓▓▓▓▓▓▓▓▓▓░░░░░░ ▓▓▓▓▓ ░░░░░░░░░░░░░░
● Spent ₹25,366   ● Invested ₹0   ● Left ₹14,634
```

Everything the current MonthTally does, unchanged — including the negative
case, the income mark and the qualified savings-rate caption.

### 2. Needs your attention — *new*
A rules-driven list, shown only when a rule fires. This is the single highest-
value addition in this document: it converts the app from something you *read*
into something that *tells you*.

| Rule | Message | Action |
| --- | --- | --- |
| No income logged, and it is past your usual pay day | "September pay not logged yet — last month it landed on the 1st." | Log income |
| Goal behind pace by more than one month's contribution | "New Bike is ₹8,400 behind. ₹12,000/month gets it back on track." | Add to goal |
| Category over budget | "Outside Food is ₹1,200 over its ₹4,000 budget with 9 days left." | Open category |
| Category on track to exceed | "Transport will pass its budget around the 24th at this rate." | Open category |
| Someone has owed you >30 days | "Sankalp has owed ₹2,400 since 3 August." | Settle up |
| Spending 40%+ above the same point last month | "You are ₹6,000 ahead of last month by today." | Open Month |
| Last month underspent *(the existing sweep)* | "You spent ₹4,200 less in August." | Move it to a goal |

Each row is dismissible for the month. Empty state is a single quiet line —
*"Nothing needs you. September is on track."* — which is itself worth seeing.

### 3. The month at a glance
A compact strip, then the flow curve:
`Spent · Projected · Today · Net with people`
plus the cumulative curve against last month's dashed line.
**Open This month →**

**Added — "vs a typical week".** A chip beside *This week* reading
`18% above your typical week`, computed as `thisWeek ÷ median(last 8 weeks)`.
It turns a raw number into a judgement without a trip to Analytics, which is
exactly what a glance screen is for. *(From the second spec.)*

### 4. Goals
Top three by urgency (behind pace first, then nearest deadline), one row each.
**All goals →**

### 5. Recent activity
Five rows. **View all →**

**Removed from Home:** Lifetime in hand card (→ a single line in the footer of
block 1: *"₹7,767 kept across 2 months →"*), Signals, the donut, the
person split, the month picker.

## 3.2 Ledger — `/ledger` *(today `/expenses`)*

> The one screen you asked me not to break. Keep everything; fix the total and
> add reach.

**Unchanged:** day grouping, sticky headings with subtotals, clustering, the
cluster popup, shift-click filtering, edit/delete with undo, the filters sheet,
`?person=` deep link.

**Fixed:**
- The stat strip totals the **whole filtered set**, not the loaded page (1.3.5).

**Added:**
- **Range beyond a month.** The month picker gains a dropdown: *This month ·
  Last month · Last 3 months · This year · All time · Custom…*. Everything
  else on the screen already works on a date range; only the picker is
  month-shaped.
- **Search covers amount and person**, not just notes. Typing `450` finds
  ₹450; typing a name filters to them.
- **Saved views.** Any filter combination can be starred and named —
  "Sankalp, unsettled", "Cash only". They appear as chips beside the quick
  filters. Stored locally; no schema change.
- **Bulk select** on long-press / shift-click: recategorise or delete many at
  once, with one undo covering the batch. The single most requested thing in
  any ledger app, and cheap here because delete is already soft.
- **Keyboard**: `j`/`k` move, `e` edit, `⌫` delete, `/` search.

## 3.3 This month — `/month`

> Everything time-boxed to one month, in the order the questions occur. The
> month picker is this page's primary control.

A **sticky section rail** across the top — `Pace · Budgets · Where · Who ·
Rhythm · Tickets` — so a 12-section page is navigable. This is the fix for
Analytics being an undifferentiated scroll.

| Section | Content | Change from today |
| --- | --- | --- |
| **Pace** | Spent hero, corrected delta, projection, flow curve, first/second half | Delta unified (1.3.1); halves hidden pre-midpoint (1.3.11) |
| **Budgets** | Per-category budget bars with pace markers, and the roll-up | **Moved here from Settings.** This is the actionable part of a month. |
| **Where it went** | Donut, full breakdown, person filter chips, concentration insight, drill-down | Unchanged |
| **Who it was with** | Person shares, "nobody tagged", the partition note | Unchanged |
| **Rhythm** | Weekday costs, day-by-day bars, spend/quiet days | Weekday denominator fixed (1.3.3) |
| **Momentum** | Heating up / cooling down | Baseline pro-rated (1.3.2) |
| **Tickets** | Typical, largest, small-ticket share, repeats | Threshold derived (1.3.11) |
| **Signals** | The six derived one-liners | **Moved here from Dashboard** |
| **Not spending** | Investing separately, Lending separately | Unchanged |
| **Close the month** — *new* | Appears from the 1st–5th for the month just ended: what you kept, best and worst category, the sweep offer, and a one-tap "looks right" | New |
| **This month's one thing** — *new* | A single auto-picked headline directly under the hero: the biggest mover, `argmax(|categoryDelta|)` across categories with 2+ eligible comparison months. Leads with a conclusion instead of asking the reader to find it. *(From the second spec.)* | New |

**Month close** deserves its own note. A monthly review is the single habit
that makes budgeting work, and no app prompts it. Five days, one card, three
figures and one action.

## 3.4 Lifetime — `/lifetime`

> The running total the months are instalments of. No month picker.

### 1. Net position — *new, and the fix for 1.3.6*
The honest full picture, which no current screen gives:

```
WHAT YOU HAVE BUILT
₹1,84,000                     Cash in hand      ₹  7,767
                              Invested          ₹1,88,583
                              Owed to you       ₹ 12,350
                              You owe           −₹24,700
                              ───────────────────────────
                              Net position      ₹1,84,000
```

- **Cash in hand** = the corrected lifetime figure, *now including the ledger*.
- **Invested** is added back here — this is net position, not cash, and the
  card says which is which. That is precisely the distinction the current
  lifetime card gestures at and then gets wrong.
- Every line links to the screen that owns it.

### 2. Lifetime in hand
The existing card, moved here intact, with the ledger correction.

### 3. In, out and kept — by month
A grouped bar chart, 12–24 months: income, spending, invested. The one chart
that shows the whole story at once, which the app currently cannot draw.

### 4. What you keep
The savings-rate history, with the **pooled** footer (1.3.7).

### 5. What you spend
The existing 12-month bars. Tap to open that month.

### 6. Category trends — *new*
Which categories are growing and shrinking over 6–12 months, as small
sparklines. Momentum answers "this month"; this answers "this year", and they
are different questions.

### 7. Category totals, all time — *new*
Every category ranked by lifetime spend. Sits beside the trends above: one
answers "what is growing", this one answers "what has this cost me, ever".
*(From the second spec.)*

### 8. Milestones — *new*
Best saving month · longest streak of positive months · first entry ·
total transactions · biggest single month. Cheap to compute, and the only
place the app ever congratulates anyone.

### 9. People, lifetime
Lifetime share per person, plus the all-time ledger picture the app has never
shown anywhere: total ever lent, total ever received back, and the net across
everyone. Today the ledger is only ever visible as a *current* balance.
*(From the second spec.)*

### 10. Year over year — *new, gated at 12 months*
Spend, income and saved per calendar year, side by side. Withheld below twelve
months of history rather than drawn from a fragment — the same gate the app
applies to goal pace. The one horizon nothing currently shows.
*(From the second spec.)*

**A caching note.** Nothing on this page is month-filtered, so unlike Monthly
it has no skeleton-racing-a-filter problem: the whole page can be fetched once
and cached hard, and after the first visit should skip the loading state
entirely.

## 3.5 Goals — `/goals`

> The only forward-looking screen. Goals first, contributions second.

### 1. All goals together — *new*
```
₹2,20,000 targeted · ₹28,000 saved · ₹18,000 a month to stay on track
```
One line, and it is the number that decides whether the whole plan is
realistic. Today you have to add the goal cards up in your head.

If the monthly commitment exceeds a sensible share of income, say so here —
this is the honest home for the "goals ask for more than the month has left"
message currently on the dashboard.

### 2. Goal cards
The existing FundCard, unchanged: progress, pace, "just started" gating,
projection, add-to-goal. Sorted by urgency.

**Added — the what-if slider.** Drag "₹X more a month" and watch the
projected date move. Turns a static target into something you can negotiate
with, which is the difference between a goal you set and a goal you keep.

### 3. Contributions
The whole existing Investments content, below the goals it explains: month
total, contributions-by-month bars, lifetime, where-it-is-going, every
contribution, and the "what you put in, not what it is worth" footnote.

**Added — the category behind it.** Every goal is an investment category with
a target; the app knows this and never says so. Each card gains a quiet
`via <category>` tag, which makes the link legible without opening the category
sheet — and explains why a contribution logged against that category moves the
goal. *(From the second spec.)*

### 4. Completed goals
Archived, collapsed, with the date each was hit and **how long it took**
(`completedDate − firstContribution`). Currently a finished goal just sits in
the live list marked *done*, which is both clutter and a missed moment.

## 3.6 Income — `/income`

> Everything about money arriving. Lifted out of Settings and given room.

### 1. This month
Received so far, against your typical month, with each source's status —
*received 1 Sept* / *not yet*. The estimate logic already in `plan.ts`
(median of the last three) is surfaced here properly instead of being a
footnote.

### 2. Sources
One card per source: name, typical amount, typical day of month, last received,
and a sparkline of the last 12 months. **+ Source** opens the existing sheet.

### 3. Income by month
12–24 months of income as bars, with the median as a reference line.

### 4. How steady is it — *new*
For anyone freelancing: highest month, lowest month, median, and a plain-
English read — *"Your income varies by about ₹18,000 month to month. Budget
against ₹42,000 — your median — rather than your best month."* This is
genuinely useful advice and the app has the data for it already.

### 5. When it lands — *new*
A compact month strip marking the days income actually arrived. For salaried
income it is a single confident dot; for freelance it shows the real shape,
which an average actively hides. *(From the second spec.)*

### 6. Reliability, per source — *new*
Shown only at 4+ months of history, and only one of two sentences:

- Low variance in day-of-month → *"Salary has landed within 2 days of the 1st
  for the last five months."*
- High variance → *"Freelance varies month to month — plan against the median,
  ₹42,000, not the last figure."*

The second sentence is the most useful thing this app could say to anyone with
irregular income, and every input for it already exists. *(From the second
spec, merged with my stability block.)*

### 7. Expected next — *new*
Per source, the next expected date, learned from the last few payments. Feeds
the Home attention rule for unlogged pay.

### 8. Where this goes
One line: *"This is what feeds 'Left in hand' on your Dashboard"* — because the
relationship between logging pay here and a number moving there is currently
invisible.

## 3.7 People — `/people`

> Keep. Add time.

**Unchanged:** net position, they-owe/I-owe split, filters, the table with
shares and balances, settle, the person inspector, clear-history, the footnote.

**Added:**
- **An inline "your share" tag** on every per-person spend figure. The
  shares-not-copies rule is the best idea in the app and it is explained in a
  footnote people skim. The moment it needs explaining is when someone taps a
  person and the figure looks *too low* next to their memory of a big group
  dinner — so the explainer belongs on the figure, as a tappable ⓘ, not at the
  bottom of the page. *(From the second spec.)*
- **Ageing.** "Owed since 3 August · 34 days" on each balance, and an amber
  tint past 30 days. A balance with no age is a balance nobody chases.
- **Per-person timeline** in the inspector: expenses and ledger entries on one
  chronological axis instead of two tabs.
- **Settle-up reminder** as a Home attention rule.
- **Group settle** — one action across several people after a trip.

## 3.8 Settings — `/settings`

> Actually settings now.

**Stays:** categories (with reorder, budget limits, goal targets, icons,
colours), account, data (import/export), appearance, session.

**Leaves:** income (→ Income), budget progress (→ Month).

**Added:**
- **Recurring & bills** — the detector from `recurring.ts` is still computing,
  still tested, and currently feeds nothing. Give it a home where you can see
  what it thinks is a bill and **confirm or reject each one**. Confirmed bills
  are trustworthy; that is what makes "Still to come" safe to bring back, and
  it fixes the real problem (2 months of history is not enough evidence) with
  a human in the loop rather than a threshold.
- **Category merge** — for the duplicates every import creates.

---

# Part 4 — Interaction and motion

The rule: **motion explains a change, or it does not ship.** Everything below
respects `prefers-reduced-motion`, which should collapse every duration to 0
rather than removing the feedback.

## 4.1 Feedback on the things you do most

| Moment | Behaviour |
| --- | --- |
| **Save a transaction** | Sheet closes on a 180ms spring. The new row inserts into today's group with a 600ms accent wash that fades out. On mobile, a light haptic. |
| **Delete** | Row collapses its own height over 160ms rather than vanishing. The undo toast carries a **draining ring** so the window is visible, not guessed. |
| **Undo** | The row expands back with the same wash. Same motion, reversed — that is what makes it read as *undo* and not *re-add*. |
| **Contribute to a goal** | The progress bar animates to its new value over 500ms with a slight overshoot, and the percentage counts up. The one place in a money app where a small celebration is earned. |
| **Complete a goal** | A single restrained moment — the card's bar fills gold, the icon scales once. No confetti; that is not this product. |
| **Settle up** | The balance counts down to zero and the row's tint drains to neutral. |

## 4.2 Numbers

- **Hero figures count up** on first paint (~450ms, ease-out). You already have
  `lp-countup` on the landing page — reuse it. Only on mount and on a real
  change, never on a re-render.
- **Deltas** slide in from the direction of travel.
- **Bars and donuts** draw from zero on mount over 400ms, staggered 30ms.
  Never on a data refresh — only when the section first appears.
- **Sparklines** draw along their own path over 800ms, and **only on
  scroll-into-view, never on page load** — the Income page renders one per
  source, and animating eight at once on first paint is a jank generator rather
  than a flourish. *(From the second spec.)*
- **Progress bars** (goals, budgets) use a spring with a ≤3% overshoot. The
  overshoot is the point: it reads as effort, which is the correct feeling for
  a goal moving forward.

**The whole vocabulary, in one table** — so motion never means two things:

| Motion | Duration / easing | Used for |
| --- | --- | --- |
| Count-up | 450–700ms ease-out, digits only | Any headline figure on mount or real change |
| Bar grow | 400ms ease-out, 30ms stagger | Bar charts, share bars, day bars — first render only |
| Progress fill | 600ms spring, ≤3% overshoot | Goal and budget bars |
| Sparkline draw | 800ms path-length, on scroll into view | Inline trends |
| Cross-fade + 8px slide | 200ms | Month switches over existing data |
| Drawer slide | 280ms ease-out — right on desktop, bottom on mobile | Every inspector and sheet |
| Row expand | 220ms height | Cluster popups, drill-down rows |
| Skeleton shimmer | 1.2s loop | Cold load only |
| Toast | 250ms in · 4.5s hold · 200ms out | All confirmations |

The rule of thumb: **numbers count up, bars grow, drawers slide, and nothing
spins except a genuine network wait.** A motion that does not map to a row
above does not ship — that is what keeps "premium" from becoming "busy".

## 4.3 Month switching

Today, switching months mutates figures in place. Instead: **the whole content
column cross-fades and slides 8px in the direction of travel** (back = right,
forward = left) over 200ms. The month label in the header slides with it. This
is the cheapest possible way to say "you are looking at a different month",
and it removes any chance of reading August's number as September's.

## 4.4 Loading

Three states, currently blurred together:

1. **First load** — skeletons matching the real layout, cross-fading to
   content over 150ms rather than popping.
2. **Refresh with cached data** — keep the figures, show a 2px indeterminate
   bar under the header. Never blank something that is still true.
3. **Slow (>800ms)** — the skeleton gains a slow shimmer, so a stall reads as
   "working" rather than "broken".

## 4.5 Errors and edge cases

The app currently has one `ErrorState`. It needs three:

| Case | Treatment |
| --- | --- |
| **Network** | Inline, retryable, with the last-known figures still on screen and greyed. Never a full-page error over data you already have. |
| **Server** | Full-page, with the actual message, a **Retry**, and a **Report** that copies the request id. |
| **Partial** | If four of five cards load, show four and put the error in the fifth. Today one failure can take a whole screen. |

Edge cases worth naming, all of which the app can hit today:
- **Negative in hand** — handled, and handled well.
- **Zero income** — handled; the lifetime card carries the prompt.
- **First day of the month** — projections should say "too early to project"
  rather than extrapolating one day across 30.
- **Single transaction** — median, average and largest are the same number.
  Suppress two of the three.
- **Very long category or person names** — truncation is in place; verify at
  320px, which is the width the earlier grid bug showed up at.
- **Amounts above ₹1 crore** — check that the hero figure does not wrap.
- **A future-dated transaction** — nothing prevents one, and it will skew the
  projection. Either disallow, or exclude from pace.

## 4.6 Empty states that teach

Every empty state should show the *shape* of what will fill it, not just say it
is empty. A goal card with no contributions should render a ghost progress bar;
an empty month should render a faint flow curve. The current empty states are
already well written — this is about adding the silhouette behind the words.

---

# Part 5 — New features, ranked

Ordered by value per unit of work. Each solves a problem visible in the current
app rather than a generic fintech checkbox.

| # | Feature | Problem it solves | Effort |
| --- | --- | --- | --- |
| 1 | **Needs your attention** (3.1) | The app knows things and never says them. Everything it needs is already computed. | M |
| 2 | **Net position** (3.4) | No screen answers "what am I worth", and the closest one is wrong. | S |
| 3 | **Budgets on Month** (3.3) | The most actionable analytic is hidden in Settings. Pure move. | S |
| 4 | **Range picker on Ledger** (3.2) | "What did I spend on this trip" is unanswerable today. | S |
| 5 | **Confirm/reject recurring** (3.8) | Rescues a whole tested subsystem that currently renders nothing. | M |
| 6 | **Month close** (3.3) | The habit that makes budgeting work; nothing prompts it. | M |
| 7 | **Goal what-if slider** (3.5) | Makes a target negotiable instead of a verdict. | S |
| 8 | **Income stability** (3.6) | Variable income is the hardest case and gets no help. | S |
| 9 | **Bulk edit** (3.2) | Import always produces rows needing recategorisation. | M |
| 10 | **Balance ageing** (3.7) | A debt with no age never gets chased. | S |
| 11 | **Saved views** (3.2) | Repeated filter combinations, retyped every time. | S |
| 12 | **Category trends** (3.4) | Momentum is monthly; drift is yearly. | M |
| 13 | **Milestones** (3.4) | The app never once acknowledges progress. | S |
| 14 | **"This month's one thing"** (3.3) | A page of data with no conclusion at the top. | S |
| 15 | **Income calendar + reliability note** (3.6) | An average actively hides the shape of irregular income. | S |
| 16 | **Inline "your share" tag** (3.7) | The best idea in the app is explained in a footnote. | XS |
| 17 | **`via <category>` on goal cards** (3.5) | The goal↔category link exists in the data and nowhere in the UI. | XS |
| 18 | **Year over year** (3.4) | The one horizon nothing shows. Gate at 12 months. | S |
| 19 | **All-time category totals** (3.4) | "What has this cost me, ever" is unanswerable. | S |
| 20 | **Lifetime with people** (3.4) | The ledger only ever appears as a current balance. | S |

**Deliberately not proposing:** bank sync, SMS/UPI parsing (you have ruled this
out and you are right — the manual log is the product's discipline), receipt
OCR, multi-currency, shared accounts, or anything requiring price data for
investments. Each would be a second product.

---

# Part 6 — How the calculations should be structured

The bugs in 1.3 share one cause: **the same concept is computed in more than
one place.** Two "vs last month"s, two elapsed-day conventions, a savings rate
in three shapes.

## 6.1 One vocabulary, defined once

A single module — call it `lib/metrics.ts` — that owns these definitions and
is the only thing allowed to produce them:

```ts
type Window = { start: string; end: string; elapsedDays: number; totalDays: number };

// The four flows. Everything else is derived from these.
inMinor        // income categories
outMinor       // expense categories
investedMinor  // investment categories
lentMinor / borrowedMinor  // ledger

// The four derived positions.
saved     = in − out                    // textbook savings rate
inHand    = in − out − invested − lent + borrowed   // cash
netWorth  = inHand + invested + owedToMe − owedByMe
rate      = saved / in                  // null when in = 0
```

Every screen reads from this. No page recomputes a delta.

## 6.2 Comparison rules

One rule, applied everywhere:

> **A partial period is only ever compared to the same partial period.**

- Current month vs last month → same elapsed days, both sides.
- Current month vs a 3-month baseline → baseline pro-rated by
  `elapsedDays / totalDays`.
- A completed month → full-to-full.

Every comparison carries the basis in its label: *"by this day last month"*
vs *"the month before"*. The app already does this correctly in the flow hero;
the fix is to do it everywhere, and to make it impossible not to by having one
function produce it.

## 6.3 Averages

| Average | Rule |
| --- | --- |
| Per-day | Divide by **days elapsed**, not days with spending. |
| Per-weekday | Divide by **weekdays occurred**, not weekdays with spending (1.3.3). |
| Per-month (investments) | State the denominator. Offer both active-month and calendar-month. |
| Savings rate over months | **Pool it** — Σsaved ÷ Σin — never the mean of rates (1.3.7). |

## 6.4 Honesty gates

The app already does this well for goal pace ("just started" for three weeks)
and for the momentum card in a first month. Generalise it into a rule:

> **A derived figure that needs N observations does not render below N. It
> renders what it is waiting for.**

Apply to: projections (need 3+ days), momentum (needs a prior month), weekday
averages (need 2+ of that weekday), income estimate (needs 2 paid months),
recurring detection (needs 4+ months, plus confirmation — 3.8).

## 6.5 Tests to add

Every fix in 1.3 should land with a test that would have caught it:

- The two delta figures on Monthly return the **same number** for the same
  input. (Catches 1.3.1 and any recurrence.)
- Momentum for a month-to-date on day 10 of 30 uses a baseline one-third of
  the full-month figure. (1.3.2)
- Weekday average for a month with four Thursdays and one spending Thursday is
  `total ÷ 4`, not `total ÷ 1`. (1.3.3)
- `getSummary` for a non-current month returns `todayMinor = 0`. (1.3.4)
- Transaction totals for a filter of 200 rows with `limit=150` equal the totals
  for the same filter with `limit=1000`. (1.3.5)
- Lifetime in hand changes when a ledger entry is added. (1.3.6)
- Pooled savings rate over `{₹5k @ 90%, ₹50k @ 20%}` is 26%, not 55%. (1.3.7)
- The sweep between a 28-day month and a 31-day month at an identical daily
  rate reports no underspend. (1.3.8)
- A category created inside the baseline window is measured against the months
  it existed for, not three. (1.3.9)
- A category with one transaction in three months returns a null projection.
  (1.3.10)

---

# Part 7 — What the experience should feel like

One continuous thread, from logging a coffee to understanding a year.

**You log in three taps.** `+` → amount → category. Person defaults to you,
date defaults to today, save. The sheet already does this well; the only change
is that the row lands with a visible flourish so you know it landed.

**Home tells you if anything needs you.** Not a wall of charts — one number
(what the month has left), one list (what needs attention, usually empty), and
a way in. If nothing needs you, Home says so and you close the app. **An app
that respects your time is the premium signal**, far more than any gradient.

**When you want to know more, you go one level down** — This month for the
month, Lifetime for the arc. Each has a rail so you can jump to the section you
want. Nothing is duplicated between them, so there is never a question of which
number is the real one.

**Goals turn saving into a thing with a shape.** A target, a monthly pace,
whether you are ahead, and a slider that lets you negotiate with the date
rather than just fail against it. Contributing animates the bar; hitting a
target gets one quiet moment of acknowledgement.

**Income stops being an afterthought.** It has a page, sources have histories,
and if your income is lumpy the app says so and tells you what number to budget
against.

**At the start of each month, the app closes the last one.** What you kept,
what moved, and one tap to sweep the underspend into a goal. That single ritual
is what turns twelve disconnected months into a trajectory.

**And every number can be traced.** Tap any figure and see what it is made of —
the app already does this for categories and people, and the principle should
hold everywhere. A money app earns trust exactly once: the first time someone
checks a number and finds it right.

---

# Part 8 — Where the two specs disagree

Both documents were written against the same `SCREENS.md`. They agree on the
big move — split Analytics by time horizon, lift Income out of Settings, fuse
Goals and Investments — and on most of the detail. Four real disagreements
remain. I have taken a side in each and given the reasoning; overrule any of
them and the rest still stands.

### 8.1 How much comes off the Dashboard

**The other spec keeps everything** — sweep, hero, projection, tally, lifetime
card, goals, stat strip, donut, person split, Signals, recent activity — and
adds two more. That is eleven blocks, described as "lighter".

**I cut it to five** and move Signals, the donut and the person split to
Monthly, and the lifetime card to Lifetime.

**My call: cut.** The dashboard and Analytics are already ~60% the same
content, which is the core structural finding of Part 1. Adding two blocks to
the longer of the two does not resolve that; it deepens it. A daily check-in
that needs scrolling has failed at being a check-in. Everything cut is one tap
away on a page that exists to hold it.

### 8.2 Whether the savings rate should be hidden behind a tap

**The other spec** argues the textbook rate sitting under the cash figure
invites "where did the rest go", and moves it to tap-to-reveal.

**My call: keep it visible.** The diagnosis is right and the treatment is
backwards. That caption is not decoration — it is the *reconciliation between
the two numbers*, and it already names the gap explicitly:

> Income less spending is ₹7,767 — a 23% savings rate, but ₹10,000 of it went
> into investments — ₹2,233 more than the month produced, so the difference
> came out of money you already had.

Hiding the reconciliation behind an interaction on the one card whose job is to
reconcile is a trust regression. A reader who skims it is no worse off than one
who never opens a tooltip; a reader who wants it should not have to hunt.
Where a tooltip *is* right is the other spec's own 2.7 — the per-person share
tag — because that explainer sits on a figure whose card is not about
explaining itself. Adopted there, declined here.

### 8.3 Where budget progress lives

**The other spec** keeps the budget card in Settings, "exactly as-is".

**My call: move it to Monthly.** Setting a limit is configuration. Watching a
bar fill against it is the most actionable monthly analytic in the app, and it
is currently three taps from the dashboard, on a screen nobody opens except to
change something. The limit stays in the category sheet; the progress moves.

### 8.4 Whether the recurring nudge can go straight to the Dashboard

**The other spec** adds an "upcoming recurring expense" line to the Dashboard,
detecting same-category, ±10% amount, same 3-day window, 3+ consecutive months.

**My call: not without a confirmation step.** That is a stricter rule than the
one currently in `recurring.ts` (2 months, ±30%), and stricter is better — but
the reason "Still to come" came off the dashboard was not that the threshold
was slightly loose. It was that **no threshold is trustworthy on a short
history**, and a card that confidently names next week's bills has to be right.

So: the detector gets a home in Settings where you **confirm or reject** each
candidate (3.8). Confirmed bills are then trustworthy by construction, and the
Dashboard nudge becomes safe to ship — as an attention rule (3.1), which is
where a dated, dismissible, one-line prompt belongs anyway. Same feature,
one gate in front of it.

### 8.5 Where the other spec was more careful than me

Credit where it is due, since three of its finds are now bugs 1.3.8–1.3.10:

- **The sweep's day-count bias** (1.3.8) I did not spot at all.
- **Momentum penalising young categories** (1.3.9) is a second, independent
  bug in the same function I had already flagged — I found the part-month
  problem and stopped looking.
- **Category projection on lumpy categories** (1.3.10) I had only as a generic
  line in a table of "definitions to label"; it is a concrete bug that renders
  a number which is never once correct.
- **The mobile Insights tab** (2.2) is a straightforwardly better answer than
  the cut I proposed.

### 8.6 Where I was more careful than it

Worth stating only because these are bugs that survive its redesign:

- It documents the **weekday average** as `Σ ÷ count of that weekday this
  month` and marks it *Kept*. That formula is the correct one — but it is not
  what the code does (1.3.3), so the fix is described as if it were current
  behaviour and would not get written.
- Its Dashboard **keeps the month picker alongside Today / This week**, so
  1.3.4 — September figures on an August page — survives intact.
- Its Lifetime page **restates `Σ(income − spent − invested)`** as the
  definition of lifetime in hand, preserving 1.3.6. It then adds "Lifetime with
  people" as a *separate* card, which places the correct ledger figures
  directly beside a cash figure that is wrong by exactly that amount.
- **The Ledger stat strip totalling the loaded page** (1.3.5) and **the
  savings-rate footer averaging percentages** (1.3.7) are unmentioned.

The lesson for whoever builds this: the two specs were written from the same
document, and the document was accurate. Every one of these was only findable
in the source. **Do not implement a metric from either spec without reading the
function it replaces.**

---

## Suggested sequence

If this is built incrementally, this order gets value out earliest and keeps
the app shippable at every step:

1. **The calculation fixes** (1.3, all eleven). They are small, they are bugs,
   and everything below inherits them. Start with 1.3.1 and 1.3.6 — a screen
   that contradicts itself and a card that overstates your cash are the two
   that cost trust.
2. **Move income out of Settings; move budgets to Month.** Pure relocation, no
   new UI, immediately better.
3. **Split Analytics into Month and Lifetime.** Also mostly relocation.
4. **Slim Home to five blocks** and drop its month picker.
5. **Needs your attention.** The first genuinely new thing, and the one that
   changes what the app is for.
6. **Net position, Goals page, Income page.**
7. **Motion pass**, once the structure has stopped moving.
