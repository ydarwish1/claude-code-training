import { CARD_BIN, luhnCheckDigit } from "@/lib/cards"
import { sumMinorUnits } from "@/lib/money"
import { merchantById, merchants } from "./merchants"
import {
  Card,
  CardCategory,
  CardEvent,
  CardEventType,
  CardStatus,
  Currency,
  Dispute,
  Merchant,
  Payment,
  PaymentStatus,
  Payout,
  Refund,
} from "./types"

/**
 * Deterministic seed data. Everyone in the room gets identical records,
 * so a bug reproduces the same way on every machine.
 */

const SEED = 20260813
const DAYS = 120
const PAYMENTS_PER_DAY = 14

/** Small, fast, deterministic PRNG. Not for anything that matters. */
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let rand = mulberry32(SEED)
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]
const between = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min

const DESCRIPTIONS = [
  "Online order",
  "In-store purchase",
  "Subscription renewal",
  "Gift card",
  "Wholesale invoice",
  "Repeat order",
  "Marketplace order",
]

const REASON_CODES = [
  "10.4 Other Fraud",
  "12.6 Duplicate Processing",
  "13.1 Merchandise Not Received",
  "13.3 Not as Described",
  "13.7 Cancelled Merchandise",
]

const pad = (n: number, width = 6) => String(n).padStart(width, "0")

/** The anchor date. Fixed, so "the last 30 days" is stable across runs. */
export const GENERATED_AT = new Date("2026-08-13T00:00:00.000Z")

function statusFor(): PaymentStatus {
  const roll = rand()
  if (roll < 0.78) return "captured"
  if (roll < 0.86) return "authorized"
  if (roll < 0.93) return "refunded"
  if (roll < 0.98) return "failed"
  return "disputed"
}

export function generate() {
  // Reseeded per call, so every call replays the same records rather than
  // continuing the stream. seedCards() reads this back to derive card spend.
  rand = mulberry32(SEED)

  const payments: Payment[] = []
  const refunds: Refund[] = []
  const disputes: Dispute[] = []
  let paymentSeq = 0
  let refundSeq = 0
  let disputeSeq = 0

  for (let day = DAYS - 1; day >= 0; day--) {
    const dayStart = new Date(GENERATED_AT)
    dayStart.setUTCDate(dayStart.getUTCDate() - day)

    const count = between(PAYMENTS_PER_DAY - 5, PAYMENTS_PER_DAY + 5)

    for (let i = 0; i < count; i++) {
      const merchant = pick(merchants)
      const createdAt = new Date(dayStart)
      createdAt.setUTCHours(between(0, 23), between(0, 59), between(0, 59), 0)

      const status = statusFor()
      const method = rand() < 0.82 ? "card" : rand() < 0.6 ? "wallet" : "bank_transfer"
      const amount = between(450, 480_00)

      const payment: Payment = {
        id: `pay_${pad(++paymentSeq)}`,
        merchantId: merchant.id,
        amount,
        currency: merchant.currency as Currency,
        status,
        method,
        cardBrand:
          method === "card" ? pick(["visa", "mastercard", "amex"] as const) : null,
        last4: method === "card" ? String(between(1000, 9999)) : null,
        createdAt: createdAt.toISOString(),
        description: pick(DESCRIPTIONS),
      }
      payments.push(payment)

      if (status === "refunded") {
        const full = rand() < 0.7
        refunds.push({
          id: `re_${pad(++refundSeq)}`,
          paymentId: payment.id,
          amount: full ? amount : Math.floor(amount / 2),
          currency: payment.currency,
          reason: pick([
            "requested_by_customer",
            "duplicate",
            "fraudulent",
          ] as const),
          createdAt: new Date(
            createdAt.getTime() + between(1, 6) * 86_400_000,
          ).toISOString(),
        })
      }

      if (status === "disputed") {
        const openedAt = new Date(createdAt.getTime() + between(2, 10) * 86_400_000)
        disputes.push({
          id: `dp_${pad(++disputeSeq)}`,
          paymentId: payment.id,
          merchantId: merchant.id,
          amount,
          currency: payment.currency,
          reasonCode: pick(REASON_CODES),
          status: pick([
            "needs_response",
            "needs_response",
            "under_review",
            "won",
            "lost",
          ] as const),
          openedAt: openedAt.toISOString(),
          evidenceDueAt: new Date(
            openedAt.getTime() + 14 * 86_400_000,
          ).toISOString(),
        })
      }
    }
  }

  const payouts = generatePayouts(payments)
  return { payments, refunds, disputes, payouts }
}

const CARD_SEED = 20260814

/**
 * Cards are blueprinted rather than rolled: the mix of statuses, the card
 * sitting past 80% of its limit, and the one nobody has spent against yet are
 * the cases the console has to render, so they are chosen, not hoped for.
 *
 * What a card has spent is not stated here. A blueprint says how many of its
 * merchant's own captured payments ran on the card; the amount is their sum.
 */
const CARD_BLUEPRINTS: readonly {
  merchantId: string
  nickname: string
  categoryLock: CardCategory
  status: CardStatus
  /** How many of this merchant's captured payments this card paid for. */
  charges: number
  detail?: string
}[] = [
  {
    merchantId: "mch_01",
    nickname: "Meta Ads Q3",
    categoryLock: "advertising",
    status: "active",
    // Enough of Lumen's ad spend to put this card past 80% of its limit.
    charges: 33,
  },
  {
    merchantId: "mch_04",
    nickname: "Design tool seats",
    categoryLock: "software",
    status: "active",
    charges: 14,
  },
  {
    merchantId: "mch_05",
    nickname: "Courier account",
    categoryLock: "shipping",
    status: "frozen",
    charges: 41,
    detail: "Frozen by ops while the courier contract is under review.",
  },
  {
    merchantId: "mch_07",
    nickname: "Contractor onboarding",
    categoryLock: "contractors",
    status: "active",
    // Issued and never used: the empty state has to render too.
    charges: 0,
  },
  {
    merchantId: "mch_09",
    nickname: "Trade show travel",
    categoryLock: "travel",
    status: "cancelled",
    charges: 33,
    detail: "Cancelled once the trade show closed.",
  },
  {
    merchantId: "mch_02",
    nickname: "Office supplies",
    categoryLock: "office",
    status: "active",
    charges: 4,
  },
]

/**
 * A merchant's captured payments, oldest first. Currency is filtered as well as
 * merchant: amounts only sum with amounts in their own currency, however right
 * the total looks.
 */
function capturedFor(payments: Payment[], merchant: Merchant): Payment[] {
  return payments
    .filter(
      (payment) =>
        payment.merchantId === merchant.id &&
        payment.status === "captured" &&
        payment.currency === merchant.currency,
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
}

/**
 * Seed cards and their audit trail. Deterministic like everything else here,
 * and it stores only a last four and a reference: a full number is revealed
 * once at creation and never persisted, seeds least of all.
 */
export function seedCards(): { cards: Card[]; cardEvents: CardEvent[] } {
  // Its own generator, so the payment stream above stays byte-identical
  // whatever order the store seeds its collections in.
  const cardRand = mulberry32(CARD_SEED)
  // The same records the store holds: generate() replays its stream on every
  // call, so a card's spend and the payments list can never disagree.
  const { payments } = generate()
  const roll = (min: number, max: number) =>
    Math.floor(cardRand() * (max - min + 1)) + min
  const hex = (length: number) =>
    Array.from({ length }, () => roll(0, 15).toString(16)).join("")

  const cards: Card[] = []
  const cardEvents: CardEvent[] = []
  let cardSeq = 0
  let eventSeq = 0

  const logEvent = (
    cardId: string,
    type: CardEventType,
    at: string,
    detail?: string,
  ) => {
    const event: CardEvent = { id: `cev_${pad(++eventSeq)}`, cardId, type, at }
    if (detail) event.detail = detail
    cardEvents.push(event)
  }

  for (const blueprint of CARD_BLUEPRINTS) {
    const merchant = merchantById(blueprint.merchantId)!

    const ageDays = roll(6, 90)
    const createdAt = new Date(GENERATED_AT)
    createdAt.setUTCDate(createdAt.getUTCDate() - ageDays)
    createdAt.setUTCHours(roll(8, 19), roll(0, 59), 0, 0)

    // Build a real 4242 number for its last four, then drop it on the floor.
    let generated = CARD_BIN
    while (generated.length < 15) generated += String(roll(0, 9))
    generated += luhnCheckDigit(generated)

    const spendLimit = roll(5, 250) * 10_000

    // Spend is a real subset of this merchant's captured payments rather than a
    // stated fraction of the limit, so the number reconciles against records
    // that exist in the store. Charges land oldest first, and one the remaining
    // limit cannot cover is declined the way the live card would decline it,
    // which is also what keeps spent at or under spendLimit.
    const charged: number[] = []
    for (const payment of capturedFor(payments, merchant)) {
      if (charged.length === blueprint.charges) break
      if (sumMinorUnits([...charged, payment.amount]) > spendLimit) continue
      charged.push(payment.amount)
    }

    const card: Card = {
      id: `card_${pad(++cardSeq)}`,
      merchantId: merchant.id,
      nickname: blueprint.nickname,
      last4: generated.slice(-4),
      numberRef: `cardnum_${hex(12)}`,
      spendLimit,
      spent: sumMinorUnits(charged),
      // A card is always in its merchant's own currency.
      currency: merchant.currency,
      status: blueprint.status,
      categoryLock: blueprint.categoryLock,
      createdAt: createdAt.toISOString(),
    }
    cards.push(card)

    logEvent(card.id, "issued", card.createdAt)

    if (blueprint.status !== "active") {
      const at = new Date(
        createdAt.getTime() + roll(1, Math.floor(ageDays / 2)) * 86_400_000,
      ).toISOString()
      logEvent(card.id, blueprint.status, at, blueprint.detail)
    }
  }

  return { cards, cardEvents }
}

function generatePayouts(payments: Payment[]): Payout[] {
  const payouts: Payout[] = []
  let seq = 0

  for (const merchant of merchants) {
    for (let week = 0; week < 8; week++) {
      const periodEnd = new Date(GENERATED_AT)
      periodEnd.setUTCDate(periodEnd.getUTCDate() - week * 7)
      const periodStart = new Date(periodEnd)
      periodStart.setUTCDate(periodStart.getUTCDate() - 7)

      const inPeriod = payments.filter(
        (p) =>
          p.merchantId === merchant.id &&
          p.status === "captured" &&
          p.createdAt >= periodStart.toISOString() &&
          p.createdAt < periodEnd.toISOString(),
      )
      if (inPeriod.length === 0) continue

      const gross = inPeriod.reduce((sum, p) => sum + p.amount, 0)
      const fees = Math.round(gross * 0.029) + inPeriod.length * 30

      payouts.push({
        id: `po_${pad(++seq, 4)}`,
        merchantId: merchant.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        gross,
        fees,
        net: gross - fees,
        currency: merchant.currency,
        status: week === 0 ? "pending" : week === 1 ? "in_transit" : "paid",
        paymentIds: inPeriod.map((p) => p.id),
      })
    }
  }

  return payouts
}
