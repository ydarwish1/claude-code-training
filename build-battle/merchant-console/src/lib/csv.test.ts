import { describe, expect, it } from "vitest"
import { Payment } from "@/data/types"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  exportFilename,
  exportLabel,
  parseColumns,
  parseScope,
  toCsv,
} from "./csv"

/**
 * The export is the file ops hands to a merchant, so a broken cell is a
 * support ticket rather than a stack trace. These tests pin the escaping and
 * the column contract; NWP-101 changed which columns ship, not how a cell is
 * written, and these still pass.
 */

const payment: Payment = {
  id: "pay_0001",
  merchantId: "mch_01",
  amount: 25000,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order 1180",
}

describe("toCsv", () => {
  it("writes a header row followed by one row per payment", () => {
    const lines = toCsv([payment]).split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","))
  })

  it("writes only the requested columns, in the order given", () => {
    expect(toCsv([payment], ["id", "amount"])).toBe(
      ["id,amount", "pay_0001,$250.00"].join("\n"),
    )
  })

  it("quotes cells containing a comma, so amounts do not split", () => {
    const large = { ...payment, amount: 123456789 }
    expect(toCsv([large], ["amount"])).toBe(['amount', '"$1,234,567.89"'].join("\n"))
  })

  it("doubles embedded quotes rather than dropping them", () => {
    const quoted = { ...payment, description: 'Order "rush"' }
    expect(toCsv([quoted], ["description"])).toBe(
      ["description", '"Order ""rush"""'].join("\n"),
    )
  })

  it("keeps a newline inside a description in one quoted cell", () => {
    const multiline = { ...payment, description: "Order 1180\nsecond line" }
    const body = toCsv([multiline], ["description"]).split("\n").slice(1).join("\n")
    expect(body).toBe('"Order 1180\nsecond line"')
  })

  it("resolves the merchant name, and falls back to the id when unknown", () => {
    expect(toCsv([payment], ["merchant"])).toContain("Lumen Coffee Roasters")
    const orphan = { ...payment, merchantId: "mch_missing" }
    expect(toCsv([orphan], ["merchant"])).toContain("mch_missing")
  })

  it("writes an empty cell for a payment with no card", () => {
    const bank: Payment = {
      ...payment,
      method: "bank_transfer",
      cardBrand: null,
      last4: null,
    }
    expect(toCsv([bank], ["card_brand", "last4"])).toBe(
      ["card_brand,last4", ","].join("\n"),
    )
  })

  it("emits a header even with no rows", () => {
    expect(toCsv([], ["id"])).toBe("id")
  })
})

describe("parseColumns", () => {
  it("keeps a subset in the order the client asked for, not the canonical one", () => {
    expect(parseColumns("amount,id")).toEqual(["amount", "id"])
    expect(parseColumns("id,amount")).toEqual(["id", "amount"])
  })

  it("leaves the card last four out by default", () => {
    expect(parseColumns(null)).toEqual(DEFAULT_EXPORT_COLUMNS)
    expect(parseColumns(null)).not.toContain("last4")
    expect(parseColumns(null)).toHaveLength(EXPORT_COLUMNS.length - 1)
  })

  it("includes the card last four only when it is asked for by name", () => {
    expect(parseColumns("id,last4")).toEqual(["id", "last4"])
  })

  it("returns an empty selection rather than falling back to a default", () => {
    expect(parseColumns("")).toEqual([])
  })

  it("drops names that are not columns instead of trusting the client", () => {
    expect(parseColumns("id,not_a_column,amount")).toEqual(["id", "amount"])
    expect(parseColumns("../../etc/passwd")).toEqual([])
    expect(parseColumns("id; DROP TABLE payments")).toEqual([])
  })

  it("drops a repeated column so it cannot appear twice in the header", () => {
    expect(parseColumns("id,amount,id")).toEqual(["id", "amount"])
  })

  it("tolerates whitespace around names", () => {
    expect(parseColumns(" id , amount ")).toEqual(["id", "amount"])
  })
})

describe("parseScope", () => {
  it("defaults to the current filter, and only 'all' widens it", () => {
    expect(parseScope(null)).toBe("filter")
    expect(parseScope("filter")).toBe("filter")
    expect(parseScope("everything")).toBe("filter")
    expect(parseScope("all")).toBe("all")
  })
})

describe("exportLabel", () => {
  it("names the status when the table is filtered by one", () => {
    expect(exportLabel("filter", { status: "disputed" })).toBe("disputed")
  })

  it("says 'all' when nothing narrowed the file, whatever the radio said", () => {
    expect(exportLabel("filter", {})).toBe("all")
    expect(exportLabel("filter", { status: "all" })).toBe("all")
  })

  it("says 'all' whenever the scope is every payment, whatever the filter was", () => {
    expect(exportLabel("all", { status: "disputed" })).toBe("all")
    expect(exportLabel("all", { merchantId: "mch_02" })).toBe("all")
  })

  it("names the merchant, so a one-merchant file cannot look like the table", () => {
    expect(exportLabel("filter", { merchantId: "mch_02" })).toBe(
      "kestrel-outdoor-supply",
    )
    expect(
      exportLabel("filter", { status: "disputed", merchantId: "mch_02" }),
    ).toBe("disputed-kestrel-outdoor-supply")
  })

  it("never puts an unrecognised merchant id in the filename", () => {
    expect(exportLabel("filter", { merchantId: "../../etc/passwd" })).toBe("all")
    expect(
      exportLabel("filter", { status: "disputed", merchantId: "mch_99" }),
    ).toBe("disputed")
  })

  it("says 'filtered' for the filters that have no name of their own", () => {
    expect(exportLabel("filter", { search: "coffee" })).toBe("filtered")
    expect(exportLabel("filter", { from: "2026-06-01" })).toBe("filtered")
    expect(
      exportLabel("filter", { status: "disputed", to: "2026-07-01" }),
    ).toBe("disputed-filtered")
  })

  it("produces a label a filename can hold, whatever the segments were", () => {
    expect(
      exportLabel("filter", {
        status: "disputed",
        merchantId: "mch_02",
        search: "x",
      }),
    ).toMatch(/^[a-z0-9-]+$/)
  })
})

describe("exportFilename", () => {
  it("stamps the UTC date, so a late-evening export does not roll forward", () => {
    expect(
      exportFilename("all", new Date("2026-03-14T23:00:00.000Z")),
    ).toBe("payments-all-2026-03-14.csv")
  })

  it("carries the scope, so two files from the same day are told apart", () => {
    const date = new Date("2026-08-13T09:00:00.000Z")
    expect(exportFilename("disputed", date)).toBe(
      "payments-disputed-2026-08-13.csv",
    )
    expect(exportFilename("filtered", date)).toBe(
      "payments-filtered-2026-08-13.csv",
    )
  })
})
