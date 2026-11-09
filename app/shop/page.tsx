"use client"

// ─────────────────────────────────────────────────────────────
// 🛍️ 샵 — 단골 제휴 · 실시간 핫딜 · 모임 꾸미기(IAP)
// hotdeal-tab + crew-exchange를 통합한 수익화 허브.
// 단골 제휴: 같은 가게 3회+ 방문 → 자동 형성 (쿠폰이 아니라 양방향 관계)
// 실시간 핫딜: 사장님이 빈 시간대 발행 → 모임 단위 방문 (객단가 3~5배)
// 모임 꾸미기(IAP): 랭킹 부스터, 테마, 뱃지 (게이미피케이션 수익원)
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Zap, Clock, Gift, Rocket, Palette, Award, ChevronRight, Loader2, Star } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { TabBar } from "../tab-bar"

const MINT = "#3BD4AE"
const HOTDEAL = "#FF6B35"
const DANDOL = "#E69500"

type FilterTab = "all" | "partner" | "hotdeal" | "iap"

// ── 단골 제휴 카드 ───────────────────────────────────────────
type Partner = {
  id: string; name: string; emoji: string; category: string
  location: string; priceRange: string; benefit: string
  moimName: string; visitCount: number
}

function PartnerCard({ p }: { p: Partner }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl" style={{ background: `${DANDOL}10` }}>{p.emoji}</div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">{p.name}</span>
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${DANDOL}15`, color: DANDOL }}>단골 제휴</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">{p.location} · {p.category} · {p.priceRange}</p>
        </div>
      </div>
      <div className="bg-emerald-50 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
        <Gift className="w-3.5 h-3.5" />{p.benefit}
      </div>
      <p className="text-[9px] text-gray-400 mt-2">{p.moimName} · {p.visitCount}회 방문으로 제휴 형성</p>
    </div>
  )
}

// ── 핫딜 카드 ────────────────────────────────────────────────
type HotDeal = {
  id: string; name: string; emoji: string; location: string; category: string
  benefit: string; time: string
}

function HotDealCard({ d }: { d: HotDeal }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border border-orange-100 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: "#FFF3E0" }}>{d.emoji}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{d.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{d.location} · {d.category}</p>
        <p className="text-[11px] font-semibold mt-1" style={{ color: HOTDEAL }}>{d.benefit}</p>
      </div>
      <span className="text-[10px] font-bold px-2 py-1 rounded-lg text-white flex-shrink-0" style={{ background: HOTDEAL }}>{d.time}</span>
    </div>
  )
}

// ── IAP 아이템 카드 ──────────────────────────────────────────
type IAPItem = { id: string; name: string; desc: string; emoji: string; price: number; unit: string; bg: string }

function IAPCard({ item }: { item: IAPItem }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: item.bg }}>{item.emoji}</div>
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-900">{item.name}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold" style={{ color: MINT }}>{item.price}P</p>
        <p className="text-[8px] text-gray-400">{item.unit}</p>
      </div>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────
export default function ShopPage() {
  const router = useRouter()
  const [tab, setTab] = useState<FilterTab>("all")
  const [points, setPoints] = useState(1200) // TODO: API 연동

  // TODO: API 연동
  const partners: Partner[] = [
    { id: "1", name: "몽탄", emoji: "🍖", category: "고깃집", location: "용산", priceRange: "1인 25,000원", benefit: "모임 방문 시 디저트 서비스", moimName: "을지로 탐험대", visitCount: 3 },
    { id: "2", name: "카페 온천집", emoji: "☕", category: "카페", location: "연남", priceRange: "1인 6,000원", benefit: "아메리카노 1잔 무료", moimName: "금요 퇴근러", visitCount: 5 },
  ]
  const hotDeals: HotDeal[] = [
    { id: "1", name: "을지로 골목식당", emoji: "🍜", location: "을지로3가", category: "한식", benefit: "3명+ → 반찬 무한리필", time: "오늘 6시" },
    { id: "2", name: "용산 크래프트비어", emoji: "🍻", location: "이태원", category: "펍", benefit: "4명+ → 첫 잔 무료", time: "오늘 8시" },
  ]
  const iapItems: IAPItem[] = [
    { id: "1", name: "랭킹 부스터", desc: "이번 주 포인트 1.5배", emoji: "🚀", price: 500, unit: "7일", bg: "#FFF8E1" },
    { id: "2", name: "모임 테마 — 골드", desc: "모임 공간을 골드로 꾸미기", emoji: "🎨", price: 800, unit: "영구", bg: "#E8F7F2" },
    { id: "3", name: "맛집 탐험가 뱃지", desc: "프로필 특별 뱃지", emoji: "🏅", price: 300, unit: "영구", bg: "#FCE4EC" },
  ]

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "partner", label: "단골 제휴" },
    { key: "hotdeal", label: "실시간 핫딜" },
    { key: "iap", label: "꾸미기" },
  ]

  return (
    <div className="min-h-screen bg-[#F5F9F8] pb-20">
      {/* 헤더 */}
      <header className="bg-white px-5 py-3 flex items-center justify-between border-b border-gray-100">
        <span className="text-lg font-extrabold text-gray-900">샵</span>
        <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: MINT }}>{points.toLocaleString()}P</span>
      </header>

      {/* 필터 탭 */}
      <div className="flex gap-2 px-4 py-2.5 bg-white overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all"
            style={{
              background: tab === t.key ? MINT : "transparent",
              color: tab === t.key ? "#fff" : "#999",
              borderColor: tab === t.key ? MINT : "#eee",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 space-y-3">
        {/* 핫딜 배너 */}
        {(tab === "all" || tab === "hotdeal") && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${HOTDEAL}, #FF8F60)` }}>
            <Zap className="w-6 h-6 text-white" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">지금 근처 빈자리 {hotDeals.length}곳</p>
              <p className="text-[10px] text-white/80 mt-0.5">모임 멤버와 함께 가면 혜택 UP!</p>
            </div>
            <span className="bg-white text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: HOTDEAL }}>보기</span>
          </div>
        )}

        {/* 단골 제휴 */}
        {(tab === "all" || tab === "partner") && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">🤝 단골 제휴 가게</h2>
              <span className="text-[10px] text-gray-400">전체보기 ›</span>
            </div>
            {partners.map(p => <PartnerCard key={p.id} p={p} />)}
          </>
        )}

        {/* 실시간 핫딜 */}
        {(tab === "all" || tab === "hotdeal") && (
          <>
            <h2 className="text-sm font-bold text-gray-900">🔥 실시간 핫딜</h2>
            {hotDeals.map(d => <HotDealCard key={d.id} d={d} />)}
          </>
        )}

        {/* 모임 꾸미기 (IAP) */}
        {(tab === "all" || tab === "iap") && (
          <>
            <h2 className="text-sm font-bold text-gray-900">✨ 모임 꾸미기</h2>
            {iapItems.map(item => <IAPCard key={item.id} item={item} />)}
          </>
        )}
      </div>

      <TabBar />
    </div>
  )
}
