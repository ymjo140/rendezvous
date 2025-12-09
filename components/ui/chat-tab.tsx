"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { ArrowLeft, Send, MoreVertical, Calendar, Clock, MapPin, Check, Loader2 } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

// 백엔드 주소
const API_URL = "https://wemeet-backend-xqlo.onrender.com";

// 🌟 [복구됨] AI 모임 플래너 컴포넌트
const MeetingPlanner = ({ roomId, onClose }: { roomId: string, onClose: () => void }) => {
    const [loading, setLoading] = useState(false)
    const [participants, setParticipants] = useState(2)
    const [budget, setBudget] = useState([3, 10]) // 예산 범위
    const [category, setCategory] = useState("전체")

    const handlePlan = async () => {
        setLoading(true)
        try {
            const token = localStorage.getItem("token");
            
            // AI에게 보낼 데이터 구성
            const payload = {
                room_id: Number(roomId), // 숫자로 변환
                participants: [], // 현재는 빈 배열 (백엔드 로직에 따라 수정 가능)
                purpose: "식사", 
                conditions: {
                    date: "today",
                    time: "19:00",
                    budget_range: budget,
                    category: category
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
                alert("AI가 모임 계획을 제안했습니다! (채팅을 확인해주세요)")
                onClose()
            } else {
                alert("AI 제안 요청 실패")
            }
        } catch (e) {
            console.error(e)
            alert("오류가 발생했습니다.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full bg-[#f0fdf4] border-2 border-[#dcfce7] rounded-3xl p-5 shadow-lg relative overflow-hidden mb-4 animate-in slide-in-from-top-2">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#2dd4bf]/30"></div>
            <h3 className="font-bold text-sm mb-1 text-teal-800">🤖 AI 모임 매니저</h3>
            <p className="text-xs text-gray-600 mb-4">원하는 조건을 입력하면 장소를 추천해드려요!</p>

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-12 text-gray-700">인원:</span>
                    <Input className="w-16 h-8 text-center bg-white" type="number" value={participants} onChange={(e) => setParticipants(Number(e.target.value))} />
                    <span className="text-xs font-bold text-gray-700">명</span>
                </div>
                
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700">예산 (1인당):</span>
                        <span className="text-xs text-[#2dd4bf] font-bold">{budget[0]}~{budget[1]}만원</span>
                    </div>
                    <Slider defaultValue={[3, 10]} max={30} step={1} className="py-2" onValueChange={setBudget} />
                </div>

                <div className="flex flex-wrap gap-2">
                    {["한식", "중식", "일식", "양식", "카페"].map(cat => (
                        <Button key={cat} variant={category === cat ? "default" : "outline"}
                            onClick={() => setCategory(cat)}
                            className={`h-7 text-xs rounded-full ${category === cat ? 'bg-[#2dd4bf] hover:bg-[#25c2af] border-none' : 'bg-white text-gray-600'}`}>{cat}</Button>
                    ))}
                </div>
                
                <Button className="w-full bg-[#2dd4bf] hover:bg-[#25c2af] text-white font-bold h-10 rounded-xl mt-2" onClick={handlePlan} disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : "✨ AI 제안 받기"}
                </Button>
            </div>
        </div>
    )
}

// 투표 카드 컴포넌트
const VoteCard = ({ data }: { data: any }) => {
    return (
        <div className="bg-white rounded-xl p-3 border shadow-sm max-w-[90%]">
            <div className="font-bold text-sm text-[#2dd4bf] mb-1">📍 장소 추천</div>
            <div className="font-bold text-gray-800">{data.place?.name}</div>
            <div className="text-xs text-gray-500 mb-2">{data.place?.category}</div>
            <div className="flex gap-1 mb-2">
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
    
    // 🌟 AI 플래너 표시 여부 상태
    const [showPlanner, setShowPlanner] = useState(false)
    
    const scrollRef = useRef<HTMLDivElement>(null)

    // 초기 데이터 로드
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

    // 채팅방 입장 시 메시지 폴링 및 플래너 초기화
    useEffect(() => {
        let interval: NodeJS.Timeout
        if (view === 'room' && activeRoom) {
            setShowPlanner(false) // 방 들어갈 때 플래너 닫기
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
            if (res.ok) {
                const msgs = await res.json()
                setMessages(msgs)
            }
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

    // 1. 채팅방 목록 뷰
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
                                <Avatar className="w-12 h-12 border border-gray-100">
                                    <AvatarFallback className="bg-purple-50 text-[#7C3AED] font-bold">{room.name[0]}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 overflow-hidden py-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className="font-bold text-sm text-gray-900 truncate">{room.name}</h3>
                                        <span className="text-[10px] text-gray-400">방금 전</span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">{room.last_message || "대화를 시작해보세요."}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="p-10 text-center text-gray-400 text-sm">
                                참여 중인 대화방이 없습니다.<br />모임에 참여해보세요!
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        )
    }

    // 2. 채팅방 상세 뷰
    return (
        <div className="flex flex-col h-full bg-[#f8fafc] font-['Pretendard']">
            {/* 채팅방 헤더 */}
            <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-20 justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setView('list')} className="-ml-2 h-9 w-9"><ArrowLeft className="w-5 h-5 text-gray-600" /></Button>
                    <div>
                        <h2 className="font-bold text-sm text-gray-900 truncate max-w-[150px]">{activeRoom?.name}</h2>
                        <span className="text-[10px] text-gray-400 block">실시간 대화 중</span>
                    </div>
                </div>
                
                {/* 🌟 [복구됨] 우측 상단 AI(WM) 버튼 */}
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setShowPlanner(!showPlanner)} 
                    className={`rounded-full transition-all border ${showPlanner ? "bg-[#2dd4bf]/10 text-[#2dd4bf] border-[#2dd4bf]" : "text-gray-400 border-transparent hover:bg-gray-100"}`}
                >
                    <span className="text-lg">🤖</span>
                </Button>
            </div>

            {/* 메시지 영역 */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="flex flex-col gap-3 pb-4">
                    {/* 시스템 환영 메시지 */}
                    <div className="flex justify-center my-4">
                        <span className="bg-gray-200/60 text-gray-500 text-[10px] px-3 py-1 rounded-full">대화가 시작되었습니다.</span>
                    </div>

                    {/* 🌟 AI 플래너가 켜져있으면 표시 */}
                    {showPlanner && (
                        <MeetingPlanner roomId={activeRoom?.id} onClose={() => setShowPlanner(false)} />
                    )}

                    {/* 메시지 리스트 */}
                    {messages.map((msg, i) => {
                        const isMe = msg.user_id === myId
                        let content = null
                        
                        // JSON 메시지 파싱 (투표 카드 등)
                        try {
                            const jsonContent = JSON.parse(msg.content)
                            if (jsonContent.type === "vote_card") content = <VoteCard data={jsonContent} />
                            else content = <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-[#7C3AED] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{jsonContent.text}</div>
                        } catch {
                            // 일반 텍스트
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

            {/* 메시지 입력창 */}
            <div className="p-3 bg-white border-t safe-area-bottom">
                <div className="flex gap-2 items-center bg-gray-50 px-3 py-1.5 rounded-3xl border border-gray-200 focus-within:border-[#7C3AED] focus-within:ring-1 focus-within:ring-[#7C3AED]/20 transition-all">
                    <Input
                        className="flex-1 border-none shadow-none bg-transparent focus-visible:ring-0 h-9 text-sm"
                        placeholder="메시지를 입력하세요..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                    />
                    <Button size="icon" className="h-8 w-8 rounded-full bg-[#7C3AED] hover:bg-[#6D28D9] shadow-sm transition-transform active:scale-95" onClick={handleSend}>
                        <Send className="w-4 h-4 text-white" />
                    </Button>
                </div>
            </div>
        </div>
    )
}