"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { 
    Settings, Bell, LogOut, Palette, Coins, ShoppingBag, 
    Heart, Star, MessageSquare, Pencil, Check, X, Utensils, 
    ChevronRight, MapPin, Search, Loader2, Calendar, Grid3X3, Trash2
} from "lucide-react"

// 🌟 [추가] 캘린더 탭 컴포넌트 가져오기
// (주의: calendar-tab.tsx 파일의 최상위 div에서 'h-full'이나 'h-screen' 클래스가 있다면 제거하거나 'min-h-[500px]' 등으로 변경해야 자연스럽습니다.)
import { CalendarTab } from "@/components/ui/calendar-tab"

import { PreferenceModal } from "@/components/ui/preference-modal"

// --- 상수 및 타입 정의 ---
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
    location_name?: string; lat?: number; lng?: number; 
    avatar: { level: number; equipped: Record<string, string | null>; inventory: string[]; }; 
    favorites: { id: number; name: string; category?: string; address?: string }[]; 
    reviews: any[]; 
    preferences?: any;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://wemeet-backend-xqlo.onrender.com";

// 게시물 타입 정의
interface PostItem {
    id: string;
    image_urls: string[];
    content?: string;
    likes_count: number;
    comments_count: number;
    created_at: string;
}

// 장소 검색 컴포넌트
function LocationSearch({ onSelect }: { onSelect: (place: any) => void }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (query.length < 2) { setResults([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`${API_URL}/api/places/search?query=${query}`);
                if (res.ok) {
                    setResults(await res.json());
                } else {
                    setResults([
                        { title: `${query} (검색결과)`, address: "서울시 중구 세종대로 110", lat: 37.5665, lng: 126.9780 },
                        { title: "강남역", address: "서울시 강남구 강남대로 396", lat: 37.4980, lng: 127.0276 }
                    ]);
                }
            } catch (e) {
                setResults([
                    { title: `${query} (검색결과)`, address: "서울시 중구 세종대로 110", lat: 37.5665, lng: 126.9780 },
                    { title: "강남역", address: "서울시 강남구 강남대로 396", lat: 37.4980, lng: 127.0276 }
                ]);
            } finally { setSearching(false); }
        }, 500);
        return () => clearTimeout(t);
    }, [query]);

    return (
        <div className="relative w-full">
            <div className="flex items-center border rounded-xl px-3 bg-gray-50 focus-within:border-[#7C3AED] focus-within:ring-1 focus-within:ring-[#7C3AED]/20 transition-all">
                <Search className="w-4 h-4 text-gray-400 mr-2"/>
                <Input 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    placeholder="동명(읍/면) 또는 도로명 주소 검색" 
                    className="border-none bg-transparent h-10 text-sm focus-visible:ring-0 placeholder:text-gray-400"
                />
                {searching && <Loader2 className="w-3 h-3 animate-spin text-gray-400"/>}
            </div>
            {results.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border rounded-xl shadow-lg mt-2 z-50 max-h-48 overflow-y-auto">
                    {results.map((place, i) => (
                        <div key={i} onClick={() => { onSelect(place); setQuery(""); setResults([]); }} className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0 transition-colors">
                            <div className="font-bold text-sm text-gray-800">{place.title}</div>
                            <div className="text-xs text-gray-500">{place.address}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function MyPageTab() {
  const router = useRouter();
  
  // --- State 관리 ---
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

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locLoading, setLocLoading] = useState(false);

  const [isPreferenceModalOpen, setIsPreferenceModalOpen] = useState(false);

  // 내 게시물 관련 상태
  const [myPosts, setMyPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  // --- Data Fetching Logic ---
  const fetchMyInfo = async () => {
      const token = localStorage.getItem("token");
      if (!token) { setIsGuest(true); return; }
      try {
          const res = await fetch(`${API_URL}/api/users/me`, { headers: { "Authorization": `Bearer ${token}` } });
          if (res.ok) {
              const data = await res.json();
              setUser(data);
              setNewName(data.name); 
              if (data.avatar) setPreviewEquipped(data.avatar.equipped || {});

              if (!data.preferences || !data.preferences.foods || data.preferences.foods.length === 0) {
                  setIsPreferenceModalOpen(true);
              }
          } else { setIsGuest(true); }
      } catch (e) { setIsGuest(true); }
  };

  const fetchShopItems = async () => {
      try { const res = await fetch(`${API_URL}/api/shop/items`); if (res.ok) setShopItems(await res.json()); } catch (e) {}
  };

  const fetchMyPosts = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      setPostsLoading(true);
      try {
          const res = await fetch(`${API_URL}/api/posts/me`, {
              headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
              const posts = await res.json();
              setMyPosts(posts);
          }
      } catch (e) {
          console.error("게시물 로드 오류:", e);
      } finally {
          setPostsLoading(false);
      }
  };

  const handleDeletePost = async (postId: string) => {
      if (!confirm("이 게시물을 삭제하시겠습니까?")) return;
      
      const token = localStorage.getItem("token");
      try {
          const res = await fetch(`${API_URL}/api/posts/${postId}`, {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
              setMyPosts(prev => prev.filter(p => p.id !== postId));
              setIsPostModalOpen(false);
              setSelectedPost(null);
          }
      } catch (e) {
          alert("삭제 실패");
      }
  };

  useEffect(() => { fetchMyInfo(); }, []);
  useEffect(() => { if (isEditorOpen) fetchShopItems(); }, [isEditorOpen]);
  useEffect(() => { if (user && !isGuest) fetchMyPosts(); }, [user, isGuest]);

  // --- Handlers ---
  const handleBuy = async (item: AvatarItem) => {
      if (!user) return;
      if (user.wallet_balance < item.price_coin) { alert("코인이 부족합니다! 열심히 활동해서 모아보세요."); return; }
      if (confirm(`${item.name}을(를) ${item.price_coin}코인에 구매하시겠습니까?`)) {
          const token = localStorage.getItem("token");
          const res = await fetch(`${API_URL}/api/shop/buy`, {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ item_id: item.id })
          });
          if (res.ok) { alert("구매 완료! 인벤토리에서 확인하세요."); fetchMyInfo(); }
      }
  };

  const handleEquip = async (item: AvatarItem) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/avatar/equip`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ category: item.category, item_id: item.id })
      });
      if (res.ok) { const data = await res.json(); setPreviewEquipped(data.equipped); fetchMyInfo(); }
  };

  const handleSubmitReview = async () => {
      if (!targetPlace) return;
      const token = localStorage.getItem("token");
      const payload = {
          place_name: targetPlace.name || targetPlace.place_name,
          rating: 0, 
          score_taste: scores.taste, score_service: scores.service, score_price: scores.price, score_vibe: scores.vibe,
          comment: reviewText, tags: targetPlace.tags || []
      };
      try {
          const res = await fetch(`${API_URL}/api/reviews`, {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
          });
          if (res.ok) { alert("소중한 리뷰가 등록되었습니다!"); setIsReviewOpen(false); setScores({ taste: 3, service: 3, price: 3, vibe: 3 }); setReviewText(""); fetchMyInfo(); }
      } catch (e) { alert("오류가 발생했습니다."); }
  };

  const handleUpdateName = async () => {
      if (!newName.trim()) return;
      const token = localStorage.getItem("token");
      try {
          const res = await fetch(`${API_URL}/api/users/me`, {
              method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ name: newName })
          });
          if (res.ok) {
              const data = await res.json();
              setUser(prev => prev ? { ...prev, name: data.name } : null);
              setIsEditingName(false);
          }
      } catch (e) { alert("변경 실패"); }
  };

  const handleSaveLocation = async (place: any) => {
      if (!confirm(`'${place.title}'을(를) 내 위치로 설정하시겠습니까?`)) return;
      setLocLoading(true);
      try {
          const token = localStorage.getItem("token");
          const res = await fetch(`${API_URL}/api/users/me/location`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify({
                  location_name: place.title,
                  lat: place.lat,
                  lng: place.lng
              })
          });
          if (res.ok) {
              const updated = await res.json();
              setUser((prev: any) => ({ ...prev, location_name: updated.user.location, lat: place.lat, lng: place.lng }));
              alert("📍 위치가 저장되었습니다! 이제 이 위치를 기준으로 모임을 추천받습니다.");
              setIsLocationModalOpen(false);
          }
      } catch (e) { alert("저장 실패"); }
      finally { setLocLoading(false); }
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

  // --- UI Rendering ---
  
  if (isGuest) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-6 space-y-6 bg-[#F3F4F6] font-['Pretendard']">
              <div className="text-center space-y-3">
                  <div className="text-6xl mb-4">🔒</div>
                  <h2 className="text-2xl font-bold text-gray-800">로그인이 필요해요</h2>
                  <p className="text-gray-500 leading-relaxed">나만의 아바타를 꾸미고<br/>친구들과의 약속을 더 편하게 잡아보세요.</p>
              </div>
              <Button className="w-full max-w-xs h-12 rounded-xl bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold text-base shadow-sm" onClick={() => router.push("/login")}>
                  카카오로 3초만에 시작하기
              </Button>
          </div>
      );
  }
  if (!user) return <div className="p-10 text-center text-gray-500">정보를 불러오는 중...</div>;

  return (
    <div className="h-full bg-[#F3F4F6] overflow-y-auto pb-24 font-['Pretendard']">
      
      {/* 1. 상단 프로필 카드 */}
      <div className="p-5 pt-8">
          <Card className="relative overflow-hidden border-none shadow-xl text-white rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-[#7C3AED] to-[#14B8A6]"></div>
            <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>

            <CardContent className="relative p-6 z-10">
                <div className="flex items-center gap-5">
                    <div className="w-24 h-24 rounded-full border-4 border-white/30 shadow-inner bg-white/20 backdrop-blur-md overflow-hidden flex items-center justify-center relative flex-shrink-0">
                          {renderAvatarLayered(user.avatar?.equipped || {}, 96)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        {isEditingName ? (
                            <div className="flex items-center gap-2 mb-2">
                                <Input value={newName} onChange={e => setNewName(e.target.value)} className="h-9 text-black bg-white/90 border-none w-32 text-sm" />
                                <Button size="icon" className="h-9 w-9 bg-green-500 hover:bg-green-600 text-white rounded-full flex-shrink-0" onClick={handleUpdateName}><Check className="w-4 h-4"/></Button>
                                <Button size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/20 rounded-full flex-shrink-0" onClick={() => setIsEditingName(false)}><X className="w-4 h-4"/></Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 mb-2">
                                <h2 className="text-2xl font-bold tracking-tight truncate">{user.name}</h2>
                                <button onClick={() => setIsEditingName(true)} className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-colors flex-shrink-0">
                                    <Pencil className="w-3 h-3 text-white" />
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="bg-black/20 hover:bg-black/30 text-xs border-0 backdrop-blur-md px-3 py-1 rounded-full text-white font-medium">
                                Lv.{user.avatar?.level || 1} 탐험가
                            </Badge>
                            <Badge className="bg-white/20 text-white border-0 px-2 py-1 rounded-full flex items-center gap-1 font-bold">
                                <Coins className="w-3 h-3 text-yellow-300" /> {(user.wallet_balance || 0).toLocaleString()}
                            </Badge>
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <button onClick={() => setIsLocationModalOpen(true)} className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl p-3 flex items-center justify-between text-white transition-all">
                        <div className="flex items-center gap-2">
                            <div className="bg-white/20 p-1.5 rounded-full"><MapPin className="w-4 h-4"/></div>
                            <div className="text-left">
                                <div className="text-[10px] opacity-80">내 동네 설정</div>
                                <div className="text-sm font-bold">{user.location_name || "위치 설정하기"}</div>
                            </div>
                        </div>
                        <ChevronRight className="w-4 h-4 opacity-70"/>
                    </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                    <Button className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md h-12 rounded-xl text-sm font-medium transition-all" onClick={() => setIsEditorOpen(true)}>
                        <Palette className="w-4 h-4 mr-2" /> 아바타 꾸미기
                    </Button>
                    <Button className="bg-white text-[#7C3AED] hover:bg-gray-50 border-0 h-12 rounded-xl text-sm font-bold shadow-md transition-all" onClick={() => { setIsEditorOpen(true); setActiveTab('shop'); }}>
                        <ShoppingBag className="w-4 h-4 mr-2" /> 아이템 상점
                    </Button>
                </div>
            </CardContent>
        </Card>
      </div>

      {/* 2. 탭 영역 (캘린더 추가됨) */}
      <div className="px-5">
        <Tabs defaultValue="posts" className="w-full">
            {/* 🌟 grid-cols-4으로 변경 - 게시물 탭 추가 */}
            <TabsList className="w-full h-14 bg-white rounded-2xl p-1.5 shadow-sm mb-6 grid grid-cols-4 border border-gray-100">
                <TabsTrigger 
                    value="posts" 
                    className="rounded-xl h-full text-gray-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white font-bold transition-all shadow-none text-xs sm:text-sm"
                >
                   <Grid3X3 className="w-4 h-4 mr-1"/> 게시물
                </TabsTrigger>
                <TabsTrigger 
                    value="calendar" 
                    className="rounded-xl h-full text-gray-500 data-[state=active]:bg-[#7C3AED] data-[state=active]:text-white font-bold transition-all shadow-none text-xs sm:text-sm"
                >
                   <Calendar className="w-4 h-4 mr-1"/> 일정
                </TabsTrigger>
                <TabsTrigger 
                    value="reviews" 
                    className="rounded-xl h-full text-gray-500 data-[state=active]:bg-[#7C3AED] data-[state=active]:text-white font-bold transition-all shadow-none text-xs sm:text-sm"
                >
                    활동
                </TabsTrigger>
                <TabsTrigger 
                    value="favorites" 
                    className="rounded-xl h-full text-gray-500 data-[state=active]:bg-[#14B8A6] data-[state=active]:text-white font-bold transition-all shadow-none text-xs sm:text-sm"
                >
                    <Heart className="w-4 h-4 mr-1"/> 찜
                </TabsTrigger>
            </TabsList>
            
            {/* 📸 [신규] 내 게시물 탭 - 인스타그램 스타일 그리드 */}
            <TabsContent value="posts" className="space-y-4">
                {postsLoading ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                        <p className="text-sm text-gray-400">게시물 불러오는 중...</p>
                    </div>
                ) : myPosts.length > 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {/* 통계 헤더 */}
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Grid3X3 className="w-5 h-5 text-purple-500" />
                                <span className="font-bold text-gray-800">내 게시물</span>
                            </div>
                            <Badge className="bg-purple-100 text-purple-600 font-bold">{myPosts.length}개</Badge>
                        </div>
                        
                        {/* 그리드 */}
                        <div className="grid grid-cols-3 gap-0.5 p-0.5">
                            {myPosts.map((post) => (
                                <div 
                                    key={post.id}
                                    onClick={() => { setSelectedPost(post); setIsPostModalOpen(true); }}
                                    className="relative aspect-square cursor-pointer group overflow-hidden bg-gray-100"
                                >
                                    {post.image_urls && post.image_urls[0] ? (
                                        <img 
                                            src={post.image_urls[0]} 
                                            alt="" 
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                            <Grid3X3 className="w-8 h-8 text-gray-400" />
                                        </div>
                                    )}
                                    
                                    {/* 여러 장 아이콘 */}
                                    {post.image_urls && post.image_urls.length > 1 && (
                                        <div className="absolute top-2 right-2">
                                            <Grid3X3 className="w-4 h-4 text-white drop-shadow-lg" />
                                        </div>
                                    )}
                                    
                                    {/* 호버 오버레이 */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white text-sm font-semibold">
                                        <div className="flex items-center gap-1">
                                            <Heart className="w-4 h-4 fill-white" />
                                            {post.likes_count}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <MessageSquare className="w-4 h-4 fill-white" />
                                            {post.comments_count}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-3">
                        <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <Grid3X3 className="w-8 h-8 text-purple-500" />
                        </div>
                        <div className="text-gray-800 font-bold">아직 게시물이 없어요</div>
                        <div className="text-gray-400 text-sm">탐색 탭에서 첫 게시물을 올려보세요!</div>
                        <Button 
                            className="mt-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold rounded-xl"
                            onClick={() => {/* 탐색 탭으로 이동하는 로직 추가 가능 */}}
                        >
                            게시물 올리기
                        </Button>
                    </div>
                )}
            </TabsContent>

            {/* 🌟 [신규] 캘린더 탭 컨텐츠 */}
            <TabsContent value="calendar" className="space-y-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px]">
                     {/* CalendarTab 컴포넌트 렌더링 */}
                     <CalendarTab />
                </div>
            </TabsContent>

            <TabsContent value="reviews" className="space-y-4">
                  {user.reviews && user.reviews.length > 0 ? user.reviews.map((review: any) => (
                    <div key={review.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="font-bold text-gray-800">{review.place_name}</h3>
                            <span className="text-[#F59E0B] font-bold text-sm flex items-center gap-1">
                                <Star className="w-3 h-3 fill-[#F59E0B]" /> {review.rating.toFixed(1)}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-3">
                            <Badge variant="secondary" className="bg-gray-50 text-gray-500 font-normal text-[10px]">맛 {review.score_taste}</Badge>
                            <Badge variant="secondary" className="bg-gray-50 text-gray-500 font-normal text-[10px]">서비스 {review.score_service}</Badge>
                            <Badge variant="secondary" className="bg-gray-50 text-gray-500 font-normal text-[10px]">분위기 {review.score_vibe}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl">
                            "{review.comment}"
                        </p>
                    </div>
                  )) : (
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-2">
                        <div className="text-4xl mb-2">📝</div>
                        <div className="text-gray-800 font-bold">아직 활동 내역이 없어요</div>
                        <div className="text-gray-400 text-sm">첫 모임을 갖고 리뷰를 남겨보세요!</div>
                    </div>
                  )}
            </TabsContent>
            
            <TabsContent value="favorites" className="space-y-4">
                  {user.favorites && user.favorites.length > 0 ? user.favorites.map((fav: any, i: number) => (
                    <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-[#14B8A6] transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                                <Heart className="w-5 h-5 fill-red-500"/>
                            </div>
                            <div>
                                <div className="font-bold text-gray-800">{fav.name}</div>
                                <div className="text-xs text-gray-400">자세히 보기</div>
                            </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#14B8A6] transition-colors" />
                    </div>
                  )) : (
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-2">
                        <div className="text-4xl mb-2">❤️</div>
                        <div className="text-gray-800 font-bold">즐겨찾는 장소가 없습니다</div>
                        <div className="text-gray-400 text-sm">마음에 드는 장소를 찜해보세요.</div>
                    </div>
                  )}
            </TabsContent>
        </Tabs>
      </div>
      
      {/* 3. 설정 메뉴 */}
      <div className="px-5 mt-8 mb-10 space-y-4">
        <h3 className="text-sm font-bold text-gray-400 ml-1">설정 및 관리</h3>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button 
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
                onClick={() => setIsPreferenceModalOpen(true)}
            >
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-[#7C3AED]">
                    <Utensils className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <div className="font-bold text-gray-800 text-sm">취향 데이터 재설정</div>
                    <div className="text-xs text-gray-400">선호하는 음식, 분위기 다시 고르기</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>

            <button className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                    <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <div className="font-bold text-gray-800 text-sm">알림 설정</div>
                    <div className="text-xs text-gray-400">푸시 알림 및 소리 설정</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
            </button>

            <button 
                className="w-full flex items-center gap-4 p-4 hover:bg-red-50 transition-colors text-left group"
                onClick={() => { if (confirm("정말 로그아웃 하시겠습니까?")) { localStorage.removeItem("token"); window.location.href = "/login"; } }}
            >
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-100 transition-colors">
                    <LogOut className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <div className="font-bold text-red-500 text-sm">로그아웃</div>
                </div>
            </button>
        </div>
      </div>

      {/* 4. 위치 설정 모달 */}
      <Dialog open={isLocationModalOpen} onOpenChange={setIsLocationModalOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl">
              <DialogHeader><DialogTitle>내 동네 설정</DialogTitle><DialogDescription>만날 장소를 추천받을 기준 위치를 설정해주세요.</DialogDescription></DialogHeader>
              <div className="py-4">
                  <LocationSearch onSelect={handleSaveLocation} />
                  {locLoading && <div className="mt-4 text-center text-xs text-gray-400 flex justify-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> 저장 중...</div>}
              </div>
          </DialogContent>
      </Dialog>

      {/* 5. 아바타 꾸미기 모달 */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-md h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-3xl border-0 font-['Pretendard']">
            <DialogHeader className="px-6 pt-5 pb-3 bg-white border-b border-gray-100 flex-shrink-0">
                <DialogTitle className="text-lg font-bold text-gray-800">아바타 스타일링</DialogTitle>
                <DialogDescription className="text-xs text-gray-400">나만의 개성을 표현해보세요!</DialogDescription>
            </DialogHeader>
            
            <div className="bg-gradient-to-b from-purple-50 to-white p-6 flex flex-col items-center justify-center border-b border-gray-100 flex-shrink-0 relative">
                {renderAvatarLayered(previewEquipped, 220)}
                <div className="absolute top-4 right-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-1 shadow-sm border border-gray-100">
                    <Coins className="w-4 h-4 text-yellow-400" /> {(user.wallet_balance || 0).toLocaleString()}
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <Tabs defaultValue="inventory" className="flex-1 flex flex-col" onValueChange={setActiveTab}>
                    <div className="px-4 pt-3 border-b border-gray-100">
                        <TabsList className="w-full grid grid-cols-2 h-11 bg-gray-100 rounded-xl p-1">
                            <TabsTrigger value="inventory" className="rounded-lg text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">내 아이템</TabsTrigger>
                            <TabsTrigger value="shop" className="rounded-lg text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm text-[#7C3AED]">상점 (구매)</TabsTrigger>
                        </TabsList>
                        
                        <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
                            {CATEGORIES.map(cat => (
                                <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${activeCategory === cat.id ? "bg-[#7C3AED] text-white border-[#7C3AED] shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                                    <span>{cat.icon}</span> {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 bg-[#F9FAFB]">
                        <div className="grid grid-cols-3 gap-3">
                            {currentItems.map(item => {
                                const isEquipped = previewEquipped[item.category] === item.id; 
                                const isOwned = user.avatar?.inventory?.includes(item.id);
                                return (
                                    <div 
                                        key={item.id} 
                                        className={`relative bg-white rounded-xl p-2 border-2 transition-all cursor-pointer hover:shadow-md ${isEquipped ? "border-[#7C3AED] bg-purple-50" : "border-transparent shadow-sm"}`} 
                                        onClick={() => activeTab === 'inventory' ? handleEquip(item) : null}
                                    >
                                        <div className="aspect-square bg-gray-50 rounded-lg mb-2 overflow-hidden flex items-center justify-center relative">
                                            <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                                            {isEquipped && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#7C3AED]"></div>}
                                        </div>
                                        <div className="text-xs font-bold truncate text-gray-800">{item.name}</div>
                                        {activeTab === 'shop' && !isOwned ? (
                                            <Button size="sm" className="w-full mt-2 h-8 text-[10px] bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold shadow-sm" onClick={(e) => { e.stopPropagation(); handleBuy(item); }}>
                                                {item.price_coin} C
                                            </Button>
                                        ) : (
                                            <div className="mt-2 text-[10px] text-center font-bold text-gray-400 py-1 bg-gray-50 rounded-md">
                                                {isEquipped ? "장착 중" : (isOwned ? "보유 중" : "")}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </Tabs>
            </div>
        </DialogContent>
      </Dialog>

      {/* 6. 리뷰 작성 모달 */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
          <DialogContent className="sm:max-w-sm rounded-3xl font-['Pretendard']">
              <DialogHeader>
                  <DialogTitle className="text-lg">✍️ 생생한 후기 남기기</DialogTitle>
                  <DialogDescription className="text-xs">
                      <span className="font-bold text-[#7C3AED]">{targetPlace?.name}</span>에서의 경험은 어떠셨나요?
                  </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-6">
                  <div className="space-y-4 bg-gray-50 p-4 rounded-xl">
                      {['taste', 'service', 'price', 'vibe'].map((key) => (
                          <div key={key} className="space-y-2">
                              <div className="flex justify-between text-xs font-bold text-gray-700">
                                  <span>
                                      {key === 'taste' && '😋 맛/음식'}
                                      {key === 'service' && '🤵 서비스'}
                                      {key === 'price' && '💰 가격/가성비'}
                                      {key === 'vibe' && '✨ 분위기'}
                                  </span>
                                  <span className="text-[#7C3AED]">{(scores as any)[key]}점</span>
                              </div>
                              <Slider 
                                  defaultValue={[3]} 
                                  max={5} min={1} step={1} 
                                  onValueChange={(v) => setScores({...scores, [key]: v[0]})}
                                  className="cursor-pointer" 
                              />
                          </div>
                      ))}
                  </div>
                  <Textarea 
                      placeholder="다른 사용자들에게 도움이 되는 자세한 후기를 남겨주세요." 
                      value={reviewText} 
                      onChange={(e) => setReviewText(e.target.value)} 
                      className="resize-none h-24 text-sm border-gray-200 focus:border-[#7C3AED] rounded-xl bg-gray-50" 
                  />
              </div>
              <DialogFooter>
                  <Button onClick={handleSubmitReview} className="w-full bg-[#7C3AED] hover:bg-purple-700 h-12 rounded-xl text-base font-bold shadow-lg">
                      리뷰 등록하기
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* 7. 취향 모달 */}
      <PreferenceModal 
          isOpen={isPreferenceModalOpen} 
          onClose={() => setIsPreferenceModalOpen(false)} 
          onComplete={() => {
              setIsPreferenceModalOpen(false);
              fetchMyInfo(); 
          }} 
      />

      {/* 8. 게시물 상세 모달 */}
      <Dialog open={isPostModalOpen} onOpenChange={setIsPostModalOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl p-0 gap-0 overflow-hidden font-['Pretendard']">
              {selectedPost && (
                  <>
                      {/* 이미지 */}
                      <div className="relative aspect-square bg-black">
                          {selectedPost.image_urls && selectedPost.image_urls[0] ? (
                              <img 
                                  src={selectedPost.image_urls[0]} 
                                  alt="" 
                                  className="w-full h-full object-contain"
                              />
                          ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                  <Grid3X3 className="w-12 h-12 text-gray-600" />
                              </div>
                          )}
                          
                          {/* 여러 장 인디케이터 */}
                          {selectedPost.image_urls && selectedPost.image_urls.length > 1 && (
                              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                                  {selectedPost.image_urls.map((_, i) => (
                                      <div 
                                          key={i} 
                                          className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/50'}`}
                                      />
                                  ))}
                              </div>
                          )}
                      </div>
                      
                      {/* 정보 */}
                      <div className="p-4 space-y-4">
                          {/* 통계 */}
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                  <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                                  <span className="font-bold">{selectedPost.likes_count}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                  <MessageSquare className="w-5 h-5 text-gray-400" />
                                  <span className="font-bold">{selectedPost.comments_count}</span>
                              </div>
                              <span className="text-gray-400 text-xs ml-auto">{selectedPost.created_at}</span>
                          </div>
                          
                          {/* 내용 */}
                          {selectedPost.content && (
                              <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-xl">
                                  {selectedPost.content}
                              </p>
                          )}
                          
                          {/* 삭제 버튼 */}
                          <Button 
                              variant="outline" 
                              className="w-full border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl h-11 font-bold"
                              onClick={() => handleDeletePost(selectedPost.id)}
                          >
                              <Trash2 className="w-4 h-4 mr-2" />
                              게시물 삭제
                          </Button>
                      </div>
                  </>
              )}
          </DialogContent>
      </Dialog>
    </div>
  )
}