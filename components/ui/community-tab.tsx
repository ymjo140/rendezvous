"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, Heart, MapPin, Calendar, User, Plus, Loader2 } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { fetchWithAuth } from "@/lib/api-client"

export function CommunityTab() {
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newMeeting, setNewMeeting] = useState({
      title: "", content: "", max_members: 4, location: "", date: "", time: "", category: "전체"
  })

  const fetchCommunities = async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth("/api/communities")
      if (res.ok) setMeetings(await res.json())
    } catch (e) { console.error(e) } 
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCommunities() }, [])

  const handleCreate = async () => {
      if (!newMeeting.title || !newMeeting.content) { alert("제목과 내용을 입력해주세요."); return; }
      
      try {
          // 🌟 422 에러 해결: 숫자 필드(max_members)는 반드시 Number()로 변환
          const payload = {
              title: newMeeting.title,
              content: newMeeting.content,
              max_members: Number(newMeeting.max_members), // 문자열 -> 숫자 변환
              location: newMeeting.location,
              date_time: `${newMeeting.date} ${newMeeting.time}`,
              category: newMeeting.category,
              tags: [newMeeting.category] // 태그가 필요하다면 배열로
          };

          const res = await fetchWithAuth("/api/communities", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });

          if (res.ok) {
              alert("모임이 생성되었습니다!");
              setIsCreateOpen(false);
              fetchCommunities(); 
              setNewMeeting({ title: "", content: "", max_members: 4, location: "", date: "", time: "", category: "전체" });
          } else {
              const err = await res.json();
              console.error(err);
              alert("생성 실패: 입력 정보를 확인해주세요.");
          }
      } catch (e) { alert("오류가 발생했습니다."); }
  };

  const handleJoin = async (id: string) => {
    if (!confirm("이 모임에 참여하시겠습니까?")) return
    try {
      const res = await fetchWithAuth(`/api/communities/${id}/join`, { method: "POST" })
      if (res.ok) { alert("참여 완료!"); fetchCommunities(); }
      else { alert("참여 실패 (이미 참여했거나 오류)"); }
    } catch (e) { alert("오류 발생"); }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 font-['Pretendard']">
      <div className="bg-white p-4 pb-2 sticky top-0 z-10 shadow-sm">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input className="pl-9 bg-white border-2 border-[#7C3AED]/20 rounded-xl h-10 text-sm" placeholder="모임 검색..." />
        </div>

        <Button className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold h-11 rounded-xl mb-4 shadow-md transition-all" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-5 w-5" /> 모임 만들기
        </Button>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {["전체", "맛집", "운동", "스터디", "취미"].map((cat, i) => (
              <Button key={cat} variant={i === 0 ? "default" : "outline"} className={`rounded-full h-8 text-xs ${i === 0 ? 'bg-[#14B8A6] border-none' : 'text-gray-500'}`}>{cat}</Button>
            ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="space-y-4 pb-20 mt-2">
          {loading ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#7C3AED]"/></div> : 
           meetings.length > 0 ? meetings.map((m) => (
            <div key={m.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <Avatar className="w-8 h-8"><AvatarFallback>{m.author_name?.[0]}</AvatarFallback></Avatar>
                  <span className="text-xs font-bold text-gray-600">{m.author_name}</span>
                </div>
                <Heart className="w-5 h-5 text-gray-300 cursor-pointer hover:text-red-500" />
              </div>
              
              <h3 className="font-bold text-base text-gray-800 mb-1">{m.title}</h3>
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">{m.content}</p>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="secondary" className="bg-purple-50 text-[#7C3AED]">{m.category}</Badge>
                <Badge variant="outline" className="text-gray-500"><User className="w-3 h-3 mr-1"/> {m.current_members?.length}/{m.max_members}</Badge>
              </div>

              <div className="flex justify-between items-end border-t pt-3">
                <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {m.date_time}</div>
                    <div className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {m.location}</div>
                </div>
                <Button size="sm" className="bg-[#7C3AED] h-8 text-xs" onClick={() => handleJoin(m.id)}>참여</Button>
              </div>
            </div>
          )) : <div className="text-center text-gray-400 py-10">생성된 모임이 없습니다.</div>}
        </div>
      </ScrollArea>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>새 모임 만들기</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                  <Input placeholder="모임 제목" value={newMeeting.title} onChange={e=>setNewMeeting({...newMeeting, title: e.target.value})} />
                  <div className="flex gap-2">
                      <Input type="date" value={newMeeting.date} onChange={e=>setNewMeeting({...newMeeting, date: e.target.value})} />
                      <Input type="time" value={newMeeting.time} onChange={e=>setNewMeeting({...newMeeting, time: e.target.value})} />
                  </div>
                  <Input placeholder="장소 (예: 강남역)" value={newMeeting.location} onChange={e=>setNewMeeting({...newMeeting, location: e.target.value})} />
                  <div className="flex gap-2 items-center">
                      <span className="text-sm w-20">최대 인원</span>
                      {/* 🌟 숫자 입력값 받기 */}
                      <Input type="number" min={2} max={20} value={newMeeting.max_members} onChange={e=>setNewMeeting({...newMeeting, max_members: Number(e.target.value)})} />
                  </div>
                  <Textarea placeholder="어떤 모임인가요? 내용을 적어주세요." value={newMeeting.content} onChange={e=>setNewMeeting({...newMeeting, content: e.target.value})} />
              </div>
              <DialogFooter>
                  <Button onClick={handleCreate} className="w-full bg-[#7C3AED]">생성하기</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  )
}