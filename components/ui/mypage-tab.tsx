"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MapPin, Settings, Bell, HelpCircle, LogOut, Palette, Coins, ShoppingBag, Heart, Star, MessageSquare, Pencil, Check, X } from "lucide-react" // 아이콘 추가
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const CATEGORIES = [
  { id: "hair", label: "헤어", icon: "💇" },
  { id: "eyes", label: "눈", icon: "👀" },
  { id: "eyebrows", label: "눈썹", icon: "🤨" },
  { id: "top", label: "상의", icon: "👕" },
  { id: "bottom", label: "하의", icon: "👖" },
  { id: "shoes", label: "신발", icon: "👟" },
  { id: "body", label: "피부", icon: "🎨" },
];

interface AvatarItem { id: string; category: string; name: string; image_url: string; price_coin: number; }
interface UserInfo { 
    id: number; name: string; email: string; wallet_balance: number; 
    avatar: { level: number; equipped: Record<string, string | null>; inventory: string[]; }; 
    favorites: { id: number; name: string }[]; 
    reviews: any[]; 
}

const VISIT_HISTORY = [
    { id: 101, name: "감성타코 강남점", tags: ["멕시칸", "맛집", "시끌벅적"] },
    { id: 102, name: "블루보틀 성수", tags: ["카페", "감성", "웨이팅"] },
];

export function MyPageTab() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [shopItems, setShopItems] = useState<AvatarItem[]>([]);
  const [activeTab, setActiveTab] = useState("inventory");
  const [activeCategory, setActiveCategory] = useState("hair");
  const [previewEquipped, setPreviewEquipped] = useState<Record<string, string | null>>({});

  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [targetPlace, setTargetPlace] = useState<any>(null);
  const [scores, setScores] = useState({ taste: 3, service: 3, price: 3, vibe: 3 });
  const [reviewText, setReviewText] = useState("");

  // 🌟 [신규] 닉네임 변경 상태
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  const fetchMyInfo = async () => {
      const token = localStorage.getItem("token");
      if (!token) { setIsGuest(true); return; }
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/users/me", { headers: { "Authorization": `Bearer ${token}` } });
          if (res.ok) {
              const data = await res.json();
              setUser(data);
              setNewName(data.name); // 초기값 설정
              if (data.avatar) setPreviewEquipped(data.avatar.equipped || {});
          } else { setIsGuest(true); }
      } catch (e) { setIsGuest(true); }
  };

  const fetchShopItems = async () => {
      try { const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/shop/items"); if (res.ok) setShopItems(await res.json()); } catch (e) {}
  };

  useEffect(() => { fetchMyInfo(); }, []);
  useEffect(() => { if (isEditorOpen) fetchShopItems(); }, [isEditorOpen]);

  const handleBuy = async (item: AvatarItem) => {
      if (!user) return;
      if (user.wallet_balance < item.price_coin) { alert("코인 부족!"); return; }
      if (confirm(`구매?`)) {
          const token = localStorage.getItem("token");
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/shop/buy", {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ item_id: item.id })
          });
          if (res.ok) { alert("구매 완료!"); fetchMyInfo(); }
      }
  };

  const handleEquip = async (item: AvatarItem) => {
      const token = localStorage.getItem("token");
      const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/avatar/equip", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ category: item.category, item_id: item.id })
      });
      if (res.ok) { const data = await res.json(); setPreviewEquipped(data.equipped); fetchMyInfo(); }
  };

  const handleSubmitReview = async () => {
      if (!targetPlace) return;
      const token = localStorage.getItem("token");
      const payload = {
          place_name: targetPlace.name, rating: 0, 
          score_taste: scores.taste, score_service: scores.service, score_price: scores.price, score_vibe: scores.vibe,
          comment: reviewText, tags: targetPlace.tags || []
      };
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/reviews", {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
          });
          if (res.ok) { alert("리뷰 등록 완료!"); setIsReviewOpen(false); setScores({ taste: 3, service: 3, price: 3, vibe: 3 }); setReviewText(""); fetchMyInfo(); }
      } catch (e) { alert("오류 발생"); }
  };

  // 🌟 [신규] 닉네임 변경 핸들러
  const handleUpdateName = async () => {
      if (!newName.trim()) return;
      const token = localStorage.getItem("token");
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/users/me", {
              method: "PUT",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify({ name: newName })
          });
          if (res.ok) {
              const data = await res.json();
              setUser(prev => prev ? { ...prev, name: data.name } : null);
              setIsEditingName(false);
          }
      } catch (e) { alert("변경 실패"); }
  };

  const currentItems = activeTab === "shop" ? shopItems.filter(i => i.category === activeCategory) : shopItems.filter(i => i.category === activeCategory && user?.avatar?.inventory?.includes(i.id));

  const renderAvatarLayered = (equippedState: Record<string, string | null>, height: number = 300) => {
      const width = height / 2; 
      const getUrl = (id: string | null | undefined) => { if (!id) return null; const item = shopItems.find(i => i.id === id); return item ? item.image_url : `/assets/avatar/${id}.png`; };
      const bodyId = equippedState.body || "body_basic"; const eyesId = equippedState.eyes || "eyes_normal"; const browsId = equippedState.eyebrows || "brows_basic";
      const layers = [
          { id: 'body', url: getUrl(bodyId), z: 1 }, { id: 'eyes', url: getUrl(eyesId), z: 2 }, { id: 'eyebrows', url: getUrl(browsId), z: 3 },
          { id: 'bottom', url: getUrl(equippedState.bottom), z: 4 }, { id: 'top', url: getUrl(equippedState.top), z: 5 },
          { id: 'shoes', url: getUrl(equippedState.shoes), z: 6, style: { bottom: 0, left: '10%', width: '80%', height: '15%', objectFit: 'contain' } }, 
          { id: 'hair', url: getUrl(equippedState.hair), z: 7 }, { id: 'pet', url: getUrl(equippedState.pet), z: 8 }, 
      ];
      return (
          <div style={{ width: width, height: height, position: 'relative', margin: '0 auto' }}>
              {layers.map((layer) => { if (layer.id === 'pet') return null; return layer.url ? (<img key={layer.id} src={layer.url} alt={layer.id} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: layer.z, ...layer.style} as React.CSSProperties} onError={(e) => e.currentTarget.style.display='none'} />) : null })}
          </div>
      );
  };

  if (isGuest) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-6 space-y-6 bg-slate-50">
              <div className="text-center space-y-2"><h2 className="text-2xl font-bold text-gray-800">로그인이 필요해요 🔒</h2><p className="text-gray-500">나만의 아바타를 꾸미고<br/>리뷰와 즐겨찾기를 관리해보세요.</p></div>
              <Button className="w-full max-w-xs bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold" onClick={() => router.push("/login")}>카카오로 3초만에 시작하기</Button>
          </div>
      );
  }
  if (!user) return <div className="p-4 text-center">로딩 중...</div>;

  return (
    <div className="space-y-4 h-full bg-slate-50 overflow-y-auto pb-20">
      <div className="sticky top-0 z-10 bg-white border-b p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">마이페이지</h1>
        <div className="flex items-center gap-1 bg-yellow-100 px-3 py-1 rounded-full text-yellow-700 font-bold text-sm"><Coins className="w-4 h-4" />{(user.wallet_balance || 0).toLocaleString()} C</div>
      </div>

      <div className="px-4 space-y-4">
        <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-none shadow-lg">
            <CardContent className="p-6">
                <div className="flex items-center gap-4">
                    <div className="w-24 h-24 bg-white/20 rounded-full border-2 border-white/50 backdrop-blur-sm overflow-hidden relative">{renderAvatarLayered(user.avatar?.equipped || {}, 96)}</div>
                    <div className="flex-1">
                        {/* 🌟 닉네임 수정 UI */}
                        {isEditingName ? (
                            <div className="flex items-center gap-2 mb-1">
                                <Input value={newName} onChange={e => setNewName(e.target.value)} className="h-8 text-black bg-white/90 border-none w-32" />
                                <Button size="icon" className="h-8 w-8 bg-green-500 hover:bg-green-600 text-white rounded-full" onClick={handleUpdateName}><Check className="w-4 h-4"/></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20 rounded-full" onClick={() => setIsEditingName(false)}><X className="w-4 h-4"/></Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-xl font-bold">{user.name}</h2>
                                <button onClick={() => setIsEditingName(true)} className="text-white/70 hover:text-white"><Pencil className="w-4 h-4"/></button>
                            </div>
                        )}
                        <Badge variant="secondary" className="bg-white/20 text-white border-0">Lv.{user.avatar?.level || 1}</Badge>
                    </div>
                </div>
                <Button className="w-full mt-5 bg-white text-indigo-600 hover:bg-indigo-50 font-bold gap-2" onClick={() => setIsEditorOpen(true)}><Palette className="w-4 h-4" /> 아바타 꾸미기 & 상점</Button>
            </CardContent>
        </Card>

        <div className="px-1">
            <Tabs defaultValue="reviews" className="w-full">
                <TabsList className="w-full grid grid-cols-3 mb-4"><TabsTrigger value="history">방문 기록</TabsTrigger><TabsTrigger value="reviews">내 리뷰</TabsTrigger><TabsTrigger value="favorites">즐겨찾기</TabsTrigger></TabsList>
                
                <TabsContent value="history" className="space-y-3">
                    {VISIT_HISTORY.map(place => (
                        <Card key={place.id} className="p-3 flex justify-between items-center bg-white shadow-sm">
                            <div><div className="font-bold text-sm">{place.name}</div><div className="text-xs text-gray-500 mt-1">{place.tags.join(" · ")}</div></div>
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setTargetPlace(place); setIsReviewOpen(true); }}>리뷰 쓰기</Button>
                        </Card>
                    ))}
                </TabsContent>

                <TabsContent value="reviews" className="space-y-3">
                    {user.reviews && user.reviews.length > 0 ? user.reviews.map((review: any) => (
                        <Card key={review.id} className="p-3 bg-white shadow-sm">
                            <div className="flex justify-between items-start mb-2"><div className="font-bold text-sm">{review.place_name}</div><div className="text-yellow-500 text-xs font-bold">★ {review.rating.toFixed(1)}</div></div>
                            <div className="grid grid-cols-4 gap-1 text-[10px] text-gray-500 bg-gray-50 p-2 rounded mb-2"><div>맛 {review.score_taste}</div><div>서비스 {review.score_service}</div><div>가격 {review.score_price}</div><div>분위기 {review.score_vibe}</div></div>
                            <p className="text-xs text-gray-700">{review.comment}</p>
                        </Card>
                    )) : <div className="text-center text-gray-400 py-10 text-sm">작성한 리뷰가 없습니다.</div>}
                </TabsContent>
                
                <TabsContent value="favorites" className="space-y-3">
                    {user.favorites && user.favorites.length > 0 ? user.favorites.map((fav: any, i: number) => (
                        <Card key={i} className="p-3 flex justify-between items-center bg-white shadow-sm">
                            <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-red-500 fill-red-500"/><span className="font-bold text-sm">{fav.name}</span></div>
                        </Card>
                    )) : <div className="text-center text-gray-400 py-10 text-sm">즐겨찾는 장소가 없습니다.</div>}
                </TabsContent>
            </Tabs>
        </div>
        <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Settings className="w-5 h-5 text-indigo-600" /> 설정</CardTitle></CardHeader><CardContent className="space-y-1"><Button variant="ghost" className="w-full justify-start gap-3 h-12"><Bell className="w-5 h-5" /> 알림 설정</Button><Button variant="ghost" className="w-full justify-start gap-3 text-red-500 hover:text-red-600 hover:bg-red-50 h-12" onClick={() => { if (confirm("로그아웃?")) { localStorage.removeItem("token"); window.location.href = "/login"; } }}><LogOut className="w-5 h-5" /> 로그아웃</Button></CardContent></Card>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-md h-[80vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl">
            <DialogHeader className="px-6 pt-4 pb-2 bg-white"><DialogTitle>아바타 꾸미기</DialogTitle></DialogHeader>
            <div className="bg-gradient-to-b from-blue-100 to-white p-6 flex flex-col items-center justify-center border-b shrink-0 relative">
                {renderAvatarLayered(previewEquipped, 200)}
                <div className="absolute top-4 right-4 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 shadow-sm"><Coins className="w-4 h-4 text-yellow-500" />{(user.wallet_balance || 0).toLocaleString()}</div>
            </div>
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <Tabs defaultValue="inventory" className="flex-1 flex flex-col" onValueChange={setActiveTab}>
                    <div className="px-4 pt-3 border-b">
                        <TabsList className="w-full grid grid-cols-2"><TabsTrigger value="inventory">내 아이템</TabsTrigger><TabsTrigger value="shop">상점 (구매)</TabsTrigger></TabsList>
                        <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">{CATEGORIES.map(cat => (<button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${activeCategory === cat.id ? "bg-indigo-600 text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}><span>{cat.icon}</span> {cat.label}</button>))}</div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                        <div className="grid grid-cols-3 gap-3">
                            {currentItems.map(item => {
                                const isEquipped = previewEquipped[item.category] === item.id; const isOwned = user.avatar?.inventory?.includes(item.id);
                                return (<div key={item.id} className={`relative bg-white rounded-xl p-2 border-2 transition-all cursor-pointer hover:shadow-md ${isEquipped ? "border-indigo-500 bg-indigo-50" : "border-transparent shadow-sm"}`} onClick={() => activeTab === 'inventory' ? handleEquip(item) : null}><div className="aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden flex items-center justify-center"><img src={item.image_url} alt={item.name} className="w-full h-full object-contain" /></div><div className="text-xs font-bold truncate">{item.name}</div>{activeTab === 'shop' && !isOwned ? (<Button size="sm" className="w-full mt-2 h-7 text-[10px] bg-yellow-400 hover:bg-yellow-500 text-black font-bold" onClick={(e) => { e.stopPropagation(); handleBuy(item); }}>{item.price_coin} C</Button>) : (<div className="mt-2 text-[10px] text-center font-bold text-gray-400 py-1">{isEquipped ? "장착 중" : (isOwned ? "보유 중" : "")}</div>)}</div>)
                            })}
                        </div>
                    </div>
                </Tabs>
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
          <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>✍️ 상세 리뷰</DialogTitle><DialogDescription><span className="font-bold text-indigo-600">{targetPlace?.name}</span> 상세 평가</DialogDescription></DialogHeader>
              <div className="py-4 space-y-6">
                  <div className="space-y-4">
                      <div className="space-y-2"><div className="flex justify-between text-sm font-bold"><span>😋 맛/음식</span><span>{scores.taste}점</span></div><Slider value={[scores.taste]} max={5} min={1} step={1} onValueChange={(v) => setScores({...scores, taste: v[0]})} /></div>
                      <div className="space-y-2"><div className="flex justify-between text-sm font-bold"><span>🤵 서비스</span><span>{scores.service}점</span></div><Slider value={[scores.service]} max={5} min={1} step={1} onValueChange={(v) => setScores({...scores, service: v[0]})} /></div>
                      <div className="space-y-2"><div className="flex justify-between text-sm font-bold"><span>💰 가격</span><span>{scores.price}점</span></div><Slider value={[scores.price]} max={5} min={1} step={1} onValueChange={(v) => setScores({...scores, price: v[0]})} /></div>
                      <div className="space-y-2"><div className="flex justify-between text-sm font-bold"><span>✨ 분위기</span><span>{scores.vibe}점</span></div><Slider value={[scores.vibe]} max={5} min={1} step={1} onValueChange={(v) => setScores({...scores, vibe: v[0]})} /></div>
                  </div>
                  <Textarea placeholder="자세한 후기를 남겨주세요 (선택)" value={reviewText} onChange={(e) => setReviewText(e.target.value)} className="resize-none h-20 text-sm" />
              </div>
              <DialogFooter><Button onClick={handleSubmitReview} className="w-full bg-indigo-600 hover:bg-indigo-700">제출하기</Button></DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  )
}