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

### Shared shell — on all eight pages

| Element | Calculation | Representation |
| --- | --- | --- |
| **Sidebar nav** (desktop) | Static, grouped: Dashboard · **RECORD** (Transactions, Income, People) · **UNDERSTAND** (This month, Lifetime, Goals) · Settings | Fixed left rail, 15rem. Active item gets `--accent-soft` background and accent text. |
| **Bottom tabs** (mobile) | Five: Home · Ledger · Goals · Insights · People | Fixed bar, 5-col grid. Income and Settings live in the mobile header. |
| **Insights tabs** | Month / Lifetime | Segmented control at the top of both analytics pages, mobile only (desktop has both in the sidebar). |
| **Add transaction** | — | Sidebar button (desktop) / floating gold FAB (mobile). Shortcut `n`. |
| **Command palette** | Fuzzy match over people, categories and screen names | `⌘K` modal. |
| **Month picker** | `shiftMonth(month, ±1)`; forward disabled when `month >= currentMonth()` | `‹ Sep ›` pill. Shows the year when it is not the current year. |
| **Toasts** | — | Bottom sheet, 4.5s. Delete toasts carry **Undo**. |

---

## 1. Dashboard — `/dashboard`

> One question: is this month going well, and is anything owed my attention?
> **No month picker** — Home is always the current month, which is what makes
> "Today" and "This week" safe to print here.

Data sources: `/api/analytics/summary`, `/api/analytics/flow`, `/api/plan`,
`/api/ledger`, `/api/transactions`, `/api/analytics/investments`, `/api/income`,
`/api/funds`, `/api/categories`, `/api/analytics/categories`,
`/api/analytics/lifetime`.

### Header
| Element | Calculation | Representation |
| --- | --- | --- |
| Title | `monthLabel(currentMonth())` | Serif display, e.g. "September 2026" |
| Subtitle | `Day {flow.pace.elapsedDays} of {flow.pace.monthDays}` | Muted line under the title |

### Sweep card — *only when last month was cheaper*
| Element | Calculation | Representation |
| --- | --- | --- |
| Underspend | Compares the **two months before this one**. `rateA = totalA/daysA`, `rateB = totalB/daysB`, `normalised = (rateB − rateA) × daysA`. Shown only when **both** `normalised > 0` and `raw > 0`; the figure is `min(raw, normalised)`. Day-count normalised so February does not look thrifty for having 28 days. | Green figure + "less than \<month\>" |
| Destination picker | Open (incomplete) funds | Chip row, one per goal |
| Move it | POSTs an expense of `savedMinor` to the chosen goal category | Full-width primary button, "Move it to \<goal\>" |
| Dismiss | Local state | `Not now` tag |

### 1 — Month tally: "Left in hand · \<month\>" / "Down in \<month\>"
The headline of the app.

| Element | Calculation | Representation |
| --- | --- | --- |
| **Headline figure** | `inHandMinor = inMinor − outMinor − investedMinor`, built from `tally` in `plan.ts`. Uses **income that actually arrived**, never the estimate. | 2.4rem/5xl number. Red with a leading `−` when negative; label flips to "Down in". |
| Sub-line | — | "after ₹X spent and ₹Y invested" |
| "came in" | `tally.inMinor` = sum of `kind='income'` rows in the month | Top-right muted figure |
| **Stacked bar** | Scaled to `max(inMinor, outMinor + investedMinor)` — **not** to income alone, so segments can never sum past 100% and silently rescale. Segments: spent, invested, in-hand. | 10px rounded bar, three segments |
| Income mark | Drawn at `pct(inMinor)` only when `inHandMinor < 0` | 2px red vertical rule + caption "past this line, the month drew on what you already had" |
| Legend: **Spent** | `tally.outMinor` | Grey dot (`--text-muted`) + figure |
| Legend: **Invested** | `tally.investedMinor` — hidden entirely when 0 | Green dot (`--credit`) |
| Legend: **Left in hand** / **Taken from savings** | `tally.inHandMinor`, signed | Gold dot, or red when negative |
| Caption | `savedMinor = inMinor − outMinor`; `ratePct = saved / in × 100`. The textbook savings rate, deliberately demoted from headline to caption and reconciled against the cash figure in words. | Muted paragraph |
| Hidden when | `tally.known === false` (no income ever recorded) | Card does not render |

Colours are chosen to survive both themes: `--brass` and `--hi` are both gold in
Ink, so the bar uses neutral / green / gold instead.

### 2 — The month at a glance
| Element | Calculation | Representation |
| --- | --- | --- |
| "Spent in \<month\>" | `flow.pace.spentMinor` = Σ `kind='expense'` rows in month | Hero figure |
| Delta chip | `flow.pace.deltaPct = (spent − prevSameDay) / prevSameDay × 100`. **Same elapsed days both sides.** Null when last month had nothing. | `↑ 138%` pill, red up / green down. "no change" under 0.05%. |
| Note | `prevSameDayMinor` = last month's daily totals filtered to `day ≤ elapsedDays` | "against ₹X by this day last month" |
| **Projected month end** | `(spentMinor / elapsedDays) × monthDays` — straight-line | Right-aligned figure + "at ₹X a day" |
| **Invested, separately** | `investments.monthMinor` — shown only when > 0 | Row linking to `/goals` with an arrow |
| **Flow curve** | Cumulative running total per day. Solid = this month; dashed = last month at the same day index. Runs to **today** in a live month, not to the 31st. Needs ≥ 2 points. | SVG area + line, 180px |

### Stat strip (4 tiles)
| Tile | Calculation | Representation |
| --- | --- | --- |
| Today | `getTotal(today..today)` — **null-ed to 0 on any non-current month** | Figure |
| This week | `weekRange(today)`, Monday–Sunday — same null-ing | Figure |
| Typical entry | `PERCENTILE_CONT(0.5)` over the month's expense amounts (median, not mean) | Figure + "N this month" |
| Net with people | `ledger.netMinor` = Σ`out` − Σ`in` across all people | `|net|`, green if owed to you / red if you owe, sub-label says which |

### 3 — Goals strip — *only when goals exist*
| Element | Calculation | Representation |
| --- | --- | --- |
| Per-goal row | `savedMinor / targetMinor` | Icon, name, `saved / target`, 5px progress bar |
| Percentage | `min(1, saved/target) × 100` | Small figure, bottom-left |
| Monthly pace | `requiredPerMonthMinor = ceil(remaining / monthsLeft)` | "₹X a month", bottom-right |
| Completed | `saved >= target` | Green "done" |
| Cap | First 4, open goals before finished ones | Card with divided rows; **All goals →** |

### 4 — Needs your attention
Rules in `src/lib/attention.ts`. Every rule reads a figure the app already
computed. Sorted by `weight` descending; each row dismissible for the month.

| Rule | Condition | Weight | Tone |
| --- | --- | --- | --- |
| **Pay not logged** | Current month · source has `monthMinor === 0` · `typicalDay` and `dayVariance` known · `dayOfMonth > typicalDay + dayVariance + 1` | 100 | urgent |
| **Over budget** | `spent > budget` on an `expense` category with a limit | 90 | urgent |
| **Goal behind** | `paceConfident` · `−paceDelta >= requiredPerMonth` (behind by at least a month's contribution) | 80 | warn |
| **Budget will break** | Current month · `dayOfMonth >= 5` · `projected = (spent/day)×daysInMonth > budget` · crossing day `ceil((budget/spent)×day)` falls inside the month | 60 | warn |
| **Stale debt** | Balance owed to you · `daysSince(lastEntryDate) >= 30` | 50 | warn |
| **Running hot** | Current month · `pace.deltaPct >= 40` | 40 | warn |
| **On track** | *Only when nothing else fired* · current month · income known · `inHand > 0` · `dayOfMonth >= 10` | 0 | good |

Representation: card list, coloured dot per tone (red / gold / green), title +
detail line, an action button linking to the fixing screen, and an `×` to
dismiss. Count badge in the section header. When empty, the "On track" row is
itself the result.

### 5 — Recent activity
| Element | Calculation | Representation |
| --- | --- | --- |
| Rows | Last 5 from `/api/transactions` for the month | Icon, note-or-category, date, category tag, person tags, amount |
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
| Filters sheet | Search (notes) · category chips · people chips | Modal, **Clear** / **Show results** |

### Stat strip — totals the **whole filtered set**, not the loaded page
Computed server-side by a separate aggregate query that shares its WHERE clause
with the paged query, so paging cannot change the totals.

| Tile | Calculation | Representation |
| --- | --- | --- |
| Spent | Σ where `kind='expense'` category is `expense` | Figure + "N entries" |
| Income *or* Invested | Whichever is non-zero (income wins) | Green figure |
| Lent out | Σ ledger `direction='out'` | Red when non-zero |
| Borrowed | Σ ledger `direction='in'` | Green when non-zero |

### The day-grouped list
| Element | Calculation | Representation |
| --- | --- | --- |
| **Day heading** | Groups by `date`; subtotal = Σ of that day's rows where the category kind is `expense` | Sticky bar at `var(--stick-top)`, surface-2 background, entry count + subtotal |
| **Clustering** | Identity = `kind │ categoryId │ sorted personIds │ lowercased trimmed note`. Same-day identical entries fold into one row. **Display only** — the day subtotal still adds individual amounts. | One row showing the combined total and `×N` |
| Cluster tap | — | Modal listing every underlying entry, each with Edit and Delete |
| Category / person tags | — | Tap opens the inspector; **shift-click** filters the list by it |
| Edit / Delete | Delete sets `deleted_at` | `.reveal` tags on single rows; undo toast |
| Load more | `limit += 150` | Full-width button, shown while `hasMore` |

Deep link: `?person=<id>` pre-filters to one person.

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
| **Month by month** | 12-month series, zeros included so the shape is honest. Needs ≥ 2 active months. | Bar chart, tap a bar to jump to that month |

### Stat strip
| Tile | Calculation |
| --- | --- |
| Typical month | `median(months with income > 0)`, sub-label "median of N" |
| Best month | `max(active months)` — green |
| Leanest month | `min(active months)` |
| Lifetime | Σ all income ever |

### Steadiness insight — *needs ≥ 3 active months and a non-zero spread*
| Element | Calculation | Representation |
| --- | --- | --- |
| Verdict | `spreadMinor = high − low`. Warn when `spread > typical × 0.35`, else good. | Insight block, amber or green rule |
| Copy (variable) | — | "Your income swings by ₹X between your best and leanest month. Budget against **₹median** rather than your last figure." |
| Copy (steady) | — | "Steady: ₹X between best and leanest. Planning against ₹median is safe." |

### Where it comes from — one row per source
| Element | Calculation | Representation |
| --- | --- | --- |
| Amount | This month's total for that source | Green when > 0 |
| Status line | Last payment date; plus `usually ₹X` from that source's own median | Muted 11px |
| **Sparkline** | That source's 12-month series; needs ≥ 2 payments | 96px inline sparkline, desktop only |
| **Timing note** | `typicalDay = round(median(day-of-month))` — needs ≥ 2 payments. `dayVariance = mean absolute deviation from the median` — needs ≥ **4** payments. | `≤2` days variance → "Lands within N days of the 5th, going by the last 6." Otherwise → "Timing moves — around the 5th, give or take N days." |
| Row tap | — | Opens the category inspector |

---

## 4. People — `/people`

> A contact you spend with and one you lend to are the same person. The two
> figures are never added together.

### Net position card
| Element | Calculation | Representation |
| --- | --- | --- |
| Net | `Σ(direction='out') − Σ(direction='in')` across everyone | Hero figure, `|net|` with "owed to you" / "you owe" / "Everything is settled." |
| They owe me | `owedToMeMinor` = Σ of positive per-person balances | Green figure + proportional bar against `max(owedToMe, owedByMe)` |
| I owe | `owedByMeMinor` = Σ of negative balances | Red figure + bar |
| Actions | — | **I lent** / **I borrowed** ghost buttons — the same words the add sheet uses |

### Filters
`All` / `Owing` (balance ≠ 0) / `Spending` (month share > 0) segmented control ·
**+ Person** chip. Sort: by `|balance|` in Owing mode, else by month spend.

### The table
| Column | Calculation | Representation |
| --- | --- | --- |
| Contact | — | Avatar mark (initial on their colour), name, `· you` for self, relationship type, transaction count |
| **\<month\> spend** | That person's **share**: `amount × (1/participants)` summed, with exact paisa remainder allocation | Figure + 3px bar proportional to the biggest spender |
| Balance | Per-person `out − in` | Green if owed to you, red if you owe, `—` when settled |
| Settle | Opens the ledger form pre-filled with `|balance|` in the correcting direction | `Settle` tag (desktop column) / `Settle ₹X` full-width tag (mobile) |

Mobile reflows: balance rides up beside the name; Settle becomes a row beneath.
Tapping a row opens the person inspector. Deep link `?settle=<id>`.

### Footnote
Explains that spend is a *share* (₹800 dinner ÷ 2 = ₹400 each) and that balance
is separate money.

---

## 5. This month — `/analytics/month`

> Everything time-boxed to one month. Month picker is the page's control.
> All figures from `src/lib/flow.ts` unless stated.

### Hero
| Element | Calculation | Representation |
| --- | --- | --- |
| Total spent | `pace.spentMinor` | Hero figure + delta (same-days basis) |
| Note | — | "N transactions · ₹X a day" |
| Last month by today | `prevSameDayMinor` | dl row |
| Projected month end | `(spent/elapsed) × monthDays` — current month only | dl row, bold |
| First half / Second half | Split at `ceil(monthDays / 2)` by day-of-month | Two dl rows |
| Flow curve | As on Dashboard, 210px | SVG + caption explaining the dashed line |

### Stat strip
| Tile | Calculation | Representation |
| --- | --- | --- |
| Daily average | `spentMinor / elapsedDays` | Figure |
| **Vs last month** | `summary.changePct`. In a live month the basis is **the same elapsed days**; on a completed month it is the full month. `comparedTo` travels with the number. | Signed %, red up / green down, sub-label naming last month's figure |
| Biggest day | `max(dailyTotals)` | Figure + date |
| Typical entry | Median | Figure + "average ₹X" |

### Budgets — *hidden when nothing has a limit*
| Element | Calculation | Representation |
| --- | --- | --- |
| Roll-up | `Σ spent` and `Σ budget` across budgeted `expense` categories only | Figure "of ₹X", 6px bar, red when over |
| Summary line | — | "Across N budgeted categories — ₹X left" / "over by ₹X" |
| Per-category bar | `share = spent / budget`; sorted by `share` descending | Icon, name, `spent / budget`, 5px bar |
| **Pace marker** | `pace = (dayOfMonth) / daysInMonth`, clamped to 1; only in the current month | 1px vertical rule at `pace × 100%`, 45% opacity |
| Colour | Red when over; gold when `share > pace + 0.05`; else the category colour | — |
| Status line | — | "Over by ₹X." / "Ahead of an even burn for this point in the month." |

### Rhythm
| Element | Calculation | Representation |
| --- | --- | --- |
| **What a weekday costs** | `avgMinor = totalOnThatWeekday / occurredDays`, where `occurredDays` counts how many of that weekday have **happened** in the window (capped at today). Not days-with-spending. | Seven bars, Sun–Sat |
| Peak sentence | Peak weekday vs mean of the others; warn tone when `peak > rest × 1.5` | "A Thursday costs ₹X on average, against ₹Y on every other day." |
| **Day by day** | One bar per calendar day | Gold bar marks the heaviest; hover on desktop reveals that day's figure |
| Days spent / Quiet days / Longest quiet run | Counted over **elapsed** days only, so a live month is not reported as having 9 quiet days on the 22nd | Three mini stats |

### Where it went
| Element | Calculation | Representation |
| --- | --- | --- |
| Person filter | `Everyone` / each person / `Nobody tagged`. Reshapes the category query. | Scrollable chip row |
| Donut | `share = categoryTotal / grandTotal` | 148px donut with a centre label |
| Breakdown list | Same shares | Icon, name, amount, share bar, % |
| Concentration | `top3Share = Σ top-3 shares`; `activeCategories = count`; warn above 0.8 | Insight line |
| Category tap | — | Drill-down modal: total, count, % of month, every transaction — **click one to edit it** |

### Heating up, cooling down — *hidden when every row would say "new"*
| Element | Calculation | Representation |
| --- | --- | --- |
| Baseline | `trailing3MonthTotal / eligibleMonths`, where `eligibleMonths` counts only months in which the category **existed** (`categories.created_at`). Then pro-rated by `elapsedDays / monthDays` in a live month. | — |
| Delta | `thisMinor − baselineMinor` | Signed amount, red up / green down |
| `new` | `eligibleMonths < 2`, or baseline is 0 with spend this month | Gold "new" label instead of a delta |
| Bar | `|delta| / max|delta|` | Two-sided bar growing from the centre line |
| Row tap | — | Opens the category inspector (month scope) |

### How the money leaves — *when there are transactions*
| Element | Calculation | Representation |
| --- | --- | --- |
| Typical entry | Median | 2xl figure + "the middle of N entries" |
| Largest single | `max(amountMinor)` | 2xl figure + category and date |
| **Under ₹X** | Threshold is the **25th percentile of the trailing 3 months**, rounded to the nearest ₹10, floor ₹10. Falls back to the ₹200 constant below 20 entries of history. | Label, total, share bar, and "N of M entries, and P% of the money" |
| Things bought more than once | Grouped by lowercased note, count ≥ 2 | List: label, category, `×N`, total |

### Who it was with
Person shares (partitioning the month), a **Nobody tagged** line for untagged
spend, and the explanation that both dimensions partition the same money.

### Not spending
| Block | Calculation | Representation |
| --- | --- | --- |
| Investing, separately | Month invested · lifetime · `invested / (invested + spent)` as "share of outgoings" | 3-tile strip + explanation of why it is excluded above |
| Lending, separately | `lentMinor`, `borrowedMinor`, `netMinor` from the ledger within the month | 3-tile strip + explanation |

### The longer view
A signpost card only — trends moved to Lifetime, because none of them respond to
the month picker.

---

## 6. Lifetime — `/analytics/lifetime`

> Every month added up. **No month picker**; nothing here moves when the month
> changes elsewhere.

### Net position — what you have built
| Element | Calculation | Representation |
| --- | --- | --- |
| **Headline** | `inHand + invested + owedToMe − owedByMe` | 2.4rem/5xl figure, red when negative |
| Cash in hand | `lifetime.inHandMinor` (see below) | dl row linking to the card underneath |
| Invested | Σ all `kind='investment'` ever — **added back**, because this is net worth not cash | Green dl row → `/goals` |
| Owed to you | `ledger.owedToMeMinor` | dl row → `/people` |
| You owe | `−ledger.owedByMeMinor` | Red dl row → `/people` |
| Net position | The sum | Bold dl row above a rule |

### Lifetime in hand
| Element | Calculation | Representation |
| --- | --- | --- |
| Figure | `Σin − Σout − Σinvested − Σlent + Σborrowed` — **the ledger is included**, because the card claims to describe cash | Hero figure, signed |
| Breakdown | Everything that came in / spent / invested, then the total | dl with a ruled total row |
| Context | `months` = distinct months with any row; `firstMonth` = earliest | "kept across N months, since \<month\>" |

### Stat strip
| Tile | Calculation |
| --- | --- |
| Months tracked | Distinct `YYYY-MM` with any transaction, sub-label = first month |
| Ever invested | Lifetime investment total |
| Best month kept | `max(savedMinor)` across months with income, sub-label = that month |
| Positive streak | Longest run of consecutive months with `savedMinor > 0` |

### Over time
| Element | Calculation | Representation |
| --- | --- | --- |
| **What you spend** | 24 months of spending totals | Bar chart; tap a bar → `/analytics/month?month=` |
| **What you keep** | Per month: `saved = in − out`, `ratePct = saved / in`. Months with **no income are drawn as gaps, not zeroes**. | One row per month: name, %, amount, bar. Negative months in red. |
| Footer average | **Pooled**: `Σsaved / Σin`, not the mean of the monthly rates — a ₹5k month at 90% must not weigh as much as a ₹50k month at 20%. | "Averaging N% kept across M months with income logged." |

### What it has all gone on
All-time totals per category, ranked. Tapping one opens the inspector in
**lifetime scope** — month-by-month totals rather than this month's rows.

### Lending, all time — *when the ledger has moved*
Owed to you · You owe · Net (with "in your favour" / "against you").

### Year on year — *needs ≥ 2 calendar years*
Per year: `Σin`, `Σout`, `Σsaved`. Two bars (In green, Out grey) scaled to the
largest year, plus "kept ₹X". Returns `null` below two years rather than drawing
a year-on-year chart out of five months.

---

## 7. Goals & investing — `/goals`

> A goal *is* an investment category with a target on it. Reports contributions,
> never returns — the app has no price data.

### All goals together
| Element | Calculation | Representation |
| --- | --- | --- |
| Roll-up | Over **incomplete** goals: `Σsaved`, `Σtarget`, `Σ requiredPerMonth` | Sentence: "₹X saved of ₹Y across N goals — ₹Z a month to land them all on time." |
| Progress | `Σsaved / Σtarget` | 6px green bar |
| Finished count | `isComplete` count | Green micro-label |
| Behind warning | Count of goals with `paceConfident && paceDelta < 0` | Red line: "N goals are behind pace." |

### Hero
| Element | Calculation | Representation |
| --- | --- | --- |
| Put in during \<month\> | Σ `kind='investment'` in the month | Hero figure |
| Delta | vs last month, **inverted** (up is good) | Green-up pill |
| Note | Lifetime total + first contribution date | Muted line |
| Where the money went | `invested / (invested + spent)` | 6px green share bar + both figures |
| Contributions by month | Needs ≥ 2 months | Bar chart, tap to jump |

### Goal cards (`FundCard`) — the arithmetic lives in `src/lib/funds.ts`
| Element | Calculation | Representation |
| --- | --- | --- |
| Header | `savedMinor of targetMinor · by <targetLabel>` — the date carries the **year** when it is not this one | Icon, name, muted line |
| Progress | `min(1, saved / target)` | 8px bar, green when complete |
| Remaining | `max(0, target − saved)` | "₹X to go" |
| **Needs a month** | `ceil(remaining / monthsLeft)` where `monthsLeft = monthsBetween(today, targetDate)` — part months count as one | Figure + "N months left" |
| **Pace** | `expectedByNow = target × (elapsed / span)` on the line from the **first contribution** to the target date; `paceDelta = saved − expectedByNow` | Green "+₹X ahead of plan" / red "−₹X behind plan" |
| Pace gate | `paceConfident` requires ≥ **21 days** since the first contribution | Below that: "Just started — pace after a few weeks" |
| **Projection** | `perDay = saved / daysRunning`; `daysNeeded = ceil(remaining / perDay)`. Requires ≥ **2 contributions** and ≥ **30 days**. | "At the rate so far you get there around \<date\> — ahead of / later than the \<target\> target." |
| Action | — | "Add to this goal" ghost button |

### Stat strip
Lifetime · Monthly average (`lifetime / activeMonths` — months **that had a
contribution**, so skipping months does not lower it; the sub-label says so) ·
Contributions count · Last month.

### Where it is going
Lifetime totals per investment category, biggest first, with three correctly
distinguished empty states: no investment categories · a goal exists but nothing
contributed · loading.

### Every contribution
Reverse-chronological list: note-or-category, date, category, amount.

### Footnote
States that none of this counts as spending anywhere, and that the screen reports
what you put in — not what it is worth today.

---

## 8. Settings — `/settings`

> Configuration only. Income and budget *progress* have moved out.

| Section | Contents | Calculation | Representation |
| --- | --- | --- | --- |
| **Income** | Signpost only | Count of active `income` categories; this month's received total | One card: "N sources · ₹X received this month" + **Open Income** |
| **Categories** | One row per active category | Spend this month per category. Budget bar only for `kind='expense'` with a limit. | Icon, name, `spent / budget` + 3px bar, or a subtitle: `Income · kept out of spending` / `Goal · ₹X by <date>` / `Investment · kept out of spending` / `No monthly budget`. **▲▼** reorder (desktop), **Edit** per row; tapping the row opens the inspector. **+ New**. |
| Disabled categories | `isActive === false` | — | Muted line listing them, noting their history still counts |
| **Account** | Name · Email · Currency | From the session | Read-only dl |
| **Data** | Import · Export · CSV | Export builds a workbook: a tab per month as day × category, a `PEERS` tab, and a `TRANSACTIONS` tab preserving notes and people (which is what makes it re-importable) | Two ghost buttons + an inline CSV link |
| **Appearance** | System / Paper / Ink | Stored in `localStorage` as `mf-theme`; applied as `data-theme` on `<html>` | Three cards, each painting a miniature of the real theme from the raw palette vars |
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
| **month** (default) | This month · Avg transaction · Transactions · Projected | Budget bar with pace marker, then the month's transactions — **each row opens the edit sheet**. Person tags inside a row open that person without triggering the row. |
| **lifetime** (from the Lifetime page) | Lifetime · Transactions · Months seen · Busiest month | **Month by month**, newest first, each with a bar scaled against the busiest month. No budget block — a monthly limit has nothing to say about all time. |

**Projected** is gated: below 4 transactions in the trailing three months the tile
shows Lifetime instead, because extrapolating a flat daily rate from one rent
charge produces a number that is never once correct.
