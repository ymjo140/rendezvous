"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, Heart, MapPin, Calendar, User, Plus, Loader2, Check, Trash2, LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

// ?뙚 [?듭떖] ?몃? ?섏〈???쒓굅: 留덉씠?섏씠吏泥섎읆 ?ш린??吏곸젒 二쇱냼瑜??뺤쓽?⑸땲??
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const CATEGORIES = ["?꾩껜", "留쏆쭛", "?대룞", "?ㅽ꽣??, "痍⑤?", "?ы뻾"];

// ?뙚 [?듭떖] ?몃? ?섏〈???쒓굅: ???뚯씪 ?꾩슜 ?듭떊 ?⑥닔瑜?留뚮벊?덈떎.
const fetchCommunityAPI = async (endpoint: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    } as HeadersInit;

    const url = `${API_URL}${endpoint}`;
    console.log(`?뱻 Community ?붿껌: ${url}`); // 濡쒓렇濡??뺤씤 媛??
    return fetch(url, { ...options, headers });
};

export function CommunityTab() {
  const router = useRouter();
  const [isGuest, setIsGuest] = useState(false);
  const [meetings, setMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("?꾩껜");
  
  const [myId, setMyId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  
  const [newMeeting, setNewMeeting] = useState({
      title: "", description: "", max_members: "4", location: "", date: "", time: "", category: "留쏆쭛"
  })

  // 1. ???뺣낫 ?뺤씤 (留덉씠?섏씠吏? ?숈씪??濡쒖쭅)
  useEffect(() => {
      const checkLogin = async () => {
          const token = localStorage.getItem("token");
          if (!token) { 
              console.log("???좏겙 ?놁쓬 -> 寃뚯뒪??紐⑤뱶");
              setIsGuest(true); 
              return; 
          }

          try {
              // ?몃? api-client ??? ?꾩뿉 ?뺤쓽??fetchCommunityAPI ?ъ슜
              const res = await fetchCommunityAPI("/api/users/me");
              if (res.ok) {
                  const data = await res.json();
                  console.log("??濡쒓렇???깃났:", data.name);
                  setMyId(data.id);
              } else {
                  console.log("??濡쒓렇???ㅽ뙣 (401) -> 寃뚯뒪??紐⑤뱶");
                  setIsGuest(true);
              }
          } catch (e) { 
              console.error(e); 
              setIsGuest(true);
          }
      }
      checkLogin();
  }, []);

  // 2. 紐⑥엫 紐⑸줉 遺덈윭?ㅺ린
  const fetchCommunities = async () => {
    setLoading(true)
    try {
      const res = await fetchCommunityAPI("/api/communities")
      if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
              setMeetings(data);
          } else {
              setMeetings([]);
          }
      }
    } catch (e) { console.error(e); setMeetings([]); } 
    finally { setLoading(false) }
  }

  useEffect(() => { 
      // 寃뚯뒪?멸? ?꾨땺 ?뚮쭔 紐⑸줉??遺덈윭?듬땲??
      if(!isGuest) fetchCommunities() 
  }, [isGuest])

  // ?ы띁: 罹섎┛???먮룞 ?깅줉
  const addToCalendar = async (title: string, date: string, time: string, location: string) => {
      try {
          const payload = {
              title: `[紐⑥엫] ${title}`,
              date: date,
              time: time,
              duration: 2,
              location_name: location,
              description: "而ㅻ??덊떚 紐⑥엫 ?먮룞 ?깅줉",
              user_id: 1, purpose: "紐⑥엫" 
          };
          await fetchCommunityAPI("/api/events", {
              method: "POST",
              body: JSON.stringify(payload)
          });
      } catch (e) { console.error("罹섎┛???깅줉 ?ㅽ뙣:", e); }
  };

  // 3. 紐⑥엫 ?앹꽦
  const handleCreate = async () => {
      if (!newMeeting.title || !newMeeting.description) { alert("?쒕ぉ怨??댁슜???낅젰?댁＜?몄슂."); return; }
      if (!newMeeting.date || !newMeeting.time) { alert("?좎쭨? ?쒓컙???낅젰?댁＜?몄슂."); return; }
      
      try {
          const payload = {
              title: newMeeting.title,
              description: newMeeting.description,
              max_members: parseInt(newMeeting.max_members, 10),
              location: newMeeting.location,
              date_time: `${newMeeting.date} ${newMeeting.time}`,
              category: newMeeting.category,
              tags: [newMeeting.category] 
          };

          const res = await fetchCommunityAPI("/api/communities", {
              method: "POST",
              body: JSON.stringify(payload)
          });

          if (res.ok) {
              await addToCalendar(newMeeting.title, newMeeting.date, newMeeting.time, newMeeting.location);
              alert("紐⑥엫???앹꽦?섏뿀?듬땲??");
              setIsCreateOpen(false);
              fetchCommunities(); 
              setNewMeeting({ title: "", description: "", max_members: "4", location: "", date: "", time: "", category: "留쏆쭛" });
          } else {
              const err = await res.json();
              alert(`?앹꽦 ?ㅽ뙣: ${JSON.stringify(err.detail)}`);
          }
      } catch (e) { alert("?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎."); }
  };

  // 4. 李몄뿬?섍린
  const handleJoin = async (m: any) => {
    if (!confirm(`'${m.title}' 紐⑥엫??李몄뿬?섏떆寃좎뒿?덇퉴?`)) return;
    try {
      const res = await fetchCommunityAPI(`/api/communities/${m.id}/join`, { method: "POST" })
      if (res.ok) { 
          const [datePart, timePart] = m.date_time.split(" ");
          const cleanTime = timePart.length > 5 ? timePart.substring(0, 5) : timePart;
          await addToCalendar(m.title, datePart, cleanTime, m.location);
          alert("李몄뿬 ?꾨즺! 罹섎┛?붿뿉 ?깅줉?섏뿀?듬땲??"); 
          fetchCommunities(); 
      }
      else { alert("李몄뿬 ?ㅽ뙣 (?대? 李몄뿬?덇굅???몄썝 珥덇낵)"); }
    } catch (e) { alert("?ㅻ쪟 諛쒖깮"); }
  }

  // 5. ??젣 (?묒꽦??
  const handleDelete = async (id: string) => {
      if(!confirm("?뺣쭚 ??紐⑥엫????젣?섏떆寃좎뒿?덇퉴? (蹂듦뎄 遺덇?)")) return;
      try {
          const res = await fetchCommunityAPI(`/api/communities/${id}`, { method: "DELETE" });
          if(res.ok) { alert("??젣?섏뿀?듬땲??"); fetchCommunities(); }
          else { alert("??젣 ?ㅽ뙣"); }
      } catch(e) { alert("?ㅻ쪟 諛쒖깮"); }
  }

  // 6. ?섍?湲?(李몄뿬??
  const handleLeave = async (id: string) => {
      if(!confirm("紐⑥엫?먯꽌 ?섍??쒓쿋?듬땲源?")) return;
      try {
          const res = await fetchCommunityAPI(`/api/chat/rooms/${id}/leave`, { method: "POST" });
          if(res.ok) { alert("?섍컮?듬땲??"); fetchCommunities(); }
          else { alert("?섍?湲??ㅽ뙣"); }
      } catch(e) { alert("?ㅻ쪟 諛쒖깮"); }
  }

  // --- ?뚮뜑留?---

  if (isGuest) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 space-y-6 bg-[#F3F4F6] font-['Pretendard']">
                <div className="text-center space-y-3">
                    <div className="text-6xl mb-4">?뫁</div>
                    <h2 className="text-2xl font-bold text-gray-800">而ㅻ??덊떚 ?낆옣</h2>
                    <p className="text-gray-500 leading-relaxed">濡쒓렇?명븯怨?痍⑦뼢??留욌뒗<br/>?덈줈??移쒓뎄?ㅼ쓣 留뚮굹蹂댁꽭??</p>
                </div>
                <Button className="w-full max-w-xs h-12 rounded-xl bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold text-base shadow-sm" onClick={() => router.push("/login")}>
                    濡쒓렇???섎윭媛湲?
                </Button>
            </div>
        );
  }

  const filteredMeetings = selectedCategory === "?꾩껜" 
      ? meetings 
      : meetings.filter(m => m.category === selectedCategory);

  return (
    <div className="flex flex-col h-full bg-slate-50 font-['Pretendard']">
      <div className="bg-white p-4 pb-2 sticky top-0 z-10 shadow-sm">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input className="pl-9 bg-white border-2 border-[#7C3AED]/20 rounded-xl h-10 text-sm" placeholder="愿?ъ궗, 吏??寃??.." />
        </div>

        <Button className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold h-11 rounded-xl mb-4 shadow-md transition-all" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-5 w-5" /> 紐⑥엫 留뚮뱾湲?
        </Button>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {CATEGORIES.map((cat, i) => (
              <Button 
                key={cat} 
                variant={selectedCategory === cat ? "default" : "outline"} 
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full h-8 text-xs px-4 ${selectedCategory === cat ? 'bg-[#14B8A6] hover:bg-[#0D9488] border-none text-white' : 'text-gray-500 bg-white border-gray-200'}`}
              >
                  {cat}
              </Button>
            ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="space-y-4 pb-20 mt-2">
          {loading ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#7C3AED]"/></div> : 
           filteredMeetings.length > 0 ? filteredMeetings.map((m) => {
            const isAuthor = m.host_id === myId;
            // ?뙚?뙚 [?ш린 二쇰ぉ] DB 而щ읆紐?member_ids)?쇰줈 ?꾨꼍?섍쾶 ?섏젙??
            const isMember = Array.isArray(m.member_ids) ? m.member_ids.includes(myId) : false;
            const memberCount = Array.isArray(m.member_ids) ? m.member_ids.length : 0;

            return (
                <div key={m.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8"><AvatarFallback className="bg-purple-50 text-[#7C3AED] font-bold">{m.author_name?.[0] || 'U'}</AvatarFallback></Avatar>
                    <span className="text-xs font-bold text-gray-600">{m.author_name || '?듬챸'}</span>
                    </div>
                    <Heart className="w-5 h-5 text-gray-300 cursor-pointer hover:text-red-500" />
                </div>
                
                <h3 className="font-bold text-base text-gray-800 mb-1">{m.title}</h3>
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{m.description}</p>

                <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="secondary" className="bg-purple-50 text-[#7C3AED] border-0">{m.category}</Badge>
                    <Badge variant="outline" className="text-gray-500 bg-gray-50 border-gray-200"><User className="w-3 h-3 mr-1"/> {memberCount}/{m.max_members}</Badge>
                </div>

                <div className="flex justify-between items-end border-t border-gray-50 pt-3">
                    <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400"/> {m.date_time}</div>
                        <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400"/> {m.location}</div>
                    </div>
                    
                    {isAuthor ? (
                        <Button size="sm" variant="destructive" className="h-8 text-xs font-bold px-3 rounded-lg shadow-sm bg-red-500 hover:bg-red-600 text-white" onClick={() => handleDelete(m.id)}>
                            <Trash2 className="w-3 h-3 mr-1"/> ??젣
                        </Button>
                    ) : isMember ? (
                        <Button size="sm" variant="outline" className="h-8 text-xs font-bold px-3 rounded-lg shadow-sm border-red-200 text-red-500 hover:bg-red-50" onClick={() => handleLeave(m.id)}>
                            <LogOut className="w-3 h-3 mr-1"/> ?섍?湲?
                        </Button>
                    ) : (
                        <Button size="sm" className="bg-[#7C3AED] h-8 text-xs font-bold px-4 rounded-lg shadow-sm hover:bg-[#6D28D9]" onClick={() => handleJoin(m)}>
                            李몄뿬
                        </Button>
                    )}
                </div>
                </div>
            )
           }) : (
            <div className="text-center text-gray-400 py-20 flex flex-col items-center">
                <div className="text-4xl mb-2">?벊</div>
                <div>?대떦 移댄뀒怨좊━??紐⑥엫???놁뒿?덈떎.</div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader><DialogTitle>??紐⑥엫 留뚮뱾湲?/DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 ml-1">移댄뀒怨좊━</label>
                      <div className="flex flex-wrap gap-2">
                          {CATEGORIES.filter(c => c !== "?꾩껜").map(cat => (
                              <Badge key={cat} onClick={() => setNewMeeting({...newMeeting, category: cat})} className={`cursor-pointer px-3 py-1.5 rounded-full text-xs transition-all ${newMeeting.category === cat ? "bg-[#7C3AED] text-white border-[#7C3AED]" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`} variant="outline">
                                  {newMeeting.category === cat && <Check className="w-3 h-3 mr-1" />}
                                  {cat}
                              </Badge>
                          ))}
                      </div>
                  </div>
                  <Input placeholder="紐⑥엫 ?쒕ぉ" value={newMeeting.title} onChange={e=>setNewMeeting({...newMeeting, title: e.target.value})} className="h-11 bg-gray-50 border-gray-200" />
                  <div className="flex gap-2">
                      <Input type="date" className="bg-gray-50 border-gray-200" value={newMeeting.date} onChange={e=>setNewMeeting({...newMeeting, date: e.target.value})} />
                      <Input type="time" className="bg-gray-50 border-gray-200" value={newMeeting.time} onChange={e=>setNewMeeting({...newMeeting, time: e.target.value})} />
                  </div>
                  <Input placeholder="?μ냼 (?? 媛뺣궓??10踰?異쒓뎄)" value={newMeeting.location} onChange={e=>setNewMeeting({...newMeeting, location: e.target.value})} className="h-11 bg-gray-50 border-gray-200" />
                  <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <span className="text-sm font-bold text-gray-600 w-20">理쒕? ?몄썝</span>
                      <Input type="number" min={2} max={20} className="bg-white border-gray-200 h-8 w-20 text-center" value={newMeeting.max_members} onChange={e=>setNewMeeting({...newMeeting, max_members: e.target.value})} />
                      <span className="text-sm text-gray-400">紐?/span>
                  </div>
                  <Textarea placeholder="?대뼡 紐⑥엫?멸??? ?댁슜???먯꽭???곸뼱二쇱꽭??" className="bg-gray-50 border-gray-200 resize-none h-24" value={newMeeting.description} onChange={e=>setNewMeeting({...newMeeting, description: e.target.value})} />
              </div>
              <DialogFooter><Button onClick={handleCreate} className="w-full bg-[#7C3AED] h-12 rounded-xl text-base font-bold shadow-md hover:bg-[#6D28D9]">紐⑥엫 留뚮뱾怨??쇱젙??異붽??섍린</Button></DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  )
}
