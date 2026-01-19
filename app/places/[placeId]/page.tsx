"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ChevronLeft,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  Star,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://wemeet-backend-xqlo.onrender.com"

type PlaceReview = {
  id: number
  user_name: string
  rating: number
  comment: string
  tags?: string[]
  created_at: string
  scores?: {
    taste?: number
    service?: number
    price?: number
    vibe?: number
  }
}

type PlaceDetail = {
  id: number
  name: string
  category?: string
  main_category?: string
  address?: string
  lat?: number
  lng?: number
  rating?: number
  review_count?: number
  phone?: string
  business_hours?: string
  price_range?: string
  external_link?: string
  tags?: string[]
  menus?: { name: string; price?: string | number | null }[]
  reviews?: PlaceReview[]
}

const formatPrice = (price?: string | number | null) => {
  if (price === null || price === undefined || price === "") return ""
  if (typeof price === "number") return `${price.toLocaleString()}원`
  return price
}

export default function PlaceDetailPage() {
  const params = useParams()
  const rawPlaceId = params?.placeId
  const placeId = Array.isArray(rawPlaceId) ? rawPlaceId[0] : rawPlaceId

  const [place, setPlace] = useState<PlaceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!placeId) return
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE_URL}/api/places/${placeId}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          setError("not_found")
          setPlace(null)
          return
        }
        const data = await res.json()
        setPlace(data)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError("network")
          setPlace(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => controller.abort()
  }, [placeId, retryKey])

  if (!placeId) {
    return (
      <main className="min-h-screen bg-gray-50 font-['Pretendard'] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-gray-500">잘못된 접근입니다.</p>
          <Link href="/" className="text-sm text-purple-600">
            홈으로 이동
          </Link>
        </div>
      </main>
    )
  }

  if (loading && !place) {
    return (
      <main className="min-h-screen bg-gray-50 font-['Pretendard'] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent mx-auto"></div>
          <p className="text-sm text-gray-500">장소 정보를 불러오는 중...</p>
        </div>
      </main>
    )
  }

  if (!place) {
    return (
      <main className="min-h-screen bg-gray-50 font-['Pretendard'] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-gray-500">
            장소 정보를 불러오지 못했어요.
          </p>
          <button
            type="button"
            onClick={() => setRetryKey((prev) => prev + 1)}
            className="text-sm text-purple-600"
          >
            다시 시도
          </button>
          <Link href="/" className="block text-xs text-gray-400">
            홈으로 이동
          </Link>
          {error && (
            <p className="text-[11px] text-gray-300">오류 코드: {error}</p>
          )}
        </div>
      </main>
    )
  }

  const rating = Number(place.rating || 0).toFixed(1)
  const reviewCount = place.review_count || 0
  const mapLink = `https://map.naver.com/v5/search/${encodeURIComponent(
    place.name,
  )}`
  const reservationLink = place.external_link || mapLink
  const reservationLabel = place.external_link ? "바로 예약하기" : "지도에서 보기"

  return (
    <main className="min-h-screen bg-gray-50 font-['Pretendard']">
      <div className="max-w-3xl mx-auto px-4 pb-28">
        <header className="pt-6 pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
            돌아가기
          </Link>

          <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {place.name}
                </h1>
                {place.category && (
                  <p className="text-sm text-gray-500 mt-1">{place.category}</p>
                )}
              </div>
              {place.price_range && (
                <Badge variant="secondary" className="text-[11px] font-normal">
                  {place.price_range}
                </Badge>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold text-gray-900">{rating}</span>
              <span className="text-gray-300">|</span>
              <span>리뷰 {reviewCount.toLocaleString()}개</span>
            </div>

            {place.tags && place.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {place.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-gray-100 text-gray-600 font-normal"
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </header>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">기본 정보</h2>
          {place.address && (
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
              <span>{place.address}</span>
            </div>
          )}
          {place.business_hours && (
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
              <span>{place.business_hours}</span>
            </div>
          )}
          {place.phone && (
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
              <span>{place.phone}</span>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">대표 메뉴</h2>
          {place.menus && place.menus.length > 0 ? (
            <div className="mt-3 space-y-2">
              {place.menus.map((menu, idx) => (
                <div
                  key={`${menu.name}_${idx}`}
                  className="flex items-center justify-between text-sm border-b border-gray-50 pb-2"
                >
                  <span className="text-gray-700">{menu.name}</span>
                  {formatPrice(menu.price) && (
                    <span className="font-semibold text-gray-900">
                      {formatPrice(menu.price)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-400">
              등록된 메뉴 정보가 없습니다.
            </p>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">리뷰</h2>
          {place.reviews && place.reviews.length > 0 ? (
            <div className="mt-3 space-y-4">
              {place.reviews.map((review) => (
                <div key={review.id} className="border-b border-gray-50 pb-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">
                      {review.user_name}
                    </span>
                    <span className="text-gray-300">|</span>
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    <span>
                      {typeof review.rating === "number"
                        ? review.rating.toFixed(1)
                        : "0.0"}
                    </span>
                    <span className="text-gray-300">|</span>
                    <span>{review.created_at}</span>
                  </div>
                  {review.comment && (
                    <p className="mt-2 text-sm text-gray-700">
                      {review.comment}
                    </p>
                  )}
                  {review.tags && review.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {review.tags.map((tag) => (
                        <Badge
                          key={`${review.id}_${tag}`}
                          variant="secondary"
                          className="bg-gray-100 text-gray-600 font-normal"
                        >
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-400">
              아직 등록된 리뷰가 없습니다.
            </p>
          )}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-3">
          {place.phone && (
            <Button variant="outline" className="flex-1" asChild>
              <a href={`tel:${place.phone}`}>전화</a>
            </Button>
          )}
          <Button
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            asChild
          >
            <a href={reservationLink} target="_blank" rel="noreferrer">
              {reservationLabel}
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
        {!place.external_link && (
          <p className="text-[11px] text-gray-400 text-center pb-2">
            예약 링크가 없어 지도 검색으로 이동합니다.
          </p>
        )}
      </div>
    </main>
  )
}
