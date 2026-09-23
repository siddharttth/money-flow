# Money Flow — every element, its calculation, and how it is drawn

A complete inventory of the eight sections. For each thing on screen: **what it
is**, **how it is calculated**, and **how it is represented**. Written by reading
the source, not the previous docs — `src/app/(app)/**/page.tsx`, `src/lib/*.ts`
and `src/components/*.tsx`.

Companion documents: `SCREENS.md` (structure only), `REDESIGN.md` (the
architecture argument and the calculation audit behind the current arithmetic).

---

## 0. Conventions that apply everywhere

Read this first; it explains most of the formulas below.

| Convention | Detail |
| --- | --- |
| **Money is integer paise** | Every amount is stored and computed as `amountMinor` (an integer). `formatINR(minor)` divides by 100 for display. No float ever touches a total. |
| **Three kinds, one table** | Income, investment and spending are all rows in `expenses`. They are told apart only by the `kind` of the category they are filed under (`expense` / `investment` / `income`). |
| **"Spent" means `kind = 'expense'`** | Every spending figure filters through `kindPredicate('spending')`, which is `kind NOT IN ('investment','income')`. Investing and income never enter a spend total. |
| **The ledger is a separate table** | `ledger_entries` (lent/borrowed) never touches an analytics query, and analytics never touches it — except in the two lifetime figures that say so explicitly. |
| **Shares, not copies** | A ₹75 expense tagged with 3 people puts ₹25 against each. Person totals *partition* the month; they never multiply it. The paisa remainder is allocated deterministically by person id order so shares always reconcile to the total. |
| **Soft delete** | Every query filters `deleted_at IS NULL`. Deleting is reversible; nothing is destroyed. |
| **A partial period is only compared to the same partial period** | Month-to-date is compared against the same elapsed days of last month, never against the whole of it. Baselines are pro-rated by `elapsedDays / monthDays`. |
| **Honesty gates** | A derived figure that needs N observations does not render below N — it renders what it is waiting for. Applies to goal pace (21 days), goal projection (2 contributions + 30 days), category projection (4 transactions), momentum (2 eligible months), income patterns (4 payments), charts (2 months). |
| **Motion is for changes, never for arrival** | `src/components/motion.tsx`. Every request goes through a counter in the SWR fetcher; a component only animates once its page's requests have finished and the page has been quiet for 450ms. Before that every change snaps. After it: money figures count to their new value (220ms, integer paise throughout), bars and rings ease to their new width (220ms, goal and budget bars overshoot ~2% at 260ms), collapsible sections open by animating one grid row 0fr→1fr (200ms), a card that changed because of something you did pulses its accent ring once (250ms), and a row you just added, edited or restored washes once (950ms). A card's pulse is scoped to the view — switching month is not a change. All of it is off under `prefers-reduced-motion`. |
| **Single values edit where they are printed** | A figure that is one field of one record — a category's monthly budget, a goal's target amount or date — is tap-to-edit in place (`InlineEdit`): dotted underline, Enter saves, Escape or leaving the field cancels. It saves one field through `PATCH /api/categories/[id]` and refreshes every screen that reads it. Anything multi-field, or anything whose flow carries a confirmation (transaction amounts and their splits, settle-ups), still opens its sheet. |

### Shared shell — on all eight pages

| Element | Calculation | Representation |
| --- | --- | --- |
| **Sidebar nav** (desktop) | Static, grouped: Dashboard · **RECORD** (Transactions, Income, People) · **UNDERSTAND** (This month, Lifetime, Goals) · Settings | Fixed left rail, 15rem. Active item gets `--accent-soft` background and accent text. |
| **Bottom tabs** (mobile) | Five: Home · Ledger · Insights · Goals · People | Fixed bar, 5-col grid. Income and Settings live in the mobile header. |
| **Insights tabs** | Month / Lifetime | Segmented control at the top of both analytics pages, mobile only (desktop has both in the sidebar). |
| **Add transaction** | — | Sidebar button (desktop) / floating accent FAB (mobile). Shortcut `n`. |
| **Command palette** | Fuzzy match over people, categories and screen names | `⌘K` modal. |
| **Month picker** | `shiftMonth(month, ±1)`; forward disabled when `month >= currentMonth()` | `‹ Sep ›` pill. Shows the year when it is not the current year. |
| **Toasts** | — | Bottom sheet, 4.5s. Delete toasts carry **Undo**. |

---

## 1. Dashboard — `/dashboard`

> One question: is this month going well? **No month picker** — Home is always
> the current month, which is what makes "Today" and "This week" safe to print
> here. Four blocks: the month card, what the saving is for, where the money
> went, and what just happened.

Data sources: `/api/analytics/summary`, `/api/analytics/flow`, `/api/plan`,
`/api/ledger`, `/api/transactions`, `/api/analytics/investments`,
`/api/funds`, `/api/categories`, `/api/analytics/categories`,
`/api/analytics/lifetime`.

