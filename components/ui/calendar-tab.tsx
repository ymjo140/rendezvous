"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input" 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { MoreHorizontal, Plus, ChevronLeft, ChevronRight, MapPin, Clock, Trash2, Link as LinkIcon, RefreshCw, Calendar as CalendarIcon, ArrowLeft } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

const API_URL = "https://wemeet-backend-xqlo.onrender.com";

export function CalendarTab() {
    // 뷰 모드 상태 ('month' | 'week')
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    
    const [date, setDate] = useState<Date>(new Date()) // 현재 보고 있는 기준 날짜
    const [events, setEvents] = useState<any[]>([])
    const [selectedDate, setSelectedDate] = useState<Date>(new Date()) // 선택된 날짜
    
    // 모달 상태들
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isSyncOpen, setIsSyncOpen] = useState(false)
    const [syncLoading, setSyncLoading] = useState(false)

    // 입력값들
    const [newEvent, setNewEvent] = useState({ title: "", location: "", time: "12:00", duration: "2" })
    const [syncUrl, setSyncUrl] = useState("") 
    const [syncSource, setSyncSource] = useState("에브리타임")

    // 날짜 포맷 함수 (로컬 시간 기준 YYYY-MM-DD)
    const formatDateLocal = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const loadEvents = async () => {
        try {
            const res = await fetchWithAuth("/api/events")
            if (res.ok) setEvents(await res.json())
        } catch(e) { console.error(e) }
    }

    useEffect(() => { loadEvents() }, [])

    // 캘린더 연동 핸들러
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
                alert(data.message);
                setIsSyncOpen(false); setSyncUrl(""); loadEvents();
            } else { alert("연동 실패: URL을 다시 확인해주세요."); }
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
                setIsCreateOpen(false); loadEvents();
                setNewEvent({ title: "", location: "", time: "12:00", duration: "2" });
            } else { alert("등록 실패"); }
        } catch(e) { alert("등록 중 오류 발생"); }
    }

    // --- 월간 뷰 로직 ---
    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(year, month, 1); const days = [];
        while (date.getMonth() === month) { days.push(new Date(date)); date.setDate(date.getDate() + 1); }
        return days;
    }
    const currentYear = date.getFullYear(); const currentMonth = date.getMonth();
    const days = getDaysInMonth(currentYear, currentMonth);
    const padding = Array(days[0].getDay()).fill(null);
    const eventsOnDate = (d: Date) => { const dateStr = formatDateLocal(d); return events.filter(e => e.date === dateStr); }
    
    // 날짜 클릭 시 주간 뷰로 전환
    const handleDateClick = (d: Date) => {
        setSelectedDate(d);
        setDate(d); // 기준 날짜도 이동
        setViewMode('week'); // 🌟 주간 뷰로 자동 전환
    };

    // --- 주간 뷰 로직 ---
    const getWeekDates = (baseDate: Date) => {
        const current = new Date(baseDate);
        const day = current.getDay(); // 0(일) ~ 6(토)
        const diff = current.getDate() - day + (day === 0 ? -6 : 1); // 월요일 기준
        const monday = new Date(current.setDate(diff));
        
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const nextDay = new Date(monday);
            nextDay.setDate(monday.getDate() + i);
            weekDates.push(nextDay);
        }
        return weekDates;
    };
    const weekDates = getWeekDates(date);
    const HOURS = Array.from({ length: 17 }, (_, i) => i + 8); // 8시 ~ 24시

    return (
        <div className="flex flex-col h-full bg-[#F3F4F6] font-['Pretendard']">
            {/* 상단 헤더 */}
            <div className="p-5 pb-2 bg-white sticky top-0 z-10 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-2">
                    {viewMode === 'week' && (
                        <Button variant="ghost" size="icon" onClick={() => setViewMode('month')} className="-ml-2">
                            <ArrowLeft className="w-5 h-5"/>
                        </Button>
                    )}
                    <h1 className="text-xl font-bold">{viewMode === 'month' ? '내 일정' : '이번 주 일정'}</h1>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsSyncOpen(true)} className="h-8 text-xs gap-1 border-purple-200 text-purple-600 bg-purple-50">
                    <RefreshCw className="w-3 h-3"/> 외부 일정
                </Button>
            </div>

            <ScrollArea className="flex-1 px-5 pb-4">
                {/* 🌟 [월간 뷰] 🌟 */}
                {viewMode === 'month' && (
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
                                        <div key={i} onClick={() => handleDateClick(d)} className={`relative w-8 h-8 flex items-center justify-center mx-auto cursor-pointer rounded-full ${isSelected ? 'bg-[#7C3AED] text-white' : 'hover:bg-gray-100'}`}>
                                            {d.getDate()}
                                            {hasEvent && !isSelected && <span className="absolute bottom-1 w-1 h-1 bg-[#14B8A6] rounded-full"></span>}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* 선택된 날짜 일정 목록 */}
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm mb-3">
                                {selectedDate.getMonth()+1}월 {selectedDate.getDate()}일의 일정
                            </h3>
                            <div className="space-y-3">
                                {eventsOnDate(selectedDate).length > 0 ? eventsOnDate(selectedDate).map((ev: any) => (
                                    <div key={ev.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative group flex justify-between items-center">
                                        <div>
                                            <div className="font-bold text-sm text-gray-800 mb-1">{ev.title}</div>
                                            <div className="text-xs text-gray-500 flex gap-2">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {ev.time} ({ev.duration_hours || ev.duration}h)</span>
                                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {ev.location_name || "미정"}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="text-gray-300 hover:text-red-500 p-2">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )) : (
                                    <div className="text-center text-gray-400 text-xs py-6 bg-white rounded-2xl border border-dashed">
                                        일정이 없습니다.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 🌟 [주간 뷰 - 시간표] 🌟 */}
                {viewMode === 'week' && (
                    <div className="mt-4 pb-24 relative overflow-x-auto">
                        <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-2xl shadow-sm">
                            <Button variant="ghost" size="icon" onClick={() => setDate(new Date(date.setDate(date.getDate() - 7)))}><ChevronLeft className="w-5 h-5"/></Button>
                            <div className="text-sm font-bold text-center">
                                {weekDates[0].getMonth()+1}.{weekDates[0].getDate()} - {weekDates[6].getMonth()+1}.{weekDates[6].getDate()}
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setDate(new Date(date.setDate(date.getDate() + 7)))}><ChevronRight className="w-5 h-5"/></Button>
                        </div>

                        {/* 시간표 그리드 */}
                        <div className="relative bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ minWidth: "100%" }}>
                            {/* 요일 헤더 */}
                            <div className="grid grid-cols-8 border-b border-gray-100 bg-gray-50">
                                <div className="p-2 text-[10px] text-gray-400 text-center border-r border-gray-100">Time</div>
                                {weekDates.map((d, i) => (
                                    <div key={i} className={`p-2 text-center border-r border-gray-100 ${formatDateLocal(d) === formatDateLocal(new Date()) ? 'bg-purple-50 text-[#7C3AED] font-bold' : ''}`}>
                                        <div className="text-[10px] text-gray-500">{['월','화','수','목','금','토','일'][d.getDay() === 0 ? 6 : d.getDay()-1]}</div>
                                        <div className="text-xs font-bold">{d.getDate()}</div>
                                    </div>
                                ))}
                            </div>

                            {/* 시간 슬롯 */}
                            <div className="relative">
                                {HOURS.map(hour => (
                                    <div key={hour} className="grid grid-cols-8 h-12 border-b border-gray-50">
                                        <div className="text-[10px] text-gray-400 text-right pr-2 pt-1 border-r border-gray-100">{hour}:00</div>
                                        {[...Array(7)].map((_, i) => <div key={i} className="border-r border-gray-50"></div>)}
                                    </div>
                                ))}

                                {/* 일정 블록 렌더링 */}
                                {weekDates.map((dayDate, dayIdx) => {
                                    const dayEvents = eventsOnDate(dayDate);
                                    return dayEvents.map((ev: any) => {
                                        const [h, m] = ev.time.split(":").map(Number);
                                        if (h < 8) return null; // 8시 이전은 생략
                                        const top = (h - 8) * 48 + (m / 60) * 48; // 1시간 = 48px
                                        const height = (ev.duration_hours || ev.duration || 1) * 48;
                                        
                                        // 색상 결정 (수업 vs 개인)
                                        const bgColor = ev.title.includes("[수업]") ? "bg-orange-100 border-orange-200 text-orange-800" : "bg-purple-100 border-purple-200 text-purple-800";

                                        return (
                                            <div 
                                                key={ev.id}
                                                className={`absolute rounded-md border p-1 text-[9px] font-bold leading-tight overflow-hidden ${bgColor} shadow-sm z-10`}
                                                style={{
                                                    top: `${top}px`,
                                                    left: `${(dayIdx + 1) * 12.5}%`, // 100% / 8칸 = 12.5%
                                                    width: "12%",
                                                    height: `${height}px`
                                                }}
                                                onClick={() => { if(confirm("삭제하시겠습니까?")) handleDeleteEvent(ev.id); }}
                                            >
                                                {ev.title}
                                            </div>
                                        )
                                    });
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </ScrollArea>

            {/* 플로팅 생성 버튼 */}
            <div className="absolute bottom-24 right-5">
                <Button className="rounded-full h-14 w-14 bg-[#14B8A6] hover:bg-[#0D9488] text-white shadow-lg flex items-center justify-center p-0" onClick={() => setIsCreateOpen(true)}>
                    <Plus className="w-7 h-7" />
                </Button>
            </div>

            {/* 일정 생성 모달 (기존 동일) */}
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

            {/* 연동 모달 (기존 동일) */}
            <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>외부 캘린더 가져오기</DialogTitle>
                        <DialogDescription className="text-xs text-gray-500">에브리타임, 구글 캘린더 URL 입력</DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-2 mb-2">
                        {["에브리타임", "구글"].map(src => (
                            <Button key={src} size="sm" variant={syncSource === src ? "default" : "outline"} onClick={() => setSyncSource(src)} className={`flex-1 text-xs ${syncSource === src ? "bg-[#7C3AED]" : ""}`}>{src}</Button>
                        ))}
                    </div>
                    <Input placeholder="https://..." value={syncUrl} onChange={e=>setSyncUrl(e.target.value)} className="text-sm h-10" />
                    <DialogFooter>
                        <Button onClick={handleSync} disabled={syncLoading} className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]">
                            {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : "불러오기"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}