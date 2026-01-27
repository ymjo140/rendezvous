"use client"

import React, { useEffect, useState } from "react"
import { Eye, Zap, ChevronLeft, ChevronRight } from "lucide-react"

type LiveDeal = {
  id: number
  image: string
  title: string
  subtitle: string
  location: string
  viewers: number
  endTime: number
}

const liveDeals: LiveDeal[] = [
  {
    id: 1,
    image: "https://images.unsplash.com/photo-1750296976666-e736034e76fa?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    title: "Live Closing Deal",
    subtitle: "Limited menu perks today",
    location: "Near your area · Hurry",
    viewers: 124,
    endTime: 9910
  },
  {
    id: 2,
    image: "https://images.unsplash.com/photo-1709433420422-731e1be1c9aa?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    title: "BBQ Fast Drop",
    subtitle: "Buy 1 get 1",
    location: "2 min away · Limited seats",
    viewers: 89,
    endTime: 5420
  },
  {
    id: 3,
    image: "https://images.unsplash.com/photo-1565895476294-b24957b878ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    title: "Street Food Rush",
    subtitle: "Combo deal",
    location: "Market district · 50+ waiting",
    viewers: 203,
    endTime: 3600
  }
]

function LiveTimer({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds)

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return (
    <div className="text-white">
      <span className="text-2xl font-black tracking-tight">
        {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </span>
    </div>
  )
}

function LiveBadge() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((prev) => !prev)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1.5 rounded-full">
      <div
        className={`w-2 h-2 rounded-full bg-white transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />
      <span className="text-white text-sm font-bold">LIVE CLOSING</span>
    </div>
  )
}

type LiveHeroCarouselProps = {
  onCtaClick?: (deal: LiveDeal) => void
}

export function LiveHeroCarousel({ onCtaClick }: LiveHeroCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)

  useEffect(() => {
    if (!isAutoPlaying) return
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % liveDeals.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isAutoPlaying])

  const goToSlide = (index: number) => {
    setCurrentSlide(index)
    setIsAutoPlaying(false)
    setTimeout(() => setIsAutoPlaying(true), 10000)
  }

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % liveDeals.length)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + liveDeals.length) % liveDeals.length)
  }

  const deal = liveDeals[currentSlide]

  return (
    <div className="relative">
      <div className="relative h-[400px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-500"
          style={{ backgroundImage: `url(${deal.image})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/80" />
        </div>

        <div className="relative h-full flex flex-col justify-between p-6">
          <div className="space-y-3">
            <LiveBadge />

            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-xs text-gray-300 mb-1">Ends in</span>
                <LiveTimer initialSeconds={deal.endTime} />
              </div>
              <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-2 rounded-full">
                <Eye className="w-4 h-4 text-orange-400" />
                <span className="text-white text-sm font-medium">{deal.viewers} watching</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-black text-white leading-tight">{deal.title}</h2>
            <p className="text-xl font-bold text-orange-400">{deal.subtitle}</p>
            <p className="text-sm text-gray-300">{deal.location}</p>
          </div>

          <button
            onClick={() => onCtaClick?.(deal)}
            className="w-full bg-gradient-to-r from-orange-600 via-orange-500 to-yellow-500 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-orange-500/50"
          >
            <Zap className="w-5 h-5 fill-current" />
            Grab the deal now
          </button>
        </div>

        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {liveDeals.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-2 rounded-full transition-all ${
                currentSlide === index ? "w-6 bg-orange-500" : "w-2 bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