Layout: two columns from `xl` — the month card on the left, the goal, category
and recent-activity column on the right. The month card stretches to the
column's height and the trajectory curve takes the difference, so neither side
ends early. Below `xl` they stack in that order.

### Header
| Element | Calculation | Representation |
| --- | --- | --- |
| Title | `monthLabel(currentMonth())` | Display heading, e.g. "September 2026", under an "Active ledger pulse" eyebrow with a live dot |
| Subtitle | `Day {flow.pace.elapsedDays} of {flow.pace.monthDays}` | Muted line under the title |
| **Budget pace** — *only when a budget exists* | `Σ spent / Σ budget × 100` across budgeted `expense` categories | Pill with a bar and the %, red above 100. Links to `/analytics/month#budgets`. |

### Sweep card — *only when last month was cheaper*
| Element | Calculation | Representation |
| --- | --- | --- |
| Underspend | Compares the **two months before this one**. `rateA = totalA/daysA`, `rateB = totalB/daysB`, `normalised = (rateB − rateA) × daysA`. Shown only when **both** `normalised > 0` and `raw > 0`; the figure is `min(raw, normalised)`. Day-count normalised so February does not look thrifty for having 28 days. | Green figure + "less than \<month\>" |
| Destination picker | Open (incomplete) funds | Chip row, one per goal |
| Move it | POSTs an expense of `savedMinor` to the chosen goal category | Full-width primary button, "Move it to \<goal\>" |
| Dismiss | Local state | `Not now` tag |

### 1 — The month card
One card answering one question, in four parts divided by rules. Carries the
page's glow and pulses when its figures change.

#### Left in hand · \<month\> / Down in \<month\> — the headline of the app
| Element | Calculation | Representation |
| --- | --- | --- |
| **Headline figure** | `inHandMinor = inMinor − outMinor − investedMinor`, built from `tally` in `plan.ts`. Uses **income that actually arrived**, never the estimate. | The page's largest figure (2.4–2.6rem) + "liquid". Red with a leading `−` when negative; label flips to "Down in". |
| Badge | `tally.ratePct` when in hand is positive | "N% kept", or "drawing down" when negative |
| Sub-line | — | "after ₹X spent and ₹Y invested" |
| Skeleton | `tally.known === false` (no income ever recorded) | The headline stays a skeleton; the rest of the card still renders |

#### Spent in \<month\> — beside the headline, one size smaller
| Element | Calculation | Representation |
| --- | --- | --- |
| Figure | `flow.pace.spentMinor` = Σ `kind='expense'` rows in month | 1.6–1.75rem figure + "N entries" (`summary.transactionCount`). The whole block links to `/analytics/month`. |
| Delta chip | `flow.pace.deltaPct = (spent − prevSameDay) / prevSameDay × 100`. **Same elapsed days both sides.** Null when last month had nothing. | `↑ 138%` pill, red up / green down. "no change" under 0.05%. |
| **Projected** | `(spentMinor / elapsedDays) × monthDays` — straight-line | "projected ₹X at ₹Y/day" |
| **Invested, separately** | `investments.monthMinor` — shown only when > 0 | Row linking to `/goals` with an arrow |

#### Spend allocation
| Element | Calculation | Representation |
| --- | --- | --- |
| "₹X in" | `tally.inMinor` = sum of `kind='income'` rows in the month | Top-right figure |
| **Stacked bar** | Scaled to `max(inMinor, outMinor + investedMinor)` — **not** to income alone, so segments can never sum past 100% and silently rescale. Segments: spent, invested, free. | 10px rounded bar, three segments |
| Income mark | Drawn at `pct(inMinor)` only when `inHandMinor < 0` | 2px red vertical rule + caption "past this line, the month drew on what you already had" |
| Legend | `tally.outMinor` · `tally.investedMinor` (hidden when 0) · `tally.inHandMinor` | **Spent** (grey) · **Invested** (green) · **Free**, or **From savings** in red when negative — each with its % and figure |
| Caption | `savedMinor = inMinor − outMinor`; `ratePct = saved / in × 100`. The textbook savings rate, deliberately demoted from headline to caption and reconciled against the cash figure in words. | Muted paragraph |

#### Cumulative spend trajectory
| Element | Calculation | Representation |
| --- | --- | --- |
| **Flow curve** | Cumulative running total per day. Solid = this month; dashed = last month at the same day index. Runs to **today** in a live month, not to the 31st. Needs ≥ 2 points. | SVG area + line, 230px minimum, growing to fill the card's height |

#### Stat strip — the card's footer row
| Tile | Calculation | Representation |
| --- | --- | --- |
| Today | `getTotal(today..today)` — **null-ed to 0 on any non-current month** | Figure; links to `/expenses?day=<today>` |
| This week | `weekRange(today)`, Monday–Sunday — same null-ing | Figure; links to `/expenses?week=<today>` (the same Monday-start week) |
| Typical entry | `PERCENTILE_CONT(0.5)` over the month's expense amounts (median, not mean) | Figure + "N this month"; links to `/analytics/month?tab=sizes` |
| Net with people | `ledger.netMinor` = Σ`out` − Σ`in` across all people | `|net|`, green if owed to you / red if you owe; sub-line names the direction and the contact count. When any balance is open: "You are owed ₹X" + **Settle →** `/people`. |

