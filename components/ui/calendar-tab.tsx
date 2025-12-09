"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input" 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { MoreHorizontal, Plus, ChevronLeft, ChevronRight, MapPin, Clock } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

// 백엔드 URL
const API_URL = "https://wemeet-backend-xqlo.onrender.com";

export function CalendarTab() {
    const [date, setDate] = useState<Date>(new Date())
    const [events, setEvents] = useState<any[]>([])
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    // 🌟 duration 복구 (초기값 문자열 '2')
    const [newEvent, setNewEvent] = useState({ title: "", location: "", time: "12:00", duration: "2" })

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

    const handleCreateEvent = async () => {
        if(!newEvent.title) return alert("일정 제목을 입력하세요.");
        
        try {
            const token = localStorage.getItem("token");
            const dateStr = selectedDate.toISOString().split('T')[0];
            
            // 🌟 [핵심 수정] 422 에러 해결: 누락된 user_id, purpose 추가
            const payload = {
                title: newEvent.title,
                date: dateStr,
                time: newEvent.time,
                duration: Number(newEvent.duration),
                location_name: newEvent.location,
                description: "개인 일정",
                // 🚨 백엔드 스키마가 요구하는 필수값 강제 주입
                user_id: 1, // 백엔드 Pydantic 통과용 더미 값 (실제론 토큰 사용됨)
                purpose: "개인" // 필수 필드 누락 방지
            };

            const res = await fetch(`${API_URL}/api/events`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    ...(token && { "Authorization": `Bearer ${token}` })
                },
                body: JSON.stringify(payload)
            });

            if(res.ok) {
                alert("일정이 등록되었습니다.");
                setIsCreateOpen(false);
                loadEvents();
                setNewEvent({ title: "", location: "", time: "12:00", duration: "2" });
            } else {
                const err = await res.json();
                console.error("등록 실패 상세:", err);
                const msg = err.detail ? JSON.stringify(err.detail) : "입력값을 확인해주세요";
                alert(`등록 실패: ${msg}`);
            }
        } catch(e) { alert("등록 중 오류 발생"); }
    }

    // 날짜 계산 로직
    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(year, month, 1)
        const days = []
        while (date.getMonth() === month) { days.push(new Date(date)); date.setDate(date.getDate() + 1); }
        return days
    }
    const currentYear = date.getFullYear()
    const currentMonth = date.getMonth()
    const days = getDaysInMonth(currentYear, currentMonth)
    const padding = Array(days[0].getDay()).fill(null)

    const eventsOnDate = (d: Date) => {
        const dateStr = d.toISOString().split('T')[0]
        return events.filter(e => e.date === dateStr)
    }
    const selectedEvents = eventsOnDate(selectedDate)

    return (
        <div className="flex flex-col h-full bg-[#F3F4F6] font-['Pretendard']">
            <div className="p-5 pb-2 bg-white sticky top-0 z-10 shadow-sm">
                <h1 className="text-xl font-bold">내 일정</h1>
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
                                const isSelected = d.toDateString() === selectedDate.toDateString();
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
                                <div key={ev.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative">
                                    <div className="flex justify-between mb-2">
                                        <div className="font-bold text-sm text-gray-800">{ev.title}</div>
                                        <MoreHorizontal className="w-4 h-4 text-gray-400" />
                                    </div>
                                    <div className="text-xs text-gray-500 space-y-1">
                                        <div className="flex items-center gap-1"><Clock className="w-3 h-3"/> {ev.time} ({ev.duration}시간)</div>
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

            {/* 플로팅 생성 버튼 */}
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
                        <div className="text-sm font-bold text-[#7C3AED] text-center">
                            {selectedDate.getFullYear()}. {selectedDate.getMonth()+1}. {selectedDate.getDate()}
                        </div>
                        <Input placeholder="일정 제목 (예: 팀 회식)" value={newEvent.title} onChange={e=>setNewEvent({...newEvent, title: e.target.value})} />
                        
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 mb-1 block">시작 시간</label>
                                <Input type="time" value={newEvent.time} onChange={e=>setNewEvent({...newEvent, time: e.target.value})} />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 mb-1 block">소요 시간(시간)</label>
                                {/* 🌟 복구된 소요 시간 입력창 */}
                                <Input 
                                    type="number" 
                                    min={1} 
                                    max={24} 
                                    value={newEvent.duration} 
                                    onChange={e=>setNewEvent({...newEvent, duration: e.target.value})} 
                                />
                            </div>
                        </div>

                        <Input placeholder="장소" value={newEvent.location} onChange={e=>setNewEvent({...newEvent, location: e.target.value})} />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreateEvent} className="w-full bg-[#14B8A6]">등록하기</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}