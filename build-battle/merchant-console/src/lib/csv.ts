import { merchantById } from "@/data/merchants"
import { Payment, PaymentFilters } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses the columns and the scope. Column names arrive from the client,
 * so they are checked against EXPORT_COLUMNS before they reach a header row or
 * a filename — see parseColumns.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/**
 * What ops gets when they express no preference.
 *
 * Every column except the card last four. Most exports go to a merchant, and
 * the last four had to be stripped by hand from every one of them.
 */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] =
  EXPORT_COLUMNS.filter((column) => column !== "last4")

function isExportColumn(value: string): value is ExportColumn {
  return (EXPORT_COLUMNS as readonly string[]).includes(value)
}

/**
 * Turn the client's `columns` parameter into a column list.
 *
 * Absent means "no preference", so the safe default set applies. Anything else
 * is checked name by name against EXPORT_COLUMNS: unknown names are dropped,
 * duplicates are dropped, and the order the client asked for is kept. An
 * explicitly empty selection returns an empty list, which the route refuses —
 * an empty file is never the right answer.
 */
export function parseColumns(
  param: string | null,
): readonly ExportColumn[] {
  if (param === null) return DEFAULT_EXPORT_COLUMNS

  const seen = new Set<ExportColumn>()
  for (const name of param.split(",")) {
    const trimmed = name.trim()
    if (isExportColumn(trimmed)) seen.add(trimmed)
  }
  return [...seen]
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

/** Which rows the file holds: the table's current filter, or every payment. */
export type ExportScope = "filter" | "all"

/**
 * The scope words in the filename.
 *
 * Assembled only from validated filter values and merchant names this server
 * already holds. Raw client input never reaches it — see exportLabel.
 */
export type ExportLabel = string

export function parseScope(param: string | null): ExportScope {
  return param === "all" ? "all" : "filter"
}

/** Lowercase letters, digits and single hyphens. A filename holds nothing else. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * The words that tell ops what is in the file without opening it.
 *
 * Every filter that narrowed the file gets a segment. A name that
 * under-describes its contents is the near-miss this ticket exists to remove:
 * a file called "disputed" that in fact holds one merchant's disputes reads as
 * safe to send to a different merchant.
 *
 * A file that nothing narrowed is called "all", whichever way the scope radio
 * was set, because that is what it holds.
 */
export function exportLabel(
  scope: ExportScope,
  filters: PaymentFilters,
): ExportLabel {
  if (scope === "all") return "all"

  const segments: string[] = []

  if (filters.status && filters.status !== "all") segments.push(filters.status)

  if (filters.merchantId) {
    // Only a merchant this server knows about is named. An unrecognised id is
    // client input and never gets interpolated into a filename.
    const name = merchantById(filters.merchantId)?.name
    const slug = name ? slugify(name) : ""
    if (slug) segments.push(slug)
  }

  if (filters.search || filters.from || filters.to) segments.push("filtered")

  if (segments.length === 0) return "all"

  return segments.join("-")
}

export function exportFilename(
  label: ExportLabel,
  date = new Date(),
): string {
  return `payments-${label}-${date.toISOString().slice(0, 10)}.csv`
}
