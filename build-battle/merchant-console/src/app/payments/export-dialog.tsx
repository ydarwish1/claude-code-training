"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  ExportColumn,
  ExportScope,
} from "@/lib/csv"
import { Download } from "lucide-react"
import { useState } from "react"

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Created at (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

export function ExportDialog({
  query,
  filteredCount,
  totalCount,
}: {
  /** The table's current filters, already serialized. */
  query: string
  /** Rows the current filter matches. */
  filteredCount: number
  /** Rows in the store, ignoring every filter. */
  totalCount: number
}) {
  const [selected, setSelected] = useState<ExportColumn[]>([
    ...DEFAULT_EXPORT_COLUMNS,
  ])
  const [scope, setScope] = useState<ExportScope>("filter")

  const rowCount = scope === "all" ? totalCount : filteredCount
  const nothingSelected = selected.length === 0

  const toggle = (column: ExportColumn) =>
    setSelected((current) =>
      current.includes(column)
        ? current.filter((name) => name !== column)
        : // Keep the canonical column order rather than click order, so the
          // file reads the same whichever way ops ticked the boxes.
          EXPORT_COLUMNS.filter(
            (name) => name === column || current.includes(name),
          ),
    )

  const href = () => {
    const params = new URLSearchParams(scope === "all" ? "" : query)
    params.set("columns", selected.join(","))
    params.set("scope", scope)
    return `/api/payments/export?${params.toString()}`
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DrawerTrigger>

      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Export payments</DrawerTitle>
          <DrawerDescription>
            Choose what goes in the file before you download it.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-6">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Scope
            </legend>
            <div className="mt-2 space-y-2">
              <label
                htmlFor="export-scope-filter"
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  type="radio"
                  id="export-scope-filter"
                  name="export-scope"
                  className="size-4 accent-blue-500"
                  checked={scope === "filter"}
                  onChange={() => setScope("filter")}
                />
                Current filter
                <span className="text-gray-500 dark:text-gray-500">
                  ({filteredCount.toLocaleString()} rows)
                </span>
              </label>
              <label
                htmlFor="export-scope-all"
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  type="radio"
                  id="export-scope-all"
                  name="export-scope"
                  className="size-4 accent-blue-500"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                All payments
                <span className="text-gray-500 dark:text-gray-500">
                  ({totalCount.toLocaleString()} rows)
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EXPORT_COLUMNS.map((column) => (
                <label
                  key={column}
                  htmlFor={`export-column-${column}`}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    id={`export-column-${column}`}
                    className="size-4 rounded accent-blue-500"
                    checked={selected.includes(column)}
                    onChange={() => toggle(column)}
                  />
                  {COLUMN_LABELS[column]}
                </label>
              ))}
            </div>
            {nothingSelected && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-500">
                Choose at least one column.
              </p>
            )}
          </fieldset>
        </DrawerBody>

        <DrawerFooter className="items-center gap-2 sm:justify-between">
          <p
            aria-live="polite"
            className="text-sm text-gray-500 dark:text-gray-500"
          >
            {rowCount.toLocaleString()} rows · {selected.length} of{" "}
            {EXPORT_COLUMNS.length} columns
          </p>
          {nothingSelected ? (
            <Button variant="primary" className="py-1.5" disabled>
              Download
            </Button>
          ) : (
            <Button variant="primary" className="py-1.5" asChild>
              <a href={href()}>Download</a>
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
