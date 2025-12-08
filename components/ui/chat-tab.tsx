import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { ArrowLeft, Send, MoreVertical, Calendar, Clock, MapPin, Check } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// --- Components ---

const MeetingPlanner = ({ roomId, onClose }: { roomId: string, onClose: () => void }) => {
    const [loading, setLoading] = useState(false)
    const [participants, setParticipants] = useState(2)
    const [date, setDate] = useState("")
    const [time, setTime] = useState("")
    const [budget, setBudget] = useState([3, 10])
    const [category, setCategory] = useState("전체")

    const handlePlan = async () => {
        setLoading(true)
        try {
            const payload = {
                room_id: roomId,
                participants: [{ id: 1, name: "Me" }], // Placeholder logic
                purpose: "식사", // Default
                manual_locations: [],
                conditions: {
                    date: date || "today",
                    time: time || "19:00",
                    budget_range: budget,
                    category
                }
            }
            // Note: Actual API payload structure might vary slightly based on backend
            // For now sending minimal valid data
            await fetchWithAuth("/api/meeting-flow", {
                method: "POST",
                body: JSON.stringify(payload)
            })
            alert("AI가 모임 계획을 제안했습니다!")
            onClose()
        } catch (e) {
            console.error(e)
            alert("AI 제안 실패")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full bg-[#f0fdf4] border-2 border-[#dcfce7] rounded-3xl p-5 shadow-lg relative overflow-hidden mb-4">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#2dd4bf]/30"></div>
            <h3 className="font-bold text-sm mb-1">AI 모임 매니저 실행!</h3>
            <p className="text-xs text-gray-600 mb-4">원하는 모임 조건을 설정해주세요.</p>

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-12">인원:</span>
                    <Input className="w-16 h-8 text-center bg-white" placeholder="2" value={participants} onChange={(e) => setParticipants(Number(e.target.value))} />
                    <span className="text-xs font-bold">명</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-12">예산:</span>
                    <span className="text-xs text-[#2dd4bf]">{budget[0]}~{budget[1]}만원</span>
                </div>
                <Slider defaultValue={[3, 10]} max={30} step={1} className="py-2" onValueChange={setBudget} />

                <div className="flex flex-wrap gap-2">
                    {["한식", "중식", "일식", "양식", "카페"].map(cat => (
                        <Button key={cat} variant={category === cat ? "default" : "outline"}
                            onClick={() => setCategory(cat)}
                            className={`h-7 text-xs ${category === cat ? 'bg-[#2dd4bf] hover:bg-[#25c2af]' : 'bg-white text-gray-600'}`}>{cat}</Button>
                    ))}
                </div>
                <Button className="w-full bg-[#2dd4bf] hover:bg-[#25c2af] text-white font-bold h-10 rounded-xl mt-2" onClick={handlePlan} disabled={loading}>
                    {loading ? "분석 중..." : "AI 제안 받기"}
                </Button>
            </div>
        </div>
    )
}

const ProposalCard = ({ data, onVote }: { data: any, onVote: () => void }) => {
    // Assuming data structure based on backend models
    return (
        <div className="bg-white rounded-xl p-3 border shadow-sm max-w-[80%]">
            <div className="font-bold text-sm text-[#6366f1] mb-1">📅 스마트 모임 제안</div>
            <div className="text-xs text-gray-700 whitespace-pre-wrap">{data.text || "모임 제안 내용"}</div>
            <Button className="w-full mt-2 h-8 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100" onClick={onVote}>자세히 보기</Button>
        </div>
    )
}

const VoteCard = ({ data }: { data: any }) => {
    return (
        <div className="bg-white rounded-xl p-3 border shadow-sm max-w-[80%]">
            <div className="font-bold text-sm text-[#2dd4bf] mb-1">📍 장소 추천</div>
            <div className="font-bold text-gray-800">{data.place?.name}</div>
            <div className="text-xs text-gray-500 mb-2">{data.place?.category}</div>
            <div className="flex gap-1 mb-2">
                {data.place?.tags?.map((t: string) => <span key={t} className="bg-gray-100 text-[10px] px-1 rounded">{t}</span>)}
            </div>
            <Button className="w-full h-8 text-xs bg-teal-50 text-teal-600 hover:bg-teal-100">👍 투표 ({data.vote_count || 0})</Button>
        </div>
    )
}

export function ChatTab() {
    const [view, setView] = useState<'list' | 'room'>('list')
    const [rooms, setRooms] = useState<any[]>([])
    const [activeRoom, setActiveRoom] = useState<any>(null)
    const [messages, setMessages] = useState<any[]>([])
    const [input, setInput] = useState("")
    const [showPlanner, setShowPlanner] = useState(false)
    const [myId, setMyId] = useState<number | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Load Initial Data
    useEffect(() => {
        const init = async () => {
            const userRes = await fetchWithAuth("/api/users/me")
            if (userRes.ok) {
                const userData = await userRes.json()
                setMyId(userData.id)
            }
            fetchRooms()
        }
        init()
    }, [])

    const fetchRooms = async () => {
        const res = await fetchWithAuth("/api/chat/rooms")
        if (res.ok) setRooms(await res.json())
    }

    // Load Messages when room active
    useEffect(() => {
        let interval: NodeJS.Timeout
        if (view === 'room' && activeRoom) {
            fetchMessages()
            interval = setInterval(fetchMessages, 3000)
        }
        return () => clearInterval(interval)
    }, [view, activeRoom])

    const fetchMessages = async () => {
        if (!activeRoom) return
        const res = await fetchWithAuth(`/api/chat/${activeRoom.id}/messages`)
        if (res.ok) {
            const msgs = await res.json()
            setMessages(msgs)
            // Scroll to bottom if new messages (simple implementation)
            // if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }

    const handleSend = async () => {
        if (!input.trim() || !activeRoom) return
        try {
            await fetchWithAuth("/api/chat/message", {
                method: "POST",
                body: JSON.stringify({ room_id: activeRoom.id, content: input, type: "text" })
            })
            setInput("")
            fetchMessages()
        } catch (e) { console.error(e) }
    }

    // --- Render ---

    if (view === 'list') {
        return (
            <div className="flex flex-col h-full bg-slate-50">
                <div className="bg-white p-4 shadow-sm sticky top-0 z-10">
                    <h1 className="text-lg font-bold">채팅</h1>
                </div>
                <ScrollArea className="flex-1">
                    <div className="divide-y divide-slate-100">
                        {rooms.map(room => (
                            <div key={room.id} onClick={() => { setActiveRoom(room); setView('room'); }} className="p-4 bg-white hover:bg-slate-50 cursor-pointer flex gap-3">
                                <Avatar><AvatarFallback>{room.name[0]}</AvatarFallback></Avatar>
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className="font-bold text-sm truncate">{room.name}</h3>
                                        <span className="text-[10px] text-gray-400">{room.time}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">{room.lastMessage}</p>
                                </div>
                            </div>
                        ))}
                        {rooms.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">참여 중인 대화방이 없습니다.<br />모임에 참여해보세요!</div>}
                    </div>
                </ScrollArea>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc]"> {/* bg-slate-50 but trying a different tone */}
            {/* Header */}
            <div className="bg-white p-3 flex items-center shadow-sm sticky top-0 z-20">
                <Button variant="ghost" size="icon" onClick={() => setView('list')}><ArrowLeft className="w-5 h-5" /></Button>
                <div className="flex-1 ml-2">
                    <h2 className="font-bold text-sm truncate">{activeRoom?.name}</h2>
                    <span className="text-[10px] text-gray-500">참여자 {activeRoom?.id ? '...' : ''}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowPlanner(!showPlanner)} className={showPlanner ? "text-[#2dd4bf] bg-teal-50" : "text-gray-500"}>
                    <div className="flex flex-col items-center">
                        <span className="text-lg leading-3">🤖</span>
                    </div>
                </Button>
            </div>

            {/* Chat Area */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="flex flex-col gap-4 pb-4">
                    {/* Welcome System Msg */}
                    <div className="flex justify-center my-4">
                        <span className="bg-gray-200 text-gray-500 text-[10px] px-3 py-1 rounded-full">대화가 시작되었습니다.</span>
                    </div>

                    {messages.map((msg, i) => {
                        const isMe = msg.user_id === myId
                        let content = null
                        try {
                            const jsonContent = JSON.parse(msg.content)
                            if (jsonContent.type === "vote_card") content = <VoteCard data={jsonContent} />
                            else if (jsonContent.type === "proposal") content = <ProposalCard data={jsonContent} onVote={() => { }} />
                            else if (jsonContent.type === "system") return <div key={i} className="flex justify-center"><span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded">{jsonContent.text}</span></div>
                            else content = <div className={`px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-[#2dd4bf] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{jsonContent.text}</div>
                        } catch {
                            content = <div className={`px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-[#2dd4bf] text-white rounded-tr-none' : 'bg-white text-gray-800 border rounded-tl-none'}`}>{msg.content}</div>
                        }

                        return (
                            <div key={i} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                {!isMe && <Avatar className="w-8 h-8"><AvatarFallback className="text-[10px]">{msg.name[0]}</AvatarFallback></Avatar>}
                                <div className="max-w-[70%]">
                                    {!isMe && <div className="text-[10px] text-gray-500 mb-1 ml-1">{msg.name}</div>}
                                    {content}
                                    <div className={`text-[9px] text-gray-400 mt-1 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>{msg.timestamp}</div>
                                </div>
                            </div>
                        )
                    })}

                    {/* Planner Area */}
                    {showPlanner && (
                        <div className="flex items-start gap-2 mt-4 anime-fade-in">
                            <div className="w-8 h-8 bg-[#2dd4bf] rounded-full flex items-center justify-center text-white text-lg shadow-md border-2 border-white">🤖</div>
                            <div className="flex-1 max-w-[85%]">
                                <MeetingPlanner roomId={activeRoom?.id} onClose={() => setShowPlanner(false)} />
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-3 bg-white border-t safe-area-bottom">
                <div className="flex gap-2 items-center bg-slate-50 px-3 py-1 rounded-full border">
                    <Input
                        className="flex-1 border-none shadow-none bg-transparent focus-visible:ring-0 h-9"
                        placeholder="메시지 입력..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                    />
                    <Button size="icon" className="h-8 w-8 rounded-full bg-[#2dd4bf] hover:bg-[#25c2af]" onClick={handleSend}>
                        <Send className="w-4 h-4 text-white" />
                    </Button>
                </div>
            </div>
        </div>
    )
}