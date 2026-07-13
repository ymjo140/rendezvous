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
    Bell, LogOut,
    Heart, Star, MessageSquare, Pencil, Check, X, Utensils,
    ChevronRight, MapPin, Search, Loader2, Calendar, Grid3X3, Trash2, Plus
} from "lucide-react"

// 🌟 [추가] 캘린더 탭 컴포넌트 가져오기
// (주의: calendar-tab.tsx 파일의 최상위 div에서 'h-full'이나 'h-screen' 클래스가 있다면 제거하거나 'min-h-[500px]' 등으로 변경해야 자연스럽습니다.)
import { CalendarTab } from "@/components/ui/calendar-tab"

import { PreferenceModal } from "@/components/ui/preference-modal"
import { FriendsPanel } from "@/components/ui/components/friends/FriendsPanel"
import { CashWalletCard } from "@/components/ui/components/wallet/CashWalletCard"
import { GameProfileCard } from "@/components/ui/components/game/GameProfileCard"
import { fetchWithAuth } from "@/lib/api-client"
import { logAction } from "@/lib/analytics-client"
import { getTasteType } from "@/lib/taste-persona"

// --- 타입 정의 ---
interface UserInfo {
    id: number; name: string; email: string; wallet_balance: number; 
    location_name?: string; lat?: number; lng?: number; 
    avatar: { level: number; equipped: Record<string, string | null>; inventory: string[]; }; 
    favorites: { id: number; name: string; category?: string; address?: string }[]; 
    reviews: any[]; 
    preferences?: any;
}


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
                const res = await fetchWithAuth(`/api/geocode?query=${encodeURIComponent(query)}`);
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
            <div className="flex items-center border rounded-xl px-3 bg-gray-50 focus-within:border-[#F5A623] focus-within:ring-1 focus-within:ring-[#F5A623]/20 transition-all">
                <Search className="w-4 h-4 text-gray-400 mr-2"/>
                <Input 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    placeholder="동네·지하철역·도로명 주소 검색"
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

// 방문 후 재방문 의향 설문 (개인 취향 + 모임 적합 2축) — 방문 다음날부터 미응답 예약에 노출
function RevisitSurvey() {
    const [items, setItems] = useState<any[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [answers, setAnswers] = useState<Record<string, { personal?: boolean; group?: boolean }>>({});

    useEffect(() => {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (!token) return;
        fetchWithAuth("/api/feedback/pending")
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((d) => setItems(d.items || []))
            .catch(() => {});
    }, []);

    const setAns = (rid: string, axis: "personal" | "group", val: boolean) =>
        setAnswers((p) => ({ ...p, [rid]: { ...p[rid], [axis]: val } }));

    const btnCls = (active: boolean, on: boolean) =>
        `flex-1 h-9 rounded-lg text-sm font-bold border transition-colors ${
            active
                ? on ? "bg-[#F5A623] text-white border-transparent" : "bg-gray-600 text-white border-transparent"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
        }`;

    const submit = async (item: any) => {
        const a = answers[item.reservation_id] || {};
        if (a.personal === undefined) { alert("'또 가고 싶어요?'를 먼저 선택해주세요."); return; }
        setBusy(item.reservation_id);
        try {
            const res = await fetchWithAuth("/api/feedback", {
                method: "POST",
                body: JSON.stringify({
                    reservation_id: item.reservation_id,
                    place_id: item.place_id,
                    personal_revisit: a.personal,
                    group_revisit: a.group ?? null,
                }),
            });
            if (res.ok) setItems((prev) => prev.filter((x) => x.reservation_id !== item.reservation_id));
            else alert("저장에 실패했어요.");
        } catch {
            alert("저장에 실패했어요.");
        } finally {
            setBusy(null);
        }
    };

    if (items.length === 0) return null;

    return (
        <div className="px-5 mb-4 space-y-3">
            {items.map((item) => {
                const a = answers[item.reservation_id] || {};
                const rid = item.reservation_id;
                return (
                    <div key={rid} className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                        <div className="text-sm font-bold text-gray-800">📍 {item.place_name} 다녀오셨나요?</div>
                        <div className="mt-0.5 text-xs text-gray-400">{item.date} · 솔직한 답이 추천을 더 정확하게 해요</div>
                        <div className="mt-3">
                            <div className="mb-1 text-xs font-semibold text-gray-600">또 가고 싶어요? <span className="text-gray-400">(내 취향)</span></div>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setAns(rid, "personal", true)} className={btnCls(a.personal === true, true)}>네 👍</button>
                                <button type="button" onClick={() => setAns(rid, "personal", false)} className={btnCls(a.personal === false, false)}>아니요</button>
                            </div>
                        </div>
                        <div className="mt-2">
                            <div className="mb-1 text-xs font-semibold text-gray-600">모임 장소로 추천할래요? <span className="text-gray-400">(모임 적합)</span></div>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setAns(rid, "group", true)} className={btnCls(a.group === true, true)}>네 👍</button>
                                <button type="button" onClick={() => setAns(rid, "group", false)} className={btnCls(a.group === false, false)}>아니요</button>
                            </div>
                        </div>
                        <Button className="w-full mt-3 h-10 rounded-xl bg-[#F5A623] hover:bg-amber-600 text-white font-bold text-sm" disabled={busy === rid} onClick={() => submit(item)}>
                            {busy === rid ? "저장 중..." : "응답 완료"}
                        </Button>
                    </div>
                );
            })}
        </div>
    );
}

export function MyPageTab() {
  const router = useRouter();
  
  // --- State 관리 ---
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isGuest, setIsGuest] = useState(false);

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
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editPostContent, setEditPostContent] = useState("");
  const [postSaving, setPostSaving] = useState(false);

  // 💾 저장 폴더 관련 상태
  interface SaveFolder {
      id: number;
      name: string;
      icon: string;
      color: string;
      item_count: number;
      is_default: boolean;
      is_public?: boolean;
      description?: string | null;
  }
  interface SavedItem {
      id: number;
      folder_id: number;
      item_type: string;
      post_id?: string;
      place_id?: number;
      memo?: string;
      created_at: string;
      item_name?: string;
      item_image?: string;
  }
  const [saveFolders, setSaveFolders] = useState<SaveFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<SaveFolder | null>(null);
  const [folderItems, setFolderItems] = useState<SavedItem[]>([]);
  const [folderItemsLoading, setFolderItemsLoading] = useState(false);

  // --- Data Fetching Logic ---
  const fetchMyInfo = async () => {
      const token = localStorage.getItem("token");
      if (!token) { setIsGuest(true); return; }
      try {
          const res = await fetchWithAuth(`/api/users/me`);
          if (res.ok) {
              const data = await res.json();
              setUser(data);
              setNewName(data.name);

              if (!data.preferences || !data.preferences.foods || data.preferences.foods.length === 0) {
                  setIsPreferenceModalOpen(true);
              }
          } else { setIsGuest(true); }
      } catch (e) { setIsGuest(true); }
  };


  const fetchMyPosts = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      setPostsLoading(true);
      try {
          const res = await fetchWithAuth(`/api/posts/me`);
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

  // 회원 탈퇴(스토어 필수) — 이중 확인 후 개인 데이터 삭제·계정 익명화
  const handleWithdraw = async () => {
      if (!confirm("정말 탈퇴하시겠어요?\n게시물·친구·취향 데이터가 모두 삭제되며 복구할 수 없습니다.")) return;
      if (!confirm("캐시 잔액과 예약 내역도 사라집니다.\n탈퇴를 진행할까요?")) return;
      try {
          const res = await fetchWithAuth("/api/users/me", { method: "DELETE" });
          if (res.ok) {
              localStorage.removeItem("token");
              alert("탈퇴가 완료되었습니다. 이용해주셔서 감사합니다.");
              window.location.href = "/login";
          } else {
              alert("탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.");
          }
      } catch {
          alert("탈퇴 처리 중 오류가 발생했어요.");
      }
  };

  const handleUpdatePost = async () => {
      if (!selectedPost) return;
      setPostSaving(true);
      try {
          const res = await fetchWithAuth(`/api/posts/${selectedPost.id}`, {
              method: "PATCH",
              body: JSON.stringify({ content: editPostContent }),
          });
          if (res.ok) {
              setMyPosts(prev => prev.map(p => p.id === selectedPost.id ? { ...p, content: editPostContent } : p));
              setSelectedPost(prev => prev ? { ...prev, content: editPostContent } : prev);
              setIsEditingPost(false);
          } else {
              alert("수정에 실패했어요.");
          }
      } catch (e) {
          alert("수정 중 오류가 발생했어요.");
      } finally {
          setPostSaving(false);
      }
  };

  const handleDeletePost = async (postId: string) => {
      if (!confirm("이 게시물을 삭제하시겠습니까?")) return;
      
      const token = localStorage.getItem("token");
      try {
          const res = await fetchWithAuth(`/api/posts/${postId}`, {
              method: "DELETE"
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

  // 💾 저장 폴더 목록 불러오기
  const fetchSaveFolders = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      setFoldersLoading(true);
      try {
          const res = await fetchWithAuth(`/api/folders`);
          if (res.ok) {
              const folders = await res.json();
              setSaveFolders(folders);
          }
      } catch (e) {
          console.error("폴더 로드 오류:", e);
      } finally {
          setFoldersLoading(false);
      }
  };

  // 💾 폴더 내 아이템 불러오기
  const fetchFolderItems = async (folderId: number) => {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      setFolderItemsLoading(true);
      try {
          const res = await fetchWithAuth(`/api/folders/${folderId}/items`);
          if (res.ok) {
              const items = await res.json();
              setFolderItems(items);
          }
      } catch (e) {
          console.error("폴더 아이템 로드 오류:", e);
      } finally {
          setFolderItemsLoading(false);
      }
  };

  // 💾 저장 아이템 삭제
  const handleUnsaveItem = async (itemId: number) => {
      if (!confirm("저장을 취소하시겠습니까?")) return;
      
      const token = localStorage.getItem("token");
      try {
          const res = await fetchWithAuth(`/api/saves/${itemId}`, {
              method: "DELETE"
          });
          if (res.ok) {
              setFolderItems(prev => prev.filter(item => item.id !== itemId));
              // 폴더 아이템 개수 업데이트
              if (selectedFolder) {
                  setSaveFolders(prev => prev.map(f => 
                      f.id === selectedFolder.id ? { ...f, item_count: f.item_count - 1 } : f
                  ));
              }
          }
      } catch (e) {
          alert("삭제 실패");
      }
  };

  // 💾 폴더 생성
  const handleCreateFolder = async () => {
      const name = window.prompt("새 폴더 이름을 입력하세요")?.trim();
      if (!name) return;
      try {
          const res = await fetchWithAuth(`/api/folders`, {
              method: "POST",
              body: JSON.stringify({ name }),
          });
          if (res.ok) {
              await fetchSaveFolders();
          } else {
              alert("폴더 생성에 실패했어요.");
          }
      } catch (e) {
          alert("폴더 생성 중 오류가 발생했어요.");
      }
  };

  // 💾 폴더 삭제 (기본 폴더는 불가)
  const handleDeleteFolder = async (folder: SaveFolder) => {
      if (folder.is_default) return;
      if (!confirm(`'${folder.name}' 폴더를 삭제할까요? 안에 저장된 항목도 함께 삭제됩니다.`)) return;
      try {
          const res = await fetchWithAuth(`/api/folders/${folder.id}`, { method: "DELETE" });
          if (res.ok) {
              setSaveFolders(prev => prev.filter(f => f.id !== folder.id));
          } else {
              alert("폴더 삭제에 실패했어요.");
          }
      } catch (e) {
          alert("폴더 삭제 중 오류가 발생했어요.");
      }
  };

  // 💾 폴더 공개/비공개 — 공개 시 큐레이터 '맛집 리스트'로 프로필에 노출
  const handleTogglePublic = async (folder: SaveFolder) => {
      if (folder.is_default) {
          alert("기본 폴더는 공개할 수 없어요. 새 폴더를 만들어 리스트로 공개해보세요.");
          return;
      }
      const makePublic = !folder.is_public;
      let description = folder.description || "";
      if (makePublic) {
          const input = window.prompt("맛집 리스트 소개 문구 (예: 혼밥하기 좋은 국밥집 모음)", description);
          if (input !== null) description = input.trim();
      }
      try {
          const res = await fetchWithAuth(`/api/folders/${folder.id}/publish`, {
              method: "PATCH",
              body: JSON.stringify({ is_public: makePublic, description }),
          });
          if (res.ok) {
              const data = await res.json();
              setSaveFolders(prev => prev.map(f => f.id === folder.id ? { ...f, is_public: data.is_public, description: data.description } : f));
          } else {
              alert("변경에 실패했어요.");
          }
      } catch (e) {
          alert("변경 중 오류가 발생했어요.");
      }
  };

  // 💾 저장 항목 클릭 → 상세로 이동 (음식점=장소)
  const handleOpenSavedItem = (item: SavedItem) => {
      if (item.item_type === "place" && item.place_id) {
          router.push(`/places/${item.place_id}`);
      }
      // 게시물 항목은 전용 상세 라우트가 없어 이동하지 않음(추후 연결)
  };

  useEffect(() => { fetchMyInfo(); fetchSaveFolders(); }, []);
  useEffect(() => { if (user && !isGuest) fetchMyPosts(); }, [user, isGuest]);

  // --- Handlers ---
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
          const res = await fetchWithAuth(`/api/reviews`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
          });
          if (res.ok) {
              logAction({
                  action_type: "review_submit",
                  place_id: targetPlace?.id ?? null,
                  source: "mypage_tab",
                  metadata: { place_name: payload.place_name }
              });
              alert("소중한 리뷰가 등록되었습니다!");
              setIsReviewOpen(false);
              setScores({ taste: 3, service: 3, price: 3, vibe: 3 });
              setReviewText("");
              fetchMyInfo();
          }
      } catch (e) { alert("오류가 발생했습니다."); }
  };

  const handleUpdateName = async () => {
      if (!newName.trim()) return;
      const token = localStorage.getItem("token");
      try {
          const res = await fetchWithAuth(`/api/users/me`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName })
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
          const res = await fetchWithAuth(`/api/users/me/location`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
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

  // 프로필 캐릭터 = 취향 페르소나 이모지 (드레스업 아바타 대체)
  const personaEmoji = getTasteType(user?.preferences)?.emoji ?? "🍽️";

  // --- UI Rendering ---
  
  if (isGuest) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-6 space-y-6 bg-[#F3F4F6] font-['Pretendard']">
              <div className="text-center space-y-3">
                  <div className="text-6xl mb-4">🔒</div>
                  <h2 className="text-2xl font-bold text-gray-800">로그인이 필요해요</h2>
                  <p className="text-gray-500 leading-relaxed">내 취향을 분석받고<br/>친구들과의 약속을 더 편하게 잡아보세요.</p>
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
            <div className="absolute inset-0 bg-gradient-to-br from-[#F5A623] to-[#14B8A6]"></div>
            <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>

            <CardContent className="relative p-6 z-10">
                <div className="flex items-center gap-5">
                    <div className="w-24 h-24 rounded-full border-4 border-white/30 shadow-inner bg-white/25 backdrop-blur-md overflow-hidden flex items-center justify-center relative flex-shrink-0">
                          <span className="text-5xl leading-none select-none">{personaEmoji}</span>
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
                            {(() => {
                                const t = getTasteType(user.preferences);
                                return (
                                    <Badge className="bg-black/20 hover:bg-black/30 text-xs border-0 backdrop-blur-md px-3 py-1 rounded-full text-white font-medium">
                                        {t ? `${t.emoji} ${t.title}` : "🍽️ 취향 분석 전"}
                                    </Badge>
                                );
                            })()}
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

                <div className="mt-3">
                    <Button className="w-full bg-white text-[#F5A623] hover:bg-gray-50 border-0 h-12 rounded-xl text-sm font-bold shadow-md transition-all" onClick={() => setIsPreferenceModalOpen(true)}>
                        <Utensils className="w-4 h-4 mr-2" /> 내 취향 설정하기
                    </Button>
                </div>
            </CardContent>
        </Card>
      </div>

      {/* 1-2. 내 취향 유형 */}
      {(() => {
        const t = getTasteType(user.preferences);
        return (
          <div className="px-5 mb-2">
            <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
              <CardContent className="p-5">
                {t ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">{t.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-[#F5A623]">내 취향 유형</div>
                        <div className="text-lg font-bold text-gray-800 truncate">{t.title}</div>
                        <div className="text-xs text-gray-500">{t.desc}</div>
                      </div>
                      <button onClick={() => setIsPreferenceModalOpen(true)} className="text-gray-400 hover:text-[#F5A623] flex-shrink-0 p-1.5 rounded-full hover:bg-amber-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {t.spendLabel && <Badge className="bg-amber-100 text-amber-600 text-[10px] font-bold">💰 {t.spendLabel}</Badge>}
                      {t.vibes.slice(0, 4).map((v) => (
                        <Badge key={`v-${v}`} variant="secondary" className="bg-gray-100 text-gray-600 text-[10px]">{v}</Badge>
                      ))}
                      {t.foods.slice(0, 4).map((f) => (
                        <Badge key={`f-${f}`} variant="secondary" className="bg-amber-50 text-amber-700 text-[10px]">{f}</Badge>
                      ))}
                      {t.alcohol.slice(0, 3).map((a) => (
                        <Badge key={`a-${a}`} variant="secondary" className="bg-rose-50 text-rose-600 text-[10px]">🍶 {a}</Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">🤔</div>
                      <div>
                        <div className="text-sm font-bold text-gray-800">내 취향 유형이 궁금하다면?</div>
                        <div className="text-xs text-gray-500">취향을 설정하면 유형을 분석해드려요</div>
                      </div>
                    </div>
                    <Button size="sm" className="bg-[#F5A623] hover:bg-amber-700 rounded-xl flex-shrink-0" onClick={() => setIsPreferenceModalOpen(true)}>
                      분석하기
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* 1-2-4. 게임 진행도 (🔥스트릭 / XP·레벨 / 일일퀘스트 / 뱃지) */}
      <GameProfileCard />

      {/* 1-2-4b. 방문 후 재방문 의향 설문(개인/모임 2축) */}
      <RevisitSurvey />

      {/* 1-2-5. 충전 캐시 + 내 예약 */}
      <CashWalletCard />

      {/* 1-3. 내 친구 (카톡 초대 / 검색 추가 / 요청 수락) */}
      <div className="px-5 mb-2">
        <FriendsPanel myId={user.id} myName={user.name} />
      </div>

      {/* 2. 탭 영역 (캘린더 추가됨) */}
      <div className="px-5">
        <Tabs defaultValue="posts" className="w-full">
            {/* 🌟 grid-cols-4으로 변경 - 게시물 탭 추가 */}
            <TabsList className="w-full h-14 bg-white rounded-2xl p-1.5 shadow-sm mb-6 grid grid-cols-4 border border-gray-100">
                <TabsTrigger 
                    value="posts" 
                    className="rounded-xl h-full text-gray-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white font-bold transition-all shadow-none text-xs sm:text-sm"
                >
                   <Grid3X3 className="w-4 h-4 mr-1"/> 게시물
                </TabsTrigger>
                <TabsTrigger 
                    value="calendar" 
                    className="rounded-xl h-full text-gray-500 data-[state=active]:bg-[#F5A623] data-[state=active]:text-white font-bold transition-all shadow-none text-xs sm:text-sm"
                >
                   <Calendar className="w-4 h-4 mr-1"/> 일정
                </TabsTrigger>
                <TabsTrigger 
                    value="reviews" 
                    className="rounded-xl h-full text-gray-500 data-[state=active]:bg-[#F5A623] data-[state=active]:text-white font-bold transition-all shadow-none text-xs sm:text-sm"
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
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                        <p className="text-sm text-gray-400">게시물 불러오는 중...</p>
                    </div>
                ) : myPosts.length > 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {/* 통계 헤더 */}
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Grid3X3 className="w-5 h-5 text-amber-500" />
                                <span className="font-bold text-gray-800">내 게시물</span>
                            </div>
                            <Badge className="bg-amber-100 text-amber-600 font-bold">{myPosts.length}개</Badge>
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
                        <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <Grid3X3 className="w-8 h-8 text-amber-500" />
                        </div>
                        <div className="text-gray-800 font-bold">아직 게시물이 없어요</div>
                        <div className="text-gray-400 text-sm">탐색 탭에서 첫 게시물을 올려보세요!</div>
                        <Button 
                            className="mt-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl"
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
                  {/* 폴더 상세 보기 모드 */}
                  {selectedFolder ? (
                    <div className="space-y-4">
                        {/* 뒤로가기 헤더 */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                            <button 
                                onClick={() => { setSelectedFolder(null); setFolderItems([]); }}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <ChevronRight className="w-5 h-5 text-gray-500 rotate-180" />
                            </button>
                            <div className="text-2xl">{selectedFolder.icon}</div>
                            <div className="flex-1">
                                <div className="font-bold text-gray-800">{selectedFolder.name}</div>
                                <div className="text-xs text-gray-400">{selectedFolder.item_count}개 저장됨</div>
                            </div>
                        </div>
                        
                        {/* 폴더 아이템 목록 */}
                        {folderItemsLoading ? (
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                                <p className="text-sm text-gray-400">불러오는 중...</p>
                            </div>
                        ) : folderItems.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3">
                                {folderItems.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleOpenSavedItem(item)}
                                        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group cursor-pointer"
                                    >
                                        {/* 이미지 */}
                                        <div className="aspect-square bg-gray-100 relative">
                                            {item.item_image ? (
                                                <img 
                                                    src={item.item_image} 
                                                    alt="" 
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100">
                                                    <Heart className="w-8 h-8 text-amber-300" />
                                                </div>
                                            )}
                                            {/* 삭제 버튼 */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleUnsaveItem(item.id); }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-3 h-3 text-white" />
                                            </button>
                                        </div>
                                        {/* 정보 */}
                                        <div className="p-3">
                                            <div className="text-sm font-medium text-gray-800 line-clamp-1">
                                                {item.item_name || "저장된 항목"}
                                            </div>
                                            {item.memo && (
                                                <div className="text-xs text-gray-400 mt-1 line-clamp-1">{item.memo}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-2">
                                <div className="text-4xl mb-2">{selectedFolder.icon}</div>
                                <div className="text-gray-800 font-bold">폴더가 비어있어요</div>
                                <div className="text-gray-400 text-sm">탐색 탭에서 마음에 드는 장소를 저장해보세요!</div>
                            </div>
                        )}
                    </div>
                  ) : (
                    /* 폴더 목록 모드 */
                    <>
                        {/* 새 폴더 만들기 */}
                        <button
                            onClick={handleCreateFolder}
                            className="w-full flex items-center justify-center gap-2 bg-white p-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-[#F5A623] hover:text-[#F5A623] transition-colors font-bold text-sm"
                        >
                            <Plus className="w-4 h-4" /> 새 폴더 만들기
                        </button>
                        {foldersLoading ? (
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                                <p className="text-sm text-gray-400">폴더 불러오는 중...</p>
                            </div>
                        ) : saveFolders.length > 0 ? (
                            <div className="space-y-3">
                                {saveFolders.map((folder) => (
                                    <div 
                                        key={folder.id} 
                                        onClick={() => { setSelectedFolder(folder); fetchFolderItems(folder.id); }}
                                        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-[#14B8A6] transition-colors cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                                                style={{ backgroundColor: `${folder.color}20` }}
                                            >
                                                {folder.icon}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-gray-800 truncate">{folder.name}</div>
                                                <div className="text-xs text-gray-400">
                                                    {folder.item_count}개 저장됨{folder.is_public ? " · 공개 리스트" : ""}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {!folder.is_default && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleTogglePublic(folder); }}
                                                    className={`px-2 py-1 rounded-full text-[11px] font-bold transition-colors ${folder.is_public ? "bg-purple-100 text-purple-600 hover:bg-purple-200" : "text-gray-400 hover:bg-gray-100"}`}
                                                    title={folder.is_public ? "공개 맛집 리스트 · 탭하여 비공개" : "맛집 리스트로 공개하기"}
                                                >
                                                    {folder.is_public ? "🌐 공개중" : "비공개"}
                                                </button>
                                            )}
                                            {!folder.is_default && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                                    title="폴더 삭제"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#14B8A6] transition-colors" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center space-y-2">
                                <div className="text-4xl mb-2">📁</div>
                                <div className="text-gray-800 font-bold">저장된 폴더가 없어요</div>
                                <div className="text-gray-400 text-sm">탐색 탭에서 마음에 드는 장소를 저장하면<br/>여기에 폴더가 생성됩니다!</div>
                            </div>
                        )}
                    </>
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
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-[#F5A623]">
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

            <a
                href="/terms"
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
            >
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500">
                    📄
                </div>
                <div className="flex-1">
                    <div className="font-bold text-gray-800 text-sm">이용약관</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
            </a>

            <a
                href="/privacy"
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left"
            >
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500">
                    🔒
                </div>
                <div className="flex-1">
                    <div className="font-bold text-gray-800 text-sm">개인정보처리방침</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
            </a>

            <button
                className="w-full flex items-center gap-4 p-4 hover:bg-red-50 transition-colors border-b border-gray-50 text-left group"
                onClick={() => { if (confirm("정말 로그아웃 하시겠습니까?")) { localStorage.removeItem("token"); window.location.href = "/login"; } }}
            >
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-100 transition-colors">
                    <LogOut className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <div className="font-bold text-red-500 text-sm">로그아웃</div>
                </div>
            </button>

            <button
                className="w-full flex items-center gap-4 p-4 hover:bg-red-50 transition-colors text-left"
                onClick={handleWithdraw}
            >
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                    <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <div className="font-bold text-gray-500 text-sm">회원 탈퇴</div>
                    <div className="text-xs text-gray-400">계정과 개인 데이터가 모두 삭제됩니다</div>
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

      {/* 6. 리뷰 작성 모달 */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
          <DialogContent className="sm:max-w-sm rounded-3xl font-['Pretendard']">
              <DialogHeader>
                  <DialogTitle className="text-lg">✍️ 생생한 후기 남기기</DialogTitle>
                  <DialogDescription className="text-xs">
                      <span className="font-bold text-[#F5A623]">{targetPlace?.name}</span>에서의 경험은 어떠셨나요?
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
                                  <span className="text-[#F5A623]">{(scores as any)[key]}점</span>
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
                      className="resize-none h-24 text-sm border-gray-200 focus:border-[#F5A623] rounded-xl bg-gray-50" 
                  />
              </div>
              <DialogFooter>
                  <Button onClick={handleSubmitReview} className="w-full bg-[#F5A623] hover:bg-amber-700 h-12 rounded-xl text-base font-bold shadow-lg">
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
                          
                          {/* 내용 — 수정 모드 지원 */}
                          {isEditingPost ? (
                              <div className="space-y-2">
                                  <Textarea
                                      value={editPostContent}
                                      onChange={(e) => setEditPostContent(e.target.value)}
                                      className="resize-none h-24 text-sm bg-gray-50 rounded-xl"
                                      placeholder="문구를 입력하세요..."
                                  />
                                  <div className="flex gap-2">
                                      <Button
                                          variant="outline"
                                          className="flex-1 rounded-xl"
                                          onClick={() => setIsEditingPost(false)}
                                      >
                                          취소
                                      </Button>
                                      <Button
                                          className="flex-1 bg-[#F5A623] hover:bg-amber-700 rounded-xl"
                                          disabled={postSaving}
                                          onClick={handleUpdatePost}
                                      >
                                          {postSaving ? "저장 중..." : "저장"}
                                      </Button>
                                  </div>
                              </div>
                          ) : (
                              selectedPost.content && (
                                  <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-xl">
                                      {selectedPost.content}
                                  </p>
                              )
                          )}

                          {/* 수정/삭제 버튼 */}
                          {!isEditingPost && (
                              <div className="flex gap-2">
                                  <Button
                                      variant="outline"
                                      className="flex-1 rounded-xl h-11 font-bold"
                                      onClick={() => {
                                          setEditPostContent(selectedPost.content || "");
                                          setIsEditingPost(true);
                                      }}
                                  >
                                      <Pencil className="w-4 h-4 mr-2" />
                                      수정
                                  </Button>
                                  <Button
                                      variant="outline"
                                      className="flex-1 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl h-11 font-bold"
                                      onClick={() => handleDeletePost(selectedPost.id)}
                                  >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      삭제
                                  </Button>
                              </div>
                          )}
                      </div>
                  </>
              )}
          </DialogContent>
      </Dialog>
    </div>
  )
}