Colours are chosen to survive both themes: `--brass` and `--hi` are both gold in
Obsidian (the dark theme), so the bar uses neutral / green / accent instead.

### 2 — What the saving is for — *only when goals exist*
**One goal** gets the Active goal card; **several** get the Goals strip.

| Element | Calculation | Representation |
| --- | --- | --- |
| Active goal | `savedMinor`, `targetMinor`, `requiredPerMonthMinor`, `monthsLeft`; ring = `min(1, saved/target)`, red when behind with a confident pace | Name, "by \<date\>", saved figure, **"/ ₹target" editable in place**, "₹X/mo · N months left", progress ring, **Add to goal**. Pulses when the goal moves. |
| Strip row | `savedMinor / targetMinor` | Icon, name, `saved / target`, 5px progress bar |
| Percentage | `min(1, saved/target) × 100` | Small figure, bottom-left |
| Monthly pace | `requiredPerMonthMinor = ceil(remaining / monthsLeft)` | "₹X a month", bottom-right |
| Completed | `saved >= target` | Green "done" |
| Cap | First 4, open goals before finished ones | Card with divided rows; **All goals →** |

### 3 — Spend by category — *when the month has spending*
| Element | Calculation | Representation |
| --- | --- | --- |
| Bubbles | `/api/analytics/categories` for the month, share of the month's spending | Proportional-area bubbles — which one is the big one, not a precise reading (that is the donut on This month) |
| Legend | Top 6 | Dot, name, %, amount in two columns. **Break it down** → `/analytics/month` |

### 4 — Recent activity
| Element | Calculation | Representation |
| --- | --- | --- |
| Rows | Last 5 from `/api/transactions` for the month | Icon, note-or-category, date, category tag, person tags, amount. A row that appears after the page is up washes once. |
| Income rows | `category.kind === 'income'` | Green amount + `income` badge |
| Investment rows | `category.kind === 'investment'` | `invested` badge |

### Lifetime footer line
| Element | Calculation | Representation |
| --- | --- | --- |
| "Kept across N months" | `lifetime.inHandMinor` and `months` — **fetched without a month in the SWR key**, so it never moves with the page | One-line row linking to `/analytics/lifetime`, red when negative |

---

## 2. Transactions — `/expenses`

> The ledger. One row per transaction, grouped by day.

### Header & filters
| Element | Calculation | Representation |
| --- | --- | --- |
| Month picker | — | Pill |
| Filters button | `categoryIds.length + personIds.length + kinds.length + (search ? 1 : 0)` | Ghost button with a gold count badge |
| Quick chips | `Everything` / `Spent` / `Lent` / `Borrowed`, multi-select | Horizontal scroll chip row; **Clear all ×** appears when any filter is on |
| Day / week range | From `?day=YYYY-MM-DD` or `?week=YYYY-MM-DD` (the Monday-start `weekRange` of that date, the same week the dashboard's This week adds up). Replaces the month's start and end in the query; changing the month drops it. | Selected chip, e.g. "Fri, 4 Sept, 2026 ×" or "Week of 31 Aug ×" — tap to return to the whole month |
| Filters sheet | Search (notes) · category chips · people chips | Modal, **Clear** / **Show results** |

### Stat strip — totals the **whole filtered set**, not the loaded page
Computed server-side by a separate aggregate query that shares its WHERE clause
with the paged query, so paging cannot change the totals.

| Tile | Calculation | Representation |
| --- | --- | --- |
| Total spent | Σ where the category is `expense` | Figure + "N entries" + "Daily average ₹X" (over the elapsed days of the month, or the days of the day/week range). Tapping it switches the **Spent** chip. |
| Income received *or* Invested | Whichever is non-zero (income wins) | Accent figure + "came in" / "not spending"; "₹X also went into investments" when both. Links to `/income` (or `/goals`). |
| Lent out | Σ ledger `direction='out'` | Red when non-zero, "receivable · N people". Tapping it switches the **Lent** chip. |
| Borrowed | Σ ledger `direction='in'` | Green when non-zero, "payable · N people". Tapping it switches the **Borrowed** chip. |

One card split by hairlines, with the page's glow. A tile whose chip is on is
tinted.

### The day-grouped list
| Element | Calculation | Representation |
| --- | --- | --- |
| **Day heading** | Groups by `date`; subtotal = Σ of that day's rows where the category kind is `expense` | Sticky bar at `var(--stick-top)`, surface-2 background, entry count + subtotal |
| **Clustering** | Identity = `kind │ categoryId │ sorted personIds │ lowercased trimmed note`. Same-day identical entries fold into one row. **Display only** — the day subtotal still adds individual amounts. | One row showing the combined total and `×N` |
| Cluster tap | — | Modal listing every underlying entry, each with Edit and Delete |
| Category / person tags | — | Tap opens the inspector; **shift-click** filters the list by it |
| Edit / Delete | Delete sets `deleted_at` | Desktop: `.reveal` text tags on the tag line of single rows. Phone: pencil and trash marks (named "Edit" / "Delete") in a column under the amount, so a second tag never pushes them onto a third line. Undo toast. |
| New or changed row | A row that appears or changes within the same view — added, edited, restored by Undo | Washes once; a month or filter change never does |
| Load more | `limit += 150` | Full-width button, shown while `hasMore` |

Deep links: `?person=<id>` pre-filters to one person; `?day=` / `?week=` narrow
to a day or a week (from the dashboard strip and This month's biggest day and
day bars).

---

## 3. Income — `/income`

> Everything about money arriving. All figures come from `src/lib/income.ts`.

### Header
Month picker · **+ Source** (primary button → income sheet).

### Hero
| Element | Calculation | Representation |
| --- | --- | --- |
| "Received in \<month\>" | Σ `kind='income'` rows in the month | Hero figure |
| Delta | `(month − previousMonth) / previousMonth × 100`, **inverted** (up is good) | Green-up pill |
| vs typical | `(monthMinor − typicalMinor) / typicalMinor × 100` where `typicalMinor` = **median of months that had any income** — median, so one good month does not redefine normal | "18% above your typical ₹42,000" |
| **When it landed** — current month only | `landedDays` = distinct `DAY(expense_date)` with income this month | A dot per calendar day; filled green on days money arrived, surface-2 otherwise |
| **Month by month** | 12-month series. Drawn from the **first month with income** (at least 6 slots), not twelve with the front half empty. The dashed average is over the **months since the first payment**: months before income was ever logged are not counted, empty months after it are. Needs ≥ 2 active months. | Bar chart, tap a bar to jump to that month. "Dashed line: ₹X average over N months". |

### Stat strip
| Tile | Calculation |
| --- | --- |
| Typical month | `median(months with income > 0)`, sub-label "median of N" |
| Best month | `max(active months)` — green. Tapping it opens that month: the most recent month in the series with that total. |
| Leanest month | `min(active months)`. Tappable the same way. |
| Lifetime | Σ all income ever |

The hero card carries the page's green glow and pulses when the month's total
changes while you are on it (a payment recorded).

### Steadiness insight — *needs ≥ 3 active months and a non-zero spread*
| Element | Calculation | Representation |
| --- | --- | --- |
| Verdict | `spreadMinor = high − low`. Warn when `spread > typical × 0.35`, else good. | Insight block, amber or green rule |
| Copy (variable) | — | "Your income swings by ₹X between your best and leanest month. Budget against **₹median** rather than your last figure." |
| Copy (steady) | — | "Steady: ₹X between best and leanest. Planning against ₹median is safe." |

### Where it comes from — one row per source
| Element | Calculation | Representation |
| --- | --- | --- |
| Amount | This month's total for that source | Green when > 0; sits beside the name (the text block is capped at 28rem on desktop). The row washes when it changes. |
| Status line | Last payment date; plus `usually ₹X` from that source's own median | Muted 11px |
| **Sparkline** | That source's 12-month series; needs ≥ 2 payments | 96px inline sparkline, desktop only |
| **Timing note** | `typicalDay = round(median(day-of-month))` — needs ≥ 2 payments. `dayVariance = mean absolute deviation from the median` — needs ≥ **4** payments. | `≤2` days variance → "Lands within N days of the 5th, going by the last 6." Otherwise → "Timing moves — around the 5th, give or take N days." |
| Row tap | — | Opens the category inspector |

---

## 4. People — `/people`

> A contact you spend with and one you lend to are the same person. The two
> figures are never added together.

### Net exposure card
| Element | Calculation | Representation |
| --- | --- | --- |
| Net | `Σ(direction='out') − Σ(direction='in')` across everyone | Hero figure, `|net|` with "Net receivable" / "Net payable" badge and "owed to you, on balance" / "you owe, on balance" / "everything is settled"; "Across N open counterparties." |
| They owe me / I owe | `owedToMeMinor` = Σ of positive per-person balances; `owedByMeMinor` = Σ of negative ones | Green and red figures over **one** two-sided bar, each side with its figure and % of the total |
| Actions | — | **↗ I lent money** / **↙ I borrowed money** ghost buttons |

The card's footer row — three facts about the ledger as a whole:

| Tile | Calculation | Representation |
| --- | --- | --- |
| Active ledgers | Contacts; open = balance ≠ 0; balanced = the rest | "N contacts", "N outstanding" / "all clear", "N fully balanced". Tapping it switches the **Owing** filter. |
| Most shared with | The non-self person with the largest month share | Their share, "\<name\> · N transactions", "N% of spend". Tapping it opens their inspector. |
| Next settlement | The largest `|balance|` | Amount (red if you owe, green if owed), "\<name\> · largest open" and what to do. Tapping it opens the same settle sheet as the row's action. When nothing is open: "—", "nothing due". |

The card glows red when you owe on balance, and pulses when a lend, borrow or
settle-up moves it; the person whose balance moved washes once in the table.

### Filters
`All` / `Owing` (balance ≠ 0) / `Spending` (month share > 0) segmented control ·
**+ Person** chip. Sort: by `|balance|` in Owing mode, else by month spend.

### The table
| Column | Calculation | Representation |
| --- | --- | --- |
| Contact | — | Avatar mark (initial on their colour), name, `· you` for self, relationship type, transaction count |
| **\<month\> spend** | That person's **share**: `amount × (1/participants)` summed, with exact paisa remainder allocation | Figure + 3px bar proportional to the biggest spender |
| Balance | Per-person `out − in` | Green if owed to you, red if you owe, `—` when settled |
| Action | Opens the ledger form pre-filled with `|balance|` in the correcting direction | **Settle** when you owe, **Remind ▷** when owed to you (desktop column) / `Settle ₹X` · `Remind about ₹X` full-width tag (mobile) |

Mobile reflows: balance rides up beside the name; Settle becomes a row beneath.
Tapping a row opens the person inspector. Deep link `?settle=<id>`.

### Footnote
Explains that spend is a *share* (₹800 dinner ÷ 2 = ₹400 each) and that balance
is separate money.

---

## 5. This month — `/analytics/month`

> Everything time-boxed to one month. Month picker is the page's control.
> All figures from `src/lib/flow.ts` unless stated. In order: the hero and its
> strip, Budgets, where it went, a closer look (tabbed), and the money kept out
> of spending.

Deep links: `?month=YYYY-MM` · `?tab=sizes` (or `trends`) opens A closer look on
that tab · `#budgets` scrolls to Budgets once it has loaded.

### Hero
| Element | Calculation | Representation |
| --- | --- | --- |
| Total spent | `pace.spentMinor` | Hero figure + delta (same-days basis). The card glows coral when the month runs ahead of the last, green when behind. |
| Note | — | "N transactions recorded · ₹X a day" |
| Last month by today | `prevSameDayMinor` (on a past month: "The month before") | Figure in a well + "±₹X faster/slower pace" |
| Projected month end | `(spent/elapsed) × monthDays` — current month only | Figure in a well, red when above last month |
| First half / Second half | Split at `ceil(monthDays / 2)` by day-of-month | Two figures in wells, with % of total and whether the pace slowed |
| Flow curve | As on Dashboard, 210px | SVG + caption explaining the dashed line |

### Stat strip
One card split by hairlines.

| Tile | Calculation | Representation |
| --- | --- | --- |
| Daily average | `spentMinor / elapsedDays` | Figure + "calculated over N active days" |
| **Vs last month** | `summary.changePct`. In a live month the basis is **the same elapsed days**; on a completed month it is the full month. `comparedTo` travels with the number. | Signed %, red up / green down, sub-label naming last month's figure. Tapping it steps to that month. |
| Biggest day | `max(dailyTotals)` | Figure + date + a meter of its share of the month. Links to `/expenses?day=<date>`. |
| Typical entry | Median | Figure + "median of N · mean ₹X". Tapping it opens **Entry sizes** below. |

### Budgets — *hidden when nothing has a limit*
| Element | Calculation | Representation |
| --- | --- | --- |
| Roll-up | `Σ spent` and `Σ budget` across budgeted `expense` categories only | Figure "of ₹X", 6px bar, red when over; "Over by ₹X" badge in the heading |
| Summary line | — | "Across N budgeted categories — ₹X left · N% utilised" / "over by ₹X" |
| Per-category row | `share = spent / budget`; sorted by `share` descending | Its own well: icon, name, "N entries this month", `spent / budget` with **the budget editable in place** (empty removes it), "₹X left" / "Over by ₹X", gradient bar. Tapping the row opens the category inspector. |
| **Pace marker** | `pace = (dayOfMonth) / daysInMonth`, clamped to 1; only in the current month | 1px vertical rule at `pace × 100%`, 55% opacity |
| Colour | Red when over; amber when `share > pace + 0.05`; else green | Gradient along the bar |
| Status line | — | "Limit already reached" / "Ahead of an even burn for this point in the month" / "N% of the month elapsed" / "Within the limit", and "N% of planned" |

The card pulses when a budget or its spending changes within the month shown.

### Where it went
One card, two halves the same height: by category and by person — two ways of
slicing the same month.

| Element | Calculation | Representation |
| --- | --- | --- |
| Person filter | `Everyone` / each person / `Nobody tagged`. Reshapes the category query. | Scrollable chip row on the category half; **Clear person filter ×** in the heading |
| Donut | `share = categoryTotal / grandTotal` | 160px donut with a centre label ("100%", or "Filtered") |
| Legend | Top 5, same shares | Name, amount, % — tap for the drill-down |
| Concentration | `top3Share = Σ top-3 shares`; `activeCategories = count`; warn above 0.8 | Insight line (unfiltered only) |
| Category tap | — | Drill-down modal: total, count, % of month, every transaction — **click one to edit it** |
| **Who it was with** | Person shares (partitioning the month), plus a **Nobody tagged** line for untagged spend | Breakdown list with bars, and the explanation that both dimensions partition the same money. Tap a person to open their inspector. |

### A closer look — one card, three tabs
A tab exists only when its section would have been drawn; with one tab the
switcher hides. Switching fades the new contents in.

#### Rhythm (always)
Two halves the same height; the day chart takes whatever height is left, so the
figures under it sit level with the weekday axis.

| Element | Calculation | Representation |
| --- | --- | --- |
| **What a weekday costs** | `avgMinor = totalOnThatWeekday / occurredDays`, where `occurredDays` counts how many of that weekday have **happened** in the window (capped at today). Not days-with-spending. | Seven bars, Sun–Sat |
| Peak | Peak weekday vs mean of the others | "\<Day\> peak · ₹X average spend" against "Other days ₹Y" |
| **Day by day** | One bar per day — in a live month only the days that have happened (never fewer than the last day with spending), then "· N days to go" on the axis | Gold bar marks the heaviest; the readout shows it, or the day pointed at. A day with spending opens `/expenses?day=` — a click, or a second tap on touch. Shorter (64px) when five or fewer days had spending. |
| Days spent / Quiet days / Longest quiet run | Counted over **elapsed** days only, so a live month is not reported as having 9 quiet days on the 22nd | Three figures, level with each other |

#### Category trends — *hidden when every row would say "new"*
| Element | Calculation | Representation |
| --- | --- | --- |
| Baseline | `trailing3MonthTotal / eligibleMonths`, where `eligibleMonths` counts only months in which the category **existed** (`categories.created_at`). Then pro-rated by `elapsedDays / monthDays` in a live month. | — |
| Delta | `thisMinor − baselineMinor` | Signed amount, red up / green down |
| `new` | `eligibleMonths < 2`, or baseline is 0 with spend this month | Gold "new" label instead of a delta |
| Bar | `|delta| / max|delta|` | Two-sided bar growing from the centre line; two columns on a wide screen |
| Row tap | — | Opens the category inspector (month scope) |

#### Entry sizes — *when there are transactions*
| Element | Calculation | Representation |
| --- | --- | --- |
| Typical entry | Median | Figure + "the middle of N entries" |
| Largest single | `max(amountMinor)` | Figure + category and date |
| **Under ₹X** | Threshold is the **25th percentile of the trailing 3 months**, rounded to the nearest ₹10, floor ₹10. Falls back to the ₹200 constant below 20 entries of history. | Label, total, share bar, and "N of M entries, and P% of the money" |
| Things bought more than once | Grouped by lowercased note, count ≥ 2 | List: label, category, `×N`, total — or a one-line empty state |

### Kept out of spending — *when either half has something*
One card, green glow, two sections.

| Section | Calculation | Representation |
| --- | --- | --- |
| Investing, separately | Month invested · lifetime · `invested / (invested + spent)` as "share of outgoings" | Three figures + explanation of why it is excluded above; **Open** → `/investments` |
| Lending, separately | `lentMinor`, `borrowedMinor`, `netMinor` from the ledger within the month | Three figures + explanation |

### The longer view
A one-line link — "Trends live on their own page … **Open Lifetime →**" — because
none of the trends respond to the month picker.

---

## 6. Lifetime — `/analytics/lifetime`

> Every month added up. **No month picker**; nothing here moves when the month
> changes elsewhere.

### Where you stand — one card
Net worth and the cash half of the same arithmetic, then the running tallies as
the card's footer row. Lime glow, coral when net worth is negative.

#### What you have built
| Element | Calculation | Representation |
| --- | --- | --- |
| **Headline** | `inHand + invested + owedToMe − owedByMe` | The page's largest figure (2.4rem/5xl), red when negative |
| Cash in hand | `lifetime.inHandMinor` (see below) | dl row linking to the section underneath |
| Invested | Σ all `kind='investment'` ever — **added back**, because this is net worth not cash | Green dl row → `/goals` |
| Owed to you | `ledger.owedToMeMinor` | dl row → `/people` |
| You owe | `−ledger.owedByMeMinor` | Red dl row → `/people` |
| Net position | The sum | Bold dl row above a rule |

The breakdown sits in a column capped at 28rem, so each label reads straight
across to its amount.

#### Lifetime in hand — below a rule, one step smaller
| Element | Calculation | Representation |
| --- | --- | --- |
| Figure | `Σin − Σout − Σinvested − Σlent + Σborrowed` — **the ledger is included**, because the section claims to describe cash | 1.6rem/3xl figure, signed |
| Breakdown | Everything that came in / spent / invested, then the total | dl with a ruled total row |
| Context | `months` = distinct months with any row; `firstMonth` = earliest | "kept across N months, since \<month\>" |

#### Stat strip — the footer row
| Tile | Calculation |
| --- | --- |
| Months tracked | Distinct `YYYY-MM` with any transaction, sub-label = first month. Links to that month on This month. |
| Ever invested | Lifetime investment total. Links to `/goals`. |
| Best month kept | `max(savedMinor)` across months with income, sub-label = that month. Links to that month on This month. |
| Positive streak | Longest run of consecutive months with `savedMinor > 0` |

### Over time — one card, two halves the same height
| Element | Calculation | Representation |
| --- | --- | --- |
| **What you spend** | 24 months of spending totals | Bar chart that grows to the half's height (150–280px); with six months or fewer the bars widen to 5rem. Tap a bar → `/analytics/month?month=` |
| **What you keep** | Per month: `saved = in − out`, `ratePct = saved / in`. Months with **no income are drawn as gaps, not zeroes**. | One row per month: name, %, amount, bar. Negative months in red. The latest 12, with **Show N earlier months** sliding the rest open. |
| Footer average | **Pooled** over every month, shown or not: `Σsaved / Σin`, not the mean of the monthly rates — a ₹5k month at 90% must not weigh as much as a ₹50k month at 20%. | "Averaging N% kept across M months with income logged." |

### What it has all gone on
All-time totals per category, ranked — two columns on a wide screen, reading
down the first and on into the second. Tapping one opens the inspector in
**lifetime scope** — month-by-month totals rather than this month's rows.

### More history — collapsed, the answer on the closed header
#### Lending, all time — *when the ledger has moved*
Header: "Net ₹X in your favour / against you". Open: Owed to you · You owe · Net,
and **Open People →**.

#### Year on year — *needs ≥ 2 calendar years*
Header: "N years". Open: per year `Σin`, `Σout`, `Σsaved` — two bars (In green,
Out grey) scaled to the largest year, plus "kept ₹X", in a list capped at 42rem.
Not drawn at all below two years rather than built out of five months.

---

## 7. Goals & investing — `/goals`

> A goal *is* an investment category with a target on it. Reports contributions,
> never returns — the app has no price data.

### Hero — one card
The whole plan as a summary band, then the month's contributions, then the
running tallies as the footer row. Green glow.

#### All goals together — the summary band (when goals exist)
| Element | Calculation | Representation |
| --- | --- | --- |
| Roll-up | Over **incomplete** goals: `Σsaved`, `Σtarget`, `Σ requiredPerMonth` | "₹X saved of ₹Y across N active targets · ₹Z a month to land them all on time" |
| Health | Behind-pace goals decide it: none → On track, all → Off track, else Slipping | Word beside the label + 48px progress ring |
| Progress | `Σsaved / Σtarget` | 4px bar, "₹X collected (N%)" / "₹Y remaining" |
| Finished count | `isComplete` count | Green badge |
| Behind warning | Count of goals with `paceConfident && paceDelta < 0` | Red line: "N goals are behind pace…" |

#### Put in during \<month\>
| Element | Calculation | Representation |
| --- | --- | --- |
| Put in during \<month\> | Σ `kind='investment'` in the month | The page's largest figure |
| Delta | vs last month, **inverted** (up is good) | Green-up pill |
| Note | Lifetime total + first contribution date | Muted line |
| Where the money went | `invested / (invested + spent)` | Split bar + both figures |
| Contributions by month | Needs ≥ 2 months | Bar chart, tap to jump; the average tag sits clear of the bars; the footer stacks on a phone |

#### Stat strip — the footer row
Lifetime capital · Monthly average (`lifetime / activeMonths` — months **that
had a contribution**, so skipping months does not lower it; the sub-label says
so) · Contributions count · Last month (tapping it steps to that month).

### Goal cards (`FundCard`) — the arithmetic lives in `src/lib/funds.ts`
| Element | Calculation | Representation |
| --- | --- | --- |
| Header | `savedMinor of targetMinor · by <targetLabel>` — the date carries the **year** when it is not this one | Icon, name, muted line. **The target and the date are editable in place**: the date cannot be before today, and clearing it leaves a goal with no deadline ("add a date"). |
| Progress | `min(1, saved / target)` | 8px bar, green when complete |
| Remaining | `max(0, target − saved)` | "₹X to go" |
| **Needs a month** | `ceil(remaining / monthsLeft)` where `monthsLeft = monthsBetween(today, targetDate)` — part months count as one | Figure + "N months left" |
| **Pace** | `expectedByNow = target × (elapsed / span)` on the line from the **first contribution** to the target date; `paceDelta = saved − expectedByNow` | Green "+₹X ahead of plan" / red "−₹X behind plan" |
| Pace gate | `paceConfident` requires ≥ **21 days** since the first contribution | Below that: "Just started — pace after a few weeks" |
| **Projection** | `perDay = saved / daysRunning`; `daysNeeded = ceil(remaining / perDay)`. Requires ≥ **2 contributions** and ≥ **30 days**. | "At the rate so far you get there around \<date\> — ahead of / later than the \<target\> target." |
| Action | — | "Add to this goal" ghost button |

Laid out by the card's own width (a container query): past 42rem it turns into
two columns — the goal and its progress on the left, what it asks for and where
it is heading on the right. The grid is laid out by count: one goal takes the
row, a multiple of three goes three-up where there is room, and an odd card out
spans the row. Each card has a small glow in the goal's own colour, and pulses
when a contribution lands or its target changes.

### Where it is going
Lifetime totals per investment category, biggest first, with three correctly
distinguished empty states: no investment categories · a goal exists but nothing
contributed · loading.

### Every contribution
Reverse-chronological list: note-or-category, date, category, amount. The latest
6, with **Show N more** sliding the rest open — only when that hides three or
more.

### Footnote
States that none of this counts as spending anywhere, and that the screen reports
what you put in — not what it is worth today.

---

## 8. Settings — `/settings`

> Configuration only. Income and budget *progress* have moved out.

| Section | Contents | Calculation | Representation |
| --- | --- | --- | --- |
| **Income** | Signpost only | Count of active `income` categories; this month's received total | One card: "N sources · ₹X received this month" + **Open Income** |
| **Categories** | One row per active category | Spend this month per category. Budget bar only for `kind='expense'` with a limit. | Icon, name, `spent / budget` (**the budget editable in place**; empty removes it) + 3px bar, or a subtitle: `Income · kept out of spending` / `Goal · ₹X by <date>` / `Investment · kept out of spending` / `No monthly budget`. **▲▼** reorder (desktop), **Edit** per row; tapping the row opens the inspector. **+ New**. |
| Disabled categories | `isActive === false` | — | Muted line listing them, noting their history still counts |
| **Account** | Name · Email · Currency | From the session | Read-only dl, each value beside its label (there is no endpoint to change the name) |
| **Data** | Import · Export · CSV | Export builds a workbook: a tab per month as day × category, a `PEERS` tab, and a `TRANSACTIONS` tab preserving notes and people (which is what makes it re-importable) | Two ghost buttons + an inline CSV link |
| **Appearance** | Paper / Obsidian | Stored in `localStorage` as `mf-theme`; applied as `data-theme` (`light` / `dark`) on `<html>`. There is no "System" option — Obsidian is the default, not one of two equal choices. | Two tiles filling the card, each with a miniature of the real theme painted from the raw palette vars (`--paper-*`, `--ink-*`) beside its name |
| **Session** | Sign out | — | Danger button |

### Sheets opened from here
| Sheet | Fields | Notes |
| --- | --- | --- |
| **Where money comes from** | Name · How much came in (₹) · When (appears once an amount is entered) · Colour | Creates the category **and** records the payment in one trip. Button reads "Save and record ₹X". |
| **New goal** | What are you saving for · How much (₹, required) · By when (optional) · Icon · Colour | Kind is set for you; no type selector, no budget field. The date field quotes `ceil(target / monthsBetween(today, date))` live as you pick. |
| **New / Edit category** | Name · Type · Make it a goal (target + date, investment only) · Monthly budget (expense only) · Icon · Colour | Icons are named keys, validated to 32 chars. |

Deep links: `?add=income` · `?add=goal` · `?add=investment` · `?add=expense` open
the matching sheet and then clear the query string.

### Import — `/settings/import`
Three steps: **give it the data** (CSV/TSV file or paste, plus a fallback year for
dates like "2-Aug") → **check the column mapping** (layout auto-detected as month
grid or flat list; headers matched to categories by edit distance) → **preview**
(transaction count, reconstructed total, the sheet's own TOTAL column, and a ✓/⚠
check that the two agree before committing).

---

## Appendix — the inspectors

Opened from almost any name in the app.

### Person inspector
| Element | Calculation | Representation |
| --- | --- | --- |
| Spent lifetime / this month | That person's **share**, not the full amounts | Two KPI tiles |
| Net ledger balance | `out − in` for that person | Tinted block: green / red / neutral, with the Gave/Got split |
| Expenses tab | Each row shows `shareMinor` alongside the full amount | List, category tappable |
| Lent & borrowed tab | Direction arrows | List with ↑/↓ marks |
| Clear all lending history | Soft-deletes every entry for that person | Two-step confirm, red |
| Footer | — | **Settle up** · **Log expense** |

### Category inspector — scope-aware
| Scope | KPIs | Body |
| --- | --- | --- |
| **month** (default) | This month · Avg transaction · Transactions · Projected | Budget bar with pace marker — **the budget editable in place** — then the month's transactions — **each row opens the edit sheet**. Person tags inside a row open that person without triggering the row. |
| **lifetime** (from the Lifetime page) | Lifetime · Transactions · Months seen · Busiest month | **Month by month**, newest first, each with a bar scaled against the busiest month. No budget block — a monthly limit has nothing to say about all time. |

**Projected** is gated: below 4 transactions in the trailing three months the tile
shows Lifetime instead, because extrapolating a flat daily rate from one rent
charge produces a number that is never once correct.
