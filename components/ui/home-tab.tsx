"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Check, Search, MapPin, User, X, Plus, Trash2, Users, ChevronDown, ChevronUp, Filter, Share, Heart, MessageSquare, Locate, Coins, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { motion, AnimatePresence } from "framer-motion" 

import { PreferenceModal } from "@/components/ui/preference-modal"
import { PlaceCard } from "@/components/ui/place-card"
import { fetchWithAuth } from "@/lib/api-client"

declare global { interface Window { naver: any; } }

// AI 페르소나 데이터 (기존 유지)
const AI_PERSONAS = [
    { id: 2, name: "김직장 (강남)", locationName: "강남역", location: { lat: 37.498085, lng: 127.027621 }, desc: "퇴근 후 한잔을 좋아하는 직장인", avatar: { equipped: { body: "body_basic", hair: "hair_01", top: "top_hoodie", bottom: "bottom_jeans", shoes: "shoes_sneakers" } } },
    { id: 3, name: "이대학 (홍대)", locationName: "홍대입구", location: { lat: 37.557527, lng: 126.924467 }, desc: "가성비와 힙한 곳을 찾는 대학생", avatar: { equipped: { body: "body_basic", hair: "hair_02", top: "top_tshirt", bottom: "bottom_shorts", shoes: "shoes_sneakers" } } },
    { id: 4, name: "박감성 (성수)", locationName: "성수역", location: { lat: 37.544581, lng: 127.056035 }, desc: "분위기 좋은 카페/전시 마니아", avatar: { equipped: { body: "body_basic", hair: "hair_01", top: "top_tshirt", bottom: "bottom_jeans", shoes: "shoes_sneakers" } } },
    { id: 5, name: "최개발 (판교)", locationName: "판교역", location: { lat: 37.394761, lng: 127.111217 }, desc: "조용한 곳을 선호하는 개발자", avatar: { equipped: { body: "body_basic", hair: "hair_01", top: "top_hoodie", bottom: "bottom_shorts", shoes: "shoes_sneakers" } } },
];

const PURPOSE_FILTERS: Record<string, any> = {
    "식사": { label: "🍚 식사", tabs: { "MENU": { label: "메뉴", options: ["한식", "양식", "일식", "중식", "고기", "분식"] }, "VIBE": { label: "분위기", options: ["가성비", "혼밥", "깔끔한", "웨이팅맛집"] } } },
    "술/회식": { label: "🍺 술/회식", tabs: { "TYPE": { label: "주종", options: ["소주", "맥주", "와인", "하이볼"] }, "VIBE": { label: "분위기", options: ["시끌벅적", "조용한", "힙한", "노포"] } } },
    "카페": { label: "☕ 카페", tabs: { "TYPE": { label: "목적", options: ["수다", "작업", "디저트"] }, "VIBE": { label: "분위기", options: ["감성", "뷰맛집", "대형"] } } },
    "데이트/기념일": { label: "💖 데이트", tabs: { "COURSE": { label: "코스", options: ["맛집", "카페", "산책", "액티비티"] }, "VIBE": { label: "분위기", options: ["로맨틱", "조용한", "이색적인"] } } }
};

export function HomeTab() {
  const router = useRouter();
  
  // --- State 관리 ---
  const [searchQuery, setSearchQuery] = useState("")
  const [myLocationInput, setMyLocationInput] = useState("위치 확인 중...") 
  const [manualInputs, setManualInputs] = useState<string[]>([""]); 
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [includeMe, setIncludeMe] = useState(true);
  
  const [isFriendModalOpen, setIsFriendModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const [selectedPurpose, setSelectedPurpose] = useState("식사")
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({ PURPOSE: ["식사"], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [] });
  
  const [myProfile, setMyProfile] = useState<any>(null)
  const [recommendedRegions, setRecommendedRegions] = useState<any[]>([])
  const [currentDisplayRegion, setCurrentDisplayRegion] = useState<any>(null)
  const [activeTabIdx, setActiveTabIdx] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false); 
  
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [placeToShare, setPlaceToShare] = useState<any>(null);
  const [myRooms, setMyRooms] = useState<any[]>([]);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<any>(null);
  const [placeReviews, setPlaceReviews] = useState<any[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewScores, setReviewScores] = useState({ taste: 3, service: 3, price: 3, vibe: 3 });
  const [reviewText, setReviewText] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  
  const [myFriendList, setMyFriendList] = useState<any[]>([]);
  const [isPreferenceModalOpen, setIsPreferenceModalOpen] = useState(false);

  // 🌟 [추가됨] 방문 인증 관련 상태
  const [nearbyPlace, setNearbyPlace] = useState<any>(null); // 내 근처에 있는 장소
  const [checkingIn, setCheckingIn] = useState(false);

  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const myMarkerRef = useRef<any>(null)
  const friendMarkersRef = useRef<any[]>([])

  // 🌟 [추가됨] 거리 계산 함수 (Haversine Formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371e3; // 지구 반지름 (미터)
      const φ1 = lat1 * Math.PI/180;
      const φ2 = lat2 * Math.PI/180;
      const Δφ = (lat2-lat1) * Math.PI/180;
      const Δλ = (lon2-lon1) * Math.PI/180;

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      return R * c;
  }

  // 🌟 [수정됨] 위치 추적 로직 (거리 계산 추가)
  useEffect(() => {
    const fetchMyInfo = async () => {
        const token = localStorage.getItem("token");
        if (!token) { setMyProfile(null); setMyLocationInput("비회원"); return; }
        try {
            const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/users/me", { headers: { "Authorization": `Bearer ${token}` } });
            if (res.ok) {
                const user: any = await res.json();
                setMyProfile({ ...user, locationName: "현위치" });
                setMyLocationInput("📍 현위치 (GPS)");
                if (!user.preferences || !user.preferences.foods || user.preferences.foods.length === 0) setIsPreferenceModalOpen(true);
            }
            const friendRes = await fetch("https://wemeet-backend-xqlo.onrender.com/api/friends", { headers: { "Authorization": `Bearer ${token}` } });
            if (friendRes.ok) { const data = await friendRes.json() as any; setMyFriendList(data.friends); }
        } catch (e) { console.error(e); }
    }
    fetchMyInfo();

    if (navigator.geolocation) {
        // 🌟 watchPosition으로 변경하여 실시간 추적
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const currentPos = { lat: latitude, lng: longitude };
                
                // 내 위치 상태 업데이트
                setMyProfile((prev: any) => prev ? { ...prev, location: currentPos } : { location: currentPos });
                
                // 🌟 [핵심] 현재 추천된 장소들 중 가까운 곳 찾기
                if (currentDisplayRegion?.places?.length > 0) {
                    let found = null;
                    for (const place of currentDisplayRegion.places) {
                        // place.location = [lat, lng] 배열 형태임
                        const dist = calculateDistance(latitude, longitude, place.location[0], place.location[1]);
                        
                        // 500m 이내면 방문 가능 (테스트용 500m, 실제 서비스 시 50~100m 권장)
                        if (dist <= 500) {
                            found = place;
                            break; // 가장 가까운 하나만 잡음
                        }
                    }
                    setNearbyPlace(found);
                }
            },
            () => setMyLocationInput("서울 시청 (기본)"),
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [currentDisplayRegion]); // 🌟 추천 목록이 바뀔 때도 다시 체크

  // --- Handlers ---
  const handleKakaoInvite = () => {
      const inviteLink = "https://v0-we-meet-app-features.vercel.app";
      navigator.clipboard.writeText(inviteLink);
      alert("카카오톡 초대 링크가 복사되었습니다!");
  };

  // 🌟 [추가됨] 방문 인증 API 호출
  const handleCheckIn = async () => {
      if (!nearbyPlace) return;
      setCheckingIn(true);
      try {
          const res = await fetchWithAuth("/api/coins/check-in", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                  place_name: nearbyPlace.name,
                  lat: nearbyPlace.location[0],
                  lng: nearbyPlace.location[1]
              })
          });

          if (res.ok) {
              const data = await res.json();
              alert(data.message); // "50코인을 획득했습니다!"
              setNearbyPlace(null); // 버튼 숨기기 (오늘 완료)
          } else {
              const err = await res.json();
              alert(err.detail); // "이미 방문했습니다" 등
          }
      } catch (e) {
          alert("인증 실패");
      } finally {
          setCheckingIn(false);
      }
  };

  // ... (이하 기존 지도/마커 로직 동일) ...
  useEffect(() => {
    const initMap = () => {
      if (typeof window.naver === 'undefined' || !window.naver.maps) { setTimeout(initMap, 100); return; }
      if (!mapRef.current) { 
        const centerLat = myProfile?.location?.lat || 37.5665;
        const centerLng = myProfile?.location?.lng || 126.9780;
        mapRef.current = new window.naver.maps.Map("map", { center: new window.naver.maps.LatLng(centerLat, centerLng), zoom: 14 }); 
      } else if (myProfile?.location && !currentDisplayRegion) {
          mapRef.current.morph(new window.naver.maps.LatLng(myProfile.location.lat, myProfile.location.lng));
      }

      const createAvatarMarker = (user: any, isMe: boolean) => {
          const equipped = user.avatar?.equipped || {};
          const getUrl = (id: string) => id ? `/assets/avatar/${id}.png` : null;
          const body = getUrl(equipped.body || "body_basic");
          
          const displayName = (user.name || "User").split('(')[0];
          const avatarHtml = `
            <div style="position: relative; width: 50px; height: 80px; display: flex; flex-col; align-items: center;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: white; border: 2px solid ${isMe ? '#7C3AED' : '#14B8A6'}; overflow: hidden; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                    <img src="${body}" style="width: 100%; height: 100%; object-fit: contain;" />
                </div>
                <div style="margin-top: 4px; background: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: bold; border: 1px solid #eee; white-space: nowrap;">${displayName}</div>
            </div>
          `;
          return new window.naver.maps.Marker({
              position: new window.naver.maps.LatLng(user.location.lat, user.location.lng),
              map: mapRef.current,
              icon: { content: avatarHtml, anchor: new window.naver.maps.Point(25, 40) },
              zIndex: isMe ? 100 : 50
          });
      };

      if (myProfile && mapRef.current) {
          if (myMarkerRef.current) myMarkerRef.current.setMap(null);
          if (includeMe) {
            myMarkerRef.current = createAvatarMarker(myProfile, true);
          }
      }

      friendMarkersRef.current.forEach(m => m.setMap(null));
      friendMarkersRef.current = [];
      selectedFriends.forEach(friend => {
          const friendWithAvatar = { ...friend, avatar: friend.avatar || { equipped: { body: "body_basic" } } };
          const marker = createAvatarMarker(friendWithAvatar, false);
          friendMarkersRef.current.push(marker);
      });

      if (currentDisplayRegion && currentDisplayRegion.places) {
          markersRef.current.forEach(m => m.setMap(null));
          markersRef.current = [];
          currentDisplayRegion.places.forEach((p: any) => {
              const marker = new window.naver.maps.Marker({ 
                  position: new window.naver.maps.LatLng(p.location[0], p.location[1]), 
                  map: mapRef.current, 
                  title: p.name
              });
              markersRef.current.push(marker);
          });
          if (currentDisplayRegion.places.length > 0) {
              mapRef.current.morph(new window.naver.maps.LatLng(currentDisplayRegion.lat, currentDisplayRegion.lng));
          }
      }
    };
    initMap();
  }, [myProfile, selectedFriends, currentDisplayRegion, includeMe]);

  const fetchRecommendations = async (users: any[], locationNameOverride?: string) => {
    const validUsers = users.filter(u => u !== null && u !== undefined);
    try {
      const allTags = Object.values(selectedFilters).flat();
      const usersToSend = validUsers.map(u => ({ id: u.id || 0, name: u.name || "User", location: u.location || { lat: 37.566, lng: 126.978 } }));

      const response = await fetch('https://wemeet-backend-xqlo.onrender.com/api/recommend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: usersToSend, purpose: selectedPurpose, location_name: locationNameOverride || "중간지점",
          manual_locations: manualInputs.filter(txt => txt && txt.trim() !== ""), user_selected_tags: allTags
        })
      })

      if (response.ok) {
          const data = await response.json() as any[];
          setRecommendedRegions(data);
          setActiveTabIdx(0); setIsExpanded(false);
          if (data.length > 0) setCurrentDisplayRegion(data[0]);
      }
    } catch (e) { console.error(e) }
  }

  // ... (나머지 핸들러들 기존 동일) ...
  const fetchMyRooms = async () => {
      const token = localStorage.getItem("token");
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/chat/rooms", { headers: { "Authorization": `Bearer ${token}` } });
          if (res.ok) setMyRooms(await res.json() as any[]);
      } catch (e) {}
  };

  const handlePlaceClick = async (place: any) => {
      setSelectedPlace(place); setIsDetailOpen(true); setPlaceReviews([]); setIsReviewing(false);
      if (myProfile?.favorites?.some((f: any) => f.id === place.id)) setIsFavorite(true); else setIsFavorite(false);
      try { const res = await fetch(`https://wemeet-backend-xqlo.onrender.com/api/reviews/${place.name}`); if (res.ok) setPlaceReviews(await res.json() as any[]); } catch (e) { console.error(e); }
  };

  const handleSubmitReview = async () => {
      if (!selectedPlace) return;
      const token = localStorage.getItem("token");
      if (!token) { if(confirm("리뷰 작성은 로그인이 필요합니다.")) router.push("/login"); return; }
      const payload = {
          place_name: selectedPlace.name, rating: 0, 
          score_taste: reviewScores.taste, score_service: reviewScores.service, score_price: reviewScores.price, score_vibe: reviewScores.vibe,
          comment: reviewText, tags: selectedPlace.tags
      };
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/reviews", {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
          });
          if (res.ok) { alert("리뷰 등록!"); setIsReviewing(false); setReviewScores({ taste: 3, service: 3, price: 3, vibe: 3 }); setReviewText(""); handlePlaceClick(selectedPlace); }
      } catch (e) { alert("오류 발생"); }
  };

  const handleToggleFavorite = async () => {
      if (!selectedPlace) return;
      const token = localStorage.getItem("token");
      if (!token) { if(confirm("즐겨찾기는 로그인이 필요합니다.")) router.push("/login"); return; }
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/favorites", {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ place_id: selectedPlace.id, place_name: selectedPlace.name })
          });
          if (res.ok) { const data = await res.json() as any; setIsFavorite(data.message === "Added"); }
      } catch (e) { alert("오류 발생"); }
  };

  const handleShare = async (roomId: string) => {
      const token = localStorage.getItem("token");
      if (!token) { if (confirm("공유 기능은 로그인이 필요합니다.")) { router.push("/login"); } return; }
      if (!placeToShare) return;
      try {
          await fetch("https://wemeet-backend-xqlo.onrender.com/api/chat/share", {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify({ room_id: roomId, place_name: placeToShare.name, place_category: placeToShare.category, place_tags: placeToShare.tags })
          });
          alert("채팅방에 공유 완료!"); setIsShareModalOpen(false); setIsDetailOpen(false); 
      } catch (e) { alert("공유 실패"); }
  };

  const handleTopSearch = () => { if(searchQuery) fetchRecommendations([myProfile], searchQuery); }
  const handleMidpointSearch = () => {
      const participants = (includeMe && myProfile) ? [myProfile, ...selectedFriends] : [...selectedFriends];
      const hasManualInput = manualInputs.some(txt => txt && txt.trim() !== "");
      if (participants.length === 0 && !hasManualInput) { alert("출발지를 설정해주세요!"); return; }
      fetchRecommendations(participants, "중간지점");
  };

  const toggleFilter = (groupKey: string, value: string) => {
      setSelectedFilters(prev => {
          if (groupKey === "PURPOSE") return { ...prev, [groupKey]: [value] };
          const list = prev[groupKey] || [];
          if (list.includes(value)) return { ...prev, [groupKey]: list.filter(v => v !== value) };
          return { ...prev, [groupKey]: [...list, value] };
      });
  };
  const removeTag = (tag: string) => { for (const [key, vals] of Object.entries(selectedFilters)) { if (vals.includes(tag)) toggleFilter(key, tag); } };
  const toggleFriend = (friend: any) => { if (selectedFriends.find(f => f.id === friend.id)) setSelectedFriends(prev => prev.filter(f => f.id !== friend.id)); else setSelectedFriends(prev => [...prev, friend]); };
  const handleManualInputChange = (idx: number, val: string) => { const newInputs = [...manualInputs]; newInputs[idx] = val; setManualInputs(newInputs); };
  const addManualInput = () => setManualInputs([...manualInputs, ""]);
  const removeManualInput = (idx: number) => { if (manualInputs.length > 1) setManualInputs(manualInputs.filter((_, i) => i !== idx)); else setManualInputs([""]); };
  const handleTabChange = (idx: number) => { setActiveTabIdx(idx); setCurrentDisplayRegion(recommendedRegions[idx]); setIsExpanded(false); };
  const moveToMyLocation = () => { if (myProfile?.location && mapRef.current) { mapRef.current.morph(new window.naver.maps.LatLng(myProfile.location.lat, myProfile.location.lng)); } }
  
  const currentFilters = PURPOSE_FILTERS[selectedPurpose];


  return (
    <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
        className="h-full overflow-y-auto pb-24 bg-[#F3F4F6] flex flex-col font-['Pretendard']"
    >
      {/* 1. 상단 검색바 & 필터 */}
      <div className="px-5 pt-6 pb-4 sticky top-0 z-20 bg-white/95 backdrop-blur-md shadow-sm rounded-b-3xl">
        <div className="relative flex items-center bg-[#F3F4F6] rounded-2xl h-12 px-4 mb-3">
            <Search className="w-5 h-5 text-gray-400 mr-2" />
            <Input 
                className="border-none bg-transparent h-full text-base placeholder:text-gray-400 focus-visible:ring-0 p-0" 
                placeholder="어떤 모임을 계획 중이신가요?" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleTopSearch()}
            />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="text-gray-400"><X className="w-4 h-4"/></button>}
        </div>
        
        {/* 필터 칩 */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            <Button variant="outline" size="sm" className="rounded-full border-[#7C3AED] text-[#7C3AED] bg-white hover:bg-purple-50 h-9 px-4 text-xs font-bold flex-shrink-0" onClick={() => setIsFilterOpen(true)}>
                <Filter className="w-3 h-3 mr-1.5"/> 필터
            </Button>
            <Badge className="h-9 px-4 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#14B8A6] text-white border-0 text-xs font-medium shadow-sm flex items-center justify-center flex-shrink-0">
                {currentFilters?.label || selectedPurpose}
            </Badge>
            {Object.entries(selectedFilters).flatMap(([k, v]) => v).map(tag => {
                if (tag === selectedPurpose) return null;
                let parentKey = ""; 
                if (currentFilters) { const tabs = currentFilters.tabs as any; for (const [key, data] of Object.entries(tabs)) { if ((data as any).options.includes(tag)) parentKey = key; } } 
                if (!parentKey) return null;
                return (
                    <Badge key={tag} variant="secondary" className="h-9 px-3 rounded-full bg-white text-gray-600 border border-gray-200 text-xs font-normal whitespace-nowrap flex-shrink-0">
                        {tag} <X className="w-3 h-3 ml-1 cursor-pointer text-gray-400" onClick={() => removeTag(tag)}/>
                    </Badge>
                )
            })}
        </div>
      </div>

      {/* 2. 지도 영역 */}
      <div className="px-5 mt-2">
          <div className="relative h-60 w-full rounded-3xl overflow-hidden shadow-md border border-white">
              <div id="map" className="w-full h-full bg-gray-200"></div>
              <Button size="icon" className="absolute bottom-4 right-4 rounded-full shadow-lg bg-white hover:bg-gray-50 text-gray-700 h-10 w-10 border-0" onClick={moveToMyLocation}>
                  <Locate className="w-5 h-5"/>
              </Button>
          </div>
      </div>

      {/* 🌟 방문 인증 팝업 (내 위치가 추천 장소 500m 이내일 때) */}
      <AnimatePresence>
        {nearbyPlace && (
            <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="px-5 mt-4 z-30"
            >
                <Button 
                    onClick={handleCheckIn} 
                    disabled={checkingIn}
                    className="w-full h-14 rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold text-lg shadow-xl flex items-center justify-center gap-2 animate-bounce"
                >
                    {checkingIn ? <Loader2 className="animate-spin"/> : <Coins className="w-6 h-6 fill-yellow-100 text-white"/>}
                    {nearbyPlace.title || nearbyPlace.name} 방문 인증 (+50C)
                </Button>
            </motion.div>
        )}
      </AnimatePresence>

      {/* 3. 출발지 설정 카드 (기존 기능) */}
      <div className="px-5 mt-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800">어디서 모이나요?</h2>
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
            {includeMe && (
                <div className="flex items-center gap-3 p-2 rounded-xl bg-gray-50">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-lg">👤</div>
                    <span className="flex-1 text-sm font-medium text-gray-700">{myLocationInput}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:bg-white" onClick={() => setIncludeMe(false)}><Trash2 className="w-4 h-4 text-gray-400"/></Button>
                </div>
            )}
            
             {selectedFriends.map(friend => (
                <div key={friend.id} className="flex items-center gap-3 p-2 rounded-xl bg-gray-50">
                    <Avatar className="w-10 h-10 border-2 border-white shadow-sm"><AvatarFallback>{friend.name[0]}</AvatarFallback></Avatar>
                    <span className="flex-1 text-sm font-medium text-gray-700">{friend.name} ({friend.locationName})</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:bg-white" onClick={() => toggleFriend(friend)}><X className="w-4 h-4"/></Button>
                </div>
            ))}

            {manualInputs.map((input, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-xl bg-gray-50">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-400"><MapPin className="w-5 h-5"/></div>
                    <div className="flex-1 relative">
                        <PlaceAutocomplete value={input} onChange={(val) => handleManualInputChange(idx, val)} placeholder="장소 입력 (예: 강남역)"/>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:bg-white" onClick={() => removeManualInput(idx)}><Trash2 className="w-4 h-4"/></Button>
                </div>
            ))}
            
            <div className="grid grid-cols-2 gap-3 mt-4">
                 <Button variant="outline" className="rounded-xl border-dashed border-gray-300 text-gray-500 h-12 hover:bg-gray-50 hover:text-[#7C3AED] hover:border-[#7C3AED]" onClick={() => setIsFriendModalOpen(true)}>
                    <Users className="w-4 h-4 mr-2"/> 친구 초대
                 </Button>
                 <Button variant="outline" className="rounded-xl border-dashed border-gray-300 text-gray-500 h-12 hover:bg-gray-50 hover:text-[#7C3AED] hover:border-[#7C3AED]" onClick={addManualInput}>
                    <Plus className="w-4 h-4 mr-2"/> 장소 추가
                 </Button>
            </div>
            
            {!includeMe && (<Button variant="ghost" className="w-full text-sm text-gray-500" onClick={() => setIncludeMe(true)}>+ 내 위치 다시 추가</Button>)}

            <Button className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#14B8A6] hover:opacity-90 text-white text-lg font-bold shadow-lg mt-2 transition-all" onClick={handleMidpointSearch}>
                🚀 중간 지점 찾기
            </Button>
        </div>
      </div>

      {/* 4. 추천 결과 */}
      <AnimatePresence>
        {recommendedRegions.length > 0 && (
            <motion.div 
                initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
                className="px-5 mt-8 pb-10"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800">✨ 추천 핫플레이스</h2>
                    <span className="text-xs text-gray-500">AI 맞춤 추천</span>
                </div>
                
                <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
                    {recommendedRegions.map((region, idx) => (
                        <button key={idx} onClick={() => handleTabChange(idx)} className={`px-4 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap shadow-sm ${activeTabIdx === idx ? "bg-[#7C3AED] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                            {region.region_name}
                        </button>
                    ))}
                </div>

                <div className="space-y-4">
                    {(isExpanded ? currentDisplayRegion?.places : currentDisplayRegion?.places?.slice(0, 3))?.map((p: any) => (
                        <PlaceCard key={p.id} place={p} onClick={() => handlePlaceClick(p)} />
                    ))}
                </div>

                {currentDisplayRegion?.places?.length > 3 && (
                    <Button variant="ghost" className="w-full mt-4 text-gray-500 h-12 rounded-xl hover:bg-gray-100 font-medium" onClick={() => setIsExpanded(!isExpanded)}>
                        {isExpanded ? <><ChevronUp className="w-4 h-4 mr-1"/> 접기</> : <><ChevronDown className="w-4 h-4 mr-1"/> 더 보기</>}
                    </Button>
                )}
            </motion.div>
        )}
      </AnimatePresence>
      
      {/* 모달들 (기존과 동일) */}
      <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <DialogContent className="sm:max-w-md h-[70vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl">
              <DialogHeader className="px-6 pt-4 pb-2 bg-white border-b"><DialogTitle>상세 필터 설정</DialogTitle></DialogHeader>
              <div className="px-4 py-3 bg-gray-50 border-b">
                <div className="text-xs font-bold text-gray-500 mb-2">모임의 목적</div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">{Object.keys(PURPOSE_FILTERS).map((purposeKey) => (<Button key={purposeKey} variant={selectedPurpose === purposeKey ? "default" : "outline"} className={`rounded-full h-8 text-xs flex-shrink-0 ${selectedPurpose === purposeKey ? "bg-[#7C3AED] text-white" : "text-gray-600"}`} onClick={() => { setSelectedPurpose(purposeKey); setSelectedFilters({ PURPOSE: [purposeKey], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [] }); }}>{PURPOSE_FILTERS[purposeKey].label}</Button>))}</div>
              </div>
              <div className="flex-1 flex flex-col bg-white overflow-hidden">{currentFilters && (<Tabs defaultValue={Object.keys(currentFilters.tabs)[0]} className="flex-1 flex flex-col"><div className="px-4 pt-2 border-b"><TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-gray-100 rounded-lg">{Object.keys(currentFilters.tabs).map((tabKey) => (<TabsTrigger key={tabKey} value={tabKey} className="text-xs py-1.5">{currentFilters.tabs[tabKey].label}</TabsTrigger>))}</TabsList></div><div className="flex-1 overflow-y-auto p-4">{Object.entries(currentFilters.tabs).map(([tabKey, tabData]: any) => (<TabsContent key={tabKey} value={tabKey} className="mt-0 h-full"><div className="grid grid-cols-3 gap-2">{tabData.options.map((opt: string) => (<Button key={opt} variant={selectedFilters[tabKey]?.includes(opt) ? "default" : "outline"} className={`h-auto py-2 px-1 text-xs break-keep ${selectedFilters[tabKey]?.includes(opt) ? "bg-purple-50 text-[#7C3AED] border-[#7C3AED]" : "text-gray-600 border-gray-200"}`} onClick={() => toggleFilter(tabKey, opt)}>{opt}</Button>))}</div></TabsContent>))}</div></Tabs>)}</div>
              <div className="p-4 border-t bg-white"><Button className="w-full bg-[#7C3AED] hover:bg-purple-700 font-bold" onClick={() => setIsFilterOpen(false)}>선택 완료</Button></div>
          </DialogContent>
      </Dialog>

      <Dialog open={isFriendModalOpen} onOpenChange={setIsFriendModalOpen}>
          <DialogContent><DialogHeader><DialogTitle>친구 추가</DialogTitle></DialogHeader><div className="py-2 space-y-4"><div className="space-y-2"><h4 className="text-xs font-bold text-gray-500">AI 페르소나 (테스트용)</h4>{AI_PERSONAS.map(f => (<div key={f.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer border" onClick={() => toggleFriend(f)}><div className="flex items-center gap-3"><Avatar><AvatarFallback>{f.name[0]}</AvatarFallback></Avatar><div><div className="font-bold">{f.name}</div><div className="text-xs text-gray-500">{f.locationName} · {f.desc}</div></div></div>{selectedFriends.find(sf => sf.id === f.id) && <Check className="w-5 h-5 text-[#7C3AED]"/>}</div>))}</div><div className="pt-2 border-t"><h4 className="text-xs font-bold text-gray-500 mb-2">실제 친구 초대</h4><Button className="w-full bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold gap-2" onClick={handleKakaoInvite}><MessageSquare className="w-5 h-5"/> 카카오톡으로 초대하기</Button></div></div></DialogContent>
      </Dialog>

      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
          <DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>채팅방에 공유하기</DialogTitle></DialogHeader><div className="py-2 space-y-2">{myRooms.length > 0 ? myRooms.map(room => (<Button key={room.id} variant="outline" className="w-full justify-start p-4 h-auto" onClick={() => handleShare(room.id)}><div className="flex flex-col items-start"><span className="font-bold text-base">💬 {room.name}</span><span className="text-xs text-gray-500">최근 대화: {room.lastMessage}</span></div></Button>)) : <div className="text-center text-gray-500 text-sm py-6">참여 중인 채팅방이 없습니다.</div>}</div></DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-md h-[80vh] flex flex-col"><DialogHeader><DialogTitle className="text-xl flex items-center gap-2">{selectedPlace?.name} <Badge variant="outline" className="text-xs font-normal">{selectedPlace?.category}</Badge></DialogTitle><div className="text-xs text-gray-500">{selectedPlace?.tags?.join(" · ")}</div></DialogHeader><div className="flex-1 overflow-y-auto py-2 space-y-4"><div className="bg-purple-50 p-4 rounded-lg text-center"><div className="text-sm text-purple-800 font-bold mb-1">AI 추천 점수</div><div className="text-3xl font-black text-[#7C3AED]">{selectedPlace?.score}</div></div>{isReviewing ? (<Card className="p-4 border-purple-200 bg-purple-50/50"><h3 className="font-bold text-sm mb-3">리뷰 작성</h3><div className="space-y-3"><div className="space-y-2"><div className="flex justify-between text-xs"><span>맛</span><span>{reviewScores.taste}</span></div><Slider value={[reviewScores.taste]} max={5} step={1} onValueChange={(v)=>setReviewScores({...reviewScores, taste: v[0]})}/></div><Textarea placeholder="후기를 남겨주세요" value={reviewText} onChange={e=>setReviewText(e.target.value)} className="h-20 text-sm bg-white"/><div className="flex gap-2"><Button size="sm" variant="outline" className="flex-1" onClick={()=>setIsReviewing(false)}>취소</Button><Button size="sm" className="flex-1 bg-[#7C3AED]" onClick={handleSubmitReview}>등록</Button></div></div></Card>) : (<Button variant="outline" className="w-full" onClick={() => setIsReviewing(true)}>✍️ 리뷰 쓰고 AI 학습시키기</Button>)}<div className="space-y-3"><h3 className="font-bold text-sm flex items-center gap-2 border-b pb-2"><MessageSquare className="w-4 h-4"/> 방문자 리뷰 ({placeReviews.length})</h3>{placeReviews.length > 0 ? placeReviews.map((review, idx) => (<div key={idx} className="border p-3 rounded-lg bg-gray-50 space-y-2"><div className="flex justify-between items-start"><div className="font-bold text-sm">{review.user_name}</div><div className="text-yellow-500 font-bold text-xs">★ {review.rating.toFixed(1)}</div></div><p className="text-sm text-gray-700">{review.comment}</p></div>)) : <div className="text-center py-8 text-gray-400 text-sm">아직 리뷰가 없습니다.</div>}</div></div><div className="p-4 border-t bg-white flex gap-2"><Button variant="outline" size="icon" onClick={handleToggleFavorite}><Heart className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : "text-gray-400"}`}/></Button><Button className="flex-1 bg-[#7C3AED] hover:bg-purple-700" onClick={() => { setIsDetailOpen(false); setPlaceToShare(selectedPlace); fetchMyRooms(); setIsShareModalOpen(true); }}>이 장소 공유하기</Button></div></DialogContent>
      </Dialog>
      
      <PreferenceModal isOpen={isPreferenceModalOpen} onClose={() => setIsPreferenceModalOpen(false)} onComplete={() => setIsPreferenceModalOpen(false)} />
    </motion.div>
  )
}

function PlaceAutocomplete({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder: string }) {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    useEffect(() => {
        if (value.length < 1) { setSuggestions([]); return; }
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`https://wemeet-backend-xqlo.onrender.com/api/places/search?query=${value}`);
                if (res.ok) {
                    const data = await res.json() as any[];
                    setSuggestions(data);
                    setShowSuggestions(true);
                }
            } catch (e) { console.error("검색 실패:", e); }
        }, 200);
        return () => clearTimeout(timer);
    }, [value]);
    return (
        <div className="relative w-full">
            <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} onFocus={() => value.length >= 1 && setShowSuggestions(true)} className="border-none bg-transparent shadow-none focus-visible:ring-0 p-0 h-auto text-sm"/>
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto left-0">
                    {suggestions.map((item, idx) => (
                        <div key={idx} className="p-2 hover:bg-gray-100 cursor-pointer text-sm" onClick={() => { onChange(item.title); setShowSuggestions(false); }}>
                            <div className="font-bold">{item.title}</div><div className="text-xs text-gray-500">{item.address}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}