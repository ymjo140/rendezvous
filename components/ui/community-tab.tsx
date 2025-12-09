"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, Heart, MapPin, Calendar, User, Plus, Loader2, Check, Trash2, LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { fetchWithAuth } from "@/lib/api-client"

// 백엔드 URL
const API_URL = "https://wemeet-backend-xqlo.onrender.com";

const CATEGORIES = ["전체", "맛집", "운동", "스터디", "취미", "여행"];

export function CommunityTab() {
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("전체");
  
  // 🌟 내 ID (권한 확인용)
  const [myId, setMyId] = useState<number | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newMeeting, setNewMeeting] = useState({
      title: "", description: "", max_members: "4", location: "", date: "", time: "", category: "맛집"
  })

  // 1. 내 정보 가져오기 (접속한 사람이 누군지 확인)
  useEffect(() => {
      const fetchMyInfo = async () => {
          try {
              const res = await fetchWithAuth("/api/users/me");
              if (res.ok) {
                  const data = await res.json();
                  setMyId(data.id); // 내 ID 저장
              }
          } catch (e) { console.error(e); }
      }
      fetchMyInfo();
  }, []);

  // 2. 모임 리스트 가져오기
  const fetchCommunities = async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth("/api/communities")
      if (res.ok) setMeetings(await res.json())
    } catch (e) { console.error(e) } 
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCommunities() }, [])

  // 캘린더 자동 등록 (헬퍼 함수)
  const addToCalendar = async (title: string, date: string, time: string, location: string) => {
      try {
          const payload = {
              title: `[모임] ${title}`,
              date: date,
              time: time,
              duration: 2,
              location_name: location,
              description: "커뮤니티 모임 자동 등록",
              user_id: 1, purpose: "모임" 
          };
          await fetchWithAuth("/api/events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });
      } catch (e) { console.error("캘린더 등록 실패:", e); }
  };

  // 3. 모임 생성
  const handleCreate = async () => {
      if (!newMeeting.title || !newMeeting.description) { alert("제목과 내용을 입력해주세요."); return; }
      if (!newMeeting.date || !newMeeting.time) { alert("날짜와 시간을 입력해주세요."); return; }
      
      try {
          const payload = {
              title: newMeeting.title,
              description: newMeeting.description,
              max_members: parseInt(newMeeting.max_members, 10),
              location: newMeeting.location,
              date_time: `${newMeeting.date} ${newMeeting.time}`,
              category: newMeeting.category,
              tags: [newMeeting.category] 
          };

          const res = await fetchWithAuth("/api/communities", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });

          if (res.ok) {
              await addToCalendar(newMeeting.title, newMeeting.date, newMeeting.time, newMeeting.location);
              alert("모임이 생성되었습니다!");
              setIsCreateOpen(false);
              fetchCommunities(); 
              setNewMeeting({ title: "", description: "", max_members: "4", location: "", date: "", time: "", category: "맛집" });
          } else {
              const err = await res.json();
              alert(`생성 실패: ${JSON.stringify(err.detail)}`);
          }
      } catch (e) { alert("오류가 발생했습니다."); }
  };

  // 4. 참여하기
  const handleJoin = async (m: any) => {
    if (!confirm(`'${m.title}' 모임에 참여하시겠습니까?`)) return;
    try {
      const res = await fetchWithAuth(`/api/communities/${m.id}/join`, { method: "POST" })
      if (res.ok) { 
          const [datePart, timePart] = m.date_time.split(" ");
          const cleanTime = timePart.length > 5 ? timePart.substring(0, 5) : timePart;
          await addToCalendar(m.title, datePart, cleanTime, m.location);
          alert("참여 완료! 캘린더에 등록되었습니다."); 
          fetchCommunities(); 
      }
      else { alert("참여 실패 (이미 참여했거나 인원 초과)"); }
    } catch (e) { alert("오류 발생"); }
  }

  // 5. 🌟 [삭제 기능] 작성자만 가능
  const handleDelete = async (id: string) => {
      if(!confirm("정말 이 모임을 삭제하시겠습니까? (복구 불가)")) return;
      try {
          const res = await fetchWithAuth(`/api/communities/${id}`, { method: "DELETE" });
          if(res.ok) { 
              alert("삭제되었습니다."); 
              fetchCommunities(); // 목록 새로고침
          }
          else { alert("삭제 실패: 권한이 없거나 오류가 발생했습니다."); }
      } catch(e) { alert("오류 발생"); }
  }

  // 6. 나가기 기능
  const handleLeave = async (id: string) => {
      if(!confirm("모임에서 나가시겠습니까?")) return;
      try {
          const res = await fetchWithAuth(`/api/chat/rooms/${id}/leave`, { method: "POST" });
          if(res.ok) { alert("나갔습니다."); fetchCommunities(); }
          else { alert("나가기 실패"); }
      } catch(e) { alert("오류 발생"); }
  }

  const filteredMeetings = selectedCategory === "전체" 
      ? meetings 
      : meetings.filter(m => m.category === selectedCategory);

  return (
    <div className="flex flex-col h-full bg-slate-50 font-['Pretendard']">
      <div className="bg-white p-4 pb-2 sticky top-0 z-10 shadow-sm">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input className="pl-9 bg-white border-2 border-[#7C3AED]/20 rounded-xl h-10 text-sm" placeholder="관심사, 지역 검색..." />
        </div>

        <Button className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold h-11 rounded-xl mb-4 shadow-md transition-all" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-5 w-5" /> 모임 만들기
        </Button>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {CATEGORIES.map((cat, i) => (
              <Button 
                key={cat} 
                variant={selectedCategory === cat ? "default" : "outline"} 
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full h-8 text-xs px-4 ${selectedCategory === cat ? 'bg-[#14B8A6] hover:bg-[#0D9488] border-none text-white' : 'text-gray-500 bg-white border-gray-200'}`}
              >
                  {cat}
              </Button>
            ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="space-y-4 pb-20 mt-2">
          {loading ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#7C3AED]"/></div> : 
           filteredMeetings.length > 0 ? filteredMeetings.map((m) => {
            // 🌟 권한 체크 (host_id와 내 ID 비교)
            const isAuthor = m.host_id === myId;
            // 참여 여부 확인 (current_members 배열 안에 내 ID가 있는지)
            const isMember = m.current_members?.some((member: any) => member.id === myId);

            return (
                <div key={m.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8"><AvatarFallback className="bg-purple-50 text-[#7C3AED] font-bold">{m.author_name?.[0] || 'U'}</AvatarFallback></Avatar>
                    <span className="text-xs font-bold text-gray-600">{m.author_name || '익명'}</span>
                    </div>
                    <Heart className="w-5 h-5 text-gray-300 cursor-pointer hover:text-red-500" />
                </div>
                
                <h3 className="font-bold text-base text-gray-800 mb-1">{m.title}</h3>
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{m.description}</p>

                <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="secondary" className="bg-purple-50 text-[#7C3AED] border-0">{m.category}</Badge>
                    <Badge variant="outline" className="text-gray-500 bg-gray-50 border-gray-200"><User className="w-3 h-3 mr-1"/> {m.current_members?.length || 0}/{m.max_members}</Badge>
                </div>

                <div className="flex justify-between items-end border-t border-gray-50 pt-3">
                    <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400"/> {m.date_time}</div>
                        <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400"/> {m.location}</div>
                    </div>
                    
                    {/* 🌟 버튼 분기 처리 */}
                    {isAuthor ? (
                        <Button size="sm" variant="destructive" className="h-8 text-xs font-bold px-3 rounded-lg shadow-sm bg-red-500 hover:bg-red-600 text-white" onClick={() => handleDelete(m.id)}>
                            <Trash2 className="w-3 h-3 mr-1"/> 삭제
                        </Button>
                    ) : isMember ? (
                        <Button size="sm" variant="outline" className="h-8 text-xs font-bold px-3 rounded-lg shadow-sm border-red-200 text-red-500 hover:bg-red-50" onClick={() => handleLeave(m.id)}>
                            <LogOut className="w-3 h-3 mr-1"/> 나가기
                        </Button>
                    ) : (
                        <Button size="sm" className="bg-[#7C3AED] h-8 text-xs font-bold px-4 rounded-lg shadow-sm hover:bg-[#6D28D9]" onClick={() => handleJoin(m)}>
                            참여
                        </Button>
                    )}
                </div>
                </div>
            )
           }) : (
            <div className="text-center text-gray-400 py-20 flex flex-col items-center">
                <div className="text-4xl mb-2">📭</div>
                <div>해당 카테고리의 모임이 없습니다.</div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader><DialogTitle>새 모임 만들기</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 ml-1">카테고리</label>
                      <div className="flex flex-wrap gap-2">
                          {CATEGORIES.filter(c => c !== "전체").map(cat => (
                              <Badge key={cat} onClick={() => setNewMeeting({...newMeeting, category: cat})} className={`cursor-pointer px-3 py-1.5 rounded-full text-xs transition-all ${newMeeting.category === cat ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`} variant="outline">
                                  {newMeeting.category === cat && <Check className="w-3 h-3 mr-1" />}
                                  {cat}
                              </Badge>
                          ))}
                      </div>
                  </div>
                  <Input placeholder="모임 제목" value={newMeeting.title} onChange={e=>setNewMeeting({...newMeeting, title: e.target.value})} className="h-11 bg-gray-50 border-gray-200" />
                  <div className="flex gap-2">
                      <Input type="date" className="bg-gray-50 border-gray-200" value={newMeeting.date} onChange={e=>setNewMeeting({...newMeeting, date: e.target.value})} />
                      <Input type="time" className="bg-gray-50 border-gray-200" value={newMeeting.time} onChange={e=>setNewMeeting({...newMeeting, time: e.target.value})} />
                  </div>
                  <Input placeholder="장소 (예: 강남역 10번 출구)" value={newMeeting.location} onChange={e=>setNewMeeting({...newMeeting, location: e.target.value})} className="h-11 bg-gray-50 border-gray-200" />
                  <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <span className="text-sm font-bold text-gray-600 w-20">최대 인원</span>
                      <Input type="number" min={2} max={20} className="bg-white border-gray-200 h-8 w-20 text-center" value={newMeeting.max_members} onChange={e=>setNewMeeting({...newMeeting, max_members: e.target.value})} />
                      <span className="text-sm text-gray-400">명</span>
                  </div>
                  <Textarea placeholder="어떤 모임인가요? 내용을 자세히 적어주세요." className="bg-gray-50 border-gray-200 resize-none h-24" value={newMeeting.description} onChange={e=>setNewMeeting({...newMeeting, description: e.target.value})} />
              </div>
              <DialogFooter><Button onClick={handleCreate} className="w-full bg-[#7C3AED] h-12 rounded-xl text-base font-bold shadow-md hover:bg-[#6D28D9]">모임 만들고 일정에 추가하기</Button></DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  )
}