export type Currency = "USD" | "EUR" | "GBP"

export type PaymentStatus =
  | "authorized"
  | "captured"
  | "refunded"
  | "failed"
  | "disputed"

export type DisputeStatus = "needs_response" | "under_review" | "won" | "lost"

export type PayoutStatus = "paid" | "in_transit" | "pending"

export interface Merchant {
  id: string
  name: string
  country: string
  /** IANA timezone. Display converts to this; storage never does. */
  timezone: string
  currency: Currency
  riskTier: "low" | "standard" | "elevated"
}

export interface Payment {
  id: string
  merchantId: string
  /** Integer minor units. Never a float. */
  amount: number
  currency: Currency
  status: PaymentStatus
  method: "card" | "wallet" | "bank_transfer"
  cardBrand: "visa" | "mastercard" | "amex" | null
  last4: string | null
  /** ISO 8601, always UTC. */
  createdAt: string
  description: string
}

export interface Refund {
  id: string
  paymentId: string
  amount: number
  currency: Currency
  reason: "requested_by_customer" | "duplicate" | "fraudulent"
  createdAt: string
}

export interface Dispute {
  id: string
  paymentId: string
  merchantId: string
  amount: number
  currency: Currency
  reasonCode: string
  status: DisputeStatus
  openedAt: string
  /** Evidence deadline, UTC. */
  evidenceDueAt: string
}

export interface Payout {
  id: string
  merchantId: string
  periodStart: string
  periodEnd: string
  gross: number
  fees: number
  net: number
  currency: Currency
  status: PayoutStatus
  paymentIds: string[]
}

export type CardStatus = "active" | "frozen" | "cancelled"

export type CardCategory =
  | "advertising"
  | "software"
  | "shipping"
  | "travel"
  | "office"
  | "contractors"

export interface Card {
  id: string
  merchantId: string
  nickname: string
  last4: string
  /** Reference to the generated number, never the number. */
  numberRef: string
  /** Integer minor units. Never a float. */
  spendLimit: number
  /** Integer minor units. Never a float. */
  spent: number
  currency: Currency
  status: CardStatus
  categoryLock: CardCategory | null
  /** ISO 8601, always UTC. */
  createdAt: string
}

export type CardEventType = "issued" | "frozen" | "unfrozen" | "cancelled"

/** Append-only audit trail. What happened to a card is never rewritten. */
export interface CardEvent {
  id: string
  cardId: string
  type: CardEventType
  /** ISO 8601, always UTC. */
  at: string
  detail?: string
}

export interface PaymentFilters {
  status?: PaymentStatus | "all"
  merchantId?: string
  search?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
  sort?: "createdAt" | "amount"
  direction?: "asc" | "desc"
}
