"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input" 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { MoreHorizontal, Plus, ChevronLeft, ChevronRight, MapPin, Clock, Trash2, Link as LinkIcon, RefreshCw } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

const API_URL = "https://wemeet-backend-xqlo.onrender.com";

export function CalendarTab() {
    const [date, setDate] = useState<Date>(new Date())
    const [events, setEvents] = useState<any[]>([])
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    
    // 모달 상태들
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isSyncOpen, setIsSyncOpen] = useState(false) // 🌟 연동 모달
    const [syncLoading, setSyncLoading] = useState(false)

    // 입력값들
    const [newEvent, setNewEvent] = useState({ title: "", location: "", time: "12:00", duration: "2" })
    const [syncUrl, setSyncUrl] = useState("") 
    const [syncSource, setSyncSource] = useState("에브리타임") // "구글" or "에브리타임"

    // 날짜 포맷 함수
    const formatDateLocal = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const loadEvents = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/api/events`, {
                headers: token ? { "Authorization": `Bearer ${token}` } : {}
            })
            if (res.ok) setEvents(await res.json())
        } catch(e) { console.error(e) }
    }

    useEffect(() => { loadEvents() }, [])

    // 🌟 캘린더 연동 핸들러
    const handleSync = async () => {
        if (!syncUrl.includes("http")) { alert("올바른 URL을 입력해주세요."); return; }
        
        setSyncLoading(true);
        try {
            const res = await fetchWithAuth("/api/sync/ical", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: syncUrl, source_name: syncSource })
            });

            if (res.ok) {
                const data = await res.json();
                alert(data.message); // "00개의 일정을 불러왔습니다!"
                setIsSyncOpen(false);
                setSyncUrl("");
                loadEvents(); // 캘린더 새로고침
            } else {
                alert("연동 실패: URL을 다시 확인해주세요.");
            }
        } catch (e) { alert("서버 오류 발생"); }
        finally { setSyncLoading(false); }
    }

    const handleDeleteEvent = async (eventId: number) => {
        if (!confirm("정말 이 일정을 삭제하시겠습니까?")) return;
        try {
            const res = await fetchWithAuth(`/api/events/${eventId}`, { method: "DELETE" });
            if (res.ok) setEvents(prev => prev.filter(e => e.id !== eventId));
            else alert("삭제 실패");
        } catch (e) { alert("삭제 중 오류 발생"); }
    };

    const handleCreateEvent = async () => {
        if(!newEvent.title) return alert("일정 제목을 입력하세요.");
        try {
            const dateStr = formatDateLocal(selectedDate);
            const payload = {
                title: newEvent.title,
                date: dateStr,
                time: newEvent.time,
                duration: Number(newEvent.duration),
                location_name: newEvent.location,
                description: "개인 일정",
                user_id: 1, purpose: "개인" 
            };
            const res = await fetchWithAuth("/api/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if(res.ok) {
                alert("일정이 등록되었습니다.");
                setIsCreateOpen(false);
                loadEvents();
                setNewEvent({ title: "", location: "", time: "12:00", duration: "2" });
            } else { alert("등록 실패"); }
        } catch(e) { alert("등록 중 오류 발생"); }
    }

    // 날짜 계산
    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(year, month, 1); const days = [];
        while (date.getMonth() === month) { days.push(new Date(date)); date.setDate(date.getDate() + 1); }
        return days;
    }
    const currentYear = date.getFullYear(); const currentMonth = date.getMonth();
    const days = getDaysInMonth(currentYear, currentMonth);
    const padding = Array(days[0].getDay()).fill(null);
    const eventsOnDate = (d: Date) => { const dateStr = formatDateLocal(d); return events.filter(e => e.date === dateStr); }
    const selectedEvents = eventsOnDate(selectedDate);

    return (
        <div className="flex flex-col h-full bg-[#F3F4F6] font-['Pretendard']">
            <div className="p-5 pb-2 bg-white sticky top-0 z-10 shadow-sm flex justify-between items-center">
                <h1 className="text-xl font-bold">내 일정</h1>
                {/* 🌟 연동 버튼 추가 */}
                <Button variant="outline" size="sm" onClick={() => setIsSyncOpen(true)} className="h-8 text-xs gap-1 border-purple-200 text-purple-600 bg-purple-50">
                    <RefreshCw className="w-3 h-3"/> 외부 일정 가져오기
                </Button>
            </div>

            <ScrollArea className="flex-1 px-5 pb-4">
                <div className="space-y-6 pb-24 mt-4">
                    {/* 달력 위젯 */}
                    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={() => setDate(new Date(currentYear, currentMonth - 1, 1))}><ChevronLeft className="w-5 h-5"/></Button>
                                <span className="text-lg font-bold">{currentYear}. {currentMonth + 1}.</span>
                                <Button variant="ghost" size="icon" onClick={() => setDate(new Date(currentYear, currentMonth + 1, 1))}><ChevronRight className="w-5 h-5"/></Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-400 mb-2">
                            {['일','월','화','수','목','금','토'].map(d => <div key={d}>{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-y-4 text-center text-sm font-medium text-gray-700">
                            {padding.map((_, i) => <div key={`pad-${i}`} />)}
                            {days.map((d, i) => {
                                const hasEvent = eventsOnDate(d).length > 0;
                                const isSelected = formatDateLocal(d) === formatDateLocal(selectedDate);
                                return (
                                    <div key={i} onClick={() => setSelectedDate(d)} className={`relative w-8 h-8 flex items-center justify-center mx-auto cursor-pointer rounded-full ${isSelected ? 'bg-[#7C3AED] text-white' : ''}`}>
                                        {d.getDate()}
                                        {hasEvent && !isSelected && <span className="absolute bottom-1 w-1 h-1 bg-[#14B8A6] rounded-full"></span>}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* 일정 목록 */}
                    <div>
                        <h3 className="font-bold text-gray-800 text-sm mb-3">
                            {selectedDate.getMonth()+1}월 {selectedDate.getDate()}일의 일정
                        </h3>
                        <div className="space-y-3">
                            {selectedEvents.length > 0 ? selectedEvents.map((ev: any) => (
                                <div key={ev.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative group">
                                    <div className="flex justify-between mb-2">
                                        <div className="font-bold text-sm text-gray-800">{ev.title}</div>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="text-xs text-gray-500 space-y-1">
                                        <div className="flex items-center gap-1"><Clock className="w-3 h-3"/> {ev.time} ({ev.duration_hours || ev.duration}시간)</div>
                                        <div className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {ev.location_name || "장소 미정"}</div>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center text-gray-400 text-xs py-6 bg-white rounded-2xl border border-dashed">
                                    등록된 일정이 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </ScrollArea>

            <div className="absolute bottom-24 right-5">
                <Button className="rounded-full h-14 w-14 bg-[#14B8A6] hover:bg-[#0D9488] text-white shadow-lg flex items-center justify-center p-0" onClick={() => setIsCreateOpen(true)}>
                    <Plus className="w-7 h-7" />
                </Button>
            </div>

            {/* 🌟 일정 생성 모달 */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader><DialogTitle>새 일정 추가</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                        <Input placeholder="일정 제목" value={newEvent.title} onChange={e=>setNewEvent({...newEvent, title: e.target.value})} />
                        <div className="flex gap-2">
                            <Input type="time" className="flex-1" value={newEvent.time} onChange={e=>setNewEvent({...newEvent, time: e.target.value})} />
                            <Input type="number" className="flex-1" placeholder="시간" value={newEvent.duration} onChange={e=>setNewEvent({...newEvent, duration: e.target.value})} />
                        </div>
                        <Input placeholder="장소" value={newEvent.location} onChange={e=>setNewEvent({...newEvent, location: e.target.value})} />
                    </div>
                    <DialogFooter><Button onClick={handleCreateEvent} className="w-full bg-[#14B8A6]">등록하기</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 🌟 캘린더 연동 모달 */}
            <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>외부 캘린더 가져오기</DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">
                            에브리타임이나 구글 캘린더의 'URL 내보내기' 주소를 입력하세요.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex gap-2 mb-2">
                        {["에브리타임", "구글"].map(src => (
                            <Button key={src} size="sm" variant={syncSource === src ? "default" : "outline"} onClick={() => setSyncSource(src)} className={`flex-1 text-xs ${syncSource === src ? "bg-[#7C3AED]" : ""}`}>
                                {src}
                            </Button>
                        ))}
                    </div>

                    <div className="space-y-3 bg-gray-50 p-4 rounded-xl mb-2">
                        <div className="text-xs text-gray-600 font-medium">
                            📌 <strong>URL 확인 방법</strong>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                            {syncSource === "에브리타임" 
                                ? "에브리타임 앱 > 시간표 > 설정(⚙️) > 'URL로 내보내기' > 주소 복사"
                                : "구글 캘린더 설정 > 내 캘린더 > 캘린더 통합 > 'iCal 형식의 비공개 주소' 복사"}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-gray-400" />
                        <Input placeholder="https://..." value={syncUrl} onChange={e=>setSyncUrl(e.target.value)} className="text-sm h-10" />
                    </div>

                    <DialogFooter>
                        <Button onClick={handleSync} disabled={syncLoading} className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]">
                            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : "일정 불러오기"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}