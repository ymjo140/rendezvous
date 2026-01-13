"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input" 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { MoreHorizontal, Plus, ChevronLeft, ChevronRight, MapPin, Clock, Trash2, Link as LinkIcon, RefreshCw, ArrowLeft, Loader2 } from "lucide-react"

// ✅ [수정] 파일 내부에 직접 URL과 인증 함수를 선언 (import 의존성 제거)
const API_URL = "https://wemeet-backend-xqlo.onrender.com";

const fetchWithAuth = async (endpoint: string, options: any = {}) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    const url = `${API_URL}${endpoint}`;
    
    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
    };

    console.log(`📡 Calendar 요청: ${url}`);
    return fetch(url, { ...options, headers });
};

export function CalendarTab() {
    const router = useRouter();
    const [isGuest, setIsGuest] = useState(false);
    
    // 🌟 [추가] 로그인한 유저의 진짜 ID를 담을 상태
    const [myId, setMyId] = useState<number | null>(null);

    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [date, setDate] = useState<Date>(new Date())
    const [events, setEvents] = useState<any[]>([])
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isSyncOpen, setIsSyncOpen] = useState(false)
    const [syncLoading, setSyncLoading] = useState(false)
    const [isAutoSyncing, setIsAutoSyncing] = useState(false)

    const [newEvent, setNewEvent] = useState({
        title: "",
        date: new Date().toISOString().split('T')[0], 
        time: "12:00",
        duration: "60", 
        location: ""
    })

    const [syncUrl, setSyncUrl] = useState("") 
    const [syncSource, setSyncSource] = useState("에브리타임")

    const formatDateLocal = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // 🌟 [추가] 내 정보(ID) 가져오기
    const fetchMyInfo = async () => {
        try {
            const res = await fetchWithAuth("/api/users/me");
            if (res.ok) {
                const data = await res.json();
                setMyId(data.id); // 내 진짜 ID 저장
                console.log("✅ 로그인된 유저 ID:", data.id);
            }
        } catch (e) { console.error("유저 정보 로드 실패", e); }
    };

    const loadEvents = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) { setIsGuest(true); return; }

            const res = await fetchWithAuth("/api/events")
            if (res.ok) {
                const data = await res.json();
                const formattedEvents = data.map((e: any) => {
                    const dateStr = e.date ? e.date : ""; 
                    const timeStr = e.time ? e.time : "00:00";
                    return {
                        ...e,
                        date: dateStr, 
                        time: timeStr,
                        dateObj: new Date(`${dateStr}T${timeStr}:00`)
                    };
                });
                setEvents(formattedEvents);
            }
            else if (res.status === 401) setIsGuest(true);
        } catch(e) { console.error(e) }
    }

    // 자동 동기화 로직
    const autoSync = async (url: string, source: string) => {
        setIsAutoSyncing(true);
        try {
            const res = await fetchWithAuth("/api/sync/ical", {
                method: "POST",
                body: JSON.stringify({ url: url, source_name: source })
            });
            if (res.ok) loadEvents();
        } catch (e) { console.error(e); } 
        finally { setIsAutoSyncing(false); }
    };

    useEffect(() => {
        const token = localStorage.getItem("token");
        if(token) {
            fetchMyInfo(); // 🌟 컴포넌트 켜질 때 내 정보 먼저 가져옴
            loadEvents();
            const savedUrl = localStorage.getItem("calendar_sync_url");
            const savedSource = localStorage.getItem("calendar_sync_source");
            if (savedUrl && savedSource) autoSync(savedUrl, savedSource);
        } else {
            setIsGuest(true);
        }
    }, [])

    const handleSync = async () => {
        if (!syncUrl.includes("http")) { alert("올바른 URL을 입력해주세요."); return; }
        setSyncLoading(true);
        try {
            const res = await fetchWithAuth("/api/sync/ical", {
                method: "POST",
                body: JSON.stringify({ url: syncUrl, source_name: syncSource })
            });
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem("calendar_sync_url", syncUrl);
                localStorage.setItem("calendar_sync_source", syncSource);
                alert(`${data.message}\n(자동 동기화가 활성화되었습니다)`);
                setIsSyncOpen(false); setSyncUrl(""); loadEvents();
            } else { alert("연동 실패: URL을 확인해주세요."); }
        } catch (e) { alert("오류 발생"); }
        finally { setSyncLoading(false); }
    }

    const handleUnlink = () => {
        if(confirm("자동 동기화를 해제하시겠습니까?")) {
            localStorage.removeItem("calendar_sync_url");
            localStorage.removeItem("calendar_sync_source");
            setSyncUrl("");
            alert("해제되었습니다.");
            setIsSyncOpen(false);
        }
    }

    const handleDeleteEvent = async (eventId: number) => {
        if (!confirm("정말 이 일정을 삭제하시겠습니까?")) return;
        try {
            const res = await fetchWithAuth(`/api/events/${eventId}`, { method: "DELETE" });
            if (res.ok) setEvents(prev => prev.filter(e => e.id !== eventId));
            else alert("삭제 실패");
        } catch (e) { alert("오류 발생"); }
    };

    // 🌟 [수정] 일정 생성 시 '진짜 내 ID'를 함께 전송
    const handleCreateEvent = async () => {
        if(!newEvent.title || !newEvent.date || !newEvent.time) return alert("일정 제목, 날짜, 시간을 모두 입력하세요.");
        if(!myId) return alert("유저 정보를 불러오지 못했습니다. 다시 로그인해주세요.");

        try {
            const payload = {
                id: crypto.randomUUID(), 
                user_id: myId, // 👈 여기가 핵심! (1이나 null이 아니라 진짜 내 ID)
                title: newEvent.title,
                date: newEvent.date,          
                time: newEvent.time,          
                duration_hours: Number(newEvent.duration) / 60, 
                location_name: newEvent.location, 
                purpose: "개인",
                is_private: true
            };

            console.log("전송 데이터:", payload);

            const res = await fetchWithAuth("/api/events", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            if(res.ok) {
                alert("일정이 등록되었습니다.");
                setIsCreateOpen(false); 
                loadEvents();
                setNewEvent({ title: "", date: new Date().toISOString().split('T')[0], time: "12:00", duration: "60", location: "" });
            } else { 
                const err = await res.json();
                alert(`등록 실패: ${err.message || "서버 오류"}`); 
            }
        } catch(e) { 
            console.error(e);
            alert("오류 발생"); 
        }
    }

    // --- 달력 계산 (기존 동일) ---
    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(year, month, 1); const days = [];
        while (date.getMonth() === month) { days.push(new Date(date)); date.setDate(date.getDate() + 1); }
        return days;
    }
    const currentYear = date.getFullYear(); const currentMonth = date.getMonth();
    const days = getDaysInMonth(currentYear, currentMonth);
    const padding = Array(days[0].getDay()).fill(null);
    const eventsOnDate = (d: Date) => { 
        const dateStr = formatDateLocal(d); 
        return events.filter(e => e.date === dateStr); 
    }
    const handleDateClick = (d: Date) => { 
        setSelectedDate(d); setDate(d); 
        setNewEvent(prev => ({...prev, date: formatDateLocal(d)}));
    };

    const getWeekDates = (baseDate: Date) => {
        const current = new Date(baseDate);
        const day = current.getDay(); 
        const diff = current.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(current.setDate(diff));
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const nextDay = new Date(monday); nextDay.setDate(monday.getDate() + i); weekDates.push(nextDay);
        }
        return weekDates;
    };
    const weekDates = getWeekDates(date);
    const HOURS = Array.from({ length: 17 }, (_, i) => i + 8); 

    if (isGuest) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 space-y-6 bg-[#F3F4F6] font-['Pretendard']">
                <div className="text-center space-y-3">
                    <div className="text-6xl mb-4">🔒</div>
                    <h2 className="text-2xl font-bold text-gray-800">로그인이 필요해요</h2>
                    <p className="text-gray-500 leading-relaxed">나만의 일정을 관리하고<br/>친구들과 약속을 잡아보세요.</p>
                </div>
                <Button className="w-full max-w-xs h-12 rounded-xl bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold text-base shadow-sm" onClick={() => router.push("/login")}>
                    카카오로 3초만에 시작하기
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#F3F4F6] font-['Pretendard']">
            <div className="p-5 pb-2 bg-white sticky top-0 z-10 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-2">
                    {viewMode === 'week' && (
                        <Button variant="ghost" size="icon" onClick={() => setViewMode('month')} className="-ml-2"><ArrowLeft className="w-5 h-5"/></Button>
                    )}
                    <h1 className="text-xl font-bold">{viewMode === 'month' ? '내 일정' : '이번 주'}</h1>
                    {isAutoSyncing && (<span className="text-[10px] text-[#7C3AED] bg-purple-50 px-2 py-1 rounded-full animate-pulse flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> 동기화 중...</span>)}
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsSyncOpen(true)} className="h-8 text-xs gap-1 border-purple-200 text-purple-600 bg-purple-50"><RefreshCw className="w-3 h-3"/> 외부 일정</Button>
            </div>

            <ScrollArea className="flex-1 px-5 pb-4">
                {viewMode === 'month' && (
                    <div className="space-y-6 pb-24 mt-4">
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
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm mb-3">{selectedDate.getMonth()+1}월 {selectedDate.getDate()}일의 일정</h3>
                            <div className="space-y-3">
                                {eventsOnDate(selectedDate).length > 0 ? eventsOnDate(selectedDate).map((ev: any) => (
                                    <div key={ev.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative group flex justify-between items-center">
                                        <div>
                                            <div className="font-bold text-sm text-gray-800 mb-1">{ev.title}</div>
                                            <div className="text-xs text-gray-500 flex gap-2">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {ev.time}</span>
                                                {ev.location_name && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {ev.location_name}</span>}
                                            </div>
                                        </div>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="text-gray-300 hover:text-red-500 p-2"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                )) : <div className="text-center text-gray-400 text-xs py-6 bg-white rounded-2xl border border-dashed">일정이 없습니다.</div>}
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'week' && (
                    <div className="mt-4 pb-24 relative overflow-x-auto">
                        <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-2xl shadow-sm">
                            <Button variant="ghost" size="icon" onClick={() => setDate(new Date(date.setDate(date.getDate() - 7)))}><ChevronLeft className="w-5 h-5"/></Button>
                            <div className="text-sm font-bold text-center">{weekDates[0].getMonth()+1}.{weekDates[0].getDate()} - {weekDates[6].getMonth()+1}.{weekDates[6].getDate()}</div>
                            <Button variant="ghost" size="icon" onClick={() => setDate(new Date(date.setDate(date.getDate() + 7)))}><ChevronRight className="w-5 h-5"/></Button>
                        </div>
                        {/* (주간 그리드 UI는 생략 - 위와 동일) */}
                    </div>
                )}
            </ScrollArea>

            <div className="absolute bottom-24 right-5"><Button className="rounded-full h-14 w-14 bg-[#14B8A6] hover:bg-[#0D9488] text-white shadow-lg flex items-center justify-center p-0" onClick={() => setIsCreateOpen(true)}><Plus className="w-7 h-7" /></Button></div>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-xs rounded-2xl font-['Pretendard']">
                    <DialogHeader>
                        <DialogTitle>새 일정 추가</DialogTitle>
                        <DialogDescription className="hidden">일정을 추가합니다.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">일정 제목</label>
                            <Input 
                                placeholder="예: 팀 회식, 생일 파티" 
                                value={newEvent.title} 
                                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                                className="bg-gray-50 border-gray-200 focus:border-[#7C3AED] focus:ring-[#7C3AED]"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">날짜</label>
                            <Input 
                                type="date"
                                value={newEvent.date}
                                onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                                className="bg-gray-50 border-gray-200"
                            />
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-gray-500 mb-1 block">시작 시간</label>
                                <Input 
                                    type="time"
                                    value={newEvent.time}
                                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                                    className="bg-gray-50 border-gray-200"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-bold text-gray-500 mb-1 block">소요 시간</label>
                                <select 
                                    className="flex h-10 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={newEvent.duration}
                                    onChange={(e) => setNewEvent({ ...newEvent, duration: e.target.value })}
                                >
                                    <option value="30">30분</option>
                                    <option value="60">1시간</option>
                                    <option value="90">1시간 30분</option>
                                    <option value="120">2시간</option>
                                    <option value="180">3시간</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">장소</label>
                            <Input 
                                placeholder="장소 입력 (선택)" 
                                value={newEvent.location} 
                                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                                className="bg-gray-50 border-gray-200"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreateEvent} className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] font-bold">
                            등록하기
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>외부 캘린더 가져오기</DialogTitle><DialogDescription className="text-xs text-gray-500">에브리타임, 구글 캘린더 URL 입력</DialogDescription></DialogHeader>
                    <div className="flex gap-2 mb-2">{["에브리타임", "구글"].map(src => (<Button key={src} size="sm" variant={syncSource === src ? "default" : "outline"} onClick={() => setSyncSource(src)} className={`flex-1 text-xs ${syncSource === src ? "bg-[#7C3AED]" : ""}`}>{src}</Button>))}</div>
                    {localStorage.getItem("calendar_sync_url") && (<div className="mb-2 p-2 bg-green-50 text-green-700 text-xs rounded-lg flex justify-between items-center"><span>✅ 자동 동기화 켜짐</span><button onClick={handleUnlink} className="text-red-500 underline">해제</button></div>)}
                    <Input placeholder="https://..." value={syncUrl} onChange={e=>setSyncUrl(e.target.value)} className="text-sm h-10" />
                    <DialogFooter><Button onClick={handleSync} disabled={syncLoading} className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]">{syncLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : "불러오기"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}