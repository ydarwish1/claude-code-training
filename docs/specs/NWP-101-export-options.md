# SPEC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** Yusif Darwish
**Status:** building

## Problem

Ops exports the payments table several times a day — merchant queries, month-end reconciliation, and whatever Finance asks for. The file is fixed: every column, current filter only, no say in what comes out.

The card last-four lands in every file, so anything going to a merchant is cleaned up by hand first. Dana's team estimates 3–4 hours a month of spreadsheet editing, and last quarter an unedited file nearly went to the wrong merchant.

## Current state

Every claim here was checked against the code, and the row counts against the running dev server.

- `src/app/payments/page.tsx` — the Export button is a `Button` wrapping a plain anchor pointed at the export route with the page's current query string. There is no fetch and no client-side file building.
- `src/app/api/payments/export/route.ts` — a `GET` handler that calls `parseFilters`, then `filterPayments`, then `sortPayments`, then `toCsv`, and returns a response carrying `content-type` and `content-disposition`. It deliberately does **not** call `paginate`.
- `src/data/queries.ts` — the one query builder. `parseFilters` is the existing server-side allowlist: it checks status against a fixed list and falls back to safe defaults for sort, direction, and page. `filterPayments` and `sortPayments` are what the export reuses.
- `src/lib/csv.ts` — `EXPORT_COLUMNS` holds ten column keys including `last4`. `toCsv` **already accepts a column list** and defaults to all of them. `cell` resolves each value and is the single place `formatMoney` is called. `escapeCell` handles commas, quotes, and newlines. `exportFilename` stamps the UTC date and nothing else.
- `src/lib/csv.test.ts` — nine passing tests. One of them already pins "writes only the requested columns, in the order given".
- `src/components/Drawer.tsx` — the accessible overlay this repo already has, built on the Radix dialog primitive, with header, title, body, footer, and close parts exported. `src/components/Sidebar.tsx` is a working usage example.

### Where the ticket does not match the code

- The ticket warns that building this in the browser would export the current page only. That risk is real for a new implementation, but the **existing server route already exports every matching row** — a no-filter export returns 1,658 rows against a page size of 20. The instruction is therefore "keep reusing the server path", not "fix a paging bug".
- `.claude/rules/components.md` says `src/components/` already has a Dialog. It does not. `Drawer.tsx` is the component built on the dialog primitive, and there is no checkbox component at all.
- Two acceptance criteria are already satisfied by existing code and only need protecting: amounts are formatted exactly once, in `cell`, and `currency` is already its own column.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| Money is integer minor units, formatted once at the edge | `merchant-console/CLAUDE.md`, `.claude/rules/money.md`, ORG-STANDARDS #1–2 | Cents drift on every total; a formatter's output re-enters arithmetic |
| One query builder | `merchant-console/CLAUDE.md`, ORG-STANDARDS #6 | A second filter path drifts from the first and the two disagree |
| Validate on the server against an allowlist | `.claude/rules/api-routes.md`, ORG-STANDARDS #7 | Client-supplied column names reach a query or a filename unchecked |
| Storage and bucketing are UTC | `merchant-console/CLAUDE.md`, ORG-STANDARDS #4–5 | The filename stamps the wrong calendar day for anyone off UTC |
| Use the components that are here; dialogs must be operable | `.claude/rules/components.md` | A hand-rolled overlay without focus handling or an accessible name |
| Card data is masked everywhere it is not needed | ORG-STANDARDS #8 | The exact defect this ticket exists to remove |

## Approach

Two new query parameters on the existing export route — `columns` and `scope` — both validated on the server against allowlists that already have a precedent in `parseFilters`. The column allowlist and the default column set live beside `EXPORT_COLUMNS` in `src/lib/csv.ts`, because that is where the column contract already lives and where the tests for it already are.

`scope=all` is expressed as calling the same `filterPayments` with an empty filter object, so there is still exactly one query builder. The filename gains a scope segment derived on the server from the validated values, never from raw client input.

The UI is a `Drawer` holding checkboxes and a scope radio. It computes nothing: both row counts are worked out server-side in `page.tsx` and handed down as props, and Download is an anchor to the same export URL. Nothing about the file is assembled in the browser.

**Considered and rejected:** building the CSV client-side from the rows already on the page. It removes a round trip and it is what the ticket explicitly names as the bug it does not want — the table is paginated, so the file would silently contain 20 rows. Also rejected: a separate `/api/payments/count` endpoint for the row counts. The page is a server component that already computes one of the two totals, so a second endpoint would be a network call to fetch a number the server already has.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | Change | Add the safe default column set, the column allowlist parser, and a scope segment on the filename |
| `src/app/api/payments/export/route.ts` | Change | Read and validate the two new params, honour scope, name the file |
| `src/app/payments/export-dialog.tsx` | Add | The client component holding the column checkboxes, scope radio, row count, and Download |
| `src/app/payments/page.tsx` | Change | Compute both row counts, replace the bare anchor with the drawer trigger |
| `src/lib/csv.test.ts` | Change | Extend with column selection and filename cases — the ticket says extend, not start a new file |

## Plan

1. **Column helpers in `src/lib/csv.ts`** — done when: the default set excludes `last4`, the parser drops unknown and duplicate names while preserving requested order, and the existing nine tests still pass.
2. **Route handler** — done when: `columns` and `scope` change the response, an unknown column name is dropped rather than returned or thrown, and an explicitly empty selection is refused with a 400.
3. **First `npm test`** — done when: exit code 0, summary shown.
4. **Drawer and page** — done when: the drawer opens with `last4` unticked, the count changes with the scope radio, and Download greys out when nothing is ticked.
5. **New tests in `src/lib/csv.test.ts`** — done when: a subset in the requested order, the last-four default, and the empty selection are each covered, plus the filename scope segment.
6. **Second `npm test` and `npm run lint`** — done when: both exit 0, summary shown.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Ops can choose which columns are included | Request the export with two column names; the header row is exactly those two, in that order |
| Card last-four is off by default | Request the export with no column parameter; `last4` is absent from the header row |
| Scope: current filter or all payments, current filter the default | Request with a status filter and `scope=all`; the row count matches the unfiltered total, not the filtered one |
| The row count is visible before download | Open the drawer in the browser and read both counts; switch the radio and watch the number change |
| Filename reflects the scope and the date | Read `content-disposition` for a filtered request and an all-payments request |
| Amounts stay in minor units, formatted once, currency its own column | The existing csv tests, unchanged and still passing |
| Deselecting every column disables Download | Untick every box in the browser; separately, request the export with an empty column parameter and get a 400 rather than a file |
| Column names validated server-side | Request an unknown column name; it is dropped, the response is not a 500, and nothing reaches a query or the filename |

## Risks

- The drawer slides in from the side rather than sitting centred, which is not what "dialog" suggests. Accepted deliberately: it is the accessible overlay this repo already has, and adding a second one would violate the components rule.
- The export must keep skipping pagination. A refactor that routes it through `queryPayments` for tidiness would silently reintroduce the exact bug the ticket warns about. Guarded by a row-count check in verification.
- The filename is built from validated values only. Interpolating a raw parameter into it is the failure this ticket's notes call out by name.

## Out of scope

- `sortPayments` in `src/data/queries.ts` compares amounts as strings, so sorting by amount is alphabetical rather than numeric. Confirmed against the running server. It is a real defect and it belongs with the number bugs in NWP-102, not here.
- Persistence of any kind. The store is in memory on purpose and that is NWP-203.

## Open questions

- None blocking. Four assumptions were confirmed before building: `scope=all` ignores every filter rather than only pagination; an absent column parameter falls back to the safe default set; an explicitly empty selection is a 400; and the row counts come from the server component rather than a new endpoint.
