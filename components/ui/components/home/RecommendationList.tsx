"use client"

import React, { useMemo, useState } from "react"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import { MapPin, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ShareRecommendationDialog } from "@/components/ui/components/home/ShareRecommendationDialog"

// 정렬 옵션
const SORT_OPTIONS = [
  { key: "reco", label: "추천순" },
  { key: "rating", label: "평점순" },
  { key: "distance", label: "거리순" },
] as const
type SortKey = (typeof SORT_OPTIONS)[number]["key"]

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

type RecommendationListProps = {
  recommendations: any[]
  activeTabIdx: number
  onSelectTab: (index: number) => void
  currentDisplayRegion: any
  onPlaceClick: (place: any) => void
  onReset: () => void
  personaLabel?: { emoji: string; title: string } | null
}

// 바텀시트 스냅 높이 (뷰포트 대비 %). peek=지도 거의 보임, full=거의 전체.
const SNAPS = ["peek", "half", "full"] as const
type Snap = (typeof SNAPS)[number]
const SNAP_VH: Record<Snap, number> = { peek: 26, half: 52, full: 88 }

const PlaceCard = ({ place, onClick }: { place: any; onClick: () => void }) => (
  <div
    className="bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
    onClick={onClick}
  >
    <div className="flex-1">
      <div className="font-bold text-gray-800 flex items-center gap-2">
        {place.name || place.title}
        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
          {place.wemeet_rating
            ? `⭐${place.wemeet_rating.toFixed(1)}`
            : place.score
            ? `⭐${place.score}`
            : ""}
        </span>
      </div>
      <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
        <MapPin className="w-3 h-3" /> {place.category || "장소"}
        {place.tags && <span className="text-gray-400">| {place.tags.slice(0, 2).join(", ")}</span>}
      </div>
      <div className="text-[10px] text-gray-400 mt-1">{place.address}</div>
      {place.reason && (
        <div className="text-[11px] font-bold text-[#F5A623] mt-1.5 flex items-center gap-1">
          <span>✨</span>
          <span className="truncate">{place.reason}</span>
        </div>
      )}
      {place.social_proof?.count > 0 && (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
          <span>🫂</span>
          <span className="truncate">
            비슷한 취향 {place.social_proof.count}명이 좋아한 곳
            {place.social_proof.names?.length ? ` · ${place.social_proof.names.slice(0, 2).join(", ")}${place.social_proof.count > 2 ? " 외" : ""}` : ""}
          </span>
        </div>
      )}
    </div>
    <Button size="sm" variant="outline" className="ml-2 h-8 text-xs">
      상세
    </Button>
  </div>
)

export const RecommendationList = ({
  recommendations,
  activeTabIdx,
  onSelectTab,
  currentDisplayRegion,
  onPlaceClick,
  onReset,
  personaLabel,
}: RecommendationListProps) => {
  const [shareOpen, setShareOpen] = useState(false)
  const [snap, setSnap] = useState<Snap>("half")
  const [sortBy, setSortBy] = useState<SortKey>("reco")

  // 현재 지역이 개인 취향 반영됐는지 (백엔드 personalized 플래그 또는 그룹취향 지역)
  const isPersonalized =
    !!currentDisplayRegion?.personalized ||
    (typeof currentDisplayRegion?.region_name === "string" &&
      currentDisplayRegion.region_name.includes("취향"))

  // 추천순(엔진 기본 순서) / 평점순 / 거리순(중간지점에서 가까운 순)
  const sortedPlaces = useMemo(() => {
    const places: any[] = currentDisplayRegion?.places || []
    const center = currentDisplayRegion?.center
    const arr = places.map((p, i) => ({ p, i }))
    if (sortBy === "rating") {
      arr.sort((a, b) => (Number(b.p.wemeet_rating) || 0) - (Number(a.p.wemeet_rating) || 0) || a.i - b.i)
    } else if (sortBy === "distance" && center?.lat && center?.lng) {
      const d = (p: any) =>
        p.lat && p.lng ? distanceKm(center.lat, center.lng, p.lat, p.lng) : Infinity
      arr.sort((a, b) => d(a.p) - d(b.p) || a.i - b.i)
    }
    // "reco" → 엔진이 반환한 원래 순서 유지
    return arr.map((x) => x.p)
  }, [currentDisplayRegion, sortBy])

  // 핸들 탭: peek → half → full → peek 순환
  const cycleSnap = () => {
    const idx = SNAPS.indexOf(snap)
    setSnap(SNAPS[(idx + 1) % SNAPS.length])
  }

  // 핸들 드래그: 위로 끌면 키우고, 아래로 끌면 줄임
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const dy = info.offset.y
    const idx = SNAPS.indexOf(snap)
    if (dy < -40 && idx < SNAPS.length - 1) setSnap(SNAPS[idx + 1])
    else if (dy > 40 && idx > 0) setSnap(SNAPS[idx - 1])
  }

  return (
    <AnimatePresence>
      {recommendations.length > 0 && (
        <motion.div
          initial={{ y: 200 }}
          animate={{ y: 0 }}
          exit={{ y: 200 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          style={{ height: `${SNAP_VH[snap]}vh`, transition: "height 0.3s ease" }}
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] z-20 flex flex-col"
        >
          {/* 드래그 핸들 (탭하면 단계 전환, 끌면 조정) */}
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
            onClick={cycleSnap}
            className="pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          >
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto" />
          </motion.div>

          {/* 헤더 + 지역 탭 (고정) */}
          <div className="px-5 shrink-0">
            {isPersonalized && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-[#F5A623]">
                <span>✨</span>
                <span>
                  {personaLabel
                    ? `${personaLabel.emoji} ${personaLabel.title}님 취향 반영됨`
                    : "내 취향 반영됨"}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg">추천 지역</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShareOpen(true)}
                  className="flex items-center gap-1 text-xs font-bold text-[#F5A623]"
                >
                  <Share2 className="w-3.5 h-3.5" /> 공유
                </button>
                <button onClick={onReset} className="text-xs text-gray-400">
                  다시 찾기
                </button>
              </div>
            </div>

            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
              {recommendations.map((r, i) => (
                <button
                  key={i}
                  onClick={() => onSelectTab(i)}
                  className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                    activeTabIdx === i ? "bg-[#F5A623] text-white shadow-md" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {r.region_name}
                </button>
              ))}
            </div>

            {/* 그룹/개인 취향 반영 배너 */}
            {currentDisplayRegion?.group_mode ? (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-[#B45309]">
                <span>👥</span>
                <span>
                  우리 그룹 {currentDisplayRegion?.group_size || ""}명 취향을 합쳐, 모두 만족할 곳을 골랐어요
                </span>
              </div>
            ) : isPersonalized ? (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-[#B45309]">
                <span>✨</span>
                <span>내 취향을 반영해 추천했어요</span>
              </div>
            ) : null}

            {/* 정렬: 추천순 / 평점순 / 거리순 */}
            <div className="flex gap-1.5 mb-2">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    sortBy === opt.key
                      ? "bg-[#F5A623] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 장소 목록 (스크롤) */}
          <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
            {sortedPlaces.map((p: any, idx: number) => (
              <PlaceCard key={p.id ?? idx} place={p} onClick={() => onPlaceClick(p)} />
            ))}
          </div>

          <ShareRecommendationDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            regionName={currentDisplayRegion?.region_name}
            places={currentDisplayRegion?.places || []}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
