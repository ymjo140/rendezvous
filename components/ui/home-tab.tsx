import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MapPin, Search, Bell, Loader2, Plus, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { fetchWithAuth } from "@/lib/api-client"

export function HomeTab() {
    const [me, setMe] = useState<any>(null)
    const [friends, setFriends] = useState<any[]>([])
    const [requests, setRequests] = useState<any[]>([])
    const [targetLocation, setTargetLocation] = useState("")
    const [recommendations, setRecommendations] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [showAddFriend, setShowAddFriend] = useState(false)
    const [friendEmail, setFriendEmail] = useState("")

    useEffect(() => {
        const init = async () => {
            // Fetch user info and friends
            const meRes = await fetchWithAuth("/api/users/me")
            if (meRes.ok) setMe(await meRes.json())
            loadFriends()
        }
        init()
    }, [])

    const loadFriends = async () => {
        const friendRes = await fetchWithAuth("/api/friends")
        if (friendRes.ok) {
            const data = await friendRes.json()
            setFriends(data.friends || [])
            setRequests(data.requests || [])
        }
    }

    const handleMidpointSearch = async () => {
        setLoading(true)
        try {
            const payload = {
                users: [me].filter(Boolean),
                location_name: "중간지점", // This triggers general search if manual locations provided
                manual_locations: [targetLocation].filter(Boolean),
                purpose: "식사"
            }
            const res = await fetchWithAuth("/api/recommend", { method: "POST", body: JSON.stringify(payload) })
            if (res.ok) {
                const data = await res.json()
                setRecommendations(data[0]?.places || [])
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleSendRequest = async () => {
        if (!friendEmail) return
        try {
            const res = await fetchWithAuth("/api/friends/request", {
                method: "POST",
                body: JSON.stringify({ email: friendEmail })
            })
            if (res.ok) {
                alert("친구 요청을 보냈습니다.")
                setFriendEmail("")
                setShowAddFriend(false)
            } else {
                const err = await res.json()
                alert(err.message || "요청 실패")
            }
        } catch (e) { alert("오류 발생") }
    }

    const handleAccept = async (id: number) => {
        try {
            const res = await fetchWithAuth("/api/friends/accept", {
                method: "POST",
                body: JSON.stringify({ request_id: id })
            })
            if (res.ok) {
                loadFriends()
            }
        } catch (e) { console.error(e) }
    }

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="p-6 pb-4 bg-white rounded-b-3xl shadow-sm z-10 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-1 text-gray-500 mb-1">
                            <MapPin className="w-4 h-4 text-[#2dd4bf]" />
                            <span className="text-xs font-medium">성북구 안암동 (임시)</span>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-800">
                            안녕하세요, <span className="text-[#2dd4bf]">{me?.name || 'User'}</span>님! 👋
                        </h1>
                    </div>
                    <div className="flex gap-2">
                        <Button size="icon" variant="ghost" className="rounded-full relative">
                            <Bell className="w-6 h-6 text-gray-600" />
                            <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></div>
                        </Button>
                        <Avatar className="w-10 h-10 border-2 border-white shadow-md">
                            <AvatarImage src={`/assets/avatar/${me?.avatar?.equipped?.hair || 'hair_01'}.png`} />
                            <AvatarFallback>ME</AvatarFallback>
                        </Avatar>
                    </div>
                </div>

                {/* Filter Chips */}
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {['전체', '맛집', '카페', '스터디', '운동'].map((chip, i) => (
                        <Button key={chip} variant={i === 0 ? "default" : "outline"} className={`rounded-3xl h-8 text-xs px-4 ${i === 0 ? 'bg-[#2dd4bf] hover:bg-[#25c2af] text-white border-none' : 'text-gray-500 border-gray-200'}`}>
                            {chip}
                        </Button>
                    ))}
                </div>
            </div>

            <ScrollArea className="flex-1 px-4 py-4" style={{ height: 'calc(100% - 180px)' }}>
                {/* Map Placeholder */}
                <div className="w-full h-48 bg-teal-50 rounded-3xl mb-6 relative overflow-hidden border border-teal-100 shadow-inner group">
                    <div className="absolute inset-0 flex items-center justify-center text-teal-200/50 text-4xl font-bold select-none group-hover:scale-105 transition-transform">MAP VIEW (Dummy)</div>

                    {/* Markers */}
                    <div className="absolute top-1/4 left-1/4 animate-bounce [animation-duration:2s]">
                        <div className="relative">
                            <Avatar className="w-8 h-8 border-2 border-[#2dd4bf] z-10"><AvatarFallback className="bg-white text-xs">나</AvatarFallback></Avatar>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-6 border-l-transparent border-r-transparent border-t-[#2dd4bf]"></div>
                        </div>
                    </div>

                    {/* Action Buttons Floating on Map */}
                    <div className="absolute bottom-3 right-3 flex gap-2">
                        <Button size="sm" className="bg-white/90 text-gray-700 hover:bg-white text-xs h-8 shadow-sm backdrop-blur-sm rounded-xl" onClick={() => setShowAddFriend(true)}>
                            <Plus className="w-3 h-3 mr-1" /> 친구 추가
                        </Button>
                        <Button size="sm" className="bg-[#2dd4bf] hover:bg-[#25c2af] text-white text-xs h-8 shadow-md rounded-xl">지도 크게 보기</Button>
                    </div>
                </div>

                {/* Friend Requests area */}
                {requests.length > 0 && (
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-3 px-1">
                            <h2 className="font-bold text-lg text-gray-800">받은 요청 <span className="text-[#2dd4bf] text-sm">{requests.length}</span></h2>
                        </div>
                        <div className="space-y-2">
                            {requests.map(req => (
                                <div key={req.id} className="bg-white p-3 rounded-xl shadow-sm border flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-8 w-8"><AvatarFallback>{req.requester_name[0]}</AvatarFallback></Avatar>
                                        <div className="text-sm">
                                            <div className="font-bold">{req.requester_name}</div>
                                            <div className="text-[10px] text-gray-400">{req.requester_email}</div>
                                        </div>
                                    </div>
                                    <Button size="sm" className="h-7 text-xs bg-[#2dd4bf]" onClick={() => handleAccept(req.id)}>수락</Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Friends List */}
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-3 px-1">
                        <h2 className="font-bold text-lg text-gray-800">내 친구 <span className="text-gray-400 text-sm font-normal">{friends.length}명</span></h2>
                        <Button variant="ghost" size="sm" className="text-[#2dd4bf] text-xs" onClick={() => loadFriends()}>새로고침</Button>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                        {friends.length > 0 ? friends.map((friend, i) => (
                            <div key={friend.id} className="flex flex-col items-center gap-1 min-w-[50px]">
                                <div className="relative cursor-pointer hover:scale-105 transition-transform" onClick={() => setTargetLocation(friend.location?.lat ? "친구 위치" : friend.name)}>
                                    <Avatar className="w-12 h-12 border-2 border-slate-100 bg-white">
                                        <AvatarImage src={`/assets/avatar/${friend.avatar?.equipped?.hair || 'hair_02'}.png`} />
                                        <AvatarFallback className="bg-slate-100 text-xl">{friend.name[0]}</AvatarFallback>
                                    </Avatar>
                                    {friend.location?.lat && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>}
                                </div>
                                <span className="text-[10px] font-medium text-gray-600 truncate w-14 text-center">{friend.name}</span>
                            </div>
                        )) : <div className="text-xs text-gray-400 py-2 w-full text-center">친구가 없습니다.</div>}

                        <div className="flex flex-col items-center gap-1 min-w-[50px]">
                            <Button variant="outline" className="w-12 h-12 rounded-full border-dashed border-2 p-0 text-gray-400" onClick={() => setShowAddFriend(true)}>
                                <Plus className="w-5 h-5" />
                            </Button>
                            <span className="text-[10px] text-gray-400">추가</span>
                        </div>
                    </div>
                </div>

                {/* Location Search Card */}
                <div className="bg-white rounded-[2rem] p-5 shadow-lg border border-slate-100 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-orange-100 p-2 rounded-xl text-orange-500">
                            <Search className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm">어디서 만날까요?</h3>
                            <p className="text-[10px] text-gray-400">친구들과의 중간 지점을 찾아보세요</p>
                        </div>
                    </div>

                    <div className="relative mb-3">
                        <Input
                            className="pl-9 bg-slate-50 border-none h-11 rounded-xl text-sm"
                            placeholder="친구 위치나 장소 입력"
                            value={targetLocation}
                            onChange={(e) => setTargetLocation(e.target.value)}
                        />
                        <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                    </div>

                    <Button className="w-full bg-[#2dd4bf] hover:bg-[#25c2af] text-white font-bold h-11 rounded-xl shadow-md" onClick={handleMidpointSearch} disabled={loading}>
                        {loading ? <Loader2 className="animate-spin w-4 h-4" /> : "중간지점 찾기"}
                    </Button>
                </div>

                {/* Recommendations */}
                {recommendations.length > 0 && (
                    <div className="space-y-3 pb-20">
                        <h3 className="font-bold text-gray-800 px-1">추천 장소</h3>
                        {recommendations.map((place: any, i) => (
                            <Card key={i} className="p-3 flex gap-3 border-none shadow-sm bg-white">
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-sm truncate">{place.name}</h4>
                                        <span className="text-orange-500 text-xs font-bold">★ {place.score}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">{place.category}</p>
                                    <div className="flex gap-1 mt-1 flex-wrap">
                                        {place.tags?.slice(0, 3).map((t: string) => <span key={t} className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">#{t}</span>)}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </ScrollArea>

            {/* Add Friend Overlay */}
            {showAddFriend && (
                <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl anime-fade-in relative">
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => setShowAddFriend(false)}>
                            <X className="w-5 h-5" />
                        </Button>
                        <h3 className="font-bold text-lg mb-1">친구 추가</h3>
                        <p className="text-xs text-gray-500 mb-4">이메일로 친구를 검색해서 요청을 보내보세요.</p>

                        <Input
                            placeholder="친구 이메일 입력"
                            className="mb-4"
                            value={friendEmail}
                            onChange={e => setFriendEmail(e.target.value)}
                        />

                        <Button className="w-full bg-[#2dd4bf] hover:bg-[#25c2af] text-white font-bold h-11 rounded-xl" onClick={handleSendRequest}>
                            요청 보내기
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}