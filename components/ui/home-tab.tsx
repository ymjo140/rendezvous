"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation" // 👈 라우터 추가
import { Check, Search, Map, MapPin, Train, User, X, Plus, Trash2, Users, ChevronDown, ChevronUp, Filter, Share, Star, Heart, MessageSquare, Locate } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"

declare global { interface Window { naver: any; } }

const DEMO_FRIENDS = [
  { 
      id: 2, name: "클레오", location: "홍대입구", lat: 37.557, lng: 126.924, 
      avatar: { equipped: { body: "body_basic", hair: "hair_01", top: "top_tshirt", bottom: "bottom_shorts", shoes: "shoes_sneakers" } } 
  },
  { 
      id: 3, name: "벤지", location: "강남역", lat: 37.498, lng: 127.027, 
      avatar: { equipped: { body: "body_basic", hair: "hair_01", top: "top_hoodie", bottom: "bottom_jeans", shoes: "shoes_sneakers" } } 
  },
  { 
      id: 4, name: "로건", location: "성수동", lat: 37.544, lng: 127.056, 
      avatar: { equipped: { body: "body_basic", hair: "hair_02", top: "top_tshirt", bottom: "bottom_shorts", pet: "pet_cat", shoes: "shoes_sneakers" } } 
  },
]

const PURPOSE_FILTERS: Record<string, any> = {
    "식사": {
        label: "🍚 식사",
        tabs: {
            "MENU": { label: "메뉴 선택", options: ["한식", "양식", "일식", "중식", "아시안", "고기", "분식", "치킨/버거"] },
            "VIBE": { label: "분위기", options: ["가성비", "혼밥가능", "캐주얼한", "푸짐한", "깔끔한", "웨이팅맛집", "숨은맛집"] },
            "ETC": { label: "편의", options: ["주차가능", "아이동반", "브레이크타임X", "예약가능"] }
        }
    },
    "비즈니스/접대": {
        label: "👔 비즈니스",
        tabs: {
            "SITUATION": { label: "만남 성격", options: ["식사미팅", "술", "커피챗", "회의", "워크샵"] },
            "PLACE": { label: "장소 유형", options: ["룸식당", "호텔다이닝", "한정식", "일식코스", "조용한카페", "비즈니스센터", "공유오피스", "세미나실"] },
            "CONDITION": { label: "필수 조건", options: ["조용한", "발렛파킹", "무료주차", "법인카드", "예약필수", "화이트보드", "프로젝터"] }
        }
    },
    "데이트/기념일": {
        label: "💖 데이트",
        tabs: {
            "COURSE": { label: "데이트 코스", options: ["맛집탐방", "카페투어", "술 한잔", "문화생활", "액티비티", "호캉스", "방탈출", "전시회"] },
            "VIBE": { label: "분위기", options: ["분위기깡패", "뷰맛집", "로맨틱", "인스타감성", "이색데이트", "조용한"] },
            "MENU": { label: "선호 메뉴", options: ["파스타", "스테이크", "오마카세", "와인", "칵테일", "디저트"] }
        }
    },
    "술/회식": {
        label: "🍺 술/회식",
        tabs: {
            "TYPE": { label: "주종", options: ["소주/맥주", "와인/칵테일", "전통주/막걸리", "위스키/하이볼"] },
            "VIBE": { label: "분위기", options: ["시끌벅적", "회식장소", "노포감성", "힙한", "대화하기좋은", "2차로좋은"] },
            "FOOD": { label: "안주", options: ["고기/구이", "회/해산물", "탕/찌개", "튀김/전", "가벼운안주"] }
        }
    },
    "카페": {
        label: "☕ 카페",
        tabs: {
            "TYPE": { label: "목적", options: ["수다/모임", "스터디/작업", "디저트맛집", "테이크아웃"] },
            "VIBE": { label: "분위기", options: ["감성적인", "뷰맛집", "식물카페", "한옥카페", "모던한", "힙한"] },
            "MENU": { label: "메뉴", options: ["커피맛집", "베이커리", "케이크", "빙수", "시그니처라떼"] }
        }
    },
    "스터디/작업": {
        label: "📚 스터디",
        tabs: {
            "SPACE": { label: "공간 유형", options: ["카공(카페)", "스터디카페", "북카페", "무인카페", "도서관"] },
            "ENV": { label: "환경", options: ["조용한", "백색소음", "넓은책상", "편한의자", "오래있어도됨"] },
            "FACILITY": { label: "시설", options: ["콘센트많음", "와이파이빵빵", "회의실", "프린트가능"] }
        }
    }
};

