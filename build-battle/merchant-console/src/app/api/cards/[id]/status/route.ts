import { CardAction, cardById, transitionCard } from "@/data/cards"
import { NextRequest, NextResponse } from "next/server"

/**
 * The one place a card changes status. A dedicated action route keeps the
 * state machine guard in a single handler rather than spread across a patch.
 */

const ACTIONS: readonly CardAction[] = ["freeze", "unfreeze", "cancel"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "The request body could not be read as JSON." },
      { status: 400 },
    )
  }

  const { action } = (body ?? {}) as Record<string, unknown>
  if (typeof action !== "string" || !ACTIONS.includes(action as CardAction)) {
    return NextResponse.json(
      { message: `The action must be one of: ${ACTIONS.join(", ")}.` },
      { status: 400 },
    )
  }

  const result = transitionCard(id, action as CardAction)

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { message: "No card with that id." },
        { status: 404 },
      )
    }

    const card = cardById(id)!
    const message =
      card.status === "cancelled"
        ? "This card is cancelled, and a cancelled card is terminal."
        : `This card is already ${card.status}, so that action changes nothing.`
    return NextResponse.json({ message }, { status: 409 })
  }

  return NextResponse.json({ card: result.card })
}
