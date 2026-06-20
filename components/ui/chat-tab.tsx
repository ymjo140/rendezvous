"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Send, Loader2, X, LogOut, Calendar, MapPin, Check, ChevronDown, ChevronUp, Clock, ThumbsUp, UserPlus } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { API_BASE_URL, fetchWithAuth } from "@/lib/api-client"
import { useMe } from "@/hooks/use-me"
import { CommunityTab } from "@/components/ui/community-tab"

// 🌟 [핵심] 주소를 여기서 직접 관리 (커뮤니티 탭과 통일)
const WS_BASE_URL =
    process.env.NEXT_PUBLIC_WS_URL ||
    (API_BASE_URL ? API_BASE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:") : "")

const fetchChatAPI = async (endpoint: string, options: RequestInit = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`?? Chat ??: ${url}`);
    return fetchWithAuth(endpoint, options);
};

// --- AI 장소 추천용 필터 데이터 ---
const AI_FILTER_OPTIONS: Record<string, any> = {
    "식사": { 
        label: "🍚 식사", 
        tabs: { "메뉴": ["한식", "일식", "중식", "양식", "고기", "분식"], "분위기": ["조용한", "가성비", "고급", "혼밥", "웨이팅맛집"] } 
    },
    "술/회식": { 
        label: "🍺 술/회식", 
        tabs: { "주종": ["소주", "맥주", "와인", "하이볼", "칵테일"], "분위기": ["시끌벅적", "룸", "노포", "헌팅", "회식장소"] } 
    },
    "카페": { 
        label: "☕ 카페", 
        tabs: { "목적": ["수다", "작업/공부", "디저트", "빙수"], "분위기": ["감성", "대형", "뷰맛집", "조용한"] } 
    },
    "데이트": { 
        label: "💖 데이트", 
        tabs: { "코스": ["맛집", "카페", "산책", "전시/공연"], "분위기": ["로맨틱", "이색적인", "기념일", "야경"] } 
    }
};

// 🌟 [VoteCard] 투표 및 확정 기능
const VoteCard = ({ data, messageId, roomId, onRefresh }: { data: any, messageId: number, roomId: string, onRefresh: () => void }) => {
    const [votes, setVotes] = useState(data.vote_count || 0);
    const [voted, setVoted] = useState(false);
    const [confirmLoading, setConfirmLoading] = useState(false);

    // 투표 API 호출
    const handleVote = async () => {
        if (voted) return; 
        try {
            const res = await fetchChatAPI(`/api/meeting-flow/vote`, {
                method: "POST",
                body: JSON.stringify({
                    room_id: String(roomId), 
                    message_id: messageId 
                })
            });
            
            if (res.ok) {
                setVotes(votes + 1);
                setVoted(true);
            }
        } catch (e) { console.error(e); }
    };

    // 확정 API 호출
    const handleConfirm = async () => {
        if (!confirm(`'${data.place.name}'으로 약속을 확정하시겠습니까?\n참여자 전원의 캘린더에 일정이 등록됩니다.`)) return;
        
        setConfirmLoading(true);
        try {
            await fetchChatAPI(`/api/meeting-flow/confirm`, {
                method: "POST",
                body: JSON.stringify({
                    room_id: String(roomId),
                    place_name: data.place.name,
                    date: data.date, 
                    time: data.time,     
                    category: data.place.category
                })
            });
            onRefresh(); 
        } catch (e) {
            alert("확정 처리 중 오류가 발생했습니다.");
        } finally {
            setConfirmLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-xl p-4 border shadow-md max-w-[90%] space-y-3">
            <div className="flex justify-between items-start">
                <div>
                    <div className="font-bold text-xs text-[#F5A623] mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3"/> AI 추천 장소
                    </div>
                    <div className="font-bold text-lg text-gray-900 leading-tight">{data.place?.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{data.place?.category}</div>
                </div>
                <div className="bg-gray-100 px-2 py-1 rounded text-xs font-bold text-gray-600">
                    {votes}표
                </div>
            </div>

            <div className="flex gap-1 flex-wrap">
                {data.place?.tags?.map((t: string, i: number) => (
                    <span key={i} className="bg-amber-50 text-amber-600 text-[10px] px-2 py-1 rounded-full border border-amber-100">#{t}</span>
                ))}
            </div>

            <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-800 whitespace-pre-line leading-relaxed border border-indigo-100">
                {data.recommendation_reason}
            </div>

            <div className="flex gap-2 pt-1 border-t border-gray-100 mt-2">
                <Button 
                    variant="outline" 
                    size="sm"
                    className={`flex-1 h-9 text-xs ${voted ? "bg-amber-100 text-amber-700 border-amber-200" : "hover:bg-gray-50"}`}
                    onClick={handleVote}
                >
                    <ThumbsUp className="w-3 h-3 mr-1.5"/> {voted ? "투표완료" : "좋아요"}
                </Button>
                <Button 
                    size="sm"
                    className="flex-1 h-9 text-xs bg-[#F5A623] hover:bg-[#D97706] text-white shadow-sm"
                    onClick={handleConfirm}
                    disabled={confirmLoading}
                >
                    {confirmLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <><Check className="w-3 h-3 mr-1.5"/> 약속 확정</>}
                </Button>
            </div>
        </div>
    )
}

// 🤖 [RecommendChatbot] 단계별 대화형 장소 추천 (어디서 → 목적 → 날짜 → 추천)
type ChatMember = { id: number; name: string; is_me?: boolean; lat?: number | null; lng?: number | null; location_name?: string | null }
type BotMsg = { role: "bot" | "user"; text: string }

const RecommendChatbot = ({ roomId, members }: { roomId: string; members: ChatMember[] }) => {
    const router = useRouter()
    const [log, setLog] = useState<BotMsg[]>([{ role: "bot", text: "어디서 만나시나요?" }])
    const [step, setStep] = useState<"where" | "place_input" | "purpose" | "date" | "loading" | "result">("where")
    const [where, setWhere] = useState<"midpoint" | { lat: number; lng: number; name: string } | null>(null)
    const [purpose, setPurpose] = useState<string>("")
    const [dateLabel, setDateLabel] = useState<string>("")
    const [dates, setDates] = useState<any[]>([])
    const [placeQuery, setPlaceQuery] = useState("")
    const [placeHits, setPlaceHits] = useState<any[]>([])
    const [results, setResults] = useState<any[]>([])

    const say = (msgs: BotMsg[]) => setLog((prev) => [...prev, ...msgs])

    useEffect(() => {
        fetchChatAPI(`/api/chat/rooms/${roomId}/available-dates`)
            .then((r) => (r.ok ? r.json() : []))
            .then((d) => setDates(Array.isArray(d) ? d : []))
            .catch(() => {})
    }, [roomId])

    const pickWhere = (kind: "midpoint" | "place") => {
        if (kind === "midpoint") {
            setWhere("midpoint")
            say([{ role: "user", text: "중간 지점" }, { role: "bot", text: "목적이 무엇인가요?" }])
            setStep("purpose")
        } else {
            say([{ role: "user", text: "장소 직접 입력" }, { role: "bot", text: "어느 장소 근처인가요? 검색해 주세요." }])
            setStep("place_input")
        }
    }

    const searchPlace = async () => {
        const q = placeQuery.trim()
        if (!q) return
        try {
            const res = await fetchChatAPI(`/api/places/search?query=${encodeURIComponent(q)}`)
            const data = res.ok ? await res.json() : []
            setPlaceHits(Array.isArray(data) ? data.slice(0, 5) : [])
        } catch {
            setPlaceHits([])
        }
    }

    const pickPlace = (p: any) => {
        setWhere({ lat: p.lat, lng: p.lng, name: p.name || p.title || placeQuery })
        setPlaceHits([])
        say([{ role: "user", text: p.name || p.title || placeQuery }, { role: "bot", text: "목적이 무엇인가요?" }])
        setStep("purpose")
    }

    const pickPurpose = (key: string) => {
        setPurpose(key)
        say([{ role: "user", text: AI_FILTER_OPTIONS[key]?.label || key }, { role: "bot", text: "정해진 날짜가 있나요?" }])
        setStep("date")
    }

    const pickDate = (label: string) => {
        setDateLabel(label)
        say([{ role: "user", text: label }])
        runRecommend()
    }

    const runRecommend = async () => {
        setStep("loading")
        say([{ role: "bot", text: "우리 모임 취향을 합쳐 딱 맞는 곳을 찾고 있어요... 🔎" }])
        try {
            const memberIds = members.map((m) => m.id)
            const located = members.filter((m) => m.lat && m.lng && Math.abs(Number(m.lat)) > 1)
            let payload: any = {
                purpose: purpose || "식사",
                user_selected_tags: [],
                member_user_ids: memberIds,
            }
            if (where === "midpoint" && located.length > 0) {
                payload.current_lat = located[0].lat
                payload.current_lng = located[0].lng
                payload.users = located.slice(1).map((m) => ({ location: { lat: m.lat, lng: m.lng } }))
            } else if (where && where !== "midpoint") {
                payload.current_lat = where.lat
                payload.current_lng = where.lng
            } else {
                // 위치 정보 없음 → 멤버 취향만 (백엔드가 내 주변 폴백)
                payload.current_lat = located[0]?.lat || 37.5665
                payload.current_lng = located[0]?.lng || 126.978
            }
            const res = await fetchChatAPI(`/api/recommend`, { method: "POST", body: JSON.stringify(payload) })
            const regions = res.ok ? await res.json() : []
            const places = (regions?.[0]?.places || []).slice(0, 6)
            setResults(places)
            const region0 = regions?.[0]
            say([{ role: "bot", text: places.length
                ? `${region0?.region_name || "추천 지역"} 근처로 ${places.length}곳 찾았어요!`
                : "조건에 맞는 곳을 못 찾았어요. 다시 시도해 주세요." }])
            setStep("result")
        } catch {
            say([{ role: "bot", text: "추천 중 오류가 났어요. 잠시 후 다시 시도해 주세요." }])
            setStep("result")
        }
    }

    const reset = () => {
        setLog([{ role: "bot", text: "어디서 만나시나요?" }])
        setStep("where"); setWhere(null); setPurpose(""); setDateLabel(""); setResults([]); setPlaceHits([]); setPlaceQuery("")
    }

    return (
        <div className="space-y-3">
            {/* 대화 로그 */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {log.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-[#F5A623] text-white" : "bg-gray-100 text-gray-800"}`}>
                            {m.role === "bot" && <span className="mr-1">🤖</span>}{m.text}
                        </div>
                    </div>
                ))}
            </div>

            {/* 단계별 선택지 */}
            {step === "where" && (
                <div className="flex gap-2">
                    <Button onClick={() => pickWhere("midpoint")} className="flex-1 bg-[#F5A623] hover:bg-[#D97706] rounded-xl">📍 중간 지점</Button>
                    <Button onClick={() => pickWhere("place")} variant="outline" className="flex-1 rounded-xl">🔍 장소 직접 입력</Button>
                </div>
            )}

            {step === "place_input" && (
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && searchPlace()}
                            placeholder="예: 강남역, 홍대입구" className="h-10 text-sm" />
                        <Button onClick={searchPlace} className="bg-[#F5A623] hover:bg-[#D97706] rounded-xl">검색</Button>
                    </div>
                    {placeHits.map((p, i) => (
                        <button key={i} onClick={() => pickPlace(p)} className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-amber-50 text-sm">
                            <div className="font-bold text-gray-800">{p.name || p.title}</div>
                            <div className="text-xs text-gray-400">{p.address}</div>
                        </button>
                    ))}
                </div>
            )}

            {step === "purpose" && (
                <div className="flex flex-wrap gap-2">
                    {Object.keys(AI_FILTER_OPTIONS).map((key) => (
                        <Button key={key} onClick={() => pickPurpose(key)} variant="outline" className="rounded-full text-xs h-8">
                            {AI_FILTER_OPTIONS[key].label}
                        </Button>
                    ))}
                </div>
            )}

            {step === "date" && (
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => pickDate("가장 빠른 빈 날")} className="bg-[#14B8A6] hover:bg-[#0D9488] rounded-full text-xs h-8">⚡ 가장 빠른 빈 날</Button>
                    {dates.slice(0, 4).map((d, i) => (
                        <Button key={i} onClick={() => pickDate(d.displayDate)} variant="outline" className="rounded-full text-xs h-8">{d.displayDate}</Button>
                    ))}
                </div>
            )}

            {step === "loading" && (
                <div className="flex justify-center py-2"><Loader2 className="w-5 h-5 animate-spin text-[#F5A623]" /></div>
            )}

            {/* 추천 결과 카드 */}
            {step === "result" && results.length > 0 && (
                <div className="space-y-2">
                    {results.map((p, i) => (
                        <div key={p.id ?? i} onClick={() => p.id && router.push(`/places/${p.id}`)}
                            className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-[#F5A623] transition-colors">
                            <div className="font-bold text-sm text-gray-800">{p.name}</div>
                            <div className="text-[11px] text-gray-500">{p.category} · {p.address}</div>
                            {p.reason && <div className="mt-1 text-[11px] font-bold text-[#F5A623]">✨ {p.reason}</div>}
                            {p.social_proof?.count > 0 && (
                                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                                    🫂 비슷한 취향 {p.social_proof.count}명이 좋아함
                                </div>
                            )}
                        </div>
                    ))}
                    <Button onClick={reset} variant="ghost" className="w-full text-xs text-gray-400">다시 추천받기</Button>
                </div>
            )}
            {step === "result" && results.length === 0 && (
                <Button onClick={reset} variant="outline" className="w-full rounded-xl text-sm">다시 시도</Button>
            )}
        </div>
    )
}

// 🌟 [MeetingPlanner] UI + DB 위치 연동
const MeetingPlanner = ({ roomId, myId, members, onClose, onRefresh }: { roomId: string, myId: number | null, members: ChatMember[], onClose: () => void, onRefresh: () => void }) => {
    const [activeTab, setActiveTab] = useState("recommend") 
    
    // -- 장소 추천 State --
    const [recLoading, setRecLoading] = useState(false)
    const [participants, setParticipants] = useState(2)
    const [budget, setBudget] = useState([3, 10]) 
    const [selectedPurpose, setSelectedPurpose] = useState("식사");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // -- 일정 추천 State --
    const [recommendedDates, setRecommendedDates] = useState<any[]>([]);
    const [showAllDates, setShowAllDates] = useState(false);
    const [selectedDateSlot, setSelectedDateSlot] = useState<any>(null);

    // -- 일정 등록 State --
    const [scheduleInput, setScheduleInput] = useState("");
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [parsedSchedule, setParsedSchedule] = useState<any>(null);

    // -- 🌟 내 위치 State (DB) --
    const [myLocation, setMyLocation] = useState<{lat: number, lng: number} | null>(null);
    const [locationLabel, setLocationLabel] = useState("위치 확인 중...");

    // 초기 데이터 로드 (일정 및 내 위치)
    useEffect(() => {
        const loadData = async () => {
            // 1. 내 정보(위치) 불러오기 - DB 연동
            try {
                const userRes = await fetchChatAPI("/api/users/me");
                if (userRes.ok) {
                    const user = await userRes.json();
                    if (user.lat && user.lng && Math.abs(user.lat) > 1.0) {
                        setMyLocation({ lat: user.lat, lng: user.lng });
                        setLocationLabel(`📍 ${user.location_name || '내 설정 위치'}`);
                    } else {
                        setLocationLabel("⚠️ 위치 미설정 (설정 필요)");
                    }
                }
            } catch (e) { console.error("위치 로드 실패:", e); }

            // 2. 가능한 날짜 불러오기
            try {
                const dateRes = await fetchChatAPI(`/api/chat/rooms/${roomId}/available-dates`);
                if (dateRes.ok) {
                    const candidates = await dateRes.json();
                    setRecommendedDates(candidates);
                    if(candidates.length > 0) setSelectedDateSlot(candidates[0]);
                }
            } catch (e) { console.error(e); }
        };

        loadData();
    }, [roomId]);

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) setSelectedTags(prev => prev.filter(t => t !== tag));
        else setSelectedTags(prev => [...prev, tag]);
    };

    // 1. 장소 추천 요청 (백그라운드 처리)
    const handlePlan = async () => {
        setRecLoading(true)
        try {
            const targetDate = selectedDateSlot ? selectedDateSlot.fullDate : "auto";
            const targetTime = selectedDateSlot ? selectedDateSlot.time : "auto";

            const detailedPrompt = `
                1. 기본 조건: ${selectedPurpose} 목적, ${budget[0]}~${budget[1]}만원 예산.
                2. 선호 키워드: ${selectedTags.join(", ")}.
                3. 일정: ${targetDate} ${targetTime}에 적합한 곳.
            `.trim();

            const payload = {
                room_id: String(roomId),
                purpose: selectedPurpose,
                // 🌟 DB에서 가져온 내 위치 사용 (없으면 0.0을 보내 백엔드에서 처리)
                current_lat: myLocation?.lat || 0.0,
                current_lng: myLocation?.lng || 0.0, 
                conditions: {
                    date: targetDate,
                    time: targetTime,
                    budget_range: budget,
                    category: selectedPurpose,
                    tags: selectedTags,
                    detail_prompt: detailedPrompt
                }
            }

            // 요청만 보내고 결과는 소켓으로 받음 (await 없이)
            fetchChatAPI(`/api/meeting-flow`, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            // 즉시 닫기
            onClose();

        } catch (e) { console.error(e); alert("오류 발생"); } 
        finally { setRecLoading(false) }
    }

    // 2. 자연어 일정 분석 요청
    const handleAnalyzeSchedule = async () => {
        if(!scheduleInput.trim()) return;
        setScheduleLoading(true);
        try {
            const res = await fetchChatAPI(`/api/ai/parse-schedule`, {
                method: "POST",
                body: JSON.stringify({ text: scheduleInput })
            });
            if(res.ok) {
                const data = await res.json();
                setParsedSchedule(data);
            }
        } catch(e) { console.error(e); alert("분석 실패"); }
        finally { setScheduleLoading(false); }
    }

    // 3. 분석된 일정 등록 (캘린더 저장)
    const handleRegisterEvent = async () => {
        if(!parsedSchedule || !myId) return;
        try {
            const res = await fetchChatAPI(`/api/events`, {
                method: "POST",
                body: JSON.stringify({
                    user_id: myId,
                    title: parsedSchedule.title || "새 약속",
                    date: parsedSchedule.date,
                    time: parsedSchedule.time,
                    location_name: parsedSchedule.location_name,
                    purpose: parsedSchedule.purpose || "기타",
                    duration_hours: 2.0
                })
            });

            if(res.ok) {
                // 채팅방에도 알림 메시지 보내기
                await fetchChatAPI(`/api/chat/message`, {
                    method: "POST",
                    body: JSON.stringify({ room_id: String(roomId), content: `📅 [일정 등록됨] ${parsedSchedule.title} (${parsedSchedule.date} ${parsedSchedule.time})`, type: "text" })
                });
                
                onRefresh();
                onClose();
            }
        } catch(e) { console.error(e); alert("등록 실패"); }
    }

    const currentOptions = AI_FILTER_OPTIONS[selectedPurpose];
    const visibleDates = showAllDates ? recommendedDates : recommendedDates.slice(0, 3);

    return (
        <div className="w-full bg-white border-2 border-[#F5A623]/20 rounded-3xl p-5 shadow-lg relative overflow-hidden mb-4 animate-in slide-in-from-top-2">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#F5A623] to-[#14B8A6]"></div>
            
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-sm text-[#F5A623] flex items-center gap-1">
                    🤖 AI 모임 매니저
                </h3>
                <button onClick={onClose}><X className="w-4 h-4 text-gray-400"/></button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="recommend">📍 장소 추천</TabsTrigger>
                    <TabsTrigger value="schedule">📅 일정 등록</TabsTrigger>
                </TabsList>

                {/* --- 탭 1: 장소 추천 (대화형 챗봇) --- */}
                <TabsContent value="recommend" className="space-y-3">
                    <RecommendChatbot roomId={roomId} members={members} />
                </TabsContent>

                {/* --- 탭 2: 일정 등록 (자연어) --- */}
                <TabsContent value="schedule" className="space-y-4">
                    {!parsedSchedule ? (
                        <>
                            <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                                "다음주 금요일 저녁 7시에 강남역에서 회식 잡아줘" 처럼 말해보세요. AI가 자동으로 일정을 등록해줍니다.
                            </div>
                            <Textarea 
                                placeholder="약속 내용을 자유롭게 입력하세요..." 
                                className="resize-none h-24 text-sm"
                                value={scheduleInput}
                                onChange={(e) => setScheduleInput(e.target.value)}
                            />
                            <Button className="w-full bg-[#14B8A6] hover:bg-[#0D9488] text-white font-bold h-11 rounded-xl" onClick={handleAnalyzeSchedule} disabled={scheduleLoading}>
                                {scheduleLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : "🤖 AI 분석 및 등록"}
                            </Button>
                        </>
                    ) : (
                        <div className="animate-in fade-in zoom-in duration-300">
                            <Card className="p-4 border-[#14B8A6] bg-teal-50/50 mb-3">
                                <h4 className="font-bold text-teal-800 mb-2 flex items-center"><Check className="w-4 h-4 mr-1"/> 분석 결과</h4>
                                <div className="space-y-2 text-sm text-gray-700">
                                    <div className="flex justify-between border-b border-teal-100 pb-1">
                                        <span className="text-gray-500">제목</span>
                                        <span className="font-bold">{parsedSchedule.title}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-teal-100 pb-1">
                                        <span className="text-gray-500 flex items-center"><Calendar className="w-3 h-3 mr-1"/> 날짜</span>
                                        <span className="font-bold">{parsedSchedule.date} {parsedSchedule.time}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-teal-100 pb-1">
                                        <span className="text-gray-500 flex items-center"><MapPin className="w-3 h-3 mr-1"/> 장소</span>
                                        <span className="font-bold">{parsedSchedule.location_name || "미정"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">목적</span>
                                        <Badge variant="outline" className="bg-white">{parsedSchedule.purpose}</Badge>
                                    </div>
                                </div>
                            </Card>
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => setParsedSchedule(null)}>다시 입력</Button>
                                <Button className="flex-[2] bg-teal-600 hover:bg-teal-700 text-white" onClick={handleRegisterEvent}>캘린더에 등록하기</Button>
                            </div>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}

// Props 타입 정의
interface ChatTabProps {
    openRoomId?: string | null;
    onRoomOpened?: () => void;
}

// 🌟 [ChatTab] 메인 컴포넌트
export function ChatTab({ openRoomId, onRoomOpened }: ChatTabProps = {}) {
    const [view, setView] = useState<'list' | 'room'>('list')
    const [rooms, setRooms] = useState<any[]>([])
    const [activeRoom, setActiveRoom] = useState<any>(null)
    const [messages, setMessages] = useState<any[]>([])
    const [input, setInput] = useState("")
    const { me } = useMe()
    const myId = me?.id ?? null
    const [rootTab, setRootTab] = useState("open")
    const [showPlanner, setShowPlanner] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const socketRef = useRef<WebSocket | null>(null)

    // 친구 초대
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [friends, setFriends] = useState<any[]>([])
    const [inviteLoading, setInviteLoading] = useState(false)
    const [invitedIds, setInvitedIds] = useState<number[]>([])

    // 채팅방 멤버
    const [members, setMembers] = useState<ChatMember[]>([])
    const [membersOpen, setMembersOpen] = useState(false)

    const fetchMembers = async (roomId: string | number) => {
        try {
            const res = await fetchChatAPI(`/api/chat/rooms/${roomId}/members`)
            if (res.ok) {
                const data = await res.json()
                setMembers(Array.isArray(data?.members) ? data.members : [])
            }
        } catch {
            /* graceful */
        }
    }

    // 📤 공유된 아이템 클릭 → 탐색 탭으로 이동
    const handleSharedItemClick = (item: any) => {
        if (item.type === "post" && item.post_id) {
            // 탐색 탭으로 이동하는 커스텀 이벤트 발생 (현재 채팅방 ID 포함)
            window.dispatchEvent(new CustomEvent("navigateToPost", {
                detail: { postId: item.post_id, roomId: activeRoom?.id }
            }));
        } else {
            // 장소인 경우 알림만 표시 (나중에 장소 상세 페이지 구현 가능)
            alert(`장소: ${item.name || "알 수 없음"}`);
        }
    };

    useEffect(() => {
        fetchRooms()
    }, [])
    
    // 📤 특정 채팅방 직접 열기 (공유 게시물에서 돌아올 때)
    useEffect(() => {
        if (openRoomId && rooms.length > 0) {
            const room = rooms.find(r => r.id === openRoomId);
            if (room) {
                setRootTab("open");
                setActiveRoom(room);
                setView('room');
                onRoomOpened?.();
            }
        }
    }, [openRoomId, rooms])

    const fetchRooms = async () => {
        try {
            // 🌟 fetchChatAPI 사용
            const res = await fetchChatAPI(`/api/chat/rooms`)
            if (res.ok) setRooms(await res.json())
        } catch(e) {}
    }

    const fetchFriends = async () => {
        try {
            const res = await fetchChatAPI(`/api/friends`)
            if (res.ok) {
                const data = await res.json()
                setFriends(Array.isArray(data?.friends) ? data.friends : [])
            }
        } catch (e) {}
    }

    const openInvite = () => {
        setInvitedIds([])
        setIsInviteOpen(true)
        fetchFriends()
    }

    const handleInvite = async (friend: any) => {
        if (!activeRoom || !friend?.id) return
        setInviteLoading(true)
        try {
            const res = await fetchChatAPI(`/api/chat/rooms/${activeRoom.id}/invite`, {
                method: "POST",
                body: JSON.stringify({ user_id: friend.id }),
            })
            if (res.ok) {
                setInvitedIds(prev => [...prev, friend.id])
                fetchMembers(activeRoom.id) // 초대 후 멤버 목록 갱신
            } else {
                alert("초대 실패: 잠시 후 다시 시도해주세요.")
            }
        } catch (e) {
            alert("초대 중 오류가 발생했습니다.")
        } finally {
            setInviteLoading(false)
        }
    }

    const fetchMessages = async () => {
        if (!activeRoom) return;
        try {
            // 🌟 fetchChatAPI 사용
            const res = await fetchChatAPI(`/api/chat/${activeRoom.id}/messages`);
            if (res.ok) {
                setMessages(await res.json());
                setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
            }
        } catch(e) {}
    };

    // WebSocket 연결 및 실시간 수신
    useEffect(() => {
        if (view === 'room' && activeRoom) {
            setShowPlanner(false)
            setMembersOpen(false)
            fetchMembers(activeRoom.id)
            fetchMessages();

            // WebSocket 연결
            const token = localStorage.getItem("token");
            if (!WS_BASE_URL || !token) {
                setIsConnected(false);
                return;
            }
            const wsUrl = `${WS_BASE_URL}/api/ws/${activeRoom.id}?token=${token}`;
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => { setIsConnected(true); console.log("Connected"); };
            ws.onmessage = (event) => {
                const newMsg = JSON.parse(event.data);
                setMessages(prev => [...prev, newMsg]);
                setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
            };
            ws.onclose = () => { setIsConnected(false); setTimeout(() => { if (view === 'room' && activeRoom) ws.close(); }, 3000); };
            socketRef.current = ws;

            return () => {
                if (ws.readyState === 1) ws.close();
            };
        }
    }, [view, activeRoom])

    const handleLeaveRoom = async () => {
        if (!activeRoom) return;
        if (!confirm("채팅방을 나가시겠습니까? 관련 모임 목록에서도 사라집니다.")) return;

        try {
            const res = await fetchChatAPI(`/api/chat/rooms/${activeRoom.id}/leave`, { method: "POST" });

            if (res.ok) {
                alert("채팅방을 나갔습니다.");
                setView('list'); 
                fetchRooms(); 
            } else {
                alert("나가기 실패: 잠시 후 다시 시도해주세요.");
            }
        } catch (e) { alert("오류 발생"); }
    };

    const handleSend = async () => {
        if (!input.trim() || !activeRoom) return
        const text = input.trim()
        setInput("")
        try {
            // REST로 전송 → 서버가 DB 저장 + 발신자 귀속 + 방 전체에 WebSocket 브로드캐스트
            const res = await fetchChatAPI(`/api/chat/message`, {
                method: "POST",
                body: JSON.stringify({ room_id: String(activeRoom.id), content: text }),
            })
            if (!res.ok) { alert("메시지 전송 실패"); return }
            // WebSocket 미연결 시에도 보이도록 폴백 새로고침
            if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
                fetchMessages()
            }
        } catch (e) {
            alert("메시지 전송 실패")
        }
    }

    const renderTabHeader = () => (
        <div className="bg-white p-4 pb-3 shadow-sm sticky top-0 z-30">
            <Tabs value={rootTab} onValueChange={setRootTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-10">
                    <TabsTrigger value="open">Open Chat</TabsTrigger>
                    <TabsTrigger value="community">핫딜</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    )

    if (rootTab === "community") {
        return (
            <div className="flex flex-col h-full bg-[#F3F4F6] font-['Pretendard']">
                {renderTabHeader()}
                <div className="flex-1 overflow-hidden">
                    <CommunityTab source="chat/community" />
                </div>
            </div>
        )
    }

    if (view === 'list') {
        return (
            <div className="flex flex-col h-full bg-[#F3F4F6] font-['Pretendard']">
                {renderTabHeader()}
                <div className="flex-1 overflow-hidden">
                    <div className="flex flex-col h-full">
                        <div className="bg-white p-5 pb-4 shadow-sm sticky top-0 z-10">
                            <h1 className="text-xl font-bold text-gray-900">채팅</h1>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="divide-y divide-gray-100 pb-20">
                                {rooms.length > 0 ? rooms.map(room => (
                                    <div key={room.id} onClick={() => { setActiveRoom(room); setView('room'); }} className="p-4 bg-white hover:bg-gray-50 cursor-pointer flex gap-3 transition-colors">
                                        <Avatar className="w-12 h-12 border border-gray-100"><AvatarFallback className="bg-amber-50 text-[#F5A623] font-bold">{room.title[0]}</AvatarFallback></Avatar>
                                        <div className="flex-1 overflow-hidden py-1">
                                            <div className="flex justify-between items-center mb-1"><h3 className="font-bold text-sm text-gray-900 truncate">{room.title}</h3><span className="text-[10px] text-gray-400">방금 전</span></div>
                                            <p className="text-xs text-gray-500 truncate">{room.last_message || "대화를 시작해보세요."}</p>
                                        </div>
                                    </div>
                                )) : <div className="p-10 text-center text-gray-400 text-sm">참여 중인 대화방이 없습니다.</div>}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] font-['Pretendard']">
            {renderTabHeader()}
            <div className="flex-1 flex flex-col">
                <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-20 justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setView('list')} className="-ml-2 h-9 w-9"><ArrowLeft className="w-5 h-5 text-gray-600" /></Button>
                    <button className="text-left" onClick={() => setMembersOpen((v) => !v)}>
                        <h2 className="font-bold text-sm text-gray-900 truncate max-w-[160px] flex items-center gap-1">
                            {activeRoom?.title || activeRoom?.name}
                            {members.length > 0 && (
                                <span className="text-[11px] font-normal text-gray-400">{members.length}</span>
                            )}
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${membersOpen ? "rotate-180" : ""}`} />
                        </h2>
                        {members.length > 0 ? (
                            <span className="text-[10px] text-gray-500 block truncate max-w-[180px]">
                                {members.map((m) => m.name).join(", ")}
                            </span>
                        ) : isConnected ? (
                            <span className="text-[10px] text-green-500 font-bold block">● 실시간 연결됨</span>
                        ) : (
                            <span className="text-[10px] text-red-500 font-bold block">● 연결 중...</span>
                        )}
                    </button>
                </div>
                
                <div className="flex items-center gap-2">
                    <Button 
                        size="sm"
                        onClick={() => setShowPlanner(!showPlanner)} 
                        className={`rounded-full transition-all font-bold shadow-sm h-8 px-3 text-xs ${showPlanner ? "bg-[#2dd4bf] text-white hover:bg-[#25c2af]" : "bg-white text-[#2dd4bf] border border-[#2dd4bf] hover:bg-teal-50"}`}
                    >
                        AI 🤖
                    </Button>
                    
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={openInvite}
                        className="h-8 w-8 text-gray-400 hover:text-[#F5A623] hover:bg-amber-50"
                        title="친구 초대"
                    >
                        <UserPlus className="w-4 h-4" />
                    </Button>

                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleLeaveRoom}
                        className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                        title="채팅방 나가기"
                    >
                        <LogOut className="w-4 h-4" />
                    </Button>
                </div>
                </div>

                {/* 멤버 펼침 패널 */}
                {membersOpen && members.length > 0 && (
                    <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-[57px] z-10">
                        <div className="text-[11px] font-bold text-gray-400 mb-2">참여 멤버 {members.length}</div>
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                            {members.map((m) => (
                                <div key={m.id} className="flex items-center gap-2.5 py-1">
                                    <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                                        {m.name?.[0] || "?"}
                                    </div>
                                    <span className="text-sm text-gray-800">{m.name}</span>
                                    {m.is_me && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">나</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="flex flex-col gap-3 pb-4">
                    <div className="flex justify-center my-4"><span className="bg-gray-200/60 text-gray-500 text-[10px] px-3 py-1 rounded-full">대화가 시작되었습니다.</span></div>

                    {showPlanner && (
                        <MeetingPlanner
                            roomId={activeRoom?.id}
                            myId={myId}
                            members={members}
                            onClose={() => setShowPlanner(false)}
                            onRefresh={fetchMessages}
                        />
                    )}

                    {messages.map((msg, i) => {
                        const isMe = msg.user_id === myId;
                        let content = null;
                        try {
                            const jsonContent = JSON.parse(msg.content);
                            if (jsonContent.type === "vote_card") {
                                content = <VoteCard data={jsonContent} messageId={msg.id} roomId={activeRoom.id} onRefresh={fetchMessages} />
                            } else if (jsonContent.type === "system") {
                                return (
                                    <div key={i} className="flex justify-center my-2">
                                        <div className="bg-gray-100 text-gray-500 text-[11px] px-3 py-1 rounded-full shadow-sm flex items-center gap-1">
                                            {jsonContent.text.includes("분석") && <Loader2 className="w-3 h-3 animate-spin"/>}
                                            {jsonContent.text}
                                        </div>
                                    </div>
                                )
                            } else if (jsonContent.type === "shared_items") {
                                // 📤 공유된 아이템 카드 렌더링
                                content = (
                                    <div className="space-y-2 max-w-[280px]">
                                        {jsonContent.message && (
                                            <div className={`px-3 py-2 rounded-xl text-sm ${isMe ? 'bg-[#F5A623] text-white' : 'bg-white text-gray-800 border'}`}>
                                                💬 {jsonContent.message}
                                            </div>
                                        )}
                                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-3 border border-amber-100 shadow-sm">
                                            <div className="text-[10px] text-amber-600 font-bold mb-2 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" /> 공유된 장소/게시물
                                            </div>
                                            <div className="space-y-2">
                                                {jsonContent.items?.map((item: any, idx: number) => (
                                                    <div 
                                                        key={idx} 
                                                        className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-amber-200 transition-colors cursor-pointer"
                                                        onClick={() => handleSharedItemClick(item)}
                                                    >
                                                        <div className="flex gap-3">
                                                            {/* 이미지 */}
                                                            <div className="w-16 h-16 flex-shrink-0 bg-gray-100">
                                                                {item.image ? (
                                                                    <img 
                                                                        src={item.image} 
                                                                        alt="" 
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100">
                                                                        <MapPin className="w-5 h-5 text-amber-300" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {/* 정보 */}
                                                            <div className="flex-1 py-2 pr-2">
                                                                <div className="font-bold text-sm text-gray-800 line-clamp-1">
                                                                    {item.name || "게시물"}
                                                                </div>
                                                                {item.content && (
                                                                    <div className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                                                                        {item.content}
                                                                    </div>
                                                                )}
                                                                <div className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                                                                    {item.type === "post" ? "📷 게시물" : "📍 장소"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            } else if (jsonContent.text) {
                                content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#F5A623] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{jsonContent.text}</div>;
                            } else {
                                content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#F5A623] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{msg.content}</div>;
                            }
                        } catch {
                            content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#F5A623] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{msg.content}</div>;
                        }
                        
                        return (
                            <div key={i} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                {!isMe && msg.user_id !== 0 && <Avatar className="w-8 h-8 border border-white shadow-sm"><AvatarFallback className="text-[10px] bg-gray-100">{msg.name?.[0]}</AvatarFallback></Avatar>}
                                <div className="max-w-[85%] flex flex-col items-start">
                                    {!isMe && msg.user_id !== 0 && <div className="text-[10px] text-gray-500 mb-1 ml-1">{msg.name}</div>}
                                    {content}
                                    <div className={`text-[9px] text-gray-300 mt-1 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>{msg.timestamp}</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
                </ScrollArea>

                <div className="p-3 bg-white border-t safe-area-bottom">
                <div className="flex gap-2 items-center bg-gray-50 px-3 py-1.5 rounded-3xl border border-gray-200 focus-within:border-[#F5A623] focus-within:ring-1 focus-within:ring-[#F5A623]/20 transition-all">
                    <Input className="flex-1 border-none shadow-none bg-transparent focus-visible:ring-0 h-9 text-sm" placeholder="메시지 입력..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
                    <Button size="icon" className="h-8 w-8 rounded-full bg-[#F5A623] hover:bg-[#D97706] shadow-sm" onClick={handleSend}><Send className="w-4 h-4 text-white" /></Button>
                </div>
                </div>
            </div>

            {/* 친구 초대 모달 */}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogContent className="sm:max-w-sm rounded-3xl font-['Pretendard']">
                    <DialogHeader>
                        <DialogTitle>친구 초대</DialogTitle>
                        <DialogDescription>이 채팅방에 초대할 친구를 선택하세요.</DialogDescription>
                    </DialogHeader>
                    <div className="py-2 max-h-[50vh] overflow-y-auto space-y-1">
                        {friends.length === 0 ? (
                            <div className="text-center text-sm text-gray-400 py-8">초대할 친구가 없어요.</div>
                        ) : friends.map((f) => {
                            const invited = invitedIds.includes(f.id)
                            return (
                                <div key={f.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50">
                                    <div className="flex items-center gap-2">
                                        <Avatar className="w-9 h-9"><AvatarFallback className="bg-amber-50 text-[#F5A623] text-xs font-bold">{f.name?.[0]}</AvatarFallback></Avatar>
                                        <div className="text-sm font-medium text-gray-800">{f.name}</div>
                                    </div>
                                    <Button
                                        size="sm"
                                        disabled={invited || inviteLoading}
                                        className={invited ? "bg-gray-100 text-gray-400 h-8 text-xs" : "bg-[#F5A623] hover:bg-amber-700 h-8 text-xs"}
                                        onClick={() => handleInvite(f)}
                                    >
                                        {invited ? "초대됨" : "초대"}
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
