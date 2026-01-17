"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Send, Loader2, X, LogOut, Calendar, MapPin, Check, ChevronDown, ChevronUp, Clock, ThumbsUp, Heart, MessageSquare, Bookmark, ExternalLink } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// 🌟 [핵심] 주소를 여기서 직접 관리 (커뮤니티 탭과 통일)
const API_URL = "https://wemeet-backend-xqlo.onrender.com";
const WS_URL = "wss://wemeet-backend-xqlo.onrender.com";

// 🌟 [핵심] 이 파일 전용 통신 함수 (토큰 자동 포함)
const fetchChatAPI = async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    } as HeadersInit;

    const url = `${API_URL}${endpoint}`;
    console.log(`📡 Chat 요청: ${url}`);
    return fetch(url, { ...options, headers });
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
                    <div className="font-bold text-xs text-[#7C3AED] mb-1 flex items-center gap-1">
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
                    <span key={i} className="bg-purple-50 text-purple-600 text-[10px] px-2 py-1 rounded-full border border-purple-100">#{t}</span>
                ))}
            </div>

            <div className="bg-indigo-50 p-3 rounded-lg text-xs text-indigo-800 whitespace-pre-line leading-relaxed border border-indigo-100">
                {data.recommendation_reason}
            </div>

            <div className="flex gap-2 pt-1 border-t border-gray-100 mt-2">
                <Button 
                    variant="outline" 
                    size="sm"
                    className={`flex-1 h-9 text-xs ${voted ? "bg-purple-100 text-purple-700 border-purple-200" : "hover:bg-gray-50"}`}
                    onClick={handleVote}
                >
                    <ThumbsUp className="w-3 h-3 mr-1.5"/> {voted ? "투표완료" : "좋아요"}
                </Button>
                <Button 
                    size="sm"
                    className="flex-1 h-9 text-xs bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-sm"
                    onClick={handleConfirm}
                    disabled={confirmLoading}
                >
                    {confirmLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : <><Check className="w-3 h-3 mr-1.5"/> 약속 확정</>}
                </Button>
            </div>
        </div>
    )
}

// 🌟 [MeetingPlanner] UI + DB 위치 연동
const MeetingPlanner = ({ roomId, myId, onClose, onRefresh }: { roomId: string, myId: number | null, onClose: () => void, onRefresh: () => void }) => {
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
        <div className="w-full bg-white border-2 border-[#7C3AED]/20 rounded-3xl p-5 shadow-lg relative overflow-hidden mb-4 animate-in slide-in-from-top-2">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#7C3AED] to-[#14B8A6]"></div>
            
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-sm text-[#7C3AED] flex items-center gap-1">
                    🤖 AI 모임 매니저
                </h3>
                <button onClick={onClose}><X className="w-4 h-4 text-gray-400"/></button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="recommend">📍 장소 추천</TabsTrigger>
                    <TabsTrigger value="schedule">📅 일정 등록</TabsTrigger>
                </TabsList>

                {/* --- 탭 1: 장소 추천 --- */}
                <TabsContent value="recommend" className="space-y-5">
                    
                    {/* 🌟 위치 정보 표시 (DB값) */}
                    <div className="text-center mb-1">
                        <span className="bg-gray-100 text-gray-600 text-[11px] px-3 py-1 rounded-full font-bold border border-gray-200">
                            {locationLabel}
                        </span>
                    </div>

                    {/* 날짜 추천 섹션 */}
                    <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold text-indigo-800 flex items-center gap-1">
                                <Clock className="w-3 h-3"/> 추천 일정 (자동 분석)
                            </label>
                            <button onClick={() => setShowAllDates(!showAllDates)} className="text-[10px] text-indigo-500 flex items-center hover:underline">
                                {showAllDates ? "접기" : "더보기"} {showAllDates ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                            </button>
                        </div>
                        
                        {visibleDates.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2">
                                {visibleDates.map((slot, i) => (
                                    <div 
                                        key={i} 
                                        onClick={() => setSelectedDateSlot(slot)}
                                        className={`cursor-pointer rounded-lg p-2 text-center border transition-all ${selectedDateSlot?.fullDate === slot.fullDate ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white border-gray-200 hover:border-indigo-300"}`}
                                    >
                                        <div className="text-[10px] opacity-80">{slot.displayDate}</div>
                                        <div className="text-xs font-bold">{slot.time}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-xs text-gray-400 py-2">
                                일정 분석 중...
                            </div>
                        )}
                    </div>

                    {/* 나머지 옵션 UI는 동일 */}
                    <div className="flex gap-4">
                        <div className="flex-1 space-y-1">
                            <label className="text-xs font-bold text-gray-500">인원</label>
                            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 h-9 border border-gray-100">
                                <Input className="w-full h-full border-none bg-transparent text-center p-0 text-sm font-bold" type="number" min={1} value={participants} onChange={(e) => setParticipants(Number(e.target.value))} />
                                <span className="text-xs text-gray-400 whitespace-nowrap">명</span>
                            </div>
                        </div>
                        <div className="flex-[2] space-y-1">
                            <div className="flex justify-between">
                                <label className="text-xs font-bold text-gray-500">인당 예산</label>
                                <span className="text-xs font-bold text-[#14B8A6]">{budget[0]}~{budget[1]}만원</span>
                            </div>
                            <Slider defaultValue={[3, 10]} max={30} step={1} className="py-2" onValueChange={setBudget} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500">목적</label>
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                            {Object.keys(AI_FILTER_OPTIONS).map(key => (
                                <Button 
                                    key={key} 
                                    variant={selectedPurpose === key ? "default" : "outline"} 
                                    onClick={() => { setSelectedPurpose(key); setSelectedTags([]); }} 
                                    className={`h-8 rounded-full text-xs font-bold flex-shrink-0 px-4 ${selectedPurpose === key ? 'bg-[#7C3AED] hover:bg-[#6D28D9] border-none' : 'text-gray-500 border-gray-200 bg-white'}`}
                                >
                                    {AI_FILTER_OPTIONS[key].label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                        <Tabs defaultValue={Object.keys(currentOptions.tabs)[0]} className="w-full">
                            <TabsList className="w-full h-8 bg-white mb-3 rounded-lg p-0.5 border border-gray-200">
                                {Object.keys(currentOptions.tabs).map(subKey => (
                                    <TabsTrigger key={subKey} value={subKey} className="flex-1 h-full rounded-md text-[10px] font-bold">{subKey}</TabsTrigger>
                                ))}
                            </TabsList>
                            {Object.entries(currentOptions.tabs).map(([subKey, tags]: any) => (
                                <TabsContent key={subKey} value={subKey} className="mt-0">
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map((tag: string) => (
                                            <Badge key={tag} variant="outline" onClick={() => toggleTag(tag)} className={`cursor-pointer px-3 py-1.5 rounded-xl text-xs transition-all ${selectedTags.includes(tag) ? "bg-white border-[#7C3AED] text-[#7C3AED] shadow-sm font-bold" : "bg-white border-gray-200 text-gray-500 font-medium hover:bg-gray-100"}`}>
                                                {tag}
                                            </Badge>
                                        ))}
                                    </div>
                                </TabsContent>
                            ))}
                        </Tabs>
                    </div>
                    
                    <Button className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold h-11 rounded-xl shadow-md" onClick={handlePlan} disabled={recLoading}>
                        {recLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : "✨ 장소 추천받기"}
                    </Button>
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

// 🌟 [ChatTab] 메인 컴포넌트
export function ChatTab() {
    const [view, setView] = useState<'list' | 'room'>('list')
    const [rooms, setRooms] = useState<any[]>([])
    const [activeRoom, setActiveRoom] = useState<any>(null)
    const [messages, setMessages] = useState<any[]>([])
    const [input, setInput] = useState("")
    const [myId, setMyId] = useState<number | null>(null)
    const [showPlanner, setShowPlanner] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const socketRef = useRef<WebSocket | null>(null)
    
    // 📤 공유된 아이템 상세 보기
    const [sharedItemModal, setSharedItemModal] = useState<any>(null)
    const [sharedPostDetail, setSharedPostDetail] = useState<any>(null)
    const [loadingPost, setLoadingPost] = useState(false)
    
    // 공유된 게시물 상세 정보 불러오기
    const fetchSharedPostDetail = async (postId: string) => {
        setLoadingPost(true);
        try {
            const res = await fetchChatAPI(`/api/posts/${postId}`);
            if (res.ok) {
                const post = await res.json();
                setSharedPostDetail(post);
            }
        } catch (e) {
            console.error("게시물 로드 실패:", e);
        } finally {
            setLoadingPost(false);
        }
    };
    
    // 공유된 아이템 클릭 핸들러
    const handleSharedItemClick = (item: any) => {
        setSharedItemModal(item);
        if (item.type === "post" && item.post_id) {
            fetchSharedPostDetail(item.post_id);
        }
    };

    useEffect(() => {
        const init = async () => {
            const token = localStorage.getItem("token");
            if(token) {
                try {
                    const res = await fetchChatAPI("/api/users/me");
                    if (res.ok) setMyId((await res.json()).id);
                } catch(e) {}
            }
            fetchRooms();
        }
        init()
    }, [])

    const fetchRooms = async () => {
        try {
            // 🌟 fetchChatAPI 사용
            const res = await fetchChatAPI(`/api/chat/rooms`)
            if (res.ok) setRooms(await res.json())
        } catch(e) {}
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
            fetchMessages(); 

            // WebSocket 연결
            const token = localStorage.getItem("token");
            const wsUrl = `${WS_URL}/api/ws/${activeRoom.id}?token=${token}`;
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
        if (!input.trim() || !activeRoom || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return
        socketRef.current.send(input);
        setInput("");
    }

    if (view === 'list') {
        return (
            <div className="flex flex-col h-full bg-[#F3F4F6] font-['Pretendard']">
                <div className="bg-white p-5 pb-4 shadow-sm sticky top-0 z-10">
                    <h1 className="text-xl font-bold text-gray-900">채팅</h1>
                </div>
                <ScrollArea className="flex-1">
                    <div className="divide-y divide-gray-100 pb-20">
                        {rooms.length > 0 ? rooms.map(room => (
                            <div key={room.id} onClick={() => { setActiveRoom(room); setView('room'); }} className="p-4 bg-white hover:bg-gray-50 cursor-pointer flex gap-3 transition-colors">
                                <Avatar className="w-12 h-12 border border-gray-100"><AvatarFallback className="bg-purple-50 text-[#7C3AED] font-bold">{room.title[0]}</AvatarFallback></Avatar>
                                <div className="flex-1 overflow-hidden py-1">
                                    <div className="flex justify-between items-center mb-1"><h3 className="font-bold text-sm text-gray-900 truncate">{room.title}</h3><span className="text-[10px] text-gray-400">방금 전</span></div>
                                    <p className="text-xs text-gray-500 truncate">{room.last_message || "대화를 시작해보세요."}</p>
                                </div>
                            </div>
                        )) : <div className="p-10 text-center text-gray-400 text-sm">참여 중인 대화방이 없습니다.</div>}
                    </div>
                </ScrollArea>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] font-['Pretendard']">
            <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-20 justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setView('list')} className="-ml-2 h-9 w-9"><ArrowLeft className="w-5 h-5 text-gray-600" /></Button>
                    <div>
                        <h2 className="font-bold text-sm text-gray-900 truncate max-w-[150px]">{activeRoom?.name}</h2>
                        {isConnected ? <span className="text-[10px] text-green-500 font-bold block">● 실시간 연결됨</span> : <span className="text-[10px] text-red-500 font-bold block">● 연결 중...</span>}
                    </div>
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
                        onClick={handleLeaveRoom}
                        className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                        title="채팅방 나가기"
                    >
                        <LogOut className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="flex flex-col gap-3 pb-4">
                    <div className="flex justify-center my-4"><span className="bg-gray-200/60 text-gray-500 text-[10px] px-3 py-1 rounded-full">대화가 시작되었습니다.</span></div>

                    {showPlanner && (
                        <MeetingPlanner 
                            roomId={activeRoom?.id} 
                            myId={myId} 
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
                                            <div className={`px-3 py-2 rounded-xl text-sm ${isMe ? 'bg-[#7C3AED] text-white' : 'bg-white text-gray-800 border'}`}>
                                                💬 {jsonContent.message}
                                            </div>
                                        )}
                                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-3 border border-purple-100 shadow-sm">
                                            <div className="text-[10px] text-purple-600 font-bold mb-2 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" /> 공유된 장소/게시물
                                            </div>
                                            <div className="space-y-2">
                                                {jsonContent.items?.map((item: any, idx: number) => (
                                                    <div 
                                                        key={idx} 
                                                        className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-purple-200 transition-colors cursor-pointer"
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
                                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
                                                                        <MapPin className="w-5 h-5 text-purple-300" />
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
                                                                <div className="text-[10px] text-purple-500 mt-1 flex items-center gap-1">
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
                                content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#7C3AED] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{jsonContent.text}</div>;
                            } else {
                                content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#7C3AED] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{msg.content}</div>;
                            }
                        } catch {
                            content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#7C3AED] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{msg.content}</div>;
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
                <div className="flex gap-2 items-center bg-gray-50 px-3 py-1.5 rounded-3xl border border-gray-200 focus-within:border-[#7C3AED] focus-within:ring-1 focus-within:ring-[#7C3AED]/20 transition-all">
                    <Input className="flex-1 border-none shadow-none bg-transparent focus-visible:ring-0 h-9 text-sm" placeholder="메시지 입력..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
                    <Button size="icon" className="h-8 w-8 rounded-full bg-[#7C3AED] hover:bg-[#6D28D9] shadow-sm" onClick={handleSend}><Send className="w-4 h-4 text-white" /></Button>
                </div>
            </div>
            
            {/* 📤 공유된 게시물 상세 모달 */}
            <Dialog open={!!sharedItemModal} onOpenChange={(open) => { if (!open) { setSharedItemModal(null); setSharedPostDetail(null); } }}>
                <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-0">
                    {sharedItemModal && (
                        <>
                            {/* 헤더 */}
                            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
                                <div className="font-bold text-gray-800">
                                    {sharedItemModal.type === "post" ? "공유된 게시물" : "공유된 장소"}
                                </div>
                                <button 
                                    onClick={() => { setSharedItemModal(null); setSharedPostDetail(null); }}
                                    className="p-1 hover:bg-gray-100 rounded-full"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            
                            {loadingPost ? (
                                <div className="p-8 text-center">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-500 mb-2" />
                                    <p className="text-sm text-gray-400">불러오는 중...</p>
                                </div>
                            ) : sharedPostDetail ? (
                                <>
                                    {/* 이미지 */}
                                    {sharedPostDetail.image_urls && sharedPostDetail.image_urls.length > 0 && (
                                        <div className="aspect-square bg-gray-100">
                                            <img 
                                                src={sharedPostDetail.image_urls[0]} 
                                                alt="" 
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    )}
                                    
                                    {/* 게시물 정보 */}
                                    <div className="p-4 space-y-4">
                                        {/* 작성자 정보 */}
                                        <div className="flex items-center gap-3">
                                            <Avatar className="w-10 h-10 border">
                                                <AvatarFallback className="bg-purple-100 text-purple-600 font-bold">
                                                    {sharedPostDetail.user_name?.[0] || "U"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-bold text-gray-800">{sharedPostDetail.user_name || "사용자"}</div>
                                                <div className="text-xs text-gray-400">
                                                    {sharedPostDetail.created_at ? new Date(sharedPostDetail.created_at).toLocaleDateString() : ""}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* 내용 */}
                                        {sharedPostDetail.content && (
                                            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                                                {sharedPostDetail.content}
                                            </p>
                                        )}
                                        
                                        {/* 장소 정보 */}
                                        {sharedPostDetail.place_name && (
                                            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-xl">
                                                <MapPin className="w-4 h-4 text-purple-500" />
                                                <span>{sharedPostDetail.place_name}</span>
                                            </div>
                                        )}
                                        
                                        {/* 통계 */}
                                        <div className="flex items-center gap-4 pt-2 border-t text-gray-500">
                                            <div className="flex items-center gap-1 text-sm">
                                                <Heart className="w-4 h-4" />
                                                <span>{sharedPostDetail.likes_count || 0}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-sm">
                                                <MessageSquare className="w-4 h-4" />
                                                <span>{sharedPostDetail.comments_count || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : sharedItemModal.image ? (
                                // API에서 못 불러왔지만 공유 메시지에 이미지가 있는 경우
                                <>
                                    <div className="aspect-square bg-gray-100">
                                        <img 
                                            src={sharedItemModal.image} 
                                            alt="" 
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="p-4">
                                        <p className="text-gray-700 text-sm whitespace-pre-wrap">
                                            {sharedItemModal.content || sharedItemModal.name || ""}
                                        </p>
                                    </div>
                                </>
                            ) : (
                                // 장소인 경우 또는 정보가 없는 경우
                                <div className="p-6">
                                    <div className="text-center mb-4">
                                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <MapPin className="w-8 h-8 text-purple-500" />
                                        </div>
                                        <h3 className="font-bold text-lg text-gray-800">{sharedItemModal.name || "장소"}</h3>
                                        {sharedItemModal.content && (
                                            <p className="text-sm text-gray-500 mt-2">{sharedItemModal.content}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}