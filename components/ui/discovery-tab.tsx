"use client"
import React, { useState } from "react"
import { Play, Heart, MapPin } from "lucide-react"

export function DiscoveryTab() {
  // 더미 데이터 (나중에 백엔드 /api/discovery 연결)
  const feeds = [
    { id: 1, title: "성수동 분위기 깡패 와인바 🍷", shop: "성수 와인픽", image: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=80", likes: 120 },
    { id: 2, title: "강남역 직장인 회식 성지", shop: "오봉집", image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80", likes: 85 },
  ]

  return (
    <div className="h-full bg-black text-white overflow-y-auto snap-y snap-mandatory">
      {feeds.map((feed) => (
        <div key={feed.id} className="h-full w-full relative snap-start shrink-0 flex items-center justify-center bg-gray-900">
          {/* 배경 이미지/비디오 */}
          <img src={feed.image} alt={feed.title} className="absolute inset-0 w-full h-full object-cover opacity-80" />
          
          {/* 콘텐츠 정보 */}
          <div className="absolute bottom-20 left-4 right-4 z-10">
            <div className="bg-black/30 backdrop-blur-md p-4 rounded-xl border border-white/10">
              <h3 className="text-xl font-bold mb-1">{feed.title}</h3>
              <div className="flex items-center text-sm text-gray-200 gap-2 mb-3">
                <MapPin className="w-4 h-4" /> {feed.shop}
              </div>
              <button className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-3 rounded-lg font-bold">
                📍 여기서 모임 잡기
              </button>
            </div>
          </div>
          
          {/* 우측 액션 버튼 */}
          <div className="absolute right-4 bottom-32 flex flex-col gap-4 items-center">
            <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm"><Heart className="w-6 h-6" /></div>
            <span className="text-xs font-bold">{feed.likes}</span>
          </div>
        </div>
      ))}
    </div>
  )
}