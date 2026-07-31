"use client"

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  Star,
  CalendarCheck,
  Wallet,
  Loader2,
  X,
  Bookmark,
  Plus,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createReservation, getWallet, won } from "@/lib/wallet"
import { recordActivity } from "@/lib/game"
import { AddToPollButton } from "@/components/ui/add-to-poll"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "")

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
  vacancy?: {
    active: boolean; remain_min: number; empty_tables: number; empty_seats: number; best_deal: number | null
  } | null
  offers?: {
    id: number; title: string; description: string; benefit_type?: string; benefit_value?: string | number | null
    remaining: number | null; valid_to: string | null
  }[]
  reviews?: PlaceReview[]
}

const formatPrice = (price?: string | number | null) => {
  if (price === null || price === undefined || price === "") return ""
  if (typeof price === "number") return `${price.toLocaleString()}원`
  return price
}

// --- 캐치테이블식 예약 슬롯 헬퍼 ---
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"]

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

// 달력 — 년/월 선택 + 월 그리드.
// components/ui/calendar.tsx(react-day-picker)를 안 쓴 이유: 그 파일은 Tailwind v4
// 문법(size-(--cell-size), has-focus:)으로 쓰여 있는데 이 프로젝트 빌드는 v3다
// (postcss.config.js + tailwind.config.ts + app/globals.css 전부 v3). 클래스가
// 생성되지 않아 화면이 깨진다. 어디서도 안 쓰이던 스캐폴딩이라 참고할 선례도 없다.
function MonthCalendar({ value, onPick }: { value: string; onPick: (date: string) => void }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : today
  const [cursor, setCursor] = useState(new Date(base.getFullYear(), base.getMonth(), 1))
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const lead = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]
  // 지난 달로는 못 간다 — 과거 예약은 어차피 전부 비활성이라 빈 화면만 보여준다
  const canPrev = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth())
  const years = [today.getFullYear(), today.getFullYear() + 1]

  return (
    <div className="mt-1.5 rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-lg px-2 py-1 text-gray-500 disabled:opacity-25"
          aria-label="이전 달"
        >
          ‹
        </button>
        <div className="flex items-center gap-1">
          <select
            value={year}
            onChange={(e) => setCursor(new Date(Number(e.target.value), month, 1))}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setCursor(new Date(year, Number(e.target.value), 1))}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
          >
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={m}>{m + 1}월</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-lg px-2 py-1 text-gray-500"
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400">
        {DOW_KO.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />
          const s = ymd(d)
          const past = d < today
          const selected = s === value
          return (
            <button
              key={s}
              type="button"
              disabled={past}
              onClick={() => onPick(s)}
              className={`rounded-lg py-1.5 text-xs transition-colors ${
                selected
                  ? "bg-amber-600 font-bold text-white"
                  : past
                    ? "text-gray-300"
                    : "text-gray-700 hover:bg-amber-50"
              }`}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// extra: 7일 밖의 날짜(일정 투표로 정한 날 등)도 칩으로 끼워 넣는다.
// 안 넣으면 선택된 날짜가 화면 어디에도 안 보여서, 언제로 예약되는지 모른 채 결제한다.
function buildDateChips(days = 7, extra?: string | null) {
  const chips: { date: string; day: string; dow: string; isToday: boolean }[] = []
  for (let i = 0; i < days; i += 1) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`
    chips.push({
      date,
      day: String(d.getDate()),
      dow: i === 0 ? "오늘" : i === 1 ? "내일" : DOW_KO[d.getDay()],
      isToday: i === 0,
    })
  }
  if (extra && /^\d{4}-\d{2}-\d{2}$/.test(extra) && !chips.some((c) => c.date === extra)) {
    const d = new Date(`${extra}T00:00:00`)
    if (!Number.isNaN(d.getTime())) {
      chips.push({ date: extra, day: String(d.getDate()), dow: DOW_KO[d.getDay()], isToday: false })
      chips.sort((a, b) => (a.date < b.date ? -1 : 1))
    }
  }
  return chips
}

// 영업시간 문자열("11:00 - 22:00" 등)에서 슬롯 범위 파싱, 실패 시 11:00~22:00
function buildTimeSlots(businessHours?: string): string[] {
  let startMin = 11 * 60
  let endMin = 22 * 60
  const m = /(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/.exec(businessHours || "")
  if (m) {
    const s = Number(m[1]) * 60 + Number(m[2])
    let e = Number(m[3]) * 60 + Number(m[4])
    if (e <= s) e = 24 * 60 // 심야 마감(예: 17:00~02:00)은 자정까지로
    if (e - s >= 60) {
      startMin = s
      endMin = e
    }
  }
  const slots: string[] = []
  for (let t = startMin; t <= endMin - 30; t += 30) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`)
  }
  return slots
}

export default function PlaceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawPlaceId = params?.placeId
  const placeId = Array.isArray(rawPlaceId) ? rawPlaceId[0] : rawPlaceId
  const offerParam = searchParams?.get("offer")
  const offerRuleId = offerParam && /^\d+$/.test(offerParam) ? Number(offerParam) : null
  // 크루 채팅에서 '이 크루로 예약하기'로 넘어온 경우 — 투표로 정한 걸 다시 고르게 하지 않는다
  const planCrew = searchParams?.get("crew") || null
  const planDate = searchParams?.get("date") || null
  const planTime = searchParams?.get("time") || null
  const planPartyRaw = searchParams?.get("party")
  const planParty = planPartyRaw && /^\d+$/.test(planPartyRaw) ? Number(planPartyRaw) : null

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

  // 캐시 예약 상태
  const [reserveOpen, setReserveOpen] = useState(false)
  const [cashBalance, setCashBalance] = useState<number>(0)
  const [reserveDate, setReserveDate] = useState("")
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [reserveTime, setReserveTime] = useState("19:00")
  const [partySize, setPartySize] = useState(2)
  // 누구와 가는 예약인지 — 크루를 고르면 체크인 때 크루를 다시 안 골라도 되고,
  // 그 크루가 이 가게와 맺은 제휴가 자동으로 걸린다.
  const [myCrews, setMyCrews] = useState<{ id: string; title: string; icon: string }[]>([])
  const [reserveCrew, setReserveCrew] = useState<string | null>(null)
  const [reserveSubmitting, setReserveSubmitting] = useState(false)
  const [reserveError, setReserveError] = useState<string | null>(null)
  const [reserveSuccess, setReserveSuccess] = useState<string | null>(null)
  const DEPOSIT_PER_PERSON = 5000
  const depositAmount = partySize * DEPOSIT_PER_PERSON

  // 🪑 테이블 지정 예약 — 사장님 테이블맵이 있는 매장이면 '창가 4인석' 지정 가능
  type PlaceTable = {
    id: number; label: string; capacity: number; shape: string
    zone: string; area: string; status: string; deal_percent: number | null; mergeable: boolean
  }
  const [placeTables, setPlaceTables] = useState<PlaceTable[]>([])
  const [selectedTable, setSelectedTable] = useState<PlaceTable | null>(null)

  useEffect(() => {
    if (!placeId) return  // 상세 진입 시 미리 로드(자리 배치 미리보기 + 예약 시 지정)
    let active = true
    fetch(`${API_BASE_URL}/api/places/${placeId}/tables`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setPlaceTables(d?.tables || [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [placeId])

  // 찜(저장) — 저장 시 폴더 선택 시트를 띄운다
  const [savedPlace, setSavedPlace] = useState(false)
  const [savingPlace, setSavingPlace] = useState(false)
  const [savePickerOpen, setSavePickerOpen] = useState(false)
  const [saveFolders, setSaveFolders] = useState<any[]>([])
  const [saveFoldersLoading, setSaveFoldersLoading] = useState(false)

  // 재방문 신뢰 배지(개인축/모임축)
  const [badges, setBadges] = useState<{
    personal?: { text: string } | null
    group?: { text: string } | null
  } | null>(null)

  // 이 장소를 다녀온/언급한 사람들
  const [visitors, setVisitors] = useState<{
    post_count: number
    visitor_count: number
    visitors: { id: number; name: string }[]
    mentioned: { id: number; name: string }[]
  } | null>(null)

  useEffect(() => {
    if (!placeId) return
    const token = localStorage.getItem("token")
    if (!token) return
    let active = true
    fetch(`${API_BASE_URL}/api/places/${placeId}/visitors`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setVisitors(d)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [placeId])

  // 재방문 신뢰 배지
  useEffect(() => {
    if (!placeId) return
    const token = localStorage.getItem("token")
    let active = true
    fetch(`${API_BASE_URL}/api/feedback/place/${placeId}/badges`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setBadges(d)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [placeId])

  // 저장 버튼 → 폴더 선택 시트 열기(+폴더 목록 로드)
  const handleSavePlace = async () => {
    if (!place || savedPlace) return
    const token = localStorage.getItem("token")
    if (!token) {
      alert("로그인이 필요합니다.")
      return
    }
    setSavePickerOpen(true)
    setSaveFoldersLoading(true)
    try {
      const fRes = await fetch(`${API_BASE_URL}/api/folders`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSaveFolders(fRes.ok ? await fRes.json() : [])
    } catch {
      setSaveFolders([])
    } finally {
      setSaveFoldersLoading(false)
    }
  }

  // 선택한 폴더에 저장
  const saveToFolder = async (folderId: number) => {
    if (!place) return
    const token = localStorage.getItem("token")
    if (!token) return
    setSavingPlace(true)
    try {
      const sRes = await fetch(`${API_BASE_URL}/api/saves`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ folder_id: folderId, item_type: "place", place_id: place.id }),
      })
      if (sRes.ok) {
        setSavedPlace(true)
        setSavePickerOpen(false)
        recordActivity("explore")
      } else {
        const err = await sRes.json().catch(() => null)
        if (String(err?.detail || "").includes("이미")) {
          setSavedPlace(true)
          setSavePickerOpen(false)
        } else {
          throw new Error("save")
        }
      }
    } catch {
      alert("저장에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setSavingPlace(false)
    }
  }

  // 새 폴더 만들어서 바로 저장
  const handleCreateFolderAndSave = async () => {
    const name = window.prompt("새 폴더 이름을 입력하세요")?.trim()
    if (!name) return
    const token = localStorage.getItem("token")
    if (!token) return
    setSavingPlace(true)
    try {
      const cRes = await fetch(`${API_BASE_URL}/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      })
      if (!cRes.ok) throw new Error("folder")
      const folder = await cRes.json()
      await saveToFolder(folder.id)
    } catch {
      alert("폴더 생성에 실패했어요.")
      setSavingPlace(false)
    }
  }

  // prefill: 크루 채팅의 확정 카드에서 넘어온 값(크루·날짜·시간·인원).
  // 상태 setter는 비동기라 여기서 한 번에 반영해야 아래 기본값(내일)에 덮이지 않는다.
  const openReserve = async (prefill?: {
    crew?: string | null; date?: string | null; time?: string | null; party?: number | null
  }) => {
    setReserveError(null)
    setReserveSuccess(null)
    if (!localStorage.getItem("token")) {
      alert("로그인이 필요합니다.")
      return
    }
    if (prefill?.crew) setReserveCrew(prefill.crew)
    if (prefill?.time) setReserveTime(prefill.time)
    if (prefill?.party && prefill.party > 0) setPartySize(prefill.party)
    if (prefill?.date) {
      setReserveDate(prefill.date)
    } else if (!reserveDate) {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      setReserveDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      )
    }
    setReserveOpen(true)
    if (myCrews.length === 0) {
      const tk = typeof window !== "undefined" ? localStorage.getItem("token") : null
      if (tk) {
        fetch(`${API_BASE_URL}/api/home/feed`, { headers: { Authorization: `Bearer ${tk}` } })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setMyCrews(d?.my_crews || []))
          .catch(() => {})
      }
    }
    try {
      const w = await getWallet()
      setCashBalance(w.balance)
    } catch {
      /* ignore */
    }
  }

  const handleReserve = async () => {
    if (!place) return
    if (!reserveDate || !reserveTime) {
      setReserveError("날짜와 시간을 선택해주세요.")
      return
    }
    if (cashBalance < depositAmount) {
      setReserveError(`캐시가 부족해요. (필요 ${won(depositAmount)} / 보유 ${won(cashBalance)}) 마이페이지에서 충전해주세요.`)
      return
    }
    setReserveSubmitting(true)
    setReserveError(null)
    try {
      await createReservation({
        place_id: place.id,
        place_name: place.name,
        date: reserveDate,
        time: reserveTime,
        party_size: partySize,
        deposit_amount: depositAmount,
        offer_rule_id: offerRuleId,
        table_id: selectedTable?.id ?? null,
        table_label: selectedTable ? `${selectedTable.zone} ${selectedTable.label}` : null,
        community_id: reserveCrew,
      })
      setReserveSuccess(
        `예약 완료!${selectedTable ? ` ${selectedTable.zone} ${selectedTable.label} 지정 ·` : ""} 예약금 ${won(depositAmount)}이 캐시에서 결제됐어요.`
        + (reserveCrew ? " 크루 예약함으로 갈게요 — 도착하면 거기서 체크인해요." : "")
      )
      recordActivity("reserve") // 게임 XP/퀘스트
      setTimeout(() => {
        setReserveOpen(false)
        // 크루 예약이면 크루 예약함으로 — 체크인 버튼이 거기 있다.
        // 방문의 증거(PlaceCheckin)는 이 경로로만 쌓이고, 재방문·제휴 한도가 전부 거기서 나온다.
        if (reserveCrew) router.push(`/crew/${reserveCrew}/reservations`)
      }, 1400)
    } catch (err: any) {
      setReserveError(err?.message || "예약에 실패했습니다.")
    } finally {
      setReserveSubmitting(false)
    }
  }

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
    // 핫딜에서 '예약하기'로 진입(?offer=) → 예약 모달 자동 오픈
    if (offerRuleId && !reserveOpen && !reserveSuccess) {
      openReserve()
    }
    // 크루 채팅 확정 카드에서 진입(?crew=) → 투표로 정한 값 채운 채로 자동 오픈
    if (planCrew && !reserveOpen && !reserveSuccess) {
      openReserve({ crew: planCrew, date: planDate, time: planTime, party: planParty })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      recordActivity("review") // 게임 XP/퀘스트
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
          <Link href="/" className="text-sm text-amber-600">
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
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent mx-auto"></div>
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
            className="text-sm text-amber-600"
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
          <button
            onClick={() => { if (window.history.length > 1) router.back(); else router.push("/") }}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="w-4 h-4" />
            돌아가기
          </button>

          {/* 대표 이미지(사장님이 손님 사진 중 지정) */}
          {(place as any).hero_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(place as any).hero_image}
              alt={place.name}
              className="mt-4 h-52 w-full rounded-2xl object-cover bg-gray-100"
              loading="lazy"
            />
          )}

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
              <div className="flex items-center gap-2">
                {place.price_range && (
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {place.price_range}
                  </Badge>
                )}
                {/* 찜(저장) */}
                <button
                  type="button"
                  onClick={handleSavePlace}
                  disabled={savingPlace}
                  className={`rounded-full border p-2 transition-colors ${
                    savedPlace
                      ? "border-amber-200 bg-amber-50 text-amber-600"
                      : "border-gray-200 bg-white text-gray-400 hover:text-amber-500"
                  }`}
                  title={savedPlace ? "저장됨" : "저장"}
                >
                  <Bookmark className={`h-4 w-4 ${savedPlace ? "fill-amber-600" : ""}`} />
                </button>
              </div>
            </div>

            {/* 모임 투표에 담기 — 진행 중 투표에 후보로 추가하거나 새 투표 시작 */}
            <div className="mt-3">
              <AddToPollButton
                place={{ id: Number(place.id), name: place.name, category: place.category, lat: place.lat, lng: place.lng }}
                className="w-full h-10 rounded-xl border border-amber-200 bg-amber-50/60 text-amber-700 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-amber-50 transition-colors"
              />
            </div>

            <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold text-gray-900">{rating}</span>
              <span className="text-gray-300">|</span>
              <span>리뷰 {reviewCount.toLocaleString()}개</span>
            </div>

            {/* 재방문 신뢰 배지 (개인축/모임축) */}
            {badges && (badges.personal || badges.group) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.personal && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                    👍 {badges.personal.text}
                  </span>
                )}
                {badges.group && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
                    🧑‍🤝‍🧑 {badges.group.text}
                  </span>
                )}
              </div>
            )}

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

        {/* 🔴 실시간 빈자리 배너 (사장님 신호) */}
        {place.vacancy?.active && (
          <section className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
              </span>
              <span className="font-bold text-rose-700 text-sm">지금 빈자리 있어요!</span>
              <span className="ml-auto text-[11px] text-rose-500">약 {place.vacancy.remain_min}분 남음</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
              {place.vacancy.empty_tables > 0 && (
                <span className="bg-white rounded-full px-3 py-1 font-medium text-rose-700">
                  빈 테이블 {place.vacancy.empty_tables}개 · {place.vacancy.empty_seats}석
                </span>
              )}
              {place.vacancy.best_deal ? (
                <span className="bg-rose-500 text-white rounded-full px-3 py-1 font-bold">
                  최대 {place.vacancy.best_deal}% 할인
                </span>
              ) : null}
            </div>
          </section>
        )}

        {/* 💸 진행 중 할인(사장님 등록 오퍼) */}
        {place.offers && place.offers.length > 0 && (
          <section className="mt-4 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <span>💸</span> 진행 중인 혜택
            </h2>
            <div className="mt-3 space-y-2">
              {place.offers.map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-amber-900 truncate">{o.title}</div>
                    {o.description && <div className="text-[11px] text-amber-700 truncate">{o.description}</div>}
                  </div>
                  {o.remaining != null && (
                    <span className="text-[10px] font-bold text-rose-500 flex-shrink-0">{o.remaining}개 남음</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 🪑 자리 배치 미리보기 (테이블맵 등록 매장) */}
        {placeTables.length > 0 && (
          <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              🪑 자리 배치
              <span className="ml-1 text-xs font-normal text-gray-400">{placeTables.length}개 테이블</span>
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {placeTables.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold border ${
                    t.status === "empty"
                      ? "bg-teal-50 border-teal-200 text-teal-700"
                      : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                  title={t.status === "empty" ? "빈자리" : "사용중"}
                >
                  {t.zone !== "홀" ? `${t.zone} ` : ""}{t.label}
                  <span className="ml-1 font-normal">{t.capacity}인</span>
                  {t.status === "empty" && t.deal_percent ? (
                    <span className="ml-1 text-rose-500">-{t.deal_percent}%</span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-teal-300 inline-block" />빈자리</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-gray-300 inline-block" />사용중</span>
            </div>
          </section>
        )}

        {/* 여기 다녀온 사람들 — 게시물로 이 장소를 방문/언급한 사람 */}
        {visitors && (visitors.visitors.length > 0 || visitors.mentioned.length > 0) && (
          <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">
              여기 다녀온 사람들
              <span className="ml-1.5 text-xs font-normal text-gray-400">
                게시물 {visitors.post_count}개
              </span>
            </h2>
            {visitors.visitors.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-medium text-gray-500 mb-1.5">방문 인증</div>
                <div className="flex flex-wrap gap-2">
                  {visitors.visitors.map((u) => (
                    <div key={u.id} className="flex items-center gap-1.5 rounded-full bg-amber-50 pl-1 pr-3 py-1">
                      <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[11px] font-bold">
                        {u.name?.[0] || "?"}
                      </div>
                      <span className="text-xs font-medium text-amber-700">{u.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {visitors.mentioned.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-medium text-gray-500 mb-1.5">함께 언급된 친구</div>
                <div className="flex flex-wrap gap-2">
                  {visitors.mentioned.map((u) => (
                    <div key={u.id} className="flex items-center gap-1.5 rounded-full bg-sky-50 pl-1 pr-3 py-1">
                      <div className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-[11px] font-bold">
                        {u.name?.[0] || "?"}
                      </div>
                      <span className="text-xs font-medium text-sky-700">{u.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

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
                    className="w-full accent-amber-500"
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
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white text-gray-500 border-gray-200 hover:border-amber-200"
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
                  className="text-amber-600"
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
              className="w-full bg-amber-600 hover:bg-amber-700"
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
          <Button variant="outline" className="flex-1" asChild>
            <a href={reservationLink} target="_blank" rel="noreferrer">
              {reservationLabel}
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
          <Button
            onClick={() => openReserve()}
            className="flex-[1.4] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
          >
            <CalendarCheck className="w-4 h-4 mr-2" />
            캐시로 예약
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 text-center pb-2">
          캐시로 예약금을 결제하고, 취소하면 자동 환불돼요.
        </p>
      </div>

      {/* 저장 폴더 선택 시트 */}
      {savePickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
          onClick={() => !savingPlace && setSavePickerOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 font-['Pretendard'] max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">폴더에 저장</h3>
              <button
                onClick={() => !savingPlace && setSavePickerOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {saveFoldersLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-amber-500" />
              </div>
            ) : (
              <div className="space-y-2">
                {saveFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => saveToFolder(f.id)}
                    disabled={savingPlace}
                    className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 p-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/40 disabled:opacity-50"
                  >
                    <span className="text-2xl">{f.icon || "📁"}</span>
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">{f.name}</div>
                      <div className="text-xs text-gray-400">{f.item_count ?? 0}개 저장됨</div>
                    </div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleCreateFolderAndSave}
                  disabled={savingPlace}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 p-3 text-sm font-bold text-gray-500 transition-colors hover:border-amber-400 hover:text-amber-600 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> 새 폴더 만들기
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 캐시 예약 모달 */}
      {reserveOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
          onClick={() => !reserveSubmitting && setReserveOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 font-['Pretendard']"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{place.name} 예약</h3>
              <button onClick={() => !reserveSubmitting && setReserveOpen(false)} className="text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* 누구와 가나요 — 크루를 고르면 체크인 때 크루가 자동 지정되고,
                  그 크루가 이 가게와 맺은 제휴 혜택이 따라온다. */}
              {myCrews.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500">누구와 가나요?</label>
                  <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setReserveCrew(null)}
                      className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                        reserveCrew === null
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      혼자 / 개인
                    </button>
                    {myCrews.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setReserveCrew(reserveCrew === c.id ? null : c.id)}
                        className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                          reserveCrew === c.id
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "border-gray-200 bg-white text-gray-600"
                        }`}
                      >
                        {c.icon} {c.title}
                      </button>
                    ))}
                  </div>
                  {reserveCrew && (
                    <p className="mt-1 text-[11px] text-indigo-500">
                      크루 예약이라 방문하면 함께 방문 실적으로 쌓이고, 제휴 혜택이 있으면 자동으로 붙어요.
                    </p>
                  )}
                </div>
              )}

              {/* 날짜 선택 — 7일 가로 칩(빠른 선택) + 달력(그 밖의 날짜) */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500">날짜</label>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen((v) => !v)}
                    className="text-[11px] font-semibold text-amber-700"
                  >
                    {calendarOpen ? "간편 선택" : "📅 달력에서 고르기"}
                  </button>
                </div>
                {calendarOpen ? (
                  <MonthCalendar value={reserveDate} onPick={(d) => { setReserveDate(d); setCalendarOpen(false) }} />
                ) : (
                <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                  {buildDateChips(7, reserveDate).map((c) => {
                    const selected = reserveDate === c.date
                    return (
                      <button
                        key={c.date}
                        type="button"
                        onClick={() => setReserveDate(c.date)}
                        className={`flex w-12 flex-shrink-0 flex-col items-center rounded-xl border py-2 transition-colors ${
                          selected
                            ? "border-amber-500 bg-amber-600 text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-amber-200"
                        }`}
                      >
                        <span className={`text-[10px] ${selected ? "text-amber-100" : "text-gray-400"}`}>
                          {c.dow}
                        </span>
                        <span className="text-sm font-bold">{c.day}</span>
                      </button>
                    )
                  })}
                </div>
                )}
              </div>

              {/* 시간 슬롯 — 영업시간 기반 30분 단위 */}
              <div>
                <label className="text-xs font-semibold text-gray-500">
                  시간 {place.business_hours ? <span className="text-gray-400">({place.business_hours})</span> : null}
                </label>
                <div className="mt-1.5 grid max-h-36 grid-cols-4 gap-1.5 overflow-y-auto">
                  {buildTimeSlots(place.business_hours).map((slot) => {
                    const selected = reserveTime === slot
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setReserveTime(slot)}
                        className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${
                          selected
                            ? "border-amber-500 bg-amber-600 text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-amber-200"
                        }`}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">인원</label>
                <div className="flex items-center gap-3 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-9 p-0"
                    onClick={() => setPartySize((p) => Math.max(1, p - 1))}
                  >
                    −
                  </Button>
                  <span className="text-base font-bold w-10 text-center">{partySize}명</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-9 p-0"
                    onClick={() => setPartySize((p) => Math.min(20, p + 1))}
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* 🪑 테이블 지정(선택) — 테이블맵 등록 매장만 노출 */}
              {placeTables.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500">
                    원하는 자리 <span className="text-gray-400 font-normal">(선택)</span>
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedTable(null)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        !selectedTable
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      아무 자리나 괜찮아요
                    </button>
                    {placeTables.map((t) => {
                      const tooSmall = t.capacity < partySize && !t.mergeable
                      const on = selectedTable?.id === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={tooSmall}
                          onClick={() => setSelectedTable(on ? null : t)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            on
                              ? "border-amber-500 bg-amber-500 text-white"
                              : tooSmall
                              ? "border-gray-100 bg-gray-50 text-gray-300"
                              : "border-gray-200 bg-white text-gray-600 hover:border-amber-300"
                          }`}
                          title={tooSmall ? `${t.capacity}인석 — 인원 초과` : ""}
                        >
                          {t.zone !== "홀" ? `${t.zone} ` : ""}{t.label} · {t.capacity}인
                          {t.mergeable ? " ⛓" : ""}
                          {t.deal_percent ? ` 💸-${t.deal_percent}%` : ""}
                        </button>
                      )
                    })}
                  </div>
                  {selectedTable?.deal_percent ? (
                    <p className="mt-1 text-[11px] text-rose-500 font-semibold">
                      💸 이 테이블은 매장에서 {selectedTable.deal_percent}% 할인이 적용돼요 (지금 비어있을 때 한정)
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-gray-400">
                      원하는 자리를 고르면 사장님께 함께 전달돼요.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-xl bg-gray-50 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">예약금 ({won(DEPOSIT_PER_PERSON)} × {partySize})</span>
                  <span className="font-bold text-gray-900">{won(depositAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Wallet className="w-3 h-3" /> 보유 캐시
                  </span>
                  <span className={cashBalance < depositAmount ? "text-rose-500 font-semibold" : "text-gray-500"}>
                    {won(cashBalance)}
                  </span>
                </div>
              </div>

              {reserveError && <p className="text-xs text-rose-500">{reserveError}</p>}
              {reserveSuccess && <p className="text-xs text-green-600">{reserveSuccess}</p>}

              <Button
                onClick={handleReserve}
                disabled={reserveSubmitting || !!reserveSuccess}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 font-bold"
              >
                {reserveSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `${won(depositAmount)} 결제하고 예약하기`
                )}
              </Button>
              <p className="text-[11px] text-gray-400 text-center">
                예약금은 캐시에서 결제되며 취소 시 환불됩니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}