const MAP_CATEGORIES = ["전체", "맛집", "카페", "술집", "편의점", "은행", "마트"];

export function HomeTab() {
  const router = useRouter(); // 👈 [추가됨] 라우터 훅 사용
  
  const [searchQuery, setSearchQuery] = useState("")
  const [myLocationInput, setMyLocationInput] = useState("") 
  
  // 다중 입력 상태
  const [manualInputs, setManualInputs] = useState<string[]>([""]); 
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [includeMe, setIncludeMe] = useState(true);

  const [isFriendModalOpen, setIsFriendModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [selectedPurpose, setSelectedPurpose] = useState("식사")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
      PURPOSE: ["식사"], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: []
  });
  
  const [myProfile, setMyProfile] = useState<any>(null)
  const [recommendedRegions, setRecommendedRegions] = useState<any[]>([])
  const [currentDisplayRegion, setCurrentDisplayRegion] = useState<any>(null)
  const [activeTabIdx, setActiveTabIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false); 
  
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [placeToShare, setPlaceToShare] = useState<any>(null);
  const [myRooms, setMyRooms] = useState<any[]>([]);
  
  // 상세 리뷰 모달 상태
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<any>(null);
  const [placeReviews, setPlaceReviews] = useState<any[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewScores, setReviewScores] = useState({ taste: 3, service: 3, price: 3, vibe: 3 });
  const [reviewText, setReviewText] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const myMarkerRef = useRef<any>(null)
  const friendMarkersRef = useRef<any[]>([])

  useEffect(() => {
    const fetchMyInfo = async () => {
        const token = localStorage.getItem("token");
        if (!token) {
             // 비로그인 상태 (게스트 모드)
             setMyProfile(null);
             setMyLocationInput("비회원 (위치 설정 필요)");
             return;
        }
        try {
            const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/users/me", { headers: { "Authorization": `Bearer ${token}` } });
            if (res.ok) {
                const user = await res.json();
                setMyProfile({ ...user, locationName: "현위치" });
                setMyLocationInput("안암 (현위치)");
            }
        } catch (e) { console.error(e); }
    }
    fetchMyInfo();
  }, []);

  useEffect(() => {
    const initMap = () => {
      if (typeof window.naver === 'undefined' || !window.naver.maps) { setTimeout(initMap, 100); return; }
      if (!mapRef.current) { 
        const center = myProfile ? new window.naver.maps.LatLng(myProfile.location.lat, myProfile.location.lng) : new window.naver.maps.LatLng(37.566, 126.978);
        mapRef.current = new window.naver.maps.Map("map", { center: center, zoom: 14 }); 
      }

      const createAvatarMarker = (user: any, isMe: boolean) => {
          const equipped = user.avatar?.equipped || {};
          const getUrl = (id: string) => id ? `/assets/avatar/${id}.png` : null;
          
          const body = getUrl(equipped.body || "body_basic");
          const eyes = getUrl(equipped.eyes || "eyes_normal");
          const brows = getUrl(equipped.eyebrows || "brows_basic");
          const hair = getUrl(equipped.hair);
          const top = getUrl(equipped.top);
          const bottom = getUrl(equipped.bottom);
          const shoes = getUrl(equipped.shoes);
          const pet = getUrl(equipped.pet);
          const foot = getUrl(equipped.footprint);

          const avatarHtml = `
            <div style="position: relative; width: 60px; height: 110px; display: flex; justify-content: center; pointer-events: none;">
                ${foot ? `<div class="footprints" style="position: absolute; bottom: 5px; width: 100%;"><img src="${foot}" style="position: absolute; left: 10px; width: 20px; opacity: 0; animation: stepLeft 1s infinite;" /><img src="${foot}" style="position: absolute; right: 10px; width: 20px; opacity: 0; animation: stepRight 1s infinite 0.5s;" /></div>` : ''}
                ${pet ? `<img src="${pet}" style="position: absolute; bottom: 5px; right: -20px; width: 30px; z-index: 5; animation: bounce 1.5s infinite;" />` : ''}
                <div class="avatar-body" style="position: relative; width: 50px; height: 90px; z-index: 10; animation: walk 0.6s infinite ease-in-out alternate;">
                    <img src="${body}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; z-index: 1;" />
                    ${eyes ? `<img src="${eyes}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; z-index: 2;" />` : ''}
                    ${brows ? `<img src="${brows}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; z-index: 2;" />` : ''}
                    ${bottom ? `<img src="${bottom}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; z-index: 3;" />` : ''}
                    ${top ? `<img src="${top}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; z-index: 4;" />` : ''}
                    ${shoes ? `<img src="${shoes}" style="position: absolute; bottom: 0; left: 10%; width: 80%; height: 20%; object-fit: contain; z-index: 5;" />` : ''}
                    ${hair ? `<img src="${hair}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; z-index: 6;" />` : ''}
                </div>
                <div style="position: absolute; bottom: -10px; background: ${isMe ? '#3b82f6' : 'white'}; color: ${isMe ? 'white' : 'black'}; padding: 1px 6px; border-radius: 10px; border: 1px solid #3b82f6; font-size: 10px; font-weight: bold; white-space: nowrap; z-index: 20;">${user.name.split('(')[0]}</div>
                <style>
                    @keyframes walk { from { transform: translateY(0); } to { transform: translateY(-4px); } }
                    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
                    @keyframes stepLeft { 0% { opacity: 0.8; transform: scale(1); } 100% { opacity: 0; transform: scale(0.5) translateY(10px); } }
                    @keyframes stepRight { 0% { opacity: 0.8; transform: scale(1); } 100% { opacity: 0; transform: scale(0.5) translateY(10px); } }
                </style>
            </div>
          `;

          return new window.naver.maps.Marker({
              position: new window.naver.maps.LatLng(user.location.lat, user.location.lng),
              map: mapRef.current,
              icon: { content: avatarHtml, anchor: new window.naver.maps.Point(30, 100) },
              zIndex: isMe ? 100 : 50
          });
      };

      if (myProfile && mapRef.current) {
          if (myMarkerRef.current) myMarkerRef.current.setMap(null);
          if (includeMe) {
            myMarkerRef.current = createAvatarMarker(myProfile, true);
            mapRef.current.setCenter(new window.naver.maps.LatLng(myProfile.location.lat, myProfile.location.lng));
          }
      }

      friendMarkersRef.current.forEach(m => m.setMap(null));
      friendMarkersRef.current = [];
      selectedFriends.forEach(friend => {
          const friendWithAvatar = { ...friend, avatar: friend.avatar || { equipped: { body: "body_basic", hair: "hair_01", top: "top_tshirt", bottom: "bottom_jeans" } } };
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
    // 참여자가 0명이어도 수동 입력이 있으면 검색 가능하도록 수정됨

    setLoading(true);
    try {
      const allTags = Object.values(selectedFilters).flat();
      const usersToSend = validUsers.map(u => ({ id: u.id || 0, name: u.name || "User", location: u.location || { lat: 37.566, lng: 126.978 } }));

      const response = await fetch('https://wemeet-backend-xqlo.onrender.com/api/recommend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: usersToSend,
          purpose: selectedPurpose,
          location_name: locationNameOverride || "중간지점",
          manual_locations: manualInputs.filter(txt => txt && txt.trim() !== ""),
          user_selected_tags: allTags
        })
      })

      if (response.ok) {
          const data = await response.json();
          setRecommendedRegions(data);
          setActiveTabIdx(0);
          setIsExpanded(false);
          if (data.length > 0) setCurrentDisplayRegion(data[0]);
      }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const fetchMyRooms = async () => {
      const token = localStorage.getItem("token");
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/chat/rooms", { headers: { "Authorization": `Bearer ${token}` } });
          if (res.ok) setMyRooms(await res.json());
      } catch (e) {}
  };

  const handlePlaceClick = async (place: any) => {
      setSelectedPlace(place);
      setIsDetailOpen(true);
      setPlaceReviews([]);
      setIsReviewing(false);
      if (myProfile?.favorites?.some((f: any) => f.id === place.id)) setIsFavorite(true);
      else setIsFavorite(false);
      try {
          const res = await fetch(`https://wemeet-backend-xqlo.onrender.com/api/reviews/${place.name}`);
          if (res.ok) setPlaceReviews(await res.json());
      } catch (e) { console.error(e); }
  };

  const handleSubmitReview = async () => {
      if (!selectedPlace) return;
      const token = localStorage.getItem("token");
      if (!token) {
          if(confirm("리뷰를 작성하려면 로그인이 필요합니다. 이동할까요?")) router.push("/login");
          return;
      }
      const payload = {
          place_name: selectedPlace.name,
          rating: 0, 
          score_taste: reviewScores.taste,
          score_service: reviewScores.service,
          score_price: reviewScores.price,
          score_vibe: reviewScores.vibe,
          comment: reviewText,
          tags: selectedPlace.tags
      };
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/reviews", {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify(payload)
          });
          if (res.ok) {
              alert("리뷰가 등록되었습니다!");
              setIsReviewing(false);
              setReviewScores({ taste: 3, service: 3, price: 3, vibe: 3 });
              setReviewText("");
              handlePlaceClick(selectedPlace); 
          }
      } catch (e) { alert("오류 발생"); }
  };

  const handleToggleFavorite = async () => {
      if (!selectedPlace) return;
      const token = localStorage.getItem("token");
      if (!token) {
          if(confirm("즐겨찾기를 하려면 로그인이 필요합니다. 이동할까요?")) router.push("/login");
          return;
      }
      try {
          const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/favorites", {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify({ place_id: selectedPlace.id, place_name: selectedPlace.name })
          });
          if (res.ok) {
              const data = await res.json();
              setIsFavorite(data.message === "Added");
          }
      } catch (e) { alert("오류 발생"); }
  };

  // 🌟 [수정] 공유하기 로그인 체크
  const handleShare = async (roomId: string) => {
      const token = localStorage.getItem("token");
      if (!token) {
          if (confirm("로그인이 필요한 기능입니다. 로그인하시겠습니까?")) {
              router.push("/login");
          }
          return;
      }

      if (!placeToShare) return;
      try {
          await fetch("https://wemeet-backend-xqlo.onrender.com/api/chat/share", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify({
                  room_id: roomId,
                  place_name: placeToShare.name,
                  place_category: placeToShare.category,
                  place_tags: placeToShare.tags
              })
          });
          alert("채팅방에 공유했습니다!");
          setIsShareModalOpen(false);
          setIsDetailOpen(false); 
      } catch (e) { alert("공유 실패"); }
  };

  const handleTopSearch = () => { if(searchQuery) fetchRecommendations([myProfile], searchQuery); }
  
  const handleMidpointSearch = () => {
      // 🌟 내 위치 포함 여부에 따라 참가자 목록 구성
      const participants = (includeMe && myProfile) ? [myProfile, ...selectedFriends] : [...selectedFriends];
      const hasManualInput = manualInputs.some(txt => txt && txt.trim() !== "");
      
      if (participants.length === 0 && !hasManualInput) {
          alert("출발지를 하나 이상 설정해주세요!");
          return;
      }
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
  
  const removeTag = (tag: string) => {
      for (const [key, vals] of Object.entries(selectedFilters)) {
          if (vals.includes(tag)) toggleFilter(key, tag);
      }
  };

  const toggleFriend = (friend: any) => {
      if (selectedFriends.find(f => f.id === friend.id)) setSelectedFriends(prev => prev.filter(f => f.id !== friend.id));
      else setSelectedFriends(prev => [...prev, friend]);
  };

  const handleManualInputChange = (idx: number, val: string) => {
      const newInputs = [...manualInputs]; newInputs[idx] = val; setManualInputs(newInputs);
  };
  const addManualInput = () => setManualInputs([...manualInputs, ""]);
  const removeManualInput = (idx: number) => {
      if (manualInputs.length > 1) setManualInputs(manualInputs.filter((_, i) => i !== idx));
      else setManualInputs([""]);
  };
  const handleTabChange = (idx: number) => { setActiveTabIdx(idx); setCurrentDisplayRegion(recommendedRegions[idx]); setIsExpanded(false); };

  const visiblePlaces = currentDisplayRegion 
      ? (isExpanded ? currentDisplayRegion.places : currentDisplayRegion.places.slice(0, 3)) 
      : [];

  const currentFilters = PURPOSE_FILTERS[selectedPurpose];

  return (
    <div className="h-full overflow-y-auto pb-20 bg-background flex flex-col">
      {/* 상단 검색 */}
      <div className="px-4 pt-4 pb-2 sticky top-0 z-20 bg-white shadow-sm space-y-2">
        <div className="relative flex items-center shadow-sm rounded-lg bg-gray-100">
            <div className="pl-3 text-muted-foreground"><Search className="w-5 h-5" /></div>
            <Input className="pl-2 border-none bg-transparent h-11" placeholder="장소, 주소 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleTopSearch()} />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="pr-3 text-gray-400"><X className="w-4 h-4"/></button>}
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <Button variant="outline" size="sm" className="h-8 rounded-full border-dashed text-xs flex-shrink-0" onClick={() => setIsFilterOpen(true)}>
                <Filter className="w-3 h-3 mr-1"/> 필터 설정
            </Button>
            <Badge variant="secondary" className="h-8 px-3 text-xs whitespace-nowrap flex-shrink-0 bg-indigo-50 text-indigo-600 border-indigo-100">
                {currentFilters?.label || selectedPurpose}
            </Badge>
            {Object.entries(selectedFilters).flatMap(([k, v]) => v).map(tag => {
                if (tag === selectedPurpose) return null; 
                let parentKey = "";
                if (currentFilters) {
                    for (const [key, data] of Object.entries(currentFilters.tabs)) {
                        // @ts-ignore
                        if (data.options.includes(tag)) parentKey = key;
                    }
                }
                if (!parentKey) return null;
                return (<Badge key={tag} variant="outline" className="h-8 px-3 text-xs whitespace-nowrap flex-shrink-0 border-indigo-200 text-indigo-600 bg-white">{tag} <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => removeTag(tag)}/></Badge>)
            })}
        </div>
      </div>

      {/* 지도 */}
      <div className="relative h-64 border-b w-full">
          <div id="map" className="w-full h-full bg-muted"></div>
          <div className="absolute bottom-3 left-3 bg-white/95 px-3 py-1.5 rounded-full text-xs font-bold shadow-md text-primary border border-primary/20 flex items-center gap-1">
              📍 {currentDisplayRegion ? currentDisplayRegion.region_name : (myProfile?.locationName || "내 위치")}
          </div>
      </div>

      {/* 출발지 입력 섹션 */}
      <div className="px-4 py-5 border-b bg-white">
        <h2 className="text-lg font-bold mb-3">어디서 출발하나요?</h2>
        <div className="space-y-3">
            {/* 내 위치 */}
            {includeMe ? (
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm">👤</div>
                    <Input className="flex-1 bg-gray-50" value={myLocationInput} readOnly />
                    <Button variant="ghost" size="icon" onClick={() => setIncludeMe(false)}>
                        <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500"/>
                    </Button>
                </div>
            ) : null}

            {/* 친구 목록 */}
            {selectedFriends.map(friend => (
                <div key={friend.id} className="flex items-center gap-2">
                    <Avatar className="w-8 h-8 border"><AvatarFallback>{friend.name[0]}</AvatarFallback></Avatar>
                    <div className="flex-1 relative">
                        <Input className="bg-white border-blue-200 text-blue-600 font-bold pr-8" value={`${friend.name} (${friend.location})`} readOnly />
                        <button onClick={() => toggleFriend(friend)} className="absolute right-2 top-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4"/></button>
                    </div>
                </div>
            ))}

            {/* 수동 입력 (자동완성) */}
            {manualInputs.map((input, idx) => (
                <div key={idx} className="flex items-center gap-2">
                    <div className="w-8 h-8 flex items-center justify-center text-gray-400"><MapPin className="w-5 h-5"/></div>
                    <div className="flex-1 relative">
                        <PlaceAutocomplete 
                            value={input} 
                            onChange={(val) => handleManualInputChange(idx, val)} 
                            placeholder="장소 입력 (예: 강남역)"
                        />
                        <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => removeManualInput(idx)}>
                            <Trash2 className="w-4 h-4 text-gray-400"/>
                        </Button>
                    </div>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
             {!includeMe && (
                 <Button variant="outline" onClick={() => setIncludeMe(true)} className="col-span-2 border-blue-200 text-blue-600">
                     <Locate className="w-4 h-4 mr-1"/> 내 위치 다시 추가
                 </Button>
             )}
             <Button variant="outline" onClick={() => setIsFriendModalOpen(true)}><Users className="w-4 h-4 mr-1"/> 친구 추가</Button>
             <Button variant="outline" onClick={addManualInput}><Plus className="w-4 h-4 mr-1"/> 장소 추가</Button>
        </div>
        
        <Button className="w-full mt-4 h-10 font-bold bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleMidpointSearch}>🚀 중간지점 찾기</Button>
      </div>

      {/* 상세 필터 모달 */}
      <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <DialogContent className="sm:max-w-md h-[70vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl">
              <DialogHeader className="px-6 pt-4 pb-2 bg-white border-b"><DialogTitle>상세 필터 설정</DialogTitle></DialogHeader>
              <div className="px-4 py-3 bg-gray-50 border-b">
                  <div className="text-xs font-bold text-gray-500 mb-2">모임의 목적</div>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                      {Object.keys(PURPOSE_FILTERS).map((purposeKey) => (
                          <Button key={purposeKey} variant={selectedPurpose === purposeKey ? "default" : "outline"} className={`rounded-full h-8 text-xs flex-shrink-0 ${selectedPurpose === purposeKey ? "bg-indigo-600" : "text-gray-600"}`} onClick={() => { setSelectedPurpose(purposeKey); setSelectedFilters({ PURPOSE: [purposeKey], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [] }); }}>{PURPOSE_FILTERS[purposeKey].label}</Button>
                      ))}
                  </div>
              </div>
              <div className="flex-1 flex flex-col bg-white overflow-hidden">
                  {currentFilters && (
                    <Tabs defaultValue={Object.keys(currentFilters.tabs)[0]} className="flex-1 flex flex-col">
                        <div className="px-4 pt-2 border-b">
                            <TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-gray-100 rounded-lg">{Object.keys(currentFilters.tabs).map((tabKey) => (<TabsTrigger key={tabKey} value={tabKey} className="text-xs py-1.5">{currentFilters.tabs[tabKey].label}</TabsTrigger>))}</TabsList>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {Object.entries(currentFilters.tabs).map(([tabKey, tabData]: any) => (
                                <TabsContent key={tabKey} value={tabKey} className="mt-0 h-full">
                                    <div className="grid grid-cols-3 gap-2">
                                        {tabData.options.map((opt: string) => (
                                            <Button key={opt} variant={selectedFilters[tabKey]?.includes(opt) ? "default" : "outline"} className={`h-auto py-2 px-1 text-xs break-keep ${selectedFilters[tabKey]?.includes(opt) ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "text-gray-600 border-gray-200"}`} onClick={() => toggleFilter(tabKey, opt)}>{opt}</Button>
                                        ))}
                                    </div>
                                </TabsContent>
                            ))}
                        </div>
                    </Tabs>
                  )}
              </div>
              <div className="p-4 border-t bg-white"><Button className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold" onClick={() => setIsFilterOpen(false)}>선택 완료 ({Object.values(selectedFilters).flat().length - 1}개)</Button></div>
          </DialogContent>
      </Dialog>

      {/* 친구 선택 모달 */}
      <Dialog open={isFriendModalOpen} onOpenChange={setIsFriendModalOpen}>
          <DialogContent>
              <DialogHeader><DialogTitle>친구 선택</DialogTitle></DialogHeader>
              <div className="py-2 space-y-2">
                  {DEMO_FRIENDS.map(f => (
                      <div key={f.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer" onClick={() => toggleFriend(f)}>
                          <div className="flex items-center gap-3"><Avatar><AvatarFallback>{f.name[0]}</AvatarFallback></Avatar><div><div className="font-bold">{f.name}</div><div className="text-xs text-gray-500">{f.location}</div></div></div>
                          {selectedFriends.find(sf => sf.id === f.id) && <Check className="w-5 h-5 text-blue-600"/>}
                      </div>
                  ))}
              </div>
          </DialogContent>
      </Dialog>

      {/* 공유하기 모달 */}
      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
          <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>채팅방에 공유하기</DialogTitle></DialogHeader>
              <div className="py-2 space-y-2">
                  {myRooms.length > 0 ? myRooms.map(room => (
                      <Button key={room.id} variant="outline" className="w-full justify-start p-4 h-auto" onClick={() => handleShare(room.id)}>
                          <div className="flex flex-col items-start"><span className="font-bold text-base">💬 {room.name}</span><span className="text-xs text-gray-500">최근 대화: {room.lastMessage}</span></div>
                      </Button>
                  )) : <div className="text-center text-gray-500 text-sm py-6">참여 중인 채팅방이 없습니다.<br/>커뮤니티 탭에서 모임에 참여해보세요!</div>}
              </div>
          </DialogContent>
      </Dialog>

      {/* 🌟 장소 상세 및 리뷰 모달 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="sm:max-w-md h-[80vh] flex flex-col">
              <DialogHeader>
                  <DialogTitle className="text-xl flex items-center gap-2">{selectedPlace?.name} <Badge variant="outline" className="text-xs font-normal">{selectedPlace?.category}</Badge></DialogTitle>
                  <div className="text-xs text-gray-500">{selectedPlace?.tags?.join(" · ")}</div>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto py-2 space-y-4">
                  <div className="bg-indigo-50 p-4 rounded-lg text-center"><div className="text-sm text-indigo-800 font-bold mb-1">AI 추천 점수</div><div className="text-3xl font-black text-indigo-600">{selectedPlace?.score}</div></div>
                  {isReviewing ? (
                      <Card className="p-4 border-indigo-200 bg-indigo-50/50">
                          <h3 className="font-bold text-sm mb-3">리뷰 작성</h3>
                          <div className="space-y-3">
                              <div className="space-y-2"><div className="flex justify-between text-xs"><span>맛</span><span>{reviewScores.taste}</span></div><Slider value={[reviewScores.taste]} max={5} step={1} onValueChange={(v)=>setReviewScores({...reviewScores, taste: v[0]})}/></div>
                              <div className="space-y-2"><div className="flex justify-between text-xs"><span>서비스</span><span>{reviewScores.service}</span></div><Slider value={[reviewScores.service]} max={5} step={1} onValueChange={(v)=>setReviewScores({...reviewScores, service: v[0]})}/></div>
                              <div className="space-y-2"><div className="flex justify-between text-xs"><span>가격</span><span>{reviewScores.price}</span></div><Slider value={[reviewScores.price]} max={5} step={1} onValueChange={(v)=>setReviewScores({...reviewScores, price: v[0]})}/></div>
                              <div className="space-y-2"><div className="flex justify-between text-xs"><span>분위기</span><span>{reviewScores.vibe}</span></div><Slider value={[reviewScores.vibe]} max={5} step={1} onValueChange={(v)=>setReviewScores({...reviewScores, vibe: v[0]})}/></div>
                              <Textarea placeholder="후기를 남겨주세요" value={reviewText} onChange={e=>setReviewText(e.target.value)} className="h-20 text-sm bg-white"/>
                              <div className="flex gap-2"><Button size="sm" variant="outline" className="flex-1" onClick={()=>setIsReviewing(false)}>취소</Button><Button size="sm" className="flex-1 bg-indigo-600" onClick={handleSubmitReview}>등록</Button></div>
                          </div>
                      </Card>
                  ) : (<Button variant="outline" className="w-full" onClick={() => setIsReviewing(true)}>✍️ 리뷰 쓰고 AI 학습시키기</Button>)}
                  <div className="space-y-3">
                      <h3 className="font-bold text-sm flex items-center gap-2 border-b pb-2"><MessageSquare className="w-4 h-4"/> 방문자 리뷰 ({placeReviews.length})</h3>
                      {placeReviews.length > 0 ? placeReviews.map((review, idx) => (
                          <div key={idx} className="border p-3 rounded-lg bg-gray-50 space-y-2">
                              <div className="flex justify-between items-start"><div className="font-bold text-sm">{review.user_name}</div><div className="text-yellow-500 font-bold text-xs">★ {review.rating.toFixed(1)}</div></div>
                              <div className="grid grid-cols-4 gap-1 text-[10px] text-gray-500"><div className="bg-white px-1 rounded border">맛 {review.scores?.taste}</div><div className="bg-white px-1 rounded border">서비스 {review.scores?.service}</div><div className="bg-white px-1 rounded border">가격 {review.scores?.price}</div><div className="bg-white px-1 rounded border">분위기 {review.scores?.vibe}</div></div>
                              <p className="text-sm text-gray-700">{review.comment}</p>
                              <div className="text-[10px] text-gray-400 text-right">{review.created_at}</div>
                          </div>
                      )) : <div className="text-center py-8 text-gray-400 text-sm">아직 리뷰가 없습니다.</div>}
                  </div>
              </div>
              <div className="p-4 border-t bg-white flex gap-2">
                  <Button variant="outline" size="icon" onClick={handleToggleFavorite}><Heart className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : "text-gray-400"}`}/></Button>
                  <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => { setIsDetailOpen(false); setPlaceToShare(selectedPlace); fetchMyRooms(); setIsShareModalOpen(true); }}>이 장소 공유하기</Button>
              </div>
          </DialogContent>
      </Dialog>

      {/* 추천 결과 리스트 */}
      {recommendedRegions.length > 0 && (
        <div className="px-4 py-5 bg-white border-t">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-600"/> 추천 장소</h2>
            <div className="flex gap-2 mb-4 p-1 bg-gray-100 rounded-lg">{recommendedRegions.map((region, idx) => (<button key={idx} onClick={() => handleTabChange(idx)} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${activeTabIdx === idx ? "bg-white shadow text-blue-600" : "text-gray-400 hover:text-gray-600"}`}>{region.region_name}</button>))}</div>
            <div className="space-y-3">
                {visiblePlaces.map((p: any) => (
                    <div key={p.id} className="flex gap-3 p-3 bg-white border rounded-xl shadow-sm hover:border-blue-400 cursor-pointer transition-all" onClick={() => handlePlaceClick(p)}>
                        <div className="w-20 h-20 bg-slate-50 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">{p.category === 'cafe' ? '☕' : '🍽️'}</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start"><h3 className="font-bold text-sm truncate">{p.name}</h3><Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); setPlaceToShare(p); fetchMyRooms(); setIsShareModalOpen(true); }}><Share className="w-4 h-4"/></Button></div>
                            <span className="text-xs font-bold text-orange-500">★ {p.score}</span>
                            <p className="text-xs text-gray-500 mt-1 mb-2">{p.category} · {(p.tags || []).slice(0, 3).join(', ')}</p>
                        </div>
                    </div>
                ))}
            </div>
            {currentDisplayRegion?.places?.length > 3 && (<Button variant="ghost" className="w-full mt-3 text-gray-500 hover:bg-gray-100" onClick={() => setIsExpanded(!isExpanded)}>{isExpanded ? <><ChevronUp className="w-4 h-4 mr-1"/> 접기</> : <><ChevronDown className="w-4 h-4 mr-1"/> {currentDisplayRegion.places.length - 3}개 더 보기</>}</Button>)}
        </div>
      )}
    </div>
  )
}

// [내부 컴포넌트] 자동완성 입력
function PlaceAutocomplete({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder: string }) {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        if (value.length < 2) { setSuggestions([]); return; }
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`https://wemeet-backend-xqlo.onrender.com/api/places/search?query=${value}`);
                if (res.ok) {
                    const data = await res.json();
                    setSuggestions(data);
                    setShowSuggestions(true);
                }
            } catch {}
        }, 300);
        return () => clearTimeout(timer);
    }, [value]);

    return (
        <div className="relative w-full">
            <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} onFocus={() => value.length >= 2 && setShowSuggestions(true)} />
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
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