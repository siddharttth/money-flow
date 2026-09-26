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

**Category inspector** — This month · Avg transaction · Transactions · Projected · a budget bar with a pace marker showing where an even burn would have you today — **the budget is editable in place** · the month's transactions, each person on them tappable.

---

## 1. Dashboard — `/dashboard`

> One question: **is this month going well?** No month picker — Home is *now*.
> Four blocks: the month card, what the saving is for, where the money went,
> and what just happened. Everything cut from the old nine went to a page that
> exists to hold it.

### Header
The month, "Day N of M", and — when any budget exists — a **Budget pace** pill
(spent of budgeted, red past 100%) that opens Budgets on This month.

### Sweep card *(only after an underspent month)*
How much less you spent than the month before — **day-count normalised**, so a
28-day month cannot flatter itself against a 31-day one. Goal chips pick a
destination, then **Move it to `<goal>`**. **Not now** dismisses it.

### 1 — The month card
One card, four parts divided by rules. On a wide screen it is as tall as the
column beside it; the curve takes the difference.

- **Left in hand · `<month>`** / **Down in `<month>`** — `came in − spent −
  invested`, negative in red; the largest figure on the page, with "N% kept" or
  "drawing down". Built from income that actually arrived, never the estimate.
- **Spent in `<month>`** — beside it, a step smaller: the same-day delta,
  entries, projected month end and daily rate, and **Invested, separately →**.
  The figure opens This month.
- **Spend allocation** — a stacked bar scaled to the larger of money-in and
  money-out, with a red mark where income ran out. Legs: Spent · Invested ·
  Free / From savings. The caption carries the textbook savings rate, qualified.
- **Cumulative spend trajectory** — this month against last month's dashed line, both named in a key (or, when last month has nothing in it, a plain line saying so). Hover — or on a phone, drag sideways — to read any day, with last month's figure beside it; on a phone the readout is a bar pinned above the chart. Today's point breathes like the header's live dot, the newest segment eases in when you add something, and the not-yet-happened part is faintly shaded. In the live month a **what-if handle** sits on the end of the projection: drag it to try a daily rate for the days left and read where the month lands against last month. Exploratory only — **Reset** puts it back, nothing is saved, and it never suggests a rate.
- **Stat strip** as the footer row: **Today** and **This week** (each opens
  those transactions) · **Typical entry** (opens Entry sizes on This month) ·
  **Net with people**, with "You are owed ₹X · **Settle →**" when anything is open.

### 2 — What the saving is for *(when goals exist)*
One goal gets the **Active goal** card — saved of target (the target is
editable in place), the monthly pace and months left, a progress ring, and
**Add to goal**. Several get the strip: one row per goal, progress bar, %, and
the monthly pace needed. **All goals →**

### 3 — Spend by category *(when the month has spending)*
Proportional bubbles — which one is the big one, not a precise reading — and a
top-six legend with shares. **Break it down →** opens This month.

### 4 — Recent activity
Last five transactions. **View all →** A row that appears while the page is up
— one you just added — highlights once.

### Footer
One line — *"Kept across N months ₹X →"* — linking to Lifetime.

---

## 2. Transactions — `/expenses`

> The ledger. One row per transaction, grouped by day, with the day's own subtotal in a heading that stays put while its rows scroll under it.

### Header
Month picker · **Filters** button with a badge counting active filters.

### Stat strip (reflects the current filter)
One card: **Total spent** (entries, daily average) · **Income received** *or*
**Invested** (opens Income or Goals) · **Lent out** · **Borrowed** (each
"receivable / payable · N people"). Total spent, Lent out and Borrowed switch
the matching chip below, and show pressed while it is on.

### Quick filter chips
`Everything` · `Spent` · `Lent` · `Borrowed` — multi-select. **Clear all ×** appears once anything is filtered. Arriving on a day or a week adds a chip for it — "Fri, 4 Sept, 2026 ×" / "Week of 31 Aug ×" — that goes back to the whole month when tapped.

### The day-grouped list
| Element | Function |
| --- | --- |
| **Sticky day heading** | "Today" or the full date, entry count, and the day's spending subtotal. Stays pinned under the mobile header while its rows scroll. |
| **Transaction row** | Icon, note or category name, date, category tag, person tags, amount. |
| **Clustering** | Same day + same category + same people + same note folds into one row showing the combined total and a `×N` count. Display only — the day subtotal still adds the individual amounts. |
| **Tap a cluster** | Opens a popup listing every underlying entry, each with its own Edit and Delete. |
| **Tap a category/person tag** | Opens that inspector. **Shift-click** filters the list by it instead. |
| **Edit / Delete** | On single (unclustered) rows. On a phone they are pencil and trash marks in a column under the amount, so a second tag never pushes them onto a third line. Delete is soft, with an **Undo** toast. |
| **A row that just changed** | One you added, edited or brought back with Undo highlights once. Changing the month or a filter never does. |
| **Load more** | Pages in another 150 rows. |

