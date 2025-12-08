import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, Heart, MapPin, Calendar, Clock, User, Plus, Loader2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { fetchWithAuth } from "@/lib/api-client"

export function CommunityTab() {
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchCommunities = async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth("/api/communities")
      if (res.ok) {
        setMeetings(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCommunities()
  }, [])

  const handleJoin = async (id: string) => {
    if (!confirm("이 모임에 참여하시겠습니까?")) return
    try {
      const res = await fetchWithAuth(`/api/communities/${id}/join`, { method: "POST" })
      if (res.ok) {
        alert("참여 완료!")
        fetchCommunities()
      } else {
        alert("참여 실패 (이미 참여했거나 오류)")
      }
    } catch (e) { alert("오류 발생") }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header & Search */}
      <div className="bg-white p-4 pb-2 sticky top-0 z-10 shadow-sm">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input className="pl-9 bg-white border-2 border-[#2dd4bf] rounded-xl h-10 text-sm" placeholder="약속 / 주제 검색" />
        </div>

        <Button className="w-full bg-[#6366f1] hover:bg-[#5558e0] text-white font-bold h-11 rounded-xl mb-4 shadow-md">
          <Plus className="mr-2 h-5 w-5" /> 약속 생성하기
        </Button>

        {/* Categories */}
        <div className="space-y-3">
          <div className="flex gap-2 text-sm font-bold text-gray-600 mb-1">테마</div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {["전체", "맛집 탐방", "요리", "스포츠", "영화/공연", "스터디"].map((cat, i) => (
              <Button key={cat} variant={i === 1 ? "default" : "outline"} className={`rounded-xl h-8 text-xs ${i === 1 ? 'bg-[#2dd4bf] hover:bg-[#25c2af] text-white border-none' : 'text-gray-500 border-gray-200'}`}>{cat}</Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-[#6366f1] text-lg">↗</span>
        <span className="text-sm font-bold text-[#6366f1]">참여 가능한 모임들</span>
      </div>

      {/* Meeting List */}
      <ScrollArea className="flex-1 px-4 pb-4">
        {loading && <div className="text-center py-10"><Loader2 className="animate-spin w-8 h-8 text-teal-500 mx-auto" /></div>}

        <div className="space-y-4 pb-20">
          {meetings.length > 0 ? meetings.map((m, idx) => (
            <div key={m.id} className={`bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative overflow-hidden ${idx === 0 ? 'ring-2 ring-[#2dd4bf]/20' : ''}`}>
              {idx === 0 && <div className="bg-[#2dd4bf] text-white text-[10px] font-bold px-3 py-1 absolute top-0 left-0 rounded-br-xl">🌟 추천 모임</div>}

              <div className="flex justify-between items-start mb-2 mt-2">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Avatar className="w-10 h-10 border-2 border-white shadow-sm z-10 relative">
                      <AvatarFallback className="bg-orange-100">{m.title[0]}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm leading-tight text-gray-800">{m.title}</h3>
                  </div>
                </div>
                <Heart className="w-5 h-5 text-gray-300 hover:text-red-500 cursor-pointer" />
              </div>

              <p className="text-xs text-gray-500 mb-3 ml-12 line-clamp-2">{m.description || "설명 없음"}</p>

              <div className="flex gap-2 ml-12 mb-3">
                <Badge variant="secondary" className="bg-teal-50 text-teal-600 border-none text-[10px] gap-1 px-2 h-5"><User className="w-3 h-3" /> {m.current_members?.length || 0}/{m.max_members} 명</Badge>
                <Badge variant="outline" className="text-[10px] h-5">{m.category}</Badge>
              </div>

              <div className="flex flex-wrap gap-1 ml-12 mb-3">
                {m.tags && m.tags.map((t: string) => (
                  <span key={t} className="text-[10px] text-gray-500 border rounded-md px-1.5 py-0.5"># {t}</span>
                ))}
              </div>

              <div className="flex items-end justify-between ml-12">
                <div className="space-y-1 text-xs text-gray-600 font-medium">
                  <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {m.date_time?.split(' ')[0] || "날짜미정"}</div>
                  <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {m.location}</div>
                </div>
                <Button className="bg-[#6366f1] hover:bg-[#5558e0] text-white text-xs font-bold h-8 px-4 rounded-lg" onClick={() => handleJoin(m.id)}>참여</Button>
              </div>
            </div>
          )) : (
            !loading && <div className="text-center text-gray-400 py-10">생성된 모임이 없습니다.</div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}