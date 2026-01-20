"use client"

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")

const API_BASE_URL = API_URL
const REVIEW_TAG_SUGGESTIONS = [
  "맛있어요",
  "친절해요",
  "가성비",
  "분위기좋음",
  "웨이팅",
  "재방문의사",
  "가족모임",
  "데이트",
]
const MAX_REVIEW_IMAGES = 3
const MAX_REVIEW_IMAGE_MB = 2

type PlaceReview = {
  id: number
  user_name: string
  rating: number
  comment: string
  tags?: string[]
  image_urls?: string[]
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
  const searchParams = useSearchParams()
  const rawPlaceId = params?.placeId
  const placeId = Array.isArray(rawPlaceId) ? rawPlaceId[0] : rawPlaceId

  const [place, setPlace] = useState<PlaceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [scores, setScores] = useState({
    taste: 4,
    service: 4,
    price: 4,
    vibe: 4,
  })
  const [tagsInput, setTagsInput] = useState("")
  const [comment, setComment] = useState("")
  const [reason, setReason] = useState("")
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [reviewImages, setReviewImages] = useState<string[]>([])
  const [reviewImageError, setReviewImageError] = useState<string | null>(null)
  const reviewFileInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!place) return
    if (searchParams?.get("review")) {
      const target = document.getElementById("review-form")
      target?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [place, searchParams])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    )
  }

  const handleReviewImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const remaining = MAX_REVIEW_IMAGES - reviewImages.length
    const nextFiles = files.slice(0, Math.max(0, remaining))
    if (files.length > remaining) {
      setReviewImageError(`사진은 최대 ${MAX_REVIEW_IMAGES}장까지 첨부할 수 있어요.`)
    } else {
      setReviewImageError(null)
    }

    const results: string[] = []
    for (const file of nextFiles) {
      const maxBytes = MAX_REVIEW_IMAGE_MB * 1024 * 1024
      if (file.size > maxBytes) {
        setReviewImageError(`${MAX_REVIEW_IMAGE_MB}MB 이하 사진만 첨부할 수 있어요.`)
        continue
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(new Error("read_failed"))
        reader.readAsDataURL(file)
      }).catch(() => "")
      if (dataUrl) results.push(dataUrl)
    }

    if (results.length > 0) {
      setReviewImages((prev) => [...prev, ...results])
    }

    event.target.value = ""
  }

  const removeReviewImage = (index: number) => {
    setReviewImages((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleReviewSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!place) return

    const token = localStorage.getItem("token")
    if (!token) {
      setReviewError("로그인이 필요합니다.")
      return
    }

    setReviewSubmitting(true)
    setReviewError(null)
    setReviewSuccess(null)

    try {
      const manualTags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
      const tags = Array.from(new Set([...selectedTags, ...manualTags]))
      const avgRating =
        (scores.taste + scores.service + scores.price + scores.vibe) / 4

      const res = await fetch(`${API_BASE_URL}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          place_name: place.name,
          rating: avgRating,
          tags,
          score_taste: scores.taste,
          score_service: scores.service,
          score_price: scores.price,
          score_vibe: scores.vibe,
          image_urls: reviewImages,
          comment: comment || null,
          reason: reason || null,
        }),
      })

      if (!res.ok) {
        setReviewError("리뷰 저장에 실패했습니다.")
        return
      }

      setReviewSuccess("리뷰가 등록되었습니다.")
      setTagsInput("")
      setComment("")
      setReason("")
      setSelectedTags([])
      setReviewImages([])
      setReviewImageError(null)
      setScores({ taste: 4, service: 4, price: 4, vibe: 4 })
      setRetryKey((prev) => prev + 1)
    } catch (err) {
      setReviewError("네트워크 오류로 실패했습니다.")
    } finally {
      setReviewSubmitting(false)
    }
  }

  const scoreItems = [
    { key: "taste", label: "맛" },
    { key: "service", label: "서비스" },
    { key: "price", label: "가격" },
    { key: "vibe", label: "분위기" },
  ] as const
  const averageScore =
    (scores.taste + scores.service + scores.price + scores.vibe) / 4

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

        <section
          id="review-form"
          className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-gray-800">리뷰 작성</h2>
          <form onSubmit={handleReviewSubmit} className="mt-3 space-y-4">
            <div className="grid gap-3">
              {scoreItems.map((item) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{item.label}</span>
                    <span className="font-semibold text-gray-700">
                      {scores[item.key]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={scores[item.key]}
                    onChange={(event) =>
                      setScores((prev) => ({
                        ...prev,
                        [item.key]: Number(event.target.value),
                      }))
                    }
                    className="w-full accent-purple-500"
                  />
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500">
              평균 {averageScore.toFixed(1)}점
            </div>
            <div className="space-y-2">
              <div className="text-xs text-gray-500">추천 태그</div>
              <div className="flex flex-wrap gap-2">
                {REVIEW_TAG_SUGGESTIONS.map((tag) => {
                  const selected = selectedTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1 rounded-full text-xs border transition ${
                        selected
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-white text-gray-500 border-gray-200 hover:border-purple-200"
                      }`}
                    >
                      #{tag}
                    </button>
                  )
                })}
              </div>
            </div>
            <Input
              placeholder="태그 입력 (쉼표로 구분)"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              className="h-10 text-sm"
            />
            <Input
              placeholder="한 줄 추천 포인트 (선택)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-10 text-sm"
            />
            <Textarea
              placeholder="리뷰 내용을 작성해 주세요 (선택)"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="min-h-[100px] text-sm"
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>사진 첨부 (최대 {MAX_REVIEW_IMAGES}장)</span>
                <button
                  type="button"
                  onClick={() => reviewFileInputRef.current?.click()}
                  className="text-purple-600"
                >
                  추가
                </button>
              </div>
              <input
                ref={reviewFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleReviewImageChange}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                {reviewImages.map((src, idx) => (
                  <div
                    key={`${src}_${idx}`}
                    className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={src}
                      alt="리뷰 이미지"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeReviewImage(idx)}
                      className="absolute top-1 right-1 bg-black/60 text-white text-[10px] rounded-full px-1.5 py-0.5"
                    >
                      삭제
                    </button>
                  </div>
                ))}
                {reviewImages.length < MAX_REVIEW_IMAGES && (
                  <button
                    type="button"
                    onClick={() => reviewFileInputRef.current?.click()}
                    className="w-20 h-20 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 flex items-center justify-center"
                  >
                    + 추가
                  </button>
                )}
              </div>
              {reviewImageError && (
                <p className="text-xs text-red-500">{reviewImageError}</p>
              )}
            </div>
            {reviewError && (
              <p className="text-xs text-red-500">{reviewError}</p>
            )}
            {reviewSuccess && (
              <p className="text-xs text-green-600">{reviewSuccess}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={reviewSubmitting}
            >
              {reviewSubmitting ? "등록 중..." : "리뷰 등록"}
            </Button>
          </form>
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
                  {review.image_urls && review.image_urls.length > 0 && (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {review.image_urls.map((src, idx) => (
                        <img
                          key={`${review.id}_img_${idx}`}
                          src={src}
                          alt="리뷰 이미지"
                          className="w-full h-20 object-cover rounded-lg border border-gray-100"
                        />
                      ))}
                    </div>
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