### Filters sheet
Search notes · Category chips (multi-select) · People chips (multi-select) · **Clear** / **Show results**. Warns that lent/borrowed entries have no category and will be hidden if you combine those filters.

### Deep links
`?person=<id>` pre-filters to one person (used by the person inspector's "Log expense"). `?day=<date>` and `?week=<date>` narrow to a day or a Monday-start week (used by the dashboard's Today and This week, and This month's biggest day and day bars).

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
Income as bars from the first month anything came in (six slots at least), with
the average over the months since that first payment as a dashed reference
line. Tap a bar to open that month.

### Stat strip
Typical month (median of N) · Best month · Leanest month · Lifetime. Best and
Leanest open the month they were.

### How steady is it *(needs 3+ months)*
One sentence, and only one of two:
- Swinging more than ~35% of the median → *"Your income swings by ₹X between
  your best and leanest month. Budget against ₹Y — your median — rather than
  your last figure."*
- Otherwise → *"Steady: ₹X between best and leanest. Planning against ₹Y is safe."*

### Where it comes from
One row per source: icon, name, this month's amount beside it, when it last
landed, what it usually is, and a 12-month sparkline. Tapping opens the
category inspector. A source whose amount changes while you watch — a payment
recorded — highlights once, and the hero acknowledges it.

**Reliability, per source** *(needs 4+ payments)* — either *"Lands within 2 days
of the 1st, going by the last 6"* or *"Timing moves — around the 5th, give or
take 9 days."*

### Footnote
Says a payment is logged like anything else, and that this is what feeds
**Left in hand** on the dashboard.

---

## 4. Goals & investing — `/goals`

> Goals first, then the contributions behind them. Reports what you put in,
> not what it is worth — the app has no price data.

### Hero card — "Put in during `<month>`"
- **All goals together**, as a summary band at the top: `₹X saved of ₹Y across N targets · ₹Z a month to land them all on time`, a health word (On track / Slipping / Off track) with a ring, a combined progress bar, and a red note counting how many are behind pace. The figure you previously had to sum in your head.
- Month total, with a delta against last month (**inverted** — up is good here, unlike everywhere else).
- Lifetime total and the date of the first contribution.
- **`<month>` · where the money went** — a share bar splitting the month between invested and spent, with both figures.
- **Contributions by month** bar chart (needs 2+ months). Tap a bar to jump to that month.
- The stat strip as the footer row: Lifetime · Monthly average (over N active months) · Contributions count (since first date) · Last month, which steps to that month.

### Goals
- One **FundCard** per goal:
  - Name, `saved of target`, and `by <date>` (with the year when it isn't this one) — **the target and the date are editable in place**. The date cannot go into the past; clearing it leaves the goal with no deadline ("add a date").
  - Progress bar, % and **₹X to go**. A contribution that carries the goal past a quarter, half, three quarters or the whole way bursts off the end of the bar with a one-line caption ("Halfway there") — that goal only, and only as it happens.
  - A finished goal carries a **"✓ Goal reached" seal**, pressed in on the save that finished it and simply there afterwards.
  - **Needs a month** — the contribution required to land on time — and months left
  - **Pace** — ₹X ahead of / behind plan. Says **"Just started"** for the first three weeks rather than dressing one deposit up as a trend.
  - **Projection** — "At the rate so far you get there around `<date>`", and whether that beats the target. Withheld until there are 2+ contributions and 30 days of history.
  - **Add to this goal** button
- Laid out by how many there are: one goal takes the row and turns into two columns; three go three-up; an odd one out spans the row. Each glows faintly in its own colour.
- **New goal** / **Manage** link in the section header.
- Empty state explains what a goal is and links to the goal sheet.

### Where it is going
Lifetime totals per investment category, biggest first. Tap → category inspector. Three empty states, correctly distinguished: no investment categories at all, a goal exists but nothing contributed yet, or loading.

### Every contribution
Reverse-chronological list of every investment transaction: note or category name, date, category, amount. The latest six, with **Show N more** when that would hide three or more. Tap a row to edit it — the same sheet as everywhere else, with the entry loaded.

### Footnote
Explains that none of this counts as spending anywhere in the app, and that the screen reports what you put in, not what it is worth today.

---

## 5. People — `/people`

> A contact you spend with and a contact you lend to are the same person. This screen merges both, and never adds the two figures together.

### Net exposure card
- Big figure: net balance, with "owed to you, on balance" / "you owe, on balance" / "everything is settled".
- **They owe me** and **I owe** side by side over one two-sided bar, with a **knob where the sides meet**. A lend or borrow pulls it across with a small overshoot; settling everything eases it back to the middle and lights it once. With nothing open the bar stays, knob centred: "All square, both ways".
- Two actions: **↗ I lent money** and **↙ I borrowed money**.
- The card's footer row — three facts about the ledger as a whole:
  - **Active ledgers** — contacts, how many are outstanding and how many balanced. Tapping it switches to **Owing**.
  - **Most shared with** — whose share of the month is largest. Tapping it opens that person.
  - **Next settlement** — the largest open balance. Tapping it opens the settle sheet for it.

### Filter row
`All` · `Owing` · `Spending` segmented control. **+ Add person** sits in the page header.

### The people table
| Column | Function |
| --- | --- |
| **Contact** | Avatar mark, name (`· you` for yourself), relationship type, transaction count. |
| **`<month>` spend** | That person's **share** of the month, with a proportional bar. |
| **Balance** | Running ledger balance, green if owed to you, red if you owe, `—` if settled. |
| **Action** | **Settle** when you owe, **Remind ▷** when you are owed. Opens the ledger form pre-filled with the outstanding balance, in the correct direction — still editable for a part payment. |

On a phone the layout reflows: the balance rides up next to the name, and **Settle ₹X** / **Remind about ₹X** becomes a full-width action beneath the row. Tapping any row opens the person inspector. A person whose balance just moved highlights once — and one whose balance just reached ₹0 gets a **settled moment** instead: a soft green sweep across the row while the amount counts off to "Settled ✓", then back to `—`.

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

### Hero card
Total spent, delta, transaction count and daily rate. Beneath it: last month by today (or the month before), projected month end, first half vs second half. Right side: the flow curve with an explanation of the dashed line.

### Stat strip
Daily average · Vs last month (% and last month's figure — tap to step to that month) · Biggest day (and which day — opens that day's transactions) · Typical entry (median, with the average alongside — opens Entry sizes below).

### Budgets *(moved here from Settings)*
Total spent of total budgeted with a bar that turns red when over, then one row
per budgeted category: icon, name, `spent / budget` — **the budget editable in
place** — a bar that runs green, amber when ahead of pace, and red when over,
and **a pace marker** showing where an even burn would put you today. A bar at
60% on the 10th is a different story from the same bar on the 28th, and the
marker is what says which. Tapping a row opens the category inspector.

**Strain** — when spending pushes a bar past 90% while you are looking, it
flinches once; past 100%, a hairline crack draws across it. The crack then
stays for as long as the category is over, and on a fresh load it is simply
there. Nothing plays for a line crossed before the page opened.

### Where it went
One card, two halves: by category and by person — two ways of slicing the same month.
- **Person filter chips** — `Everyone`, each person, and `Nobody tagged`. This reshapes the category view; it is the one place the two dimensions are deliberately crossed.
- **Donut + category breakdown** with shares. Tap a category → drill-down modal.
- **Concentration insight**: "Three categories carry N% of the month, spread across M in use."
- **Who it was with** — every person's share, plus a **Nobody tagged** line, and the note explaining that both dimensions partition the same month.

### A closer look
One card, three tabs. A tab exists only when its section would have been drawn.
- **Rhythm**
  - **What a weekday costs** — average spend per day-of-week, led by the peak day against the rest.
  - **Day by day** — a bar per day that has happened (then "N days to go"), gold marks the heaviest; **hover on desktop shows that day's spend**, and a day with spending opens its transactions. Below: days spent, quiet days, longest quiet run.
- **Category trends** — this month against the average of the three before, per category, with a two-sided delta bar. *Hidden in a first month*, where every row would just read "new".
- **Entry sizes** *(when there are transactions)*
  - **Typical entry** (median) and **Largest single** with its category and date.
  - **Under ₹X** — the small-ticket total, its share bar, and what fraction of entries and of the money it represents.
  - **Things you bought more than once** — repeated notes, matched case-insensitively, with count and total.

### Kept out of spending *(when you invested or the ledger moved)*
One card, two sections:
- **Investing, separately** — put in this month · lifetime · share of outgoings, and why it is excluded from every figure above. **Open** → Investments.
- **Lending, separately** — lent out · received · net movement (out of / into pocket), with the reasoning for keeping it out of spending totals.

### The longer view
A one-line pointer, not a section — twelve months of bars and six months of
savings rate were never month-scoped, and stranding them under a month picker
made the picker look broken. **Open Lifetime →**

### Deep links
`?month=<YYYY-MM>` · `?tab=sizes` (or `trends`) opens A closer look on that tab · `#budgets` scrolls to Budgets.

### Category drill-down modal
Opened by tapping a category. Shows the total, the transaction count and its % of the month, then every transaction — click one to open it for editing.

---

## 7. Lifetime — `/analytics/lifetime`

> The whole arc, and deliberately no month picker. Nothing here moves when you
> change the month elsewhere.

### Lifetime totals
One card, answering one question: of everything earned, where did it go and
what is left. **No lending** in any figure — People owns the ledger.
- **Lifetime savings** — `earned − spent − invested`, the page's largest figure,
  "saved across N months, since \<month\>". Beside it the subtraction spelled
  out — Lifetime earned · spent · invested — each row opening the screen it
  comes from, and a caption noting that the monthly "kept" figures below count
  investments as kept. Without any income, a prompt to add an income source
  stands in for the figure.
- **Stat strip** as the footer row: Months tracked · Savings rate · Best month
  kept · Positive streak. Savings rate is the headline as a share of everything
  earned; it replaced Ever invested, which repeated the card's Invested row.

*(Replaced "What you have built" — net position with the ledger — and "Lifetime
in hand", which subtracted money lent. The Dashboard's one-line link now reads
"Saved across N months" with this same figure.)*

### Over time
One card, two halves the same height.
- **What you spend** — up to 24 months of bars; tap to open that month.
- **What you keep** — savings rate per month, gaps for months with no income,
  and a **pooled** footer (`Σsaved ÷ Σincome`, not the mean of the rates). The
  latest twelve, with **Show N earlier months**.

### Every day *(new)*
A year of spending as a heatmap, laid out like a contribution graph: one column
per week, one row per weekday, a square per day shaded by what went out (four
shades, scaled to your own spending). "Nothing spent" and "no record" are drawn
differently, so a gap in the record never passes for a frugal day. Year tabs,
with the year's total, spending days and no-spend days beside them. Hover or
tap reads the day out — amount, entries, the category that took the most — and
a click (or a second tap) opens that day in Transactions. On a phone the strip
scrolls sideways and opens on the latest weeks.

### What it has all gone on *(new)*
Every category by lifetime total, in two columns on a wide screen. The monthly
view answers what is moving; this answers what it has cost.

### More history
Collapsed, with the answer on the closed header, and absent entirely until there
is something in it.
- **Year on year** *(gated at 2+ years)* — In, out and kept per calendar year, as
  paired bars. Withheld below two years rather than drawn from a fragment. Its
  "kept" is `in − out`, as the monthly figures are; it never included the ledger.

*(Lending, all time was removed — People shows owed to you, you owe and net.)*

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
- One row per active category: icon, name, spend this month, and either `spent / budget` with a pace bar — **the budget editable in place** — or a subtitle — `Income · kept out of spending`, `Goal · ₹X by <date>`, `Investment · kept out of spending`, or `No monthly budget`.
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
Two theme tiles, each with a painted miniature of the actual theme: **Paper** (cream and forest) · **Obsidian** (charcoal and electric lime). There is no "follow the device" option — Obsidian is the app's look, and Paper is there for anyone who prefers light.

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
| **Motion** | For changes, never for arrival: nothing animates while a page is loading. After that, figures count to their new value and bars ease to it (~220ms; goal and budget bars overshoot ~2%), collapsed sections slide open, a card highlights after a change you made (switching month is not one), and a row you added, edited or restored highlights once. Drawers slide, and nothing spins except a genuine network wait. The one other event is **a figure crossing a line while you watch**: a budget flinching at 90% and cracking at 100%, a goal bursting at each quarter with a one-line caption and a seal when finished, the People balance knob pulled across and lit when everything settles, and a person's row sweeping green as their balance counts off to "Settled ✓". Never on load — with one exception: the first time you open the Dashboard in a new month, the hero counts up once and a "New month" label shows beside the title for a moment. Everything collapses to zero duration under `prefers-reduced-motion` — the crack, seal and caption still show. |
| **Editing in place** | A single value — a category's monthly budget, a goal's target or date — is edited where it is printed: tap it, type, Enter saves, Escape cancels. Anything with more than one field, or a confirmation step (a transaction and its split, a settle-up), keeps its sheet. |
| **Stale-while-revalidate** | Switching months keeps the previous figures on screen while the next load runs, rather than blanking to skeletons. |
| **Empty states** | Every list and card has one. A full-size one says what is missing and, where there is one, offers the action that would fill it; inside a paired or tabbed card it is a single quiet line, so the empty half is never taller than the full one. |
| **Theme** | Paper (cream/forest) and Obsidian (charcoal/lime). Every colour is defined for both. |
