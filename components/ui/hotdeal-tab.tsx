"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { LiveHeroCarousel } from "@/components/ui/hotdeal/LiveHeroCarousel"
import { DateNavigator } from "@/components/ui/hotdeal/DateNavigator"
import { OfferFeed } from "@/components/ui/hotdeal/OfferFeed"
import { useDecisionCell } from "@/hooks/use-decision-cell"
import { logAction } from "@/lib/analytics-client"

const DATE_KEYS = ["today", "tomorrow", "tue", "wed", "thu", "fri", "sat"] as const
type DateKey = (typeof DATE_KEYS)[number]

const DAY_INDEX: Record<DateKey, number> = {
  today: -1,
  tomorrow: -1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
}

const pad = (value: number) => String(value).padStart(2, "0")

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const resolveDateKey = (key: DateKey) => {
  const now = new Date()
  if (key === "today") return formatDate(now)
  if (key === "tomorrow") {
    const next = new Date(now)
    next.setDate(now.getDate() + 1)
    return formatDate(next)
  }
  const targetDow = DAY_INDEX[key]
  const currentDow = now.getDay()
  let diff = targetDow - currentDow
  if (diff <= 0) diff += 7
  const next = new Date(now)
  next.setDate(now.getDate() + diff)
  return formatDate(next)
}

export function HotDealTab() {
  const [selectedDate, setSelectedDate] = useState<DateKey>("today")
  const { decisionCell, requestId, updatePartial, resetRequestId } = useDecisionCell()

  const resolvedDate = useMemo(() => resolveDateKey(selectedDate), [selectedDate])

  useEffect(() => {
    resetRequestId()
  }, [resetRequestId])

  useEffect(() => {
    updatePartial({ date: resolvedDate })
  }, [resolvedDate, updatePartial])

  const handleSelectDate = useCallback(
    (dateId: string) => {
      const nextKey = DATE_KEYS.includes(dateId as DateKey) ? (dateId as DateKey) : "today"
      resetRequestId()
      setSelectedDate(nextKey)
    },
    [resetRequestId]
  )

  const handleHeroCta = useCallback(
    (deal: { id: number }) => {
      logAction({
        action_type: "reserve_click",
        offer_id: deal.id,
        source: "hotdeals_tab"
      })
    },
    []
  )

  return (
    <div className="min-h-screen bg-[#121212] pb-20">
      <LiveHeroCarousel onCtaClick={handleHeroCta} />
      <DateNavigator selectedDate={selectedDate} onSelectDate={handleSelectDate} />
      <OfferFeed selectedDate={selectedDate} decisionCell={decisionCell} requestId={requestId} />
    </div>
  )
}
