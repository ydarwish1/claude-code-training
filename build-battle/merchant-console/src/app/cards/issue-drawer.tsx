"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { Card, CardCategory, Currency } from "@/data/types"
import { CARD_CATEGORIES, MAX_SPEND_LIMIT_MINOR, maskCard } from "@/lib/cards"
import { formatMoney, parseAmountToMinorUnits } from "@/lib/money"
import { cx } from "@/lib/utils"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Issue a card, then reveal its number exactly once.
 *
 * Every check here is a hint: the route handler is the enforcement, and a 400
 * from it is shown as-is. The number lives in this component's state for the
 * life of the success screen and is cleared before the drawer unmounts.
 */

const NICKNAME_MAX = 40
const NO_LOCK = "none"

type IssuableMerchant = { id: string; name: string; currency: Currency }

export function IssueCardDrawer({
  merchants,
  triggerLabel = "Issue card",
}: {
  merchants: IssuableMerchant[]
  /** Trigger text; the empty state uses a distinct label so the two triggers read apart. */
  triggerLabel?: string
}) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [limitInput, setLimitInput] = useState("")
  const [categoryLock, setCategoryLock] = useState<CardCategory | typeof NO_LOCK>(
    NO_LOCK,
  )
  const [touchedNickname, setTouchedNickname] = useState(false)
  const [touchedLimit, setTouchedLimit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{
    card: Card
    fullNumber: string | null
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const merchant = merchants.find((m) => m.id === merchantId)

  const trimmedLimit = limitInput.trim()
  const limitMinor = trimmedLimit === "" ? null : parseAmountToMinorUnits(trimmedLimit)
  const limitError =
    trimmedLimit === ""
      ? "Enter a spend limit."
      : limitMinor === null
        ? "Enter the limit as a plain amount, like 250 or 250.00."
        : limitMinor === 0
          ? "The spend limit must be greater than zero."
          : merchant && limitMinor > MAX_SPEND_LIMIT_MINOR
            ? `A card cannot be issued above ${formatMoney(MAX_SPEND_LIMIT_MINOR, merchant.currency)}.`
            : null

  const nicknameError =
    nickname.trim() === ""
      ? "Give the card a nickname so ops can recognise it later."
      : null

  const ready = !nicknameError && !limitError && Boolean(merchant)

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // One key per opening, so a double-click or a retry issues one card.
      setIdempotencyKey(crypto.randomUUID())
    } else {
      // The number never outlives the success screen.
      setIssued(null)
      setIdempotencyKey("")
      setNickname("")
      setMerchantId("")
      setLimitInput("")
      setCategoryLock(NO_LOCK)
      setTouchedNickname(false)
      setTouchedLimit(false)
      setError(null)
      setCopied(false)
      setCopyFailed(false)
    }
    setOpen(next)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready || submitting || !merchant || limitMinor === null) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          merchantId: merchant.id,
          spendLimit: limitMinor,
          currency: merchant.currency,
          categoryLock: categoryLock === NO_LOCK ? null : categoryLock,
          idempotencyKey,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        setError(payload.message ?? "The card could not be issued.")
        return
      }
      // A replay answers with the record and no number: the reveal already happened.
      setIssued({ card: payload.card, fullNumber: payload.fullNumber ?? null })
      router.refresh()
    } catch {
      setError("The console could not reach the server. Nothing was issued.")
    } finally {
      setSubmitting(false)
    }
  }

  const copyNumber = async () => {
    if (!issued?.fullNumber) return
    try {
      await navigator.clipboard.writeText(issued.fullNumber)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {issued ? "Card issued" : "Issue a virtual card"}
          </DrawerTitle>
          <DrawerDescription className="text-sm">
            {issued
              ? "Copy the number now. The console will not show it again."
              : "One merchant, one limit, in the merchant's own currency."}
          </DrawerDescription>
        </DrawerHeader>

        {issued ? (
          <>
            <DrawerBody className="space-y-5">
              {issued.fullNumber ? (
                <div aria-live="polite">
                  <p className="text-sm text-gray-500">Card number</p>
                  <p className="mt-1 font-mono text-lg tracking-widest text-gray-900 dark:text-gray-50">
                    {issued.fullNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="py-1.5"
                      onClick={copyNumber}
                    >
                      {copied ? "Copied" : "Copy number"}
                    </Button>
                    {copyFailed && (
                      <p className="text-sm text-red-600 dark:text-red-500">
                        This browser would not hand over the clipboard. Select
                        the number and copy it by hand.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  This request had already issued the card, so there is no
                  number to show: it was revealed once, on the first answer.
                </p>
              )}

              <p className="text-sm text-amber-700 dark:text-amber-500">
                The full number is shown exactly once. After this drawer closes
                the console keeps only {maskCard(issued.card.last4)}.
              </p>

              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-gray-500">Nickname</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-gray-50">
                    {issued.card.nickname}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Spend limit</dt>
                  <dd className="mt-1 text-sm tabular-nums text-gray-900 dark:text-gray-50">
                    {formatMoney(issued.card.spendLimit, issued.card.currency)}
                  </dd>
                </div>
              </dl>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button className="w-full py-2 sm:w-fit">Done</Button>
              </DrawerClose>
            </DrawerFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
            <DrawerBody className="space-y-4">
              <div>
                <label
                  htmlFor="card-nickname"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Nickname
                </label>
                <Input
                  id="card-nickname"
                  name="nickname"
                  className="mt-2"
                  maxLength={NICKNAME_MAX}
                  value={nickname}
                  hasError={Boolean(touchedNickname && nicknameError)}
                  aria-invalid={Boolean(touchedNickname && nicknameError) || undefined}
                  aria-describedby={
                    touchedNickname && nicknameError
                      ? "card-nickname-error"
                      : undefined
                  }
                  onBlur={() => setTouchedNickname(true)}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Meta Ads Q3"
                />
                {touchedNickname && nicknameError && (
                  <p
                    id="card-nickname-error"
                    className="mt-1 text-sm text-red-600 dark:text-red-500"
                  >
                    {nicknameError}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="card-merchant"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Merchant
                </label>
                <Select value={merchantId} onValueChange={setMerchantId}>
                  <SelectTrigger id="card-merchant" className="mt-2 w-full">
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="card-limit"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Spend limit
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    id="card-limit"
                    name="spendLimit"
                    type="text"
                    inputMode="decimal"
                    disabled={!merchant}
                    value={limitInput}
                    hasError={Boolean(touchedLimit && limitError)}
                    aria-invalid={Boolean(touchedLimit && limitError) || undefined}
                    aria-describedby={
                      touchedLimit && limitError ? "card-limit-error" : undefined
                    }
                    onBlur={() => setTouchedLimit(true)}
                    onChange={(event) => setLimitInput(event.target.value)}
                    placeholder="2500.00"
                  />
                  <span className="shrink-0 text-sm text-gray-500">
                    {merchant ? merchant.currency : "—"}
                  </span>
                </div>
                {!merchant ? (
                  <p className="mt-1 text-sm text-gray-500">
                    Choose a merchant first — the limit is set in their currency.
                  </p>
                ) : (
                  touchedLimit &&
                  limitError && (
                    <p
                      id="card-limit-error"
                      className="mt-1 text-sm text-red-600 dark:text-red-500"
                    >
                      {limitError}
                    </p>
                  )
                )}
              </div>

              <div>
                <label
                  htmlFor="card-currency"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Currency
                </label>
                <Input
                  id="card-currency"
                  name="currency"
                  readOnly
                  className="mt-2"
                  inputClassName="bg-gray-50 dark:bg-gray-900"
                  value={merchant ? merchant.currency : ""}
                  placeholder="Set by the merchant"
                />
                <p className="mt-1 text-sm text-gray-500">
                  {merchant
                    ? `${merchant.name} settles in ${merchant.currency}, so the card is issued in ${merchant.currency}.`
                    : "A card is always issued in its merchant's own currency."}
                </p>
              </div>

              <div>
                <label
                  htmlFor="card-category"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Category lock
                </label>
                <Select
                  value={categoryLock}
                  onValueChange={(value) =>
                    setCategoryLock(value as CardCategory | typeof NO_LOCK)
                  }
                >
                  <SelectTrigger
                    id="card-category"
                    className={cx(
                      "mt-2 w-full",
                      categoryLock !== NO_LOCK && "capitalize",
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LOCK}>No lock</SelectItem>
                    {CARD_CATEGORIES.map((category) => (
                      <SelectItem
                        key={category}
                        value={category}
                        className="capitalize"
                      >
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-500/10"
                >
                  <p className="text-sm text-red-700 dark:text-red-500">
                    {error}
                  </p>
                </div>
              )}
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 w-full py-2 sm:mt-0 sm:w-fit"
                >
                  Cancel
                </Button>
              </DrawerClose>
              <Button
                type="submit"
                className="w-full py-2 sm:w-fit"
                disabled={!ready}
                isLoading={submitting}
              >
                Issue card
              </Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  )
}
