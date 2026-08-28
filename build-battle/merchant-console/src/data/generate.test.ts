import { describe, expect, it, vi } from "vitest"
import { generate, seedCards } from "./generate"

describe("generate", () => {
  it("replays the identical stream on every call", () => {
    expect(JSON.stringify(generate())).toBe(JSON.stringify(generate()))
  })
})

describe("seedCards", () => {
  it("is deterministic across calls", () => {
    expect(JSON.stringify(seedCards())).toBe(JSON.stringify(seedCards()))
  })

  it("derives every card's spend from its merchant's own captured payments", () => {
    const { payments } = generate()
    const { cards } = seedCards()

    for (const card of cards) {
      // Replay the charge rule independently: the merchant's captured,
      // same-currency payments, oldest first, skipping a charge the remaining
      // limit cannot cover. Every running total along that walk is a sum a
      // card could legitimately have spent; anything else is invented money.
      const reachable = new Set<number>([0])
      let running = 0
      const eligible = payments
        .filter(
          (payment) =>
            payment.merchantId === card.merchantId &&
            payment.status === "captured" &&
            payment.currency === card.currency,
        )
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        )
      for (const payment of eligible) {
        if (running + payment.amount > card.spendLimit) continue
        running += payment.amount
        reachable.add(running)
      }

      expect(Number.isInteger(card.spent)).toBe(true)
      expect(card.spent).toBeLessThanOrEqual(card.spendLimit)
      expect(reachable.has(card.spent)).toBe(true)
    }
  })

  it("covers the states the console has to render", () => {
    const { cards } = seedCards()
    expect(cards.some((card) => card.spent / card.spendLimit > 0.8)).toBe(true)
    expect(cards.some((card) => card.spent === 0)).toBe(true)
    expect(cards.every((card) => card.spent <= card.spendLimit)).toBe(true)
  })

  it("returns the same cards on a cold call as after a cached run", async () => {
    // A fresh module instance has no cached run, so seedCards() takes the
    // generate-it-yourself branch; the second call reads the cache. Both
    // paths must produce identical records or the cache is load-bearing.
    vi.resetModules()
    const fresh = await import("./generate")
    const cold = fresh.seedCards()
    fresh.generate()
    const cached = fresh.seedCards()
    expect(JSON.stringify(cold)).toBe(JSON.stringify(cached))
  })
})
