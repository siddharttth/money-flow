# Money Flow — what is on every screen, and what it does

A page-by-page inventory of the app: every element on each of the eight
screens, and the functionality it provides. Written from the source, not from
memory — `src/app/(app)/*/page.tsx` plus the shared components each one mounts.

> **Restructured.** The app was six screens sorted by noun; it is now eight
> sorted by time horizon — see `docs/REDESIGN.md` for the argument and the
> eleven calculation bugs that came out of writing it. Old routes redirect:
> `/analytics` → `/analytics/month`, `/investments` → `/goals`.

| Page | Route | Horizon |
| --- | --- | --- |
| Dashboard | `/dashboard` | now |
| Transactions | `/expenses` | a point |
| Income | `/income` | recurring |
| People | `/people` | running balance |
| This month | `/analytics/month` | this month |
| Lifetime | `/analytics/lifetime` | all time |
| Goals & investing | `/goals` | ahead |
| Settings | `/settings` | — |

Two rules run through everything below and explain most of the design:

1. **Investing and income are not spending.** All three live in the same
   `expenses` table and are told apart only by the `kind` of category they are
   filed under (`expense` / `investment` / `income`). Every "spent" figure in
   the app filters to `kind = 'expense'`.
2. **Category totals sum to the month; person totals also sum to the month.**
   A ₹75 dinner tagged with three people puts ₹25 against each — shares, not
   copies — so both dimensions partition the same money instead of multiplying
   it.

---

## Shared shell — present on all eight screens

| Element | Where | What it does |
| --- | --- | --- |
| **Sidebar nav** | Desktop, fixed left | Dashboard, then two labelled groups — **Record** (Transactions, Income, People) and **Understand** (This month, Lifetime, Goals) — then Settings. The labels are the only place the app says out loud that it has an in-side and an out-side. |
| **Bottom tab bar** | Mobile, fixed | Five tabs: Home, Ledger, Insights, Goals, People. **Insights** covers both analytics pages, with a segmented Month/Lifetime control at the top of the page. Income and Settings live in the mobile header. |
| **Add transaction** | Sidebar button (desktop) / floating **+** (mobile) | Opens the add sheet. Keyboard shortcut: `n`. |
| **Search** | Sidebar field / mobile header icon | Opens the command palette. Shortcut: `⌘K`. |
| **Command palette** | `⌘K` | Fuzzy search over people, categories and screens. Jumps to any screen, opens any person/category inspector, or triggers Add transaction. |
| **Month picker** | Header of Transactions, Income, People, Goals, This month. **Not on Dashboard** — Home is always the current month, which is what stops "Today" appearing under an August heading. | `‹ Aug ›`. Steps one month at a time; forward is disabled past the current month. Shows the year when it is not this one. |
| **Toasts** | Bottom of screen | Confirmations after any save/delete. Delete toasts carry an **Undo** action (soft delete + restore). |
| **User block** | Bottom of sidebar | Name, email, **Sign out**. |

### The Add transaction sheet

One segmented control picks the kind; the matching form renders underneath.

| Tab | Fields | Notes |
| --- | --- | --- |
| **Expense** | Amount (₹, decimal keypad) · Category chips · **Investing · kept, not spent** chip row · Person chips + **＋ Multiple** · Date · Note | Category chips are ordered most-recently-used first. "Me" is pre-selected; the first tap on another person *replaces* it rather than adding. With more than one person tagged it shows the per-head split and offers **Lend their shares** — one tap writes the ledger entries so the app knows what each of them owes you. |
| **Income** | Amount · Source chips · Date · Note | No person block (nobody is "with" a salary). With no income source set up, links straight to the sheet that creates one. |
| **I lent** / **I borrowed** | Amount · Person · Date · Note | Direction is chosen once, by the tab. |

`⌘/Ctrl + Enter` saves and immediately queues another entry.

### The inspectors (slide-over drawers)

Opened from almost any name in the app.

**Person inspector** — Spent lifetime · Spent this month · Net ledger balance (settled / owed to you / you owe, with the Gave/Got split) · two tabs: **Expenses** (each row shows that person's *share*) and **Lent & borrowed** · **Clear all lending history** (soft delete, with a confirm step) · footer actions **Settle up** and **Log expense**.

**Category inspector** — This month · Avg transaction · Transactions · Projected · a budget bar with a pace marker showing where an even burn would have you today · the month's transactions, each person on them tappable.

---

## 1. Dashboard — `/dashboard`

> One question: **is this month going well, and is there anything I should do
> about it?** No month picker — Home is *now*. Five blocks; everything cut from
> the old nine went to a page that exists to hold it.

### Sweep card *(only after an underspent month)*
How much less you spent than the month before — **day-count normalised**, so a
28-day month cannot flatter itself against a 31-day one. Goal chips pick a
destination, then **Move it to `<goal>`**. **Not now** dismisses it.

### 1 — Month tally: "Left in hand · `<month>`" / "Down in `<month>`"
`came in − spent − invested`, negative in red. A stacked bar scaled to the
larger of money-in and money-out, with a red mark where income ran out.
Three legs: Spent · Invested · Left in hand / Taken from savings. The caption
carries the textbook savings rate, qualified. Built from income that actually
arrived, never the estimate.

### 2 — Needs your attention *(new)*
A rules list, each entry firing only on evidence, each dismissible for the
month. Every rule reads a figure the app already computed:

| Rule | Fires when |
| --- | --- |
| Pay not logged | A source is past its usual day ± its usual variance, with nothing recorded |
| Goal behind | Behind the line by more than one month's contribution, and pace is confident |
| Over budget | A category has passed its limit |
| Budget on course to break | Past the 5th, and the rate projects past the limit — names the day it crosses |
| Debt gone stale | Someone has owed you 30+ days |
| Running hot | 40%+ above the same point last month |
| On track | Nothing else fired, past the 10th, in hand and positive |

### 3 — The month at a glance
Spent hero with the same-day delta, projected month end, **Invested separately →**,
and the cumulative flow curve against last month's dashed line. Then a stat
strip: Today · This week · Typical entry · Net with people.

### 4 — Goals strip *(when goals exist)*
One row per goal: progress bar, %, and the monthly pace needed. **All goals →**

### 5 — Recent activity
Last five transactions. **View all →**

### Footer
One line — *"Kept across N months ₹X →"* — linking to Lifetime.

---

## 2. Transactions — `/expenses`

> The ledger. One row per transaction, grouped by day, with the day's own subtotal in a heading that stays put while its rows scroll under it.

### Header
Month picker · **Filters** button with a badge counting active filters.

### Stat strip (reflects the current filter)
Spent (+ "N shown") · Income *or* Invested · Lent out · Borrowed.

### Quick filter chips
`Everything` · `Spent` · `Lent` · `Borrowed` — multi-select. **Clear all ×** appears once anything is filtered.

### The day-grouped list
| Element | Function |
| --- | --- |
| **Sticky day heading** | "Today" or the full date, entry count, and the day's spending subtotal. Stays pinned under the mobile header while its rows scroll. |
| **Transaction row** | Icon, note or category name, date, category tag, person tags, amount. |
| **Clustering** | Same day + same category + same people + same note folds into one row showing the combined total and a `×N` count. Display only — the day subtotal still adds the individual amounts. |
| **Tap a cluster** | Opens a popup listing every underlying entry, each with its own Edit and Delete. |
| **Tap a category/person tag** | Opens that inspector. **Shift-click** filters the list by it instead. |
| **Edit / Delete** | On single (unclustered) rows. Delete is soft, with an **Undo** toast. |
| **Load more** | Pages in another 150 rows. |

### Filters sheet
Search notes · Category chips (multi-select) · People chips (multi-select) · **Clear** / **Show results**. Warns that lent/borrowed entries have no category and will be hidden if you combine those filters.

### Deep link
`?person=<id>` pre-filters to one person (used by the person inspector's "Log expense").

---

## 3. Income — `/income`

> Everything about money arriving. Lifted out of Settings and given room to
> answer what a settings row never could.

### Hero — "Received in `<month>`"
Total, with an **inverted** delta against last month (up is good here), and a
note comparing against your *median* rather than your last figure — one good
month should not reset what normal means.

### When it landed
The month as a row of dots, filled on the days income actually arrived. For a
salary that is one confident dot; for freelance it shows the real shape, which
an average actively hides. *(Current month only.)*

### Month by month
Up to 12 months of income as bars, with the average as a dashed reference line.
Tap a bar to open that month.

### Stat strip
Typical month (median of N) · Best month · Leanest month · Lifetime.

### How steady is it *(needs 3+ months)*
One sentence, and only one of two:
- Swinging more than ~35% of the median → *"Your income swings by ₹X between
  your best and leanest month. Budget against ₹Y — your median — rather than
  your last figure."*
- Otherwise → *"Steady: ₹X between best and leanest. Planning against ₹Y is safe."*

### Where it comes from
One row per source: icon, name, this month's amount, when it last landed, what
it usually is, and a 12-month sparkline. Tapping opens the category inspector.

**Reliability, per source** *(needs 4+ payments)* — either *"Lands within 2 days
of the 1st, going by the last 6"* or *"Timing moves — around the 5th, give or
take 9 days."* This feeds the Home rule for unlogged pay.

### Footnote
Says a payment is logged like anything else, and that this is what feeds
**Left in hand** on the dashboard.

---

## 4. Goals & investing — `/goals`

> Goals first, then the contributions behind them. Reports what you put in,
> not what it is worth — the app has no price data.

### All goals together *(new)*
One line: `₹X saved of ₹Y across N goals — ₹Z a month to land them all on
time`, with a combined progress bar, and a red note counting how many are
behind pace. The figure you previously had to sum in your head.

### Hero card — "Put in during `<month>`"
- Month total, with a delta against last month (**inverted** — up is good here, unlike everywhere else).
- Lifetime total and the date of the first contribution.
- **`<month>` · where the money went** — a share bar splitting the month between invested and spent, with both figures.
- **Contributions by month** bar chart (needs 2+ months). Tap a bar to jump to that month.

### Goals
- One **FundCard** per goal:
  - Name, `saved of target`, and `by <date>` (with the year when it isn't this one)
  - Progress bar, % and **₹X to go**
  - **Needs a month** — the contribution required to land on time — and months left
  - **Pace** — ₹X ahead of / behind plan. Says **"Just started"** for the first three weeks rather than dressing one deposit up as a trend.
  - **Projection** — "At the rate so far you get there around `<date>`", and whether that beats the target. Withheld until there are 2+ contributions and 30 days of history.
  - **Add to this goal** button
- **New goal** / **Manage** link in the section header.
- Empty state explains what a goal is and links to the goal sheet.

### Stat strip
Lifetime · Monthly average (over N active months) · Contributions count (since first date) · Last month.

### Where it is going
Lifetime totals per investment category, biggest first. Tap → category inspector. Three empty states, correctly distinguished: no investment categories at all, a goal exists but nothing contributed yet, or loading.

### Every contribution
Reverse-chronological list of every investment transaction: note or category name, date, category, amount.

### Footnote
Explains that none of this counts as spending anywhere in the app, and that the screen reports what you put in, not what it is worth today.

---

## 5. People — `/people`

> A contact you spend with and a contact you lend to are the same person. This screen merges both, and never adds the two figures together.

### Net position card
- Big figure: net balance, with "owed to you" / "you owe" / "Everything is settled."
- **They owe me** and **I owe** side by side, each with a proportional bar.
- Two actions: **I lent** and **I borrowed** — the same words the Add sheet uses.

### Filter row
`All` · `Owing` · `Spending` segmented control, plus **+ Person**.

### The people table
| Column | Function |
| --- | --- |
| **Contact** | Avatar mark, name (`· you` for yourself), relationship type, transaction count. |
| **`<month>` spend** | That person's **share** of the month, with a proportional bar. |
| **Balance** | Running ledger balance, green if owed to you, red if you owe, `—` if settled. |
| **Settle** | Opens the ledger form pre-filled with the outstanding balance, in the correct direction — still editable for a part payment. |

On a phone the layout reflows: the balance rides up next to the name, and **Settle ₹X** becomes a full-width action beneath the row. Tapping any row opens the person inspector.

### Footnote
Explains that spend is a *share* (an ₹800 dinner with two people is ₹400 each) and that balance is separate money entirely.

### Add person sheet
Name · Relationship (family / friend / other) · Colour, with a live avatar preview.

### Deep link
`?settle=<id>` opens the settle-up sheet directly (used by the person inspector).

---

## 6. This month — `/analytics/month`

> Everything time-boxed to one month, in the order the questions occur. This
> page owns the month picker.

### Budgets *(moved here from Settings)*
Total spent of total budgeted with a bar that turns red when over, then one row
per budgeted category: icon, name, `spent / budget`, a bar that goes gold when
ahead of pace and red when over, and **a pace marker** showing where an even
burn would put you today. A bar at 60% on the 10th is a different story from
the same bar on the 28th, and the marker is what says which.

### Hero card
Total spent, delta, transaction count and daily rate. Beneath it: last month by today (or the month before), projected month end, first half vs second half. Right side: the flow curve with an explanation of the dashed line.

### Stat strip
Daily average · Vs last month (% and last month's figure) · Biggest day (and which day) · Typical entry (median, with the average alongside).

### Rhythm
- **What a weekday costs** — average spend per day-of-week, plus a one-sentence read: *"A Thursday costs ₹X on average, against ₹Y on every other day."*
- **Day by day** — a bar per calendar day, gold marks the heaviest; **hover on desktop shows that day's spend**. Below: days spent, quiet days, longest quiet run.

### Where it went
- **Person filter chips** — `Everyone`, each person, and `Nobody tagged`. This reshapes the category view; it is the one place the two dimensions are deliberately crossed.
- **Donut + full category breakdown** with shares. Tap a category → drill-down modal.
- **Concentration insight**: "Three categories carry N% of the month, spread across M in use."
- **Heating up, cooling down** — this month against the average of the three before, per category, with a two-sided delta bar. *Hidden in a first month*, where every row would just read "new".

### How the money leaves *(when there are transactions)*
- **Typical entry** (median) and **Largest single** with its category and date.
- **Under ₹X** — the small-ticket total, its share bar, and what fraction of entries and of the money it represents.
- **Things you bought more than once** — repeated notes, matched case-insensitively, with count and total.

### Who it was with
Every person's share, plus a **Nobody tagged** line, and the note explaining that both dimensions partition the same month.

### Investing, separately *(when you invested)*
Put in this month · Lifetime · Share of outgoings. Plus the explanation of why it is excluded from every figure above. **Open** → Investments.

### Lending, separately *(when the ledger moved)*
Lent out · Received · Net movement (out of / into pocket), with the reasoning for keeping it out of spending totals.

### The longer view
A pointer, not a section — twelve months of bars and six months of savings rate
were never month-scoped, and stranding them under a month picker made the
picker look broken. **Open Lifetime →**

### Category drill-down modal
Opened by tapping a category. Shows the total, the transaction count and its % of the month, then every transaction — click one to open it for editing.

---

## 7. Lifetime — `/analytics/lifetime`

> The whole arc, and deliberately no month picker. Nothing here moves when you
> change the month elsewhere.

### Net position *(new)*
`cash + invested + owed to you − you owe`, with each line spelled out and
linking to the screen that owns it. Investments are **added back** here — this
is net worth, and the card says so, where the card below it is the cash half of
the same arithmetic. The figure no screen previously answered.

### Lifetime in hand
`Σ(came in − spent − invested − lent + borrowed)` across every month, with the
subtraction spelled out. The ledger is in it now: money handed to a friend has
left the account.

### Stat strip
Months tracked · Ever invested · Best month kept · Longest positive streak.

### Over time
- **What you spend** — up to 24 months of bars; tap to open that month.
- **What you keep** — savings rate per month, gaps for months with no income,
  and a **pooled** footer (`Σsaved ÷ Σincome`, not the mean of the rates).

### What it has all gone on *(new)*
Every category by lifetime total. The monthly view answers what is moving; this
answers what it has cost.

### Lending, all time *(new)*
Owed to you · You owe · Net. The ledger previously only ever appeared as a
current balance.

### Year on year *(new, gated at 2+ years)*
In, out and kept per calendar year, as paired bars. Withheld below two years
rather than drawn from a fragment.

---

## 8. Settings — `/settings`

> Configuration, not a daily destination. A stack of labelled sections, one card each.

### Income
A signpost, not a section — source count, this month's total, and **Open Income →**.
Income moved to its own page: a configuration screen is somewhere you go once,
and income is something you record every month.

*(Budget progress moved to This month. Setting a limit is still here, on the
category sheet — watching a bar fill against it is not configuration.)*

### Categories
- One row per active category: icon, name, spend this month, and either `spent / budget` with a pace bar, or a subtitle — `Income · kept out of spending`, `Goal · ₹X by <date>`, `Investment · kept out of spending`, or `No monthly budget`.
- **▲ ▼** reorder (desktop) and **Edit** per row. Tapping the row opens the category inspector.
- **+ New** → the category sheet.
- Disabled categories are listed below with a note that their history still counts.

### Account
Name · Email · Currency (read-only).

### Data
- **Import a sheet** → `/settings/import`
- **Export to a spreadsheet** — a workbook with a tab per month laid out day × category, a `PEERS` tab for the lending ledger, and a `TRANSACTIONS` tab with the flat rows, notes and people intact (which is what makes it re-importable).
- **Plain CSV instead** as an alternative.

### Appearance
Three theme cards, each with a painted miniature of the actual theme: **System** (follows device) · **Paper** (cream and forest) · **Ink** (near-black and gold).

### Session
**Sign out**.

### Sheets this screen opens
| Sheet | Fields |
| --- | --- |
| **Where money comes from** (income) | Name · How much came in (₹) · When (appears once an amount is entered) · Colour. Filling the amount creates the source *and* records the payment in one trip — the button reads **Save and record ₹X**. |
| **New goal** | What are you saving for · How much do you need (₹) · By when (optional) · Icon · Colour. The date field quotes the monthly pace live as you pick it. Kind is set for you; there is no type selector and no budget field. |
| **New / Edit category** | Name · Type (Spending / Investment / Income) · **Make it a goal** (target + date, investment only) · Monthly budget (spending only) · Icon · Colour. |

### Deep links
`?add=income`, `?add=goal`, `?add=investment`, `?add=expense` open the matching sheet on arrival, then clear the query string so a refresh doesn't reopen it.

---

## 8b. Import — `/settings/import`

A three-step wizard, reachable from Settings → Data.

1. **Give it the data** — choose a CSV/TSV file, *or* paste rows straight from the sheet (the clipboard carries tab-separated text, which the parser detects on its own). Plus a fallback year for dates written like "2-Aug".
2. **Check the column mapping** — the layout is auto-detected as either a **month grid** (a column per category; each filled cell becomes its own transaction) or a **flat list** (one transaction per row, like this app's own export). Each column shows what it was understood as, and grid columns can be re-roled between date / category / person / ignore. Headers are matched to your categories by edit distance, so typos still land.
3. **Preview** — transaction count, reconstructed total, and the sheet's own TOTAL column if present, with a ✓/⚠ check that the two agree before you commit. Warnings are collapsible; the first 40 rows are shown as a table. Then **Import N expenses**.

---

## Cross-cutting behaviour

| Behaviour | Detail |
| --- | --- |
| **Soft delete + Undo** | Deleting a transaction or ledger entry sets `deleted_at` and raises a toast with **Undo**. Nothing is lost. |
| **Clear lending history** | Per person, from their inspector. Hides every entry from the UI but keeps the rows for analytics. Two-step confirm. |
| **Month persistence** | Every month-scoped screen keeps its own selection. Dashboard and Lifetime have no picker at all — one is always now, the other is always everything. |
| **Attention dismissals** | Per rule, per month, stored locally. A rule you have acknowledged stops nagging for the month and comes back next month if it is still true. |
| **Motion** | One vocabulary: numbers count up, bars grow, drawers slide, rows settle, and nothing spins except a genuine network wait. Goal and budget bars overshoot ~2% on the way up; everything collapses to zero duration under `prefers-reduced-motion`. |
| **Stale-while-revalidate** | Switching months keeps the previous figures on screen while the next load runs, rather than blanking to skeletons. |
| **Empty states** | Every list and card has one, and each offers the action that would fill it. |
| **Theme** | Paper (cream/forest) and Ink (near-black/gold), or follow the system. Every colour is defined for both. |
