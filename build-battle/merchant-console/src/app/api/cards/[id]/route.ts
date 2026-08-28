import { cardById, eventsForCard } from "@/data/cards"
import { NextRequest, NextResponse } from "next/server"

/**
 * One card and its audit trail. The record carries a last four and a
 * reference, never a number, so there is nothing here to redact.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const card = cardById(id)

  if (!card) {
    return NextResponse.json(
      { message: "No card with that id." },
      { status: 404 },
    )
  }

  return NextResponse.json({ card, events: eventsForCard(card.id) })
}
