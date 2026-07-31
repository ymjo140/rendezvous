"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Send, Loader2, X, LogOut, Calendar, CalendarCheck, MapPin, Check, ChevronDown, ThumbsUp, UserPlus, Globe, Lock, List, Users, Settings, Plus, ImageIcon, Video, History, Calculator, Pencil, Bell, ChevronRight, Search } from "lucide-react"
import {
    PollCard, PlacePollComposer, SchedulePollComposer, CandidateSheet,
    HistorySheet, SettlementComposer, SettlementCard, PollConfirmedCard,
    fetchPoll, type Poll,
    SplitCard, SplitComposer, SplitBanner, fetchSplit, type Split,
} from "@/components/ui/chat-poll"
import { compressImageFile } from "@/lib/image"
import { validateAndUploadVideo } from "@/lib/video"
import { useFriends } from "@/hooks/use-friends"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { API_BASE_URL, fetchWithAuth } from "@/lib/api-client"
import { useMe } from "@/hooks/use-me"

// 🌟 [핵심] 주소를 여기서 직접 관리 (커뮤니티 탭과 통일)
const WS_BASE_URL =
    process.env.NEXT_PUBLIC_WS_URL ||
    (API_BASE_URL ? API_BASE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:") : "")

const fetchChatAPI = async (endpoint: string, options: RequestInit = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`?? Chat ??: ${url}`);
    return fetchWithAuth(endpoint, options);
};

type ChatMember = { id: number; name: string; is_me?: boolean; lat?: number | null; lng?: number | null; location_name?: string | null }

// 🌟 [VoteCard] 투표 및 확정 기능 (레거시 meeting-flow 메시지용)
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

// ➕ 채팅방 만들기 시트 — 친구 목록/검색 → 다중 선택 → 1명=1:1, 2명+=모임(비공개)
const CreateRoomSheet = ({ onClose, onCreated }: { onClose: () => void; onCreated: (room: any) => void }) => {
    const { friends, isLoading } = useFriends()
    const [q, setQ] = useState("")
    const [selected, setSelected] = useState<number[]>([])
    const [title, setTitle] = useState("")
    const [busy, setBusy] = useState(false)

    const list = (friends || []).filter(
        (f: any) => !q.trim() || String(f.name || "").toLowerCase().includes(q.trim().toLowerCase())
    )
    const toggle = (id: number) =>
        setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

    const create = async () => {
        if (selected.length === 0 || busy) return
        setBusy(true)
        try {
            const res = await fetchChatAPI(`/api/chat/rooms`, {
                method: "POST",
                body: JSON.stringify({ member_ids: selected, title: title.trim() }),
            })
            if (res.ok) {
                onCreated(await res.json())
                onClose()
            } else {
                const d = await res.json().catch(() => null)
                alert(d?.detail || "채팅방 생성에 실패했어요.")
            }
        } catch {
            alert("오류가 발생했어요.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
            <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-7 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
                <h3 className="font-bold text-gray-900 mb-1">새 채팅방</h3>
                <p className="text-xs text-gray-400 mb-3">친구 1명이면 1:1, 여러 명이면 모임 채팅방이 만들어져요.</p>

                {selected.length >= 2 && (
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="모임 이름 (비우면 자동)"
                        className="h-10 text-sm mb-2"
                    />
                )}

                <div className="flex items-center border rounded-xl px-3 bg-gray-50 mb-2">
                    <Search className="w-4 h-4 text-gray-400 mr-2" />
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="친구 이름 검색"
                        className="border-none bg-transparent h-10 text-sm focus-visible:ring-0"
                    />
                </div>

                {selected.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                        {selected.map((id) => {
                            const f: any = (friends || []).find((x: any) => x.id === id)
                            return (
                                <button key={id} onClick={() => toggle(id)} className="text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-1">
                                    {f?.name || id} ✕
                                </button>
                            )
                        })}
                    </div>
                )}

                <div className="space-y-0.5 max-h-[38vh] overflow-y-auto mb-3">
                    {isLoading ? (
                        <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" /></div>
                    ) : list.length === 0 ? (
                        <div className="py-8 text-center text-xs text-gray-400">
                            {q.trim() ? "검색 결과가 없어요." : "아직 친구가 없어요. 마이페이지에서 친구를 추가해보세요!"}
                        </div>
                    ) : (
                        list.map((f: any) => {
                            const on = selected.includes(f.id)
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => toggle(f.id)}
                                    className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${on ? "bg-amber-50" : "hover:bg-gray-50"}`}
                                >
                                    <Avatar className="w-9 h-9">
                                        <AvatarFallback className="bg-amber-50 text-[#F5A623] text-xs font-bold">{f.name?.[0] || "?"}</AvatarFallback>
                                    </Avatar>
                                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">{f.name}</span>
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${on ? "bg-[#F5A623] text-white" : "border border-gray-200 text-transparent"}`}>
                                        <Check className="w-3 h-3" />
                                    </span>
                                </button>
                            )
                        })
                    )}
                </div>

                <Button
                    onClick={create}
                    disabled={selected.length === 0 || busy}
                    className="w-full h-11 rounded-xl bg-[#F5A623] hover:bg-[#D97706]"
                >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> :
                        selected.length === 0 ? "친구를 선택하세요" :
                        selected.length === 1 ? "1:1 채팅 시작" : `모임 만들기 (${selected.length + 1}명)`}
                </Button>
            </div>
        </div>
    )
}

// Props 타입 정의
interface ChatTabProps {
    openRoomId?: string | null;
    openRoomTitle?: string | null;
    onRoomOpened?: () => void;
}

// 🌟 [ChatTab] 메인 컴포넌트
export function ChatTab({ openRoomId, openRoomTitle, onRoomOpened }: ChatTabProps = {}) {
    const router = useRouter()
    // 방을 지정해 들어오면(크루 💬, 푸시 알림) 목록을 거치지 않는다.
    // 예전엔 /api/chat/rooms 응답을 기다리는 동안 채팅 목록이 먼저 떴다가 방으로
    // 갈아탔다 — 콜드스타트면 그 목록이 몇 초씩 보인다. 방을 여는 데 필요한 건
    // id뿐이라(메시지·WS·멤버 전부 id로 붙는다) 껍데기로 먼저 열고 제목만 채운다.
    const [view, setView] = useState<'list' | 'room'>(openRoomId ? 'room' : 'list')
    const [rooms, setRooms] = useState<any[]>([])
    const [activeRoom, setActiveRoom] = useState<any>(
        openRoomId ? { id: openRoomId, title: openRoomTitle || "" } : null
    )
    const [messages, setMessages] = useState<any[]>([])
    const [input, setInput] = useState("")
    const { me } = useMe()
    const myId = me?.id ?? null
    const [rootTab, setRootTab] = useState("open")
    const [isConnected, setIsConnected] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const socketRef = useRef<WebSocket | null>(null)

    // ➕ 플러스 메뉴 & 기능 시트
    const [plusOpen, setPlusOpen] = useState(false)
    const [composer, setComposer] = useState<null | "place" | "schedule" | "settlement" | "history" | "split">(null)
    const [candidatePoll, setCandidatePoll] = useState<Poll | null>(null)
    // 투표 카드 상태(poll_id → Poll) — WS poll_update로 실시간 갱신
    const [pollsById, setPollsById] = useState<Record<number, Poll>>({})
    const pollsRef = useRef<Record<number, Poll>>({})
    pollsRef.current = pollsById
    const upsertPoll = (p: Poll) => setPollsById((prev) => ({ ...prev, [p.id]: p }))
    // 💳 분담 카드 상태(split_id → Split)
    const [splitsById, setSplitsById] = useState<Record<number, Split>>({})
    const splitsRef = useRef<Record<number, Split>>({})
    splitsRef.current = splitsById
    const upsertSplit = (s: Split) => setSplitsById((prev) => ({ ...prev, [s.id]: s }))
    // ⚙️ 설정 시트
    const [settingsOpen, setSettingsOpen] = useState(false)
    // 미디어 첨부
    const imageInputRef = useRef<HTMLInputElement>(null)
    const videoInputRef = useRef<HTMLInputElement>(null)
    const [mediaSending, setMediaSending] = useState(false)

    // 목록 화면: 방 만들기 + 방 검색
    const [createRoomOpen, setCreateRoomOpen] = useState(false)
    const [roomSearchOpen, setRoomSearchOpen] = useState(false)
    const [roomQuery, setRoomQuery] = useState("")

    // 친구 초대
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [friends, setFriends] = useState<any[]>([])
    const [inviteLoading, setInviteLoading] = useState(false)
    const [invitedIds, setInvitedIds] = useState<number[]>([])

    // 채팅방 멤버
    const [members, setMembers] = useState<ChatMember[]>([])
    const [membersOpen, setMembersOpen] = useState(false)
    // 🍽️ 맛집 모임 공개 설정(방장만) — 룸 id == 모임 id
    const [groupInfo, setGroupInfo] = useState<any>(null)
    const [visSaving, setVisSaving] = useState(false)

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
        // 장소 상세 등 다녀와도 보던 채팅방으로 복원(뒤로가기 시 방 유지)
        // 단, openRoomId로 특정 방을 지정해 들어온 경우(크루 채팅 딥링크)는 복원 생략
        // — 이전 방(데모모임 등)이 먼저 떴다가 갈아타는 깜빡임 방지
        if (openRoomId) return
        try {
            const saved = sessionStorage.getItem("chat:openRoom")
            if (saved) {
                const r = JSON.parse(saved)
                if (r?.id) {
                    setActiveRoom(r)
                    setView("room")
                }
            }
        } catch { /* ignore */ }
    }, [])
    
    // 📤 목록이 도착하면 껍데기를 진짜 방 정보로 교체(제목·그룹 여부 등).
    // id가 같아서 메시지·WS는 다시 붙지 않는다(아래 효과가 activeRoom?.id에 걸려 있다).
    //
    // ★한 번만 연다★ — 방에서 뒤로 가면 fetchRooms()가 돌아 rooms가 새 배열이 되고,
    // 그때 이 효과가 다시 방을 열어버려서 목록으로 못 나가고 갇힌다(/chats는
    // onRoomOpened를 안 넘겨서 openRoomId가 계속 남아 있다).
    const deepLinkOpened = useRef(false)
    useEffect(() => {
        if (!openRoomId || rooms.length === 0) return
        const room = rooms.find(r => r.id === openRoomId)
        if (!room) return
        setRootTab("open")
        setActiveRoom((prev: any) => (prev && prev.id !== room.id ? prev : room))
        if (!deepLinkOpened.current) {
            deepLinkOpened.current = true
            setView('room')
            onRoomOpened?.()
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

    // 현재 방 저장 — 상세 페이지 갔다 와도 이 방으로 복원.
    // WS 효과와 분리한 이유: 제목이 나중에 채워질 때 재연결이 일어나면 안 된다.
    useEffect(() => {
        if (view !== 'room' || !activeRoom?.id) return
        try {
            sessionStorage.setItem("chat:openRoom", JSON.stringify({
                id: activeRoom.id, title: activeRoom.title, is_group: activeRoom.is_group,
            }))
        } catch { /* ignore */ }
    }, [view, activeRoom])

    // WebSocket 연결 및 실시간 수신
    useEffect(() => {
        if (view === 'room' && activeRoom?.id) {
            setPlusOpen(false)
            setComposer(null)
            setCandidatePoll(null)
            setMembersOpen(false)
            setSettingsOpen(false)
            fetchMembers(activeRoom.id)
            fetchGroupInfo(activeRoom.id)
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
                const data = JSON.parse(event.data);
                // 투표 상태 변경은 메시지가 아니라 카드 갱신
                // (브로드캐스트엔 내 투표/작성자 플래그가 없어서 기존 상태와 병합)
                if (data?.type === "poll_update" && data.poll?.id) {
                    const old = pollsRef.current[data.poll.id];
                    if (!old) {
                        fetchPoll(data.poll.id).then((p) => { if (p) upsertPoll(p) });
                        return;
                    }
                    const mine = new Set(old.options.filter((o) => o.voted_by_me).map((o) => o.id));
                    const merged = {
                        ...data.poll,
                        is_creator: old.is_creator,
                        options: data.poll.options.map((o: any) => ({ ...o, voted_by_me: mine.has(o.id) })),
                    };
                    setPollsById(prev => ({ ...prev, [merged.id]: merged }));
                    return;
                }
                // 분담 카드 갱신(개인 플래그 없음 — 그대로 교체)
                if (data?.type === "split_update" && data.split?.id) {
                    setSplitsById(prev => ({ ...prev, [data.split.id]: data.split }));
                    return;
                }
                // 메시지 삭제(투표 삭제 등) — 전원 화면에서 제거
                if (data?.type === "message_deleted" && data.message_id) {
                    setMessages(prev => prev.filter((m: any) => m.id !== data.message_id));
                    return;
                }
                setMessages(prev => [...prev, data]);
                setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
            };
            ws.onclose = () => { setIsConnected(false); setTimeout(() => { if (view === 'room' && activeRoom) ws.close(); }, 3000); };
            socketRef.current = ws;

            return () => {
                if (ws.readyState === 1) ws.close();
            };
        }
    }, [view, activeRoom?.id])

    // 메시지에 등장하는 투표/분담 카드 로드(캐시에 없는 것만)
    useEffect(() => {
        const ids: number[] = []
        const sids: number[] = []
        messages.forEach((m: any) => {
            try {
                const c = JSON.parse(m.content)
                if (c?.type === "poll" && c.poll_id && !pollsRef.current[c.poll_id] && ids.indexOf(c.poll_id) < 0) {
                    ids.push(c.poll_id)
                }
                if (c?.type === "split" && c.split_id && !splitsRef.current[c.split_id] && sids.indexOf(c.split_id) < 0) {
                    sids.push(c.split_id)
                }
            } catch { /* text */ }
        })
        ids.forEach((id) => fetchPoll(id).then((p) => { if (p) upsertPoll(p) }))
        sids.forEach((id) => fetchSplit(id).then((s) => { if (s) upsertSplit(s) }))
    }, [messages])

    // 구조화 메시지(payload) 전송 — 사진/영상/정산
    const sendPayload = async (payload: any) => {
        if (!activeRoom) return false
        try {
            const res = await fetchChatAPI(`/api/chat/message`, {
                method: "POST",
                body: JSON.stringify({ room_id: String(activeRoom.id), payload }),
            })
            if (res.ok && (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)) fetchMessages()
            return res.ok
        } catch { return false }
    }

    const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        e.target.value = ""
        if (!f) return
        setMediaSending(true)
        setPlusOpen(false)
        try {
            const dataUrl = await compressImageFile(f)
            if (!(await sendPayload({ type: "image", url: dataUrl }))) alert("사진 전송에 실패했어요.")
        } catch { alert("사진 처리에 실패했어요.") } finally { setMediaSending(false) }
    }

    const onPickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        e.target.value = ""
        if (!f) return
        setMediaSending(true)
        setPlusOpen(false)
        try {
            const { url } = await validateAndUploadVideo(f)
            if (!(await sendPayload({ type: "video", url }))) alert("영상 전송에 실패했어요.")
        } catch (err: any) { alert(err?.message || "영상 처리에 실패했어요.") } finally { setMediaSending(false) }
    }

    const handleLeaveRoom = async () => {
        if (!activeRoom) return;
        if (!confirm("채팅방을 나가시겠습니까? 관련 모임 목록에서도 사라집니다.")) return;

        try {
            const res = await fetchChatAPI(`/api/chat/rooms/${activeRoom.id}/leave`, { method: "POST" });

            if (res.ok) {
                alert("채팅방을 나갔습니다.");
                try { sessionStorage.removeItem("chat:openRoom") } catch {}
                setView('list');
                fetchRooms();
            } else {
                alert("나가기 실패: 잠시 후 다시 시도해주세요.");
            }
        } catch (e) { alert("오류 발생"); }
    };

    // 이 채팅방이 '맛집 모임'인지 + 내가 방장인지 조회 (룸 id == 모임 id)
    const fetchGroupInfo = async (roomId: string) => {
        try {
            const res = await fetchChatAPI(`/api/groups/${roomId}`)
            setGroupInfo(res.ok ? await res.json() : null)
        } catch { setGroupInfo(null) }
    };

    // 모임 공개 수준 변경(방장만)
    const saveVisibility = async (v: string) => {
        if (!activeRoom || visSaving) return
        setVisSaving(true)
        try {
            const res = await fetchChatAPI(`/api/groups/${activeRoom.id}/visibility`, {
                method: "PATCH",
                body: JSON.stringify({ visibility: v }),
            })
            if (res.ok) {
                const d = await res.json()
                setGroupInfo((p: any) => (p ? { ...p, visibility: d.visibility } : p))
            } else if (res.status === 403) {
                alert("모임장만 변경할 수 있어요.")
            } else {
                alert("변경에 실패했어요.")
            }
        } catch { alert("오류가 발생했어요.") } finally { setVisSaving(false) }
    };

    // 채팅에서 공유된 장소를 우리 모임 맛집 리스트에 저장(멤버)
    const savePlaceToGroup = async (e: any, item: any) => {
        e.stopPropagation()
        if (!activeRoom || !item?.place_id) return
        try {
            const res = await fetchChatAPI(`/api/groups/${activeRoom.id}/save-place`, {
                method: "POST",
                body: JSON.stringify({ place_id: item.place_id }),
            })
            if (res.ok) {
                const d = await res.json()
                alert(d.saved ? `'${d.folder_name}'에 저장했어요! (${d.item_count}곳)` : "이미 저장된 곳이에요.")
            } else if (res.status === 403) {
                alert("모임 멤버만 저장할 수 있어요.")
            } else {
                alert("저장에 실패했어요.")
            }
        } catch { alert("오류가 발생했어요.") }
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

    if (view === 'list') {
        return (
            <div className="flex flex-col h-full bg-[#F3F4F6] font-['Pretendard']">
                <div className="flex-1 overflow-hidden">
                    <div className="flex flex-col h-full">
                        <div className="bg-white p-5 pb-4 shadow-sm sticky top-0 z-10">
                            <div className="flex items-center justify-between">
                                <h1 className="text-xl font-bold text-gray-900">채팅</h1>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => { setRoomSearchOpen((v) => !v); setRoomQuery("") }}
                                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${roomSearchOpen ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-50"}`}
                                        title="채팅방 검색"
                                    >
                                        <Search className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => setCreateRoomOpen(true)}
                                        className="w-9 h-9 rounded-full bg-[#F5A623] text-white flex items-center justify-center shadow-sm hover:bg-[#D97706]"
                                        title="채팅방 만들기"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            {roomSearchOpen && (
                                <div className="mt-3 flex items-center border rounded-xl px-3 bg-gray-50">
                                    <Search className="w-4 h-4 text-gray-400 mr-2" />
                                    <Input
                                        autoFocus
                                        value={roomQuery}
                                        onChange={(e) => setRoomQuery(e.target.value)}
                                        placeholder="채팅방 이름 검색"
                                        className="border-none bg-transparent h-9 text-sm focus-visible:ring-0"
                                    />
                                    {roomQuery && (
                                        <button onClick={() => setRoomQuery("")}>
                                            <X className="w-4 h-4 text-gray-300" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                            <div className="divide-y divide-gray-100 pb-20">
                                {(() => {
                                    const visibleRooms = roomQuery.trim()
                                        ? rooms.filter((r) => String(r.title || "").toLowerCase().includes(roomQuery.trim().toLowerCase()))
                                        : rooms
                                    if (visibleRooms.length === 0 && roomQuery.trim()) {
                                        return <div className="p-10 text-center text-gray-400 text-sm">'{roomQuery.trim()}' 채팅방이 없어요.</div>
                                    }
                                    return null
                                })()}
                                {rooms.length > 0 ? rooms.filter((r) => !roomQuery.trim() || String(r.title || "").toLowerCase().includes(roomQuery.trim().toLowerCase())).map(room => (
                                    <div key={room.id} onClick={() => { setActiveRoom(room); setView('room'); }} className="p-4 bg-white hover:bg-gray-50 cursor-pointer flex gap-3 transition-colors">
                                        <Avatar className="w-12 h-12 border border-gray-100"><AvatarFallback className="bg-amber-50 text-[#F5A623] font-bold">{room.title[0]}</AvatarFallback></Avatar>
                                        <div className="flex-1 overflow-hidden py-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <h3 className="font-bold text-sm text-gray-900 truncate">{room.title}</h3>
                                                <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{room.last_time || ""}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs text-gray-500 truncate">{room.last_message || "대화를 시작해보세요."}</p>
                                                {(room.unread ?? 0) > 0 && (
                                                    <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                                        {room.unread > 99 ? "99+" : room.unread}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )) : <div className="p-10 text-center text-gray-400 text-sm">참여 중인 대화방이 없습니다.</div>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ➕ 채팅방 만들기 시트 */}
                {createRoomOpen && (
                    <CreateRoomSheet
                        onClose={() => setCreateRoomOpen(false)}
                        onCreated={(d) => {
                            fetchRooms()
                            setActiveRoom({ id: d.room_id, title: d.title, is_group: d.is_group })
                            setView("room")
                        }}
                    />
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] font-['Pretendard']">
            <div className="flex-1 flex flex-col min-h-0">
                <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-20 justify-between">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => {
                        try { sessionStorage.removeItem("chat:openRoom") } catch {}
                        // 나가면서 읽음 처리 → 목록 뱃지 초기화
                        if (activeRoom) fetchChatAPI(`/api/chat/${activeRoom.id}/read`, { method: "POST" }).catch(() => {})
                        // 크루에서 바로 들어온 방이면 왔던 곳으로 돌아간다.
                        // 채팅 목록을 거치지 않고 들어왔는데 나갈 때 목록에 떨어지면,
                        // 안 거치게 만든 의미가 없다.
                        if (openRoomId) { router.back(); return }
                        setView('list')
                        fetchRooms()
                    }} className="-ml-2 h-9 w-9"><ArrowLeft className="w-5 h-5 text-gray-600" /></Button>
                    <button className="text-left" onClick={() => setMembersOpen((v) => !v)}>
                        <h2 className="font-bold text-sm text-gray-900 truncate max-w-[160px] flex items-center gap-1">
                            {activeRoom?.title || activeRoom?.name || groupInfo?.title || ""}
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
                        size="icon"
                        variant="ghost"
                        onClick={() => setSettingsOpen(true)}
                        className="h-8 w-8 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100"
                        title="채팅방 설정"
                    >
                        <Settings className="w-4 h-4" />
                    </Button>
                </div>
                </div>

                {/* ⚙️ 채팅방 설정 시트 — 공개 범위 + 초대/이름/멤버/나가기 */}
                {settingsOpen && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setSettingsOpen(false)}>
                        <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
                            <h3 className="font-bold text-gray-900 mb-3">{groupInfo ? "모임 설정" : "채팅방 설정"}</h3>

                            {/* 모임 공개 범위 (모임방만) */}
                            {groupInfo && (
                                <div className="rounded-2xl border border-gray-200 p-3.5 mb-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                                            <Globe className="w-4 h-4 text-gray-400" /> 모임 공개 범위
                                        </span>
                                        {!groupInfo.is_host && <span className="text-[10px] text-gray-400">모임장만 변경 가능</span>}
                                    </div>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {[
                                            { v: "private", t: "비공개", icon: <Lock className="w-3.5 h-3.5" /> },
                                            { v: "list_only", t: "리스트만", icon: <List className="w-3.5 h-3.5" /> },
                                            { v: "public", t: "모임 공개", icon: <Users className="w-3.5 h-3.5" /> },
                                            { v: "open", t: "오픈채팅", icon: <Globe className="w-3.5 h-3.5" /> },
                                        ].map((o) => {
                                            const on = groupInfo.visibility === o.v
                                            return (
                                                <button
                                                    key={o.v}
                                                    onClick={() => groupInfo.is_host && saveVisibility(o.v)}
                                                    disabled={visSaving || !groupInfo.is_host}
                                                    className={`rounded-xl px-1 py-2 text-[11px] font-bold flex flex-col items-center gap-1 border transition-colors ${
                                                        on ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-500"
                                                    } ${!groupInfo.is_host ? "opacity-60" : ""}`}
                                                >
                                                    {o.icon}{o.t}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2">
                                        {groupInfo.visibility === "private" && "우리끼리만 보여요. 아무 데도 노출되지 않아요."}
                                        {groupInfo.visibility === "list_only" && "맛집 리스트만 탐색에 공개돼요. 채팅·멤버는 비공개."}
                                        {groupInfo.visibility === "public" && "인기 모임 랭킹·팔로우 대상에 노출돼요. 채팅은 초대제."}
                                        {groupInfo.visibility === "open" && "누구나 찾아서 참여할 수 있는 완전 개방 모임이에요."}
                                    </p>
                                </div>
                            )}

                            <div className="rounded-2xl border border-gray-200 overflow-hidden mb-3">
                                <button onClick={() => { setSettingsOpen(false); openInvite() }} className="w-full flex items-center gap-2.5 px-3.5 py-3 border-b border-gray-100 hover:bg-gray-50">
                                    <UserPlus className="w-4 h-4 text-amber-600" />
                                    <span className="flex-1 text-left text-sm font-bold text-gray-800">친구 초대</span>
                                    <ChevronRight className="w-4 h-4 text-gray-300" />
                                </button>
                                {groupInfo?.is_host && (
                                    <button
                                        onClick={async () => {
                                            const name = prompt("모임 이름을 입력하세요", (groupInfo.title || activeRoom?.title || "").replace("[모임] ", ""))
                                            if (!name?.trim()) return
                                            try {
                                                const res = await fetchChatAPI(`/api/groups/${activeRoom.id}/profile`, {
                                                    method: "PATCH",
                                                    body: JSON.stringify({ title: name.trim() }),
                                                })
                                                if (res.ok) {
                                                    const d = await res.json()
                                                    setGroupInfo((p: any) => (p ? { ...p, title: d.title } : p))
                                                    setActiveRoom((r: any) => (r ? { ...r, title: `[모임] ${d.title}` } : r))
                                                    fetchRooms()
                                                } else alert("변경에 실패했어요.")
                                            } catch { alert("오류가 발생했어요.") }
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3.5 py-3 border-b border-gray-100 hover:bg-gray-50"
                                    >
                                        <Pencil className="w-4 h-4 text-gray-400" />
                                        <span className="flex-1 text-left text-sm text-gray-700">모임 이름 변경</span>
                                        <ChevronRight className="w-4 h-4 text-gray-300" />
                                    </button>
                                )}
                                <button onClick={() => { setSettingsOpen(false); setMembersOpen(true) }} className="w-full flex items-center gap-2.5 px-3.5 py-3 border-b border-gray-100 hover:bg-gray-50">
                                    <Users className="w-4 h-4 text-gray-400" />
                                    <span className="flex-1 text-left text-sm text-gray-700">멤버 보기 ({members.length})</span>
                                    <ChevronRight className="w-4 h-4 text-gray-300" />
                                </button>
                                <button onClick={() => { setSettingsOpen(false); setComposer("history") }} className="w-full flex items-center gap-2.5 px-3.5 py-3 border-b border-gray-100 hover:bg-gray-50">
                                    <History className="w-4 h-4 text-gray-400" />
                                    <span className="flex-1 text-left text-sm text-gray-700">우리 모임 히스토리</span>
                                    <ChevronRight className="w-4 h-4 text-gray-300" />
                                </button>
                                <div className="w-full flex items-center gap-2.5 px-3.5 py-3">
                                    <Bell className="w-4 h-4 text-gray-400" />
                                    <span className="flex-1 text-left text-sm text-gray-700">알림</span>
                                    <span className="text-[11px] text-gray-400">준비 중</span>
                                </div>
                            </div>

                            <button
                                onClick={() => { setSettingsOpen(false); handleLeaveRoom() }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border border-red-100 bg-red-50/50 hover:bg-red-50"
                            >
                                <LogOut className="w-4 h-4 text-red-500" />
                                <span className="flex-1 text-left text-sm font-bold text-red-500">채팅방 나가기</span>
                            </button>
                        </div>
                    </div>
                )}

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

                {/* 메시지 영역 — Radix ScrollArea는 flex/터치에서 스크롤이 죽어 일반 div로(min-h-0 필수) */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4" ref={scrollRef}>
                <div className="flex flex-col gap-3 pb-4">
                    <div className="flex justify-center my-4"><span className="bg-gray-200/60 text-gray-500 text-[10px] px-3 py-1 rounded-full">대화가 시작되었습니다.</span></div>

                    {messages.map((msg, i) => {
                        const isMe = msg.user_id === myId;
                        let content = null;
                        try {
                            const jsonContent = JSON.parse(msg.content);
                            if (jsonContent.type === "poll") {
                                const poll = pollsById[jsonContent.poll_id]
                                content = poll ? (
                                    <PollCard
                                        poll={poll}
                                        onUpdate={upsertPoll}
                                        onAddCandidates={(p) => setCandidatePoll(p)}
                                        memberCount={members.length}
                                    />
                                ) : (
                                    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 투표 불러오는 중...
                                    </div>
                                )
                            } else if (jsonContent.type === "poll_confirmed") {
                                return <PollConfirmedCard key={i} data={jsonContent} />
                            } else if (jsonContent.type === "split") {
                                const split = splitsById[jsonContent.split_id]
                                content = split ? (
                                    <SplitCard split={split} myId={myId} onUpdate={upsertSplit} />
                                ) : (
                                    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 분담 요청 불러오는 중...
                                    </div>
                                )
                            } else if (jsonContent.type === "split_completed" || jsonContent.type === "split_cancelled") {
                                return <SplitBanner key={i} data={jsonContent} />
                            } else if (jsonContent.type === "settlement") {
                                content = <SettlementCard data={jsonContent} />
                            } else if (jsonContent.type === "image") {
                                content = <img src={jsonContent.url} alt="" className="max-w-[220px] rounded-2xl border border-gray-100 shadow-sm" />
                            } else if (jsonContent.type === "video") {
                                content = <video src={jsonContent.url} controls playsInline className="max-w-[220px] rounded-2xl border border-gray-100 shadow-sm" />
                            } else if (jsonContent.type === "vote_card") {
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
                                                        {item.type === "place" && item.place_id && groupInfo?.is_member && (
                                                            <button
                                                                onClick={(e) => savePlaceToGroup(e, item)}
                                                                className="w-full flex items-center justify-center gap-1 py-2 text-[11px] font-bold text-amber-600 bg-amber-50 border-t border-amber-100 hover:bg-amber-100 transition-colors"
                                                            >
                                                                <List className="w-3 h-3" /> 우리 모임 리스트에 저장
                                                            </button>
                                                        )}
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
                </div>

                <div className="p-3 bg-white border-t safe-area-bottom">
                {/* ➕ 플러스 메뉴 — 사진/동영상/일정/장소/히스토리/정산 */}
                {plusOpen && (
                    <div className="grid grid-cols-6 gap-1 mb-2.5 animate-in slide-in-from-bottom-2">
                        {[
                            { key: "photo", icon: <ImageIcon className="w-5 h-5" />, label: "사진", onClick: () => imageInputRef.current?.click() },
                            { key: "video", icon: <Video className="w-5 h-5" />, label: "동영상", onClick: () => videoInputRef.current?.click() },
                            { key: "schedule", icon: <Calendar className="w-5 h-5" />, label: "일정", onClick: () => { setPlusOpen(false); setComposer("schedule") } },
                            { key: "place", icon: <MapPin className="w-5 h-5" />, label: "장소", onClick: () => { setPlusOpen(false); setComposer("place") }, hot: true },
                            { key: "split", icon: <CalendarCheck className="w-5 h-5" />, label: "예약", onClick: () => { setPlusOpen(false); setComposer("split") }, hot: true },
                            { key: "settle", icon: <Calculator className="w-5 h-5" />, label: "정산", onClick: () => { setPlusOpen(false); setComposer("settlement") } },
                        ].map((it: any) => (
                            <button key={it.key} onClick={it.onClick} className="flex flex-col items-center gap-1 py-1" disabled={mediaSending}>
                                <span className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${it.hot ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-gray-50 border-gray-100 text-gray-500"}`}>
                                    {it.icon}
                                </span>
                                <span className={`text-[10px] ${it.hot ? "text-amber-600 font-bold" : "text-gray-500"}`}>{it.label}</span>
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex gap-2 items-center">
                    <button
                        onClick={() => setPlusOpen((v) => !v)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${plusOpen ? "bg-gray-200 text-gray-600 rotate-45" : "bg-amber-50 text-amber-600"}`}
                    >
                        {mediaSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
                    </button>
                    <div className="flex-1 flex gap-2 items-center bg-gray-50 px-3 py-1.5 rounded-3xl border border-gray-200 focus-within:border-[#F5A623] focus-within:ring-1 focus-within:ring-[#F5A623]/20 transition-all">
                        <Input className="flex-1 border-none shadow-none bg-transparent focus-visible:ring-0 h-9 text-sm" placeholder="메시지 입력..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
                        <Button size="icon" className="h-8 w-8 rounded-full bg-[#F5A623] hover:bg-[#D97706] shadow-sm" onClick={handleSend}><Send className="w-4 h-4 text-white" /></Button>
                    </div>
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
                <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={onPickVideo} />
                </div>

                {/* 기능 시트들 */}
                {composer === "place" && activeRoom && (
                    <PlacePollComposer roomId={String(activeRoom.id)} members={members} onClose={() => setComposer(null)} onCreated={(p) => { upsertPoll(p); if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) fetchMessages() }} />
                )}
                {composer === "schedule" && activeRoom && (
                    <SchedulePollComposer roomId={String(activeRoom.id)} onClose={() => setComposer(null)} onCreated={(p) => { upsertPoll(p); if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) fetchMessages() }} />
                )}
                {composer === "settlement" && activeRoom && (
                    <SettlementComposer roomId={String(activeRoom.id)} memberCount={members.length || 2} onClose={() => setComposer(null)} onSent={() => {}} />
                )}
                {composer === "history" && activeRoom && (
                    <HistorySheet roomId={String(activeRoom.id)} onClose={() => setComposer(null)} />
                )}
                {composer === "split" && activeRoom && (
                    <SplitComposer
                        roomId={String(activeRoom.id)}
                        memberCount={members.length || 2}
                        members={members}
                        onClose={() => setComposer(null)}
                        onCreated={(s) => { upsertSplit(s); if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) fetchMessages() }}
                    />
                )}
                {candidatePoll && (
                    <CandidateSheet
                        poll={pollsById[candidatePoll.id] || candidatePoll}
                        members={members}
                        onClose={() => setCandidatePoll(null)}
                        onUpdate={upsertPoll}
                    />
                )}
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
