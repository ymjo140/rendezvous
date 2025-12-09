"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { ArrowLeft, Send, Loader2, X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const API_URL = "https://wemeet-backend-xqlo.onrender.com";

// 🌟 [추가] 홈 탭과 동일한 상세 키워드 옵션 정의
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

// 🌟 [수정됨] AI 모임 플래너 (홈 탭 스타일 필터 적용)
const MeetingPlanner = ({ roomId, onClose }: { roomId: string, onClose: () => void }) => {
    const [loading, setLoading] = useState(false)
    const [participants, setParticipants] = useState(2)
    const [budget, setBudget] = useState([3, 10]) 
    
    // 필터 상태
    const [selectedPurpose, setSelectedPurpose] = useState("식사");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) setSelectedTags(prev => prev.filter(t => t !== tag));
        else setSelectedTags(prev => [...prev, tag]);
    };

    const handlePlan = async () => {
        setLoading(true)
        try {
            const token = localStorage.getItem("token");
            
            // AI에게 보낼 프롬프트 데이터 구성
            const payload = {
                room_id: Number(roomId),
                participants: [], 
                purpose: selectedPurpose, 
                conditions: {
                    date: "today",
                    time: "19:00",
                    budget_range: budget,
                    category: selectedPurpose, // 대분류
                    tags: selectedTags,        // 사용자가 고른 상세 키워드 (예: 한식, 조용한)
                    detail_prompt: `목적: ${selectedPurpose}, 키워드: ${selectedTags.join(", ")}`
                }
            }

            const res = await fetch(`${API_URL}/api/meeting-flow`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    ...(token && { "Authorization": `Bearer ${token}` })
                },
                body: JSON.stringify(payload)
            })

            if(res.ok) {
                alert("AI가 조건을 분석하여 제안을 생성했습니다! 채팅창을 확인해주세요.")
                onClose()
            } else {
                alert("요청 실패. 잠시 후 다시 시도해주세요.")
            }
        } catch (e) { console.error(e); alert("오류 발생"); } 
        finally { setLoading(false) }
    }

    const currentOptions = AI_FILTER_OPTIONS[selectedPurpose];

    return (
        <div className="w-full bg-white border-2 border-[#7C3AED]/20 rounded-3xl p-5 shadow-lg relative overflow-hidden mb-4 animate-in slide-in-from-top-2">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#7C3AED] to-[#14B8A6]"></div>
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm text-[#7C3AED] flex items-center gap-1">
                    🤖 WeMeet AI 매니저
                </h3>
                <button onClick={onClose}><X className="w-4 h-4 text-gray-400"/></button>
            </div>
            
            <div className="space-y-5">
                {/* 1. 기본 설정 (인원, 예산) */}
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

                {/* 2. 목적 선택 (탭 스타일) */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500">오늘 모임의 목적은?</label>
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

                {/* 3. 상세 키워드 선택 (Tabs) */}
                <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                    <Tabs defaultValue={Object.keys(currentOptions.tabs)[0]} className="w-full">
                        <TabsList className="w-full h-8 bg-white mb-3 rounded-lg p-0.5 border border-gray-200">
                            {Object.keys(currentOptions.tabs).map(subKey => (
                                <TabsTrigger key={subKey} value={subKey} className="flex-1 h-full rounded-md text-[10px] font-bold data-[state=active]:bg-[#7C3AED]/10 data-[state=active]:text-[#7C3AED]">{subKey}</TabsTrigger>
                            ))}
                        </TabsList>
                        {Object.entries(currentOptions.tabs).map(([subKey, tags]: any) => (
                            <TabsContent key={subKey} value={subKey} className="mt-0">
                                <div className="flex flex-wrap gap-2">
                                    {tags.map((tag: string) => (
                                        <Badge 
                                            key={tag}
                                            variant="outline"
                                            onClick={() => toggleTag(tag)}
                                            className={`cursor-pointer px-3 py-1.5 rounded-xl text-xs transition-all ${selectedTags.includes(tag) ? "bg-white border-[#7C3AED] text-[#7C3AED] shadow-sm font-bold" : "bg-white border-gray-200 text-gray-500 font-medium hover:bg-gray-100"}`}
                                        >
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>
                </div>
                
                {/* 4. 선택된 태그 미리보기 및 전송 */}
                <div className="pt-2">
                    {selectedTags.length > 0 && (
                        <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide">
                            {selectedTags.map(t => <span key={t} className="text-[10px] text-[#7C3AED] bg-purple-50 px-2 py-0.5 rounded-md font-bold whitespace-nowrap">#{t}</span>)}
                        </div>
                    )}
                    <Button className="w-full bg-gradient-to-r from-[#7C3AED] to-[#14B8A6] hover:opacity-90 text-white font-bold h-11 rounded-xl shadow-md transition-transform active:scale-95" onClick={handlePlan} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : "✨ AI 맞춤 추천 받기"}
                    </Button>
                </div>
            </div>
        </div>
    )
}

const VoteCard = ({ data }: { data: any }) => {
    return (
        <div className="bg-white rounded-xl p-3 border shadow-sm max-w-[90%]">
            <div className="font-bold text-sm text-[#2dd4bf] mb-1">📍 장소 추천</div>
            <div className="font-bold text-gray-800">{data.place?.name}</div>
            <div className="text-xs text-gray-500 mb-2">{data.place?.category}</div>
            <div className="flex gap-1 mb-2 flex-wrap">
                {data.place?.tags?.map((t: string, i: number) => <span key={i} className="bg-gray-100 text-[10px] px-1 rounded text-gray-500">#{t}</span>)}
            </div>
            <Button className="w-full h-8 text-xs bg-teal-50 text-teal-600 hover:bg-teal-100 font-bold border border-teal-100">👍 투표하기 ({data.vote_count || 0})</Button>
        </div>
    )
}

export function ChatTab() {
    const [view, setView] = useState<'list' | 'room'>('list')
    const [rooms, setRooms] = useState<any[]>([])
    const [activeRoom, setActiveRoom] = useState<any>(null)
    const [messages, setMessages] = useState<any[]>([])
    const [input, setInput] = useState("")
    const [myId, setMyId] = useState<number | null>(null)
    const [showPlanner, setShowPlanner] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const init = async () => {
            const token = localStorage.getItem("token");
            if(token) {
                try {
                    const userRes = await fetch(`${API_URL}/api/users/me`, { headers: { "Authorization": `Bearer ${token}` } });
                    if (userRes.ok) {
                        const userData = await userRes.json();
                        setMyId(userData.id);
                    }
                } catch(e) {}
            }
            fetchRooms();
        }
        init()
    }, [])

    const fetchRooms = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/api/chat/rooms`, {
                headers: token ? { "Authorization": `Bearer ${token}` } : {}
            })
            if (res.ok) setRooms(await res.json())
        } catch(e) {}
    }

    useEffect(() => {
        let interval: NodeJS.Timeout
        if (view === 'room' && activeRoom) {
            setShowPlanner(false)
            fetchMessages()
            interval = setInterval(fetchMessages, 3000)
        }
        return () => clearInterval(interval)
    }, [view, activeRoom])

    const fetchMessages = async () => {
        if (!activeRoom) return
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/api/chat/${activeRoom.id}/messages`, {
                headers: token ? { "Authorization": `Bearer ${token}` } : {}
            })
            if (res.ok) setMessages(await res.json())
        } catch(e) {}
    }

    const handleSend = async () => {
        if (!input.trim() || !activeRoom) return
        try {
            const token = localStorage.getItem("token");
            await fetch(`${API_URL}/api/chat/message`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    ...(token && { "Authorization": `Bearer ${token}` }) 
                },
                body: JSON.stringify({ room_id: activeRoom.id, content: input, type: "text" })
            })
            setInput("")
            fetchMessages()
        } catch (e) { console.error(e) }
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
                                <Avatar className="w-12 h-12 border border-gray-100"><AvatarFallback className="bg-purple-50 text-[#7C3AED] font-bold">{room.name[0]}</AvatarFallback></Avatar>
                                <div className="flex-1 overflow-hidden py-1">
                                    <div className="flex justify-between items-center mb-1"><h3 className="font-bold text-sm text-gray-900 truncate">{room.name}</h3><span className="text-[10px] text-gray-400">방금 전</span></div>
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
                        <span className="text-[10px] text-gray-400 block">실시간 대화 중</span>
                    </div>
                </div>
                
                <Button 
                    size="sm"
                    onClick={() => setShowPlanner(!showPlanner)} 
                    className={`rounded-full transition-all font-bold shadow-sm ${showPlanner ? "bg-[#2dd4bf] text-white hover:bg-[#25c2af]" : "bg-white text-[#2dd4bf] border border-[#2dd4bf] hover:bg-teal-50"}`}
                >
                    AI 매니저 🤖
                </Button>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="flex flex-col gap-3 pb-4">
                    <div className="flex justify-center my-4"><span className="bg-gray-200/60 text-gray-500 text-[10px] px-3 py-1 rounded-full">대화가 시작되었습니다.</span></div>

                    {showPlanner && (
                        <MeetingPlanner roomId={activeRoom?.id} onClose={() => setShowPlanner(false)} />
                    )}

                    {messages.map((msg, i) => {
                        const isMe = msg.user_id === myId
                        let content = null
                        try {
                            const jsonContent = JSON.parse(msg.content)
                            if (jsonContent.type === "vote_card") content = <VoteCard data={jsonContent} />
                            else content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#7C3AED] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{jsonContent.text}</div>
                        } catch {
                            content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#7C3AED] text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>{msg.content}</div>
                        }
                        return (
                            <div key={i} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                {!isMe && <Avatar className="w-8 h-8 border border-white shadow-sm"><AvatarFallback className="text-[10px] bg-gray-100">{msg.name?.[0]}</AvatarFallback></Avatar>}
                                <div className="max-w-[75%] flex flex-col">
                                    {!isMe && <div className="text-[10px] text-gray-500 mb-1 ml-1">{msg.name}</div>}
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
        </div>
    )
}