import { describe, expect, it } from "vitest"
import {
  canTransition,
  generateCardNumber,
  isLuhnValid,
  maskCard,
} from "./cards"

/**
 * Two rules earn most of these tests: nothing generated here may resemble a
 * real PAN, and a cancelled card never comes back. Both are the kind of thing
 * that looks right in the UI long after it has stopped being true.
 */

/**
 * An independent Luhn, written the other way round from the one under test.
 * If the implementation and this disagree, one of them is wrong.
 */
function luhnByHand(cardNumber: string): boolean {
  const total = cardNumber
    .split("")
    .reverse()
    .map(Number)
    .reduce((sum, digit, index) => {
      if (index % 2 === 0) return sum + digit
      const doubled = digit * 2
      return sum + (doubled > 9 ? doubled - 9 : doubled)
    }, 0)
  return total % 10 === 0
}

describe("generateCardNumber", () => {
  it("produces sixteen digits on the test BIN with a valid check digit", () => {
    const number = generateCardNumber()
    expect(number.startsWith("4242")).toBe(true)
    expect(number).toHaveLength(16)
    expect(/^\d{16}$/.test(number)).toBe(true)
    expect(isLuhnValid(number)).toBe(true)
  })

  it("holds for every number in a batch, and an independent Luhn agrees", () => {
    const numbers = Array.from({ length: 200 }, () => generateCardNumber())

    for (const number of numbers) {
      expect(number.startsWith("4242")).toBe(true)
      expect(/^\d{16}$/.test(number)).toBe(true)
      expect(isLuhnValid(number)).toBe(true)
      expect(luhnByHand(number)).toBe(true)
    }

    expect(new Set(numbers).size).toBe(numbers.length)
  })
})

describe("isLuhnValid", () => {
  it("accepts a known-good number", () => {
    expect(isLuhnValid("4242424242424242")).toBe(true)
  })

  it("rejects the same number with one digit flipped", () => {
    expect(isLuhnValid("4242424242424243")).toBe(false)
    expect(isLuhnValid("4242424242424142")).toBe(false)
  })
})

describe("maskCard", () => {
  it("is how a card reads everywhere except the creation response", () => {
    expect(maskCard("4242")).toBe("•••• 4242")
  })
})

describe("canTransition", () => {
  // The full matrix, spelled out: active and frozen swap, either can be
  // cancelled, cancelled is terminal, and nothing transitions to itself.
  it("allows active to freeze or cancel, and nothing else", () => {
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("active", "cancelled")).toBe(true)
  })

  it("allows frozen to unfreeze or cancel, and nothing else", () => {
    expect(canTransition("frozen", "active")).toBe(true)
    expect(canTransition("frozen", "frozen")).toBe(false)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("lets nothing out of cancelled", () => {
    expect(canTransition("cancelled", "active")).toBe(false)
    expect(canTransition("cancelled", "frozen")).toBe(false)
    expect(canTransition("cancelled", "cancelled")).toBe(false)
  })
})
