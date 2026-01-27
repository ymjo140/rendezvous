"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Heart, Send, Star, MapPin } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { logAction } from "@/lib/analytics-client"
import type { DecisionCell } from "@/lib/decision-cell"

interface Offer {
  id: number
  image: string
  title: string
  restaurant: string
  rating: number
  location: string
  tags: string[]
  liked: boolean
  place_id?: number | null
}

const fallbackOffers: Record<string, Offer[]> = {
  today: [
    {
      id: 1,
      image: "https://images.unsplash.com/photo-1637848982489-fe38dcbbb42a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
      title: "Free side dish",
      restaurant: "Sushi House",
      rating: 4.8,
      location: "Center Station",
      tags: ["#local", "#quick", "#deal"],
      liked: false
    },
    {
      id: 2,
      image: "https://images.unsplash.com/photo-1672856399624-61b47d70d339?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
      title: "1+1 combo",
      restaurant: "Chicken Lab",
      rating: 4.6,
      location: "River Walk",
      tags: ["#combo", "#crispy"],
      liked: false
    }
  ],
  tomorrow: [
    {
      id: 3,
      image: "https://images.unsplash.com/photo-1752095809329-5addd009f71d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
      title: "Weekend special",
      restaurant: "Omakase 11",
      rating: 4.9,
      location: "Gangnam 11",
      tags: ["#premium", "#event"],
      liked: false
    }
  ]
}

interface OfferFeedProps {
  selectedDate: string
  decisionCell: DecisionCell
  requestId: string
}

export function OfferFeed({ selectedDate, decisionCell, requestId }: OfferFeedProps) {
  const [offers, setOffers] = useState<Record<string, Offer[]>>(fallbackOffers)
  const currentOffers = useMemo(() => offers[selectedDate] || [], [offers, selectedDate])

  useEffect(() => {
    const fetchOffers = async () => {
      const payload = {
        request_id: requestId,
        decision_cell: decisionCell
      }
      try {
        let res = await fetchWithAuth("/api/offers/query", {
          method: "POST",
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const params = new URLSearchParams({
            request_id: requestId,
            decision_cell: JSON.stringify(decisionCell)
          })
          res = await fetchWithAuth(`/api/offers/query?${params.toString()}`)
        }
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) {
            setOffers((prev) => ({ ...prev, [selectedDate]: data }))
          } else if (Array.isArray(data?.offers)) {
            setOffers((prev) => ({ ...prev, [selectedDate]: data.offers }))
          }
        }
      } catch (error) {
        console.warn("Offer fetch failed", error)
      }
    }

    fetchOffers()
  }, [decisionCell, requestId, selectedDate])

  useEffect(() => {
    if (!currentOffers.length) return
    currentOffers.slice(0, 6).forEach((offer, index) => {
      logAction({
        action_type: "offer_impression",
        offer_id: offer.id,
        place_id: offer.place_id ?? null,
        source: "hotdeals_tab",
        metadata: { position: index, date_key: selectedDate }
      })
    })
  }, [currentOffers, selectedDate])

  const toggleLike = (offerId: number) => {
    setOffers((prev) => ({
      ...prev,
      [selectedDate]: prev[selectedDate].map((offer) =>
        offer.id === offerId ? { ...offer, liked: !offer.liked } : offer
      )
    }))
  }

  const handleShare = (offer: Offer) => {
    logAction({
      action_type: "share",
      offer_id: offer.id,
      place_id: offer.place_id ?? null,
      source: "hotdeals_tab",
      metadata: { restaurant: offer.restaurant }
    })
    alert(`Shared: ${offer.restaurant}`)
  }

  const handleClick = (offer: Offer) => {
    logAction({
      action_type: "offer_click",
      offer_id: offer.id,
      place_id: offer.place_id ?? null,
      source: "hotdeals_tab"
    })
  }

  if (currentOffers.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <div className="text-gray-500 text-lg mb-2">No deals</div>
        <p className="text-gray-400">Check another date for new offers.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-4 px-2">
        <h3 className="text-white font-bold text-lg">Offer Spotlight</h3>
        <p className="text-gray-400 text-sm mt-0.5">Scroll to discover more</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {currentOffers.map((offer) => (
          <button
            key={offer.id}
            className="relative rounded-2xl overflow-hidden bg-gray-900 group text-left"
            onClick={() => handleClick(offer)}
          >
            <div className="relative aspect-[3/4]">
              <img src={offer.image} alt={offer.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80" />

              <div className="absolute top-3 left-3 right-3">
                <div className="bg-gradient-to-r from-orange-600 to-yellow-500 text-white px-3 py-1.5 rounded-lg inline-block">
                  <span className="font-black text-lg tracking-tight">{offer.title}</span>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-white text-sm font-bold">{offer.rating}</span>
                  </div>
                  <h4 className="text-white font-bold text-sm">{offer.restaurant}</h4>
                  <div className="flex items-center gap-1 text-xs text-gray-300">
                    <MapPin className="w-3 h-3" />
                    <span>{offer.location}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {offer.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs text-gray-300 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="absolute right-3 bottom-24 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleLike(offer.id)
                    logAction({
                      action_type: "save",
                      offer_id: offer.id,
                      place_id: offer.place_id ?? null,
                      source: "hotdeals_tab"
                    })
                  }}
                  className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
                >
                  <Heart className={`w-5 h-5 ${offer.liked ? "fill-red-500 text-red-500" : "text-white"}`} />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    handleShare(offer)
                  }}
                  className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
