"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { fetchWithAuth } from "@/lib/api-client"
import { logAction } from "@/lib/analytics-client"
import { logVectorInteraction, getGroupRecommendations } from "@/lib/recommend-client"
import { useDecisionCell } from "@/hooks/use-decision-cell"
import { placeApi } from "@/lib/place-api"
import { useMapLogic } from "@/hooks/use-map-logic"
import { useRecommendation } from "@/hooks/use-recommendation"
import { useSystemConfig } from "@/hooks/use-system-config"
import { HomeHeader } from "@/components/ui/components/home/HomeHeader"
import { ActionButtons } from "@/components/ui/components/home/ActionButtons"
import { MidpointSelector } from "@/components/ui/components/home/MidpointSelector"
import { RecommendationList } from "@/components/ui/components/home/RecommendationList"
import { FilterDialog } from "@/components/ui/components/home/FilterDialog"
import { FriendModal } from "@/components/ui/components/home/FriendModal"
import { getPersonaLabel } from "@/lib/taste-persona"
import { recordActivity } from "@/lib/game"

const HOME_STATE_KEY = "home_tab_state_v1"

const PreferenceModal = ({ isOpen, onClose, onComplete }: any) => (
  <Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent>
      <DialogHeader><DialogTitle>취향 설문</DialogTitle></DialogHeader>
      <div className="py-4 text-center text-gray-600">추천 정확도를 높이기 위해 취향을 알려주세요.</div>
      <DialogFooter><Button onClick={onComplete}>확인</Button></DialogFooter>
    </DialogContent>
  </Dialog>
)

const AI_PERSONAS = [
  { id: 2, name: "직장인 (강남)", locationName: "강남역", location: { lat: 37.498085, lng: 127.027621 } },
  { id: 3, name: "학생 (홍대)", locationName: "홍대입구", location: { lat: 37.557527, lng: 126.924467 } },
  { id: 4, name: "친구 (성수)", locationName: "성수", location: { lat: 37.544581, lng: 127.056035 } },
]

export function HomeTab() {
  const router = useRouter()

  // 🏢 같은 건물 여러 가게 핀 탭 → 목록 시트 (use-map-logic이 dispatch)
  const [buildingGroup, setBuildingGroup] = useState<any[] | null>(null)
  useEffect(() => {
    const h = (e: any) => setBuildingGroup(e?.detail?.places || null)
    window.addEventListener("map:place-group", h)
    return () => window.removeEventListener("map:place-group", h)
  }, [])

  // State
  const [searchQuery, setSearchQuery] = useState("")
  const [myLocation, setMyLocation] = useState<{ lat: number, lng: number } | null>(null)
  const [myLocationInput, setMyLocationInput] = useState("위치 확인 중...")

  const [manualInputs, setManualInputs] = useState<{ text: string, lat?: number, lng?: number }[]>([{ text: "" }])
  const [selectedFriends, setSelectedFriends] = useState<any[]>([])
  const [includeMe, setIncludeMe] = useState(true)

  const [loots, setLoots] = useState<any[]>([])
  const [gpsError, setGpsError] = useState<string>("")

  const [nearbyPlace, setNearbyPlace] = useState<any>(null)
  const [nearbyLoot, setNearbyLoot] = useState<any>(null)
  const [interactionLoading, setInteractionLoading] = useState(false)

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isFriendModalOpen, setIsFriendModalOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<any>(null)
  const [isPreferenceModalOpen, setIsPreferenceModalOpen] = useState(false)

  const [selectedPurpose, setSelectedPurpose] = useState("식사")
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
    PURPOSE: ["식사"],
    CATEGORY: [],
    PRICE: [],
    VIBE: [],
    CONDITION: []
  })
  const [myProfile, setMyProfile] = useState<any>(null)

  const { data: purposeConfig } = useSystemConfig()

  const { decisionCell, requestId, resetRequestId } = useDecisionCell()

  const {
    recommendations,
    setRecommendations,
    currentDisplayRegion,
    setCurrentDisplayRegion,
    activeTabIdx,
    setActiveTabIdx,
    searchMidpoint,
    searchByQuery,
    isLoading
  } = useRecommendation({
    selectedPurpose,
    selectedFilters,
    includeMe,
    myProfile,
    myLocation,
    selectedFriends,
    manualInputs,
    decisionCell,
    requestId,
    labels: {
      noOriginMessage: "출발지를 1개 이상 입력해주세요.",
      errorMessage: "네트워크 오류가 발생했습니다.",
      locationName: "중간지점",
      searchResultTag: "검색 결과",
      searchRegionLabel: (query: string) => `'${query}' 검색 결과`
    }
  })

  const { mapRef, drawPathsToTarget, clearPaths, drawRegionPaths } = useMapLogic({
    myLocation,
    currentDisplayRegion,
    loots,
    selectedFriends,
    includeMe,
    manualInputs,
    myProfile,
    fallbackName: "알 수 없음",
    formatTravelTime: (minutes) => `${minutes}분`
  })

  const persistSearchState = () => {
    if (typeof window === "undefined") return
    if (!recommendations.length) return
    try {
      const payload = {
        recommendations,
        currentDisplayRegion,
        activeTabIdx,
        selectedPurpose,
        selectedFilters,
        manualInputs,
        selectedFriends,
        includeMe,
        searchQuery
      }
      sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.log("Failed to persist search state:", error)
    }
  }

  const restoreSearchState = () => {
    if (typeof window === "undefined") return
    const raw = sessionStorage.getItem(HOME_STATE_KEY)
    if (!raw) return
    try {
      const saved = JSON.parse(raw)
      if (Array.isArray(saved.recommendations) && saved.recommendations.length > 0) {
        setRecommendations(saved.recommendations)
        const restoredIdx = typeof saved.activeTabIdx === "number" ? saved.activeTabIdx : 0
        setActiveTabIdx(restoredIdx)
        if (saved.currentDisplayRegion) {
          setCurrentDisplayRegion(saved.currentDisplayRegion)
        } else {
          setCurrentDisplayRegion(saved.recommendations[restoredIdx] || null)
        }
      }
      if (saved.selectedPurpose) setSelectedPurpose(saved.selectedPurpose)
      if (saved.selectedFilters) setSelectedFilters(saved.selectedFilters)
      if (Array.isArray(saved.manualInputs) && saved.manualInputs.length > 0) {
        setManualInputs(saved.manualInputs)
      }
      if (Array.isArray(saved.selectedFriends)) setSelectedFriends(saved.selectedFriends)
      if (typeof saved.includeMe === "boolean") setIncludeMe(saved.includeMe)
      if (typeof saved.searchQuery === "string") setSearchQuery(saved.searchQuery)
    } catch (error) {
      console.log("Failed to restore search state:", error)
    }
  }

  useEffect(() => {
    restoreSearchState()
  }, [])

  // 내 프로필/위치 로드 (마이페이지에서 저장한 위치 기준). 없으면 안내.
  useEffect(() => {
    let cancelled = false
    const loadMe = async () => {
      try {
        const res = await fetchWithAuth("/api/users/me")
        if (!res.ok) {
          if (!cancelled) setMyLocationInput("위치 미설정 (마이페이지에서 설정)")
          return
        }
        const me = await res.json()
        if (cancelled) return
        setMyProfile(me)
        // /api/users/me 는 위치를 me.location.lat/lng(중첩)로 반환한다(과거 me.lat로 읽어 항상 미설정 처리됐음)
        const lat = me?.location?.lat ?? me?.lat
        const lng = me?.location?.lng ?? me?.lng
        if (lat && lng && Math.abs(lat) > 1.0) {
          setMyLocation({ lat, lng })
          setMyLocationInput(me.location_name || "내 설정 위치")
        } else {
          setMyLocationInput("위치 미설정 (마이페이지에서 설정)")
        }
      } catch {
        if (!cancelled) setMyLocationInput("위치 미설정 (마이페이지에서 설정)")
      }
    }
    loadMe()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!purposeConfig) return
    if (!selectedPurpose || !purposeConfig[selectedPurpose]) {
      const firstPurpose = Object.keys(purposeConfig)[0]
      if (firstPurpose) {
        setSelectedPurpose(firstPurpose)
        setSelectedFilters(prev => ({ ...prev, PURPOSE: [firstPurpose] }))
      }
    }
  }, [purposeConfig, selectedPurpose])

  const handleMidpointSearch = async () => {
    resetRequestId()
    const result = await searchMidpoint()
    if (!result.ok) {
      alert(result.message || "추천에 실패했어요. 잠시 후 다시 시도해주세요.")
      return
    }
    recordActivity("recommend") // 게임: 맞춤 추천 받기 퀘스트/XP
    // 그룹 취향 맞춤 추천을 맨 앞 지역으로 주입 (Group Vector AI)
    try {
      const memberIds: number[] = []
      if (includeMe && myProfile?.id) memberIds.push(Number(myProfile.id))
      selectedFriends.forEach((f: any) => { if (f?.id) memberIds.push(Number(f.id)) })
      const uniqueIds = Array.from(new Set(memberIds.filter((n) => Number.isFinite(n))))
      if (uniqueIds.length === 0) return

      const grp = await getGroupRecommendations(uniqueIds, 8)
      if (!grp || !grp.recommendations?.length) return

      const center = (result as any).data?.[0]?.center ?? myLocation ?? null
      const groupRegion = {
        region_name: "✨ 우리 취향 맞춤",
        center,
        transit_info: null,
        _recommendation_id: grp.recommendation_id,
        places: grp.recommendations.map((r, i) => ({
          id: r.place_id,
          name: r.name,
          category: r.category,
          address: r.address,
          tags: r.tags || [],
          score: r.group_score,
          reason: r.reason,
          _recommendation_id: grp.recommendation_id,
          _position: i,
        })),
      }
      setRecommendations((prev: any[]) => [groupRegion, ...prev])
      setActiveTabIdx(0)
      setCurrentDisplayRegion(groupRegion)
    } catch (e) {
      console.log("group rec inject failed:", e)
    }
  }

  const handleTopSearch = async () => {
    if (!searchQuery || searchQuery.trim() === "") return

    try {
      resetRequestId()
      const mainCategory = purposeConfig?.[selectedPurpose]?.mainCategory || ""
      const searchRegion = await searchByQuery(searchQuery, mainCategory)
      if (!searchRegion) {
        // 0건: 네트워크 오류가 아니라 결과 없음 — 문구를 정확히 구분
        alert(`'${searchQuery.trim()}' 검색 결과가 없어요. 다른 이름이나 지역으로 검색해보세요.`)
        return
      }
      if (mapRef.current) {
        const newCenter = new window.naver.maps.LatLng(searchRegion.center.lat, searchRegion.center.lng)
        mapRef.current.morph(newCenter)
      }
    } catch (e) {
      console.error("Search failed:", e)
      alert("검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.")
    }
  }

  const handleManualInputChange = (idx: number, val: string) => {
    const newInputs = [...manualInputs]
    newInputs[idx] = { ...newInputs[idx], text: val, lat: undefined, lng: undefined }
    setManualInputs(newInputs)
  }

  const handleManualSelect = (idx: number, place: any) => {
    const newInputs = [...manualInputs]
    newInputs[idx] = { text: place.name, lat: place.lat, lng: place.lng }
    setManualInputs(newInputs)
  }

  const addManualInput = () => setManualInputs([...manualInputs, { text: "" }])
  const removeManualInput = (idx: number) => setManualInputs(manualInputs.filter((_, i) => i !== idx))
  const toggleFriend = (friend: any) => {
    if (selectedFriends.find(f => f.id === friend.id)) {
      setSelectedFriends(prev => prev.filter(f => f.id !== friend.id))
    } else {
      setSelectedFriends(prev => [...prev, friend])
    }
  }

  const toggleFilter = (k: string, v: string) => {
    setSelectedFilters(prev => {
      const list = prev[k] || []
      return list.includes(v) ? { ...prev, [k]: list.filter(i => i !== v) } : { ...prev, [k]: [...list, v] }
    })
  }

  const removeTag = (tag: string) => {
    for (const [key, vals] of Object.entries(selectedFilters)) {
      if (vals.includes(tag)) toggleFilter(key, tag)
    }
  }

  const handleCheckIn = async () => {
    if (!nearbyPlace) return
    setInteractionLoading(true)
    try {
      // 체크인 = 탐험 활동(게임 XP/퀘스트). 캐시(현금)가 아니라 XP로 보상.
      await recordActivity("explore")
      setNearbyPlace(null)
    } catch (e) {
      alert("오류가 발생했어요.")
    } finally {
      setInteractionLoading(false)
    }
  }

  const handleClaimLoot = async () => {
    if (!nearbyLoot) return
    setInteractionLoading(true)
    try {
      // 지도 보물찾기 = 탐험 XP 보상(놀이처럼). 축하 연출은 전역 GameCelebration이 처리.
      await recordActivity("explore")
      setLoots(p => p.filter(l => l.id !== nearbyLoot.id))
      setNearbyLoot(null)
    } catch (e) {
      alert("오류가 발생했어요.")
    } finally {
      setInteractionLoading(false)
    }
  }

  const handlePlaceClick = async (p: any) => {
    persistSearchState()
    if (p?.id) {
      logAction({ action_type: "detail_view", place_id: p.id, source: "home_tab" })
      // 추천 학습 + CTR: 클릭 기록 (그룹추천이면 recommendation_id로 귀속)
      logVectorInteraction({
        place_id: p.id, action_type: "CLICK",
        recommendation_id: p._recommendation_id, position_in_list: p._position,
      })
      router.push(`/places/${p.id}`)
      return
    }
    if (p?.name) {
      try {
        const matches = await placeApi.searchDbOnly(p.name)
        const matched = matches.find((item: any) => item.name === p.name) || matches[0]
        if (matched?.id) {
          logAction({ action_type: "detail_view", place_id: matched.id, source: "home_tab" })
          logVectorInteraction({ place_id: matched.id, action_type: "CLICK" })
          router.push(`/places/${matched.id}`)
          return
        }
      } catch (error) {
        console.log("Place lookup failed:", error)
      }
    }
    setSelectedPlace(p)
    setIsDetailOpen(true)
    drawPathsToTarget(p.lat, p.lng, currentDisplayRegion?.transit_info)
  }

  const currentFilters = purposeConfig ? purposeConfig[selectedPurpose] : null
  const handleResetSearch = () => {
    setRecommendations([])
    setManualInputs([{ text: "" }])
    setCurrentDisplayRegion(null)
    setActiveTabIdx(0)
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(HOME_STATE_KEY)
    }
  }
  const handleSelectTab = (idx: number) => {
    setActiveTabIdx(idx)
    setCurrentDisplayRegion(recommendations[idx])
  }
  const handleSelectPurpose = (purposeKey: string) => {
    setSelectedPurpose(purposeKey)
    setSelectedFilters({ PURPOSE: [purposeKey], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [] })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col bg-[#F3F4F6] relative font-['Pretendard']">
      <HomeHeader
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearchSubmit={handleTopSearch}
        onOpenFilter={() => setIsFilterOpen(true)}
        selectedFilters={selectedFilters}
        currentFiltersLabel={currentFilters?.label}
        onRemoveTag={removeTag}
      />

      <div id="map" className="w-full h-full bg-gray-200"></div>

      <ActionButtons
        nearbyLoot={nearbyLoot}
        nearbyPlace={nearbyPlace}
        interactionLoading={interactionLoading}
        onClaimLoot={handleClaimLoot}
        onCheckIn={handleCheckIn}
      />

      {!recommendations.length && (
        <MidpointSelector
          includeMe={includeMe}
          myLocationInput={myLocationInput}
          selectedFriends={selectedFriends}
          manualInputs={manualInputs}
          onToggleFriend={toggleFriend}
          onManualInputChange={handleManualInputChange}
          onManualSelect={handleManualSelect}
          onRemoveManualInput={removeManualInput}
          onAddManualInput={addManualInput}
          onOpenFriendModal={() => setIsFriendModalOpen(true)}
          onIncludeMeChange={setIncludeMe}
          onSearch={handleMidpointSearch}
          PlaceAutocompleteComponent={PlaceAutocomplete}
        />
      )}

      <RecommendationList
        recommendations={recommendations}
        activeTabIdx={activeTabIdx}
        onSelectTab={handleSelectTab}
        currentDisplayRegion={currentDisplayRegion}
        onPlaceClick={handlePlaceClick}
        onReset={handleResetSearch}
        personaLabel={getPersonaLabel(myProfile?.preferences)}
      />

      {isLoading && (
        <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-[#F5A623] animate-spin" />
        </div>
      )}
      {gpsError && (
        <div className="absolute top-24 left-4 right-4 bg-red-100 text-red-600 p-2 rounded-lg text-xs z-50">
          {gpsError}
        </div>
      )}

      <FilterDialog
        isOpen={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        purposeConfig={purposeConfig || null}
        selectedPurpose={selectedPurpose}
        onSelectPurpose={handleSelectPurpose}
        selectedFilters={selectedFilters}
        onToggleFilter={toggleFilter}
      />

      <FriendModal
        isOpen={isFriendModalOpen}
        onOpenChange={setIsFriendModalOpen}
        aiPersonas={AI_PERSONAS}
        selectedFriends={selectedFriends}
        onToggleFriend={toggleFriend}
      />
      <PreferenceModal
        isOpen={isPreferenceModalOpen}
        onClose={() => setIsPreferenceModalOpen(false)}
        onComplete={() => setIsPreferenceModalOpen(false)}
      />

      <Dialog open={isDetailOpen} onOpenChange={(open) => {
        setIsDetailOpen(open)
        if (!open) {
          clearPaths()
          if (currentDisplayRegion) drawRegionPaths(currentDisplayRegion)
        }
      }}>
        <DialogContent className="sm:max-w-md h-[80vh] flex flex-col font-['Pretendard']">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {selectedPlace?.name}
              <Badge variant="outline" className="text-xs font-normal">{selectedPlace?.category}</Badge>
            </DialogTitle>
            <DialogDescription className="hidden">Place details</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            <div className="bg-amber-50 p-4 rounded-lg text-center">
              <div className="text-sm text-amber-800 font-bold mb-1">AI 추천 점수</div>
              <div className="text-3xl font-black text-[#F5A623]">{selectedPlace?.score || selectedPlace?.wemeet_rating || "NEW"}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedPlace?.tags?.map((t: string, i: number) => (
                <Badge key={i} variant="secondary" className="bg-white border border-gray-200 text-gray-500">#{t}</Badge>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (selectedPlace?.id) {
                  persistSearchState()
                  setIsDetailOpen(false)
                  router.push(`/places/${selectedPlace.id}?review=1`)
                }
              }}
            >
              리뷰 쓰고 AI 학습시키기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🏢 같은 건물 가게 목록 시트 */}
      {buildingGroup && buildingGroup.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" onClick={() => setBuildingGroup(null)}>
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 max-h-[70vh] overflow-y-auto font-['Pretendard']"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <h3 className="font-bold text-gray-900 mb-3">이 건물의 가게 {buildingGroup.length}곳</h3>
            <div className="space-y-1.5">
              {buildingGroup.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setBuildingGroup(null)
                    router.push(`/places/${p.id}`)
                  }}
                  className="w-full flex items-center gap-3 text-left rounded-xl px-3 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-base flex-shrink-0">🍽️</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-900 truncate">{p.name}</span>
                    {p.category && <span className="block text-[11px] text-gray-400 truncate">{p.category}</span>}
                  </span>
                  <span className="text-gray-300">›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

function PlaceAutocomplete({ value, onChange, onSelect, placeholder }: any) {
  const [list, setList] = useState<any[]>([])
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), 300)
    return () => clearTimeout(t)
  }, [value])

  const { data } = useQuery({
    queryKey: ["place-autocomplete", debouncedValue],
    queryFn: () => placeApi.autocomplete(debouncedValue),
    enabled: !!debouncedValue && debouncedValue.length > 0,
    staleTime: 60 * 1000
  })

  useEffect(() => {
    if (!debouncedValue) {
      setList([])
      return
    }
    if (Array.isArray(data)) {
      setList(data)
    }
  }, [data, debouncedValue])

  return (
    <div className="relative w-full">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm bg-transparent border-none p-0 focus-visible:ring-0"
      />
      {list.length > 0 && (
        <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm mt-2 max-h-60 overflow-y-auto">
          {list.map((item, i) => (
            <div
              key={i}
              onClick={() => {
                onSelect(item)
                setList([])
              }}
              className="p-3 hover:bg-amber-50 cursor-pointer text-sm border-b last:border-0 border-gray-100 transition-colors flex justify-between items-center"
            >
              <div className="font-bold text-gray-800">
                {item.name}
                {item.lines && item.lines.length > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-gray-500 bg-gray-100 px-1 rounded">
                    {item.lines.join(",")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
