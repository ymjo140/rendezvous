"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search, MapPin, X, Plus, Trash2, Users, Filter, Coins, Gem, Loader2, CheckCircle2, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { motion, AnimatePresence } from "framer-motion"

// --- 1. 의존성 컴포넌트 및 유틸리티 ---

const API_URL = "https://wemeet-backend-xqlo.onrender.com";
const HOME_STATE_KEY = "home_tab_state_v1";

const PlaceCard = ({ place, onClick }: { place: any, onClick: () => void }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors" onClick={onClick}>
        <div className="flex-1">
            <div className="font-bold text-gray-800 flex items-center gap-2">
                {place.name || place.title}
                {/* 🌟 백엔드에서 온 점수가 있으면 표시 (wemeet_rating or score) */}
                <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                    {place.wemeet_rating ? `★${place.wemeet_rating.toFixed(1)}` : (place.score ? `★${place.score}` : '')}
                </span>
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" /> {place.category || "장소"}
                {place.tags && <span className="text-gray-400">| {place.tags.slice(0, 2).join(", ")}</span>}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{place.address}</div>
        </div>
        <Button size="sm" variant="outline" className="ml-2 h-8 text-xs">상세</Button>
    </div>
);

const PreferenceModal = ({ isOpen, onClose, onComplete }: any) => (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
            <DialogHeader><DialogTitle>취향 조사</DialogTitle></DialogHeader>
            <div className="py-4 text-center text-gray-600">더 정확한 추천을 위해 취향을 알려주세요!</div>
            <DialogFooter><Button onClick={onComplete}>완료</Button></DialogFooter>
        </DialogContent>
    </Dialog>
);

const fetchWithAuth = async (url: string, options: any = {}) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    const headers = { ...options.headers, "Authorization": token ? `Bearer ${token}` : "" };
    return fetch(`${API_URL}${url}`, { ...options, headers });
};

declare global { interface Window { naver: any; } }

const AI_PERSONAS = [
    { id: 2, name: "김직장 (강남)", locationName: "강남역", location: { lat: 37.498085, lng: 127.027621 } },
    { id: 3, name: "이대학 (홍대)", locationName: "홍대입구", location: { lat: 37.557527, lng: 126.924467 } },
    { id: 4, name: "박감성 (성수)", locationName: "성수역", location: { lat: 37.544581, lng: 127.056035 } },
];

const PURPOSE_FILTERS: Record<string, any> = {
    "식사": { 
        label: "🍚 식사", 
        mainCategory: "RESTAURANT",
        tabs: { 
            "MENU": { label: "메뉴", options: ["한식", "양식", "일식", "중식", "고기/구이", "해산물", "치킨", "피자", "분식", "아시아음식"] }, 
            "VIBE": { label: "분위기", options: ["가성비", "조용한", "웨이팅맛집", "혼밥", "단체", "가족모임"] } 
        } 
    },
    "술/회식": { 
        label: "🍺 술/회식", 
        mainCategory: "PUB",
        tabs: { 
            "TYPE": { label: "주종", options: ["소주", "맥주", "와인", "하이볼", "칵테일", "막걸리", "사케"] }, 
            "VIBE": { label: "분위기", options: ["시끌벅적", "조용한", "룸술집", "루프탑", "스탠딩", "이자카야"] } 
        } 
    },
    "카페": { 
        label: "☕ 카페", 
        mainCategory: "CAFE",
        tabs: { 
            "TYPE": { label: "목적", options: ["수다", "작업", "디저트", "브런치", "베이커리"] }, 
            "VIBE": { label: "분위기", options: ["감성", "뷰맛집", "대형", "조용한", "루프탑", "펫카페"] } 
        } 
    },
    "데이트": { 
        label: "💖 데이트", 
        mainCategory: "RESTAURANT",
        tabs: { 
            "COURSE": { label: "코스", options: ["맛집", "카페", "산책", "영화", "전시"] }, 
            "VIBE": { label: "분위기", options: ["로맨틱", "조용한", "야경", "프라이빗", "핫플"] } 
        } 
    },
    "비즈니스": { 
        label: "💼 비즈니스", 
        mainCategory: "BUSINESS",
        tabs: { 
            "TYPE": { label: "유형", options: ["회의실", "식사미팅", "스터디카페", "코워킹스페이스", "세미나실"] }, 
            "VIBE": { label: "분위기", options: ["조용한", "프라이빗", "대형", "빔프로젝터", "화이트보드"] } 
        } 
    },
    "문화생활": { 
        label: "🎬 문화생활", 
        mainCategory: "CULTURE",
        tabs: { 
            "TYPE": { label: "유형", options: ["영화관", "공연/뮤지컬", "전시/미술관", "콘서트", "축제/이벤트", "스포츠관람"] }, 
            "VIBE": { label: "분위기", options: ["데이트", "친구", "가족", "혼자", "야외", "실내"] } 
        } 
    }
};

// --- 2. 메인 컴포넌트 ---

export function HomeTab() {
    const router = useRouter();

    // State
    const [searchQuery, setSearchQuery] = useState("")
    const [myLocation, setMyLocation] = useState<{ lat: number, lng: number } | null>(null)
    const [myLocationInput, setMyLocationInput] = useState("위치 확인 중...")

    // manualInputs: 객체 배열
    const [manualInputs, setManualInputs] = useState<{ text: string, lat?: number, lng?: number }[]>([{ text: "" }]);
    const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
    const [includeMe, setIncludeMe] = useState(true);

    const [recommendations, setRecommendations] = useState<any[]>([])
    const [currentDisplayRegion, setCurrentDisplayRegion] = useState<any>(null)
    const [activeTabIdx, setActiveTabIdx] = useState(0)

    const [loots, setLoots] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [gpsError, setGpsError] = useState<string>("");

    const [nearbyPlace, setNearbyPlace] = useState<any>(null);
    const [nearbyLoot, setNearbyLoot] = useState<any>(null);
    const [interactionLoading, setInteractionLoading] = useState(false);

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isFriendModalOpen, setIsFriendModalOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState<any>(null);
    const [isPreferenceModalOpen, setIsPreferenceModalOpen] = useState(false);

    const [selectedPurpose, setSelectedPurpose] = useState("식사")
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({ PURPOSE: ["식사"], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [] });
    const [myProfile, setMyProfile] = useState<any>(null)

    const persistSearchState = () => {
        if (typeof window === "undefined") return;
        if (!recommendations.length) return;
        try {
            const payload = {
                recommendations,
                currentDisplayRegion,
                activeTabIdx,
                selectedPurpose,
                selectedFilters,
                manualInputs,
                selectedFriends,
                includeMe,
                searchQuery
            };
            sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(payload));
        } catch (error) {
            console.log("Failed to persist search state:", error);
        }
    };

    const restoreSearchState = () => {
        if (typeof window === "undefined") return;
        const raw = sessionStorage.getItem(HOME_STATE_KEY);
        if (!raw) return;
        try {
            const saved = JSON.parse(raw);
            if (Array.isArray(saved.recommendations) && saved.recommendations.length > 0) {
                setRecommendations(saved.recommendations);
                const restoredIdx = typeof saved.activeTabIdx === "number" ? saved.activeTabIdx : 0;
                setActiveTabIdx(restoredIdx);
                if (saved.currentDisplayRegion) {
                    setCurrentDisplayRegion(saved.currentDisplayRegion);
                } else {
                    setCurrentDisplayRegion(saved.recommendations[restoredIdx] || null);
                }
            }
            if (saved.selectedPurpose) setSelectedPurpose(saved.selectedPurpose);
            if (saved.selectedFilters) setSelectedFilters(saved.selectedFilters);
            if (Array.isArray(saved.manualInputs) && saved.manualInputs.length > 0) {
                setManualInputs(saved.manualInputs);
            }
            if (Array.isArray(saved.selectedFriends)) setSelectedFriends(saved.selectedFriends);
            if (typeof saved.includeMe === "boolean") setIncludeMe(saved.includeMe);
            if (typeof saved.searchQuery === "string") setSearchQuery(saved.searchQuery);
        } catch (error) {
            console.log("Failed to restore search state:", error);
        }
    };

    useEffect(() => {
        restoreSearchState();
    }, []);

    // Refs
    const mapRef = useRef<any>(null)
    const markersRef = useRef<any[]>([])
    const lootMarkersRef = useRef<any[]>([])
    const friendMarkersRef = useRef<any[]>([])
    // 🌟 [추가] 수동 입력 장소 마커를 위한 Ref
    const manualMarkersRef = useRef<any[]>([]) 
    const myMarkerRef = useRef<any>(null)
    const polylinesRef = useRef<any[]>([])
    const timeMarkersRef = useRef<any[]>([])

    // --- Helpers ---
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // --- Effects (지도 및 마커 렌더링) ---
    useEffect(() => {
        const initMap = () => {
            if (typeof window.naver === 'undefined' || !window.naver.maps) { setTimeout(initMap, 100); return; }
            const center = myLocation || { lat: 37.5665, lng: 126.9780 };
            if (!mapRef.current) {
                mapRef.current = new window.naver.maps.Map("map", { center: new window.naver.maps.LatLng(center.lat, center.lng), zoom: 16 });
            }

            // 내 위치 마커
            if (myLocation) {
                if (myMarkerRef.current) myMarkerRef.current.setMap(null);
                if (includeMe) {
                    myMarkerRef.current = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(myLocation.lat, myLocation.lng),
                        map: mapRef.current, zIndex: 100,
                        icon: { content: '<div style="font-size:30px;">🏃</div>' }
                    });
                }
            }

            // 1. 추천 장소 마커
            if (Array.isArray(markersRef.current)) {
                markersRef.current.forEach((m: any) => m.setMap(null));
            }
            markersRef.current = [];

            if (currentDisplayRegion && Array.isArray(currentDisplayRegion.places)) {
                currentDisplayRegion.places.forEach((p: any) => {
                    const marker = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(p.lat, p.lng),
                        map: mapRef.current, title: p.name
                    });
                    markersRef.current.push(marker);
                });
                
                if (currentDisplayRegion.center) {
                    mapRef.current.morph(new window.naver.maps.LatLng(currentDisplayRegion.center.lat, currentDisplayRegion.center.lng));
                }
            }

            // 2. 보물 마커
            if (Array.isArray(lootMarkersRef.current)) {
                lootMarkersRef.current.forEach((m: any) => m.setMap(null));
            }
            lootMarkersRef.current = [];
            
            if (Array.isArray(loots)) {
                loots.forEach((loot: any) => {
                    const marker = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(loot.lat, loot.lng),
                        map: mapRef.current,
                        icon: { content: '<div style="font-size:24px; animation: bounce 2s infinite;">💎</div>' }
                    });
                    lootMarkersRef.current.push(marker);
                });
            }

            // 3. 친구 위치 마커
            if (Array.isArray(friendMarkersRef.current)) {
                friendMarkersRef.current.forEach((m: any) => m.setMap(null));
            }
            friendMarkersRef.current = [];
            
            if (Array.isArray(selectedFriends)) {
                selectedFriends.forEach((f: any) => {
                    const marker = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(f.location.lat, f.location.lng),
                        map: mapRef.current,
                        icon: { content: `<div style="padding:5px; background:white; border-radius:50%; border:2px solid #F59E0B; font-weight:bold;">${f.name[0]}</div>` }
                    });
                    friendMarkersRef.current.push(marker);
                });
            }

            // 🌟 [추가] 4. 수동 입력 장소 마커 (초록색 핀)
            if (Array.isArray(manualMarkersRef.current)) {
                manualMarkersRef.current.forEach((m: any) => m.setMap(null));
            }
            manualMarkersRef.current = [];

            manualInputs.forEach((input) => {
                if (input.lat && input.lng) {
                    const marker = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(input.lat, input.lng),
                        map: mapRef.current,
                        icon: { 
                            // 초록색 핀과 장소명 라벨 스타일
                            content: `<div style="display:flex; flex-direction:column; align-items:center; transform:translateY(-10px);">
                                        <div style="padding:4px 8px; background:white; border-radius:12px; border:2px solid #10B981; font-weight:bold; font-size:11px; color:#10B981; margin-bottom:4px; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.1);">${input.text}</div>
                                        <div style="width:12px; height:12px; background:#10B981; border:2px solid white; border-radius:50%; box-shadow:0 2px 4px rgba(0,0,0,0.2);"></div>
                                      </div>` 
                        }
                    });
                    manualMarkersRef.current.push(marker);
                }
            });
        };
        initMap();
    }, [myLocation, currentDisplayRegion, loots, selectedFriends, includeMe, manualInputs]); // 🌟 manualInputs 의존성 추가

    // 경로 그리기 함수
    const drawPathsToTarget = async (destLat: number, destLng: number, transitInfo: any = null) => {
        polylinesRef.current?.forEach(p => p.setMap(null));
        polylinesRef.current = [];
        timeMarkersRef.current?.forEach(m => m.setMap(null));
        timeMarkersRef.current = [];

        if (!mapRef.current) return;

        const destLatLng = new window.naver.maps.LatLng(destLat, destLng);
        const origins: any[] = [];

        // 1. 내 위치
        if (includeMe) {
            const lat = myProfile?.location?.lat || myLocation?.lat;
            const lng = myProfile?.location?.lng || myLocation?.lng;
            const name = myProfile?.name || "나";
            if (lat && lng) {
                origins.push({ lat, lng, color: '#7C3AED', name });
            }
        }

        // 2. 친구들
        selectedFriends?.forEach(f => {
            if (f.location) {
                origins.push({
                    lat: f.location.lat, lng: f.location.lng,
                    color: '#F59E0B', name: f.name
                });
            }
        });

        // 3. 수동 입력 장소
        for (const input of manualInputs) {
            if (!input.text || input.text.trim() === "") continue;

            if (input.lat && input.lng) {
                origins.push({
                    lat: input.lat,
                    lng: input.lng,
                    color: '#10B981',
                    name: input.text
                });
                continue;
            }

            try {
                const res = await fetch(`${API_URL}/api/places/search?query=${input.text}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.length > 0) {
                        const topHit = data[0];
                        origins.push({
                            lat: topHit.lat,
                            lng: topHit.lng,
                            color: '#10B981',
                            name: input.text
                        });
                    }
                }
            } catch (e) {
                console.error("수동 입력 장소 좌표 찾기 실패:", e);
            }
        }

        // 4. 지도에 그리기
        // 🆕 transitInfo에서 travel_times 배열 가져오기 (백엔드에서 계산된 실제 소요시간)
        const travelTimes = transitInfo?.travel_times || [];
        
        origins?.forEach((origin, index) => {
            const polyline = new window.naver.maps.Polyline({
                map: mapRef.current,
                path: [new window.naver.maps.LatLng(origin.lat, origin.lng), destLatLng],
                strokeColor: origin.color, strokeWeight: 5, strokeStyle: 'shortdash', strokeOpacity: 0.8,
                endIcon: window.naver.maps.PointingIcon.OPEN_ARROW
            });
            polylinesRef.current.push(polyline);

            // 🆕 실제 이동 시간 사용 (없으면 거리 기반 추정)
            let timeMinutes: number;
            if (travelTimes[index] !== undefined && travelTimes[index] > 0) {
                // 백엔드에서 계산된 실제 대중교통 소요시간 사용
                timeMinutes = travelTimes[index];
            } else {
                // 폴백: 거리 기반 추정 (1km당 약 3분 + 대기시간 5분)
                const dist = calculateDistance(origin.lat, origin.lng, destLat, destLng);
                timeMinutes = Math.ceil(dist / 1000 * 3 + 5);
            }
            const timeText = `약 ${timeMinutes}분`;

            const midLat = (origin.lat + destLat) / 2;
            const midLng = (origin.lng + destLng) / 2;

            const timeMarker = new window.naver.maps.Marker({
                position: new window.naver.maps.LatLng(midLat, midLng),
                map: mapRef.current,
                icon: {
                    content: `
                        <div style="background-color: rgba(30, 41, 59, 0.9); color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 6px; z-index: 9999;">
                            <div style="width: 8px; height: 8px; background-color: ${origin.color}; border-radius: 50%;"></div>
                            <span>${origin.name}</span>
                            <span style="opacity: 0.5;">|</span>
                            <span style="color: #FCD34D;">${timeText}</span>
                        </div>`,
                    anchor: new window.naver.maps.Point(50, 50)
                }
            });
            timeMarkersRef.current.push(timeMarker);
        });
    }

    const drawRegionPaths = (region: any) => {
        if (!region || !region.center) return;
        // 🆕 travel_times를 transitInfo로 전달 (백엔드에서 계산된 실제 대중교통 소요시간)
        drawPathsToTarget(region.center.lat, region.center.lng, { travel_times: region.travel_times || [] });
    }

    useEffect(() => {
        if (currentDisplayRegion && mapRef.current) {
            drawRegionPaths(currentDisplayRegion);
        }
    }, [currentDisplayRegion]);

    // 🌟 [핵심] n개 출발지 및 필터 전송
    const handleMidpointSearch = async () => {
        setLoading(true);
        try {
            const allPoints: {lat: number, lng: number}[] = [];

            if (includeMe) {
                const lat = myProfile?.location?.lat || myLocation?.lat || 37.5665;
                const lng = myProfile?.location?.lng || myLocation?.lng || 126.9780;
                allPoints.push({ lat, lng });
            }

            selectedFriends.forEach(f => {
                if (f.location && f.location.lat) allPoints.push({ lat: f.location.lat, lng: f.location.lng });
            });

            manualInputs.forEach(i => {
                if (i.lat && i.lng) allPoints.push({ lat: i.lat, lng: i.lng });
            });

            if (allPoints.length === 0) {
                alert("출발지를 하나 이상 입력해주세요.");
                setLoading(false);
                return;
            }

            const allTags = Object.values(selectedFilters).flat();

            const payload = {
                purpose: selectedPurpose,
                user_selected_tags: allTags,
                location_name: "중간지점",
                current_lat: allPoints[0].lat,
                current_lng: allPoints[0].lng,
                users: allPoints.slice(1).map(p => ({
                    location: { lat: p.lat, lng: p.lng }
                }))
            };

            const response = await fetch(`${API_URL}/api/recommend`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                setRecommendations(data);
                setActiveTabIdx(0);
                if (data.length > 0) setCurrentDisplayRegion(data[0]);
            } else {
                alert("추천 실패: 서버 오류가 발생했습니다.");
            }
        } catch (e) { 
            console.error(e);
            alert("네트워크 오류가 발생했습니다.");
        } finally { 
            setLoading(false); 
        }
    };

    // --- Handlers ---
    const handleTopSearch = async () => {
        if (!searchQuery || searchQuery.trim() === "") return;

        setLoading(true);
        try {
            // 선택된 목적에 따른 main_category 필터 적용
            const mainCategory = PURPOSE_FILTERS[selectedPurpose]?.mainCategory || "";
            const categoryParam = mainCategory ? `&main_category=${mainCategory}` : "";
            const res = await fetch(`${API_URL}/api/places/search?query=${searchQuery}${categoryParam}`);
            if (res.ok) {
                const data = await res.json();

                if (data && data.length > 0) {
                    const searchResultPlace = data.map((item: any, idx: number) => ({
                        id: 90000 + idx,
                        name: item.name,
                        category: item.category || "검색 장소",
                        address: item.address,
                        lat: item.lat,
                        lng: item.lng,
                        tags: ["검색결과"],
                        score: 0,
                        image: null
                    }));

                    const searchRegion = {
                        region_name: `'${searchQuery}' 검색 결과`,
                        center: { lat: searchResultPlace[0].lat, lng: searchResultPlace[0].lng },
                        places: searchResultPlace,
                        transit_info: null
                    };

                    setRecommendations([searchRegion]);
                    setCurrentDisplayRegion(searchRegion);
                    setActiveTabIdx(0);

                    if (mapRef.current) {
                        const newCenter = new window.naver.maps.LatLng(searchResultPlace[0].lat, searchResultPlace[0].lng);
                        mapRef.current.morph(newCenter);
                    }
                } else {
                    alert("검색 결과가 없습니다.");
                }
            }
        } catch (e) {
            console.error("Search failed:", e);
            alert("검색 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    }

    const handleManualInputChange = (idx: number, val: string) => {
        const newInputs = [...manualInputs];
        newInputs[idx] = { ...newInputs[idx], text: val, lat: undefined, lng: undefined };
        setManualInputs(newInputs);
    };
    const handleManualSelect = (idx: number, place: any) => {
        const newInputs = [...manualInputs];
        newInputs[idx] = { text: place.name, lat: place.lat, lng: place.lng };
        setManualInputs(newInputs);
    };
    const addManualInput = () => setManualInputs([...manualInputs, { text: "" }]);
    const removeManualInput = (idx: number) => setManualInputs(manualInputs.filter((_, i) => i !== idx));
    const toggleFriend = (friend: any) => {
        if (selectedFriends.find(f => f.id === friend.id)) setSelectedFriends(prev => prev.filter(f => f.id !== friend.id)); else setSelectedFriends(prev => [...prev, friend]);
    };

    const toggleFilter = (k: string, v: string) => {
        setSelectedFilters(prev => {
            const list = prev[k] || [];
            return list.includes(v) ? { ...prev, [k]: list.filter(i => i !== v) } : { ...prev, [k]: [...list, v] };
        });
    };
    const removeTag = (tag: string) => { for (const [key, vals] of Object.entries(selectedFilters)) { if (vals.includes(tag)) toggleFilter(key, tag); } };

    const handleCheckIn = async () => {
        if (!nearbyPlace) return;
        setInteractionLoading(true);
        try {
            await fetchWithAuth("/api/coins/check-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place_name: nearbyPlace.name, lat: nearbyPlace.lat, lng: nearbyPlace.lng }) });
            alert("50코인 획득!"); setNearbyPlace(null);
        } catch (e) { alert("오류"); } finally { setInteractionLoading(false); }
    }
    const handleClaimLoot = async () => {
        if (!nearbyLoot) return;
        setInteractionLoading(true);
        try {
            await fetchWithAuth("/api/coins/claim-loot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loot_id: nearbyLoot.id, amount: nearbyLoot.amount }) });
            alert(`${nearbyLoot.amount}코인 획득!`); setLoots(p => p.filter(l => l.id !== nearbyLoot.id)); setNearbyLoot(null);
        } catch (e) { alert("오류"); } finally { setInteractionLoading(false); }
    }

    const handlePlaceClick = async (p: any) => {
        persistSearchState();
        if (p?.id) {
            router.push(`/places/${p.id}`);
            return;
        }
        if (p?.name) {
            try {
                const res = await fetch(`${API_URL}/api/places/search?query=${encodeURIComponent(p.name)}&db_only=true`);
                if (res.ok) {
                    const matches = await res.json();
                    const matched = matches.find((item: any) => item.name === p.name) || matches[0];
                    if (matched?.id) {
                        router.push(`/places/${matched.id}`);
                        return;
                    }
                }
            } catch (error) {
                console.log("Place lookup failed:", error);
            }
        }
        setSelectedPlace(p);
        setIsDetailOpen(true);
        // ?? [Fix] lat, lng 사용
        drawPathsToTarget(p.lat, p.lng, currentDisplayRegion?.transit_info);
    };

    const currentFilters = PURPOSE_FILTERS[selectedPurpose];

    // --- Render ---
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col bg-[#F3F4F6] relative font-['Pretendard']">

            {/* 상단 검색바 */}
            <div className="absolute top-4 left-4 right-4 z-10">
                <div className="flex items-center bg-white rounded-2xl shadow-md h-12 px-4 border border-gray-100">
                    <Search className="w-5 h-5 text-gray-400 mr-2" />
                    <Input 
                        className="border-none bg-transparent h-full text-base p-0" 
                        placeholder="빠른 장소 검색 (예: 백소정)" 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleTopSearch()} 
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto mt-2 pb-1 scrollbar-hide">
                    <Button variant="outline" size="sm" className="rounded-full bg-white shadow-sm border-[#7C3AED] text-[#7C3AED]" onClick={() => setIsFilterOpen(true)}><Filter className="w-3 h-3 mr-1" />필터</Button>
                    <Badge className="rounded-full bg-gradient-to-r from-[#7C3AED] to-[#14B8A6] border-0 text-white h-9 px-3 flex items-center">{currentFilters?.label}</Badge>
                    {Object.entries(selectedFilters).flatMap(([k, v]) => v).map(tag => (
                        <Badge key={tag} variant="secondary" className="h-9 px-3 rounded-full bg-white text-gray-600 border border-gray-200 text-xs font-normal whitespace-nowrap flex-shrink-0 cursor-pointer" onClick={() => removeTag(tag)}>
                            {tag} <X className="w-3 h-3 ml-1" />
                        </Badge>
                    ))}
                </div>
            </div>

            <div id="map" className="w-full h-full bg-gray-200"></div>

            {/* 상호작용 버튼 */}
            <AnimatePresence>
                {nearbyLoot ? (
                    <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="absolute bottom-24 left-4 right-4 z-30">
                        <Button onClick={handleClaimLoot} disabled={interactionLoading} className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-xl animate-pulse flex gap-2"><Gem className="w-5 h-5" /> 보물 줍기 (+{nearbyLoot.amount}C)</Button>
                    </motion.div>
                ) : nearbyPlace ? (
                    <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="absolute bottom-24 left-4 right-4 z-30">
                        <Button onClick={handleCheckIn} disabled={interactionLoading} className="w-full h-14 rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-white font-bold shadow-xl animate-bounce flex gap-2"><Coins className="w-5 h-5" /> 방문 인증 (+50C)</Button>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {/* 출발지 설정 카드 (기본 표시) */}
            {!recommendations.length && (
                <div className="absolute bottom-4 left-4 right-4 bg-white rounded-3xl p-5 shadow-lg border border-gray-100 z-20">
                    <h2 className="text-lg font-bold mb-3">어디서 모이나요?</h2>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                        {includeMe && <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl"><span className="text-xl">👤</span><span className="flex-1 text-sm">{myLocationInput}</span><button onClick={() => setIncludeMe(false)}><Trash2 className="w-4 h-4 text-gray-400" /></button></div>}
                        {selectedFriends.map(f => <div key={f.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl"><Avatar className="w-8 h-8"><AvatarFallback>{f.name[0]}</AvatarFallback></Avatar><span className="flex-1 text-sm">{f.name}</span><button onClick={() => toggleFriend(f)}><X className="w-4 h-4 text-gray-400" /></button></div>)}
                        {manualInputs.map((val, i) => (
                            <div key={i} className="flex items-start gap-3 p-2 bg-gray-50 rounded-xl relative z-50">
                                <MapPin className="w-5 h-5 text-gray-400 mt-1.5" />
                                <div className="flex-1">
                                    <PlaceAutocomplete
                                        value={val.text}
                                        onChange={(v: string) => handleManualInputChange(i, v)}
                                        onSelect={(place: any) => handleManualSelect(i, place)}
                                        placeholder="장소 입력 (예: 강남)"
                                    />
                                </div>
                                <button onClick={() => removeManualInput(i)} className="mt-1"><Trash2 className="w-4 h-4 text-gray-400" /></button>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        <Button variant="outline" onClick={() => setIsFriendModalOpen(true)}><Users className="w-4 h-4 mr-2" />친구</Button>
                        <Button variant="outline" onClick={addManualInput}><Plus className="w-4 h-4 mr-2" />장소</Button>
                    </div>
                    {!includeMe && <button onClick={() => setIncludeMe(true)} className="text-xs text-gray-500 mt-2 underline w-full">+ 내 위치 추가</button>}
                    <Button className="w-full mt-3 h-12 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold" onClick={handleMidpointSearch}>🚀 중간 지점 찾기</Button>
                </div>
            )}

            {/* 추천 결과 리스트 */}
            <AnimatePresence>
                {recommendations.length > 0 && (
                    <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] max-h-[60vh] overflow-y-auto z-20">
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">추천 지역</h3>
                            <button
                                onClick={() => {
                                    setRecommendations([]);
                                    setManualInputs([{ text: "" }]);
                                    setCurrentDisplayRegion(null);
                                    setActiveTabIdx(0);
                                    if (typeof window !== "undefined") {
                                        sessionStorage.removeItem(HOME_STATE_KEY);
                                    }
                                }}
                                className="text-xs text-gray-400"
                            >
                                다시 찾기
                            </button>
                        </div>

                        {/* 지역 선택 탭 */}
                        <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
                            {recommendations.map((r, i) => (
                                <button key={i} onClick={() => { setActiveTabIdx(i); setCurrentDisplayRegion(r); }}
                                    className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTabIdx === i ? "bg-[#7C3AED] text-white shadow-md" : "bg-gray-100 text-gray-500"}`}>
                                    {r.region_name}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-3">{currentDisplayRegion?.places?.map((p: any) => <PlaceCard key={p.id} place={p} onClick={() => handlePlaceClick(p)} />)}</div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Loading & Error */}
            {loading && <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center"><Loader2 className="w-10 h-10 text-[#7C3AED] animate-spin" /></div>}
            {gpsError && <div className="absolute top-24 left-4 right-4 bg-red-100 text-red-600 p-2 rounded-lg text-xs z-50">{gpsError}</div>}

            {/* 필터 상세 설정 모달 */}
            <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <DialogContent className="sm:max-w-md h-[70vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl">
                    <DialogHeader className="px-6 pt-4 pb-2 bg-white border-b">
                        <DialogTitle>상세 필터 설정</DialogTitle>
                        <DialogDescription className="hidden">모임의 목적과 세부 옵션을 설정하세요.</DialogDescription>
                    </DialogHeader>

                    <div className="px-4 py-3 bg-gray-50 border-b">
                        <div className="text-xs font-bold text-gray-500 mb-2">모임의 목적</div>
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                            {Object.keys(PURPOSE_FILTERS).map((purposeKey) => (
                                <Button key={purposeKey} variant={selectedPurpose === purposeKey ? "default" : "outline"} className={`rounded-full h-8 text-xs flex-shrink-0 ${selectedPurpose === purposeKey ? "bg-[#7C3AED] text-white" : "text-gray-600"}`} onClick={() => { setSelectedPurpose(purposeKey); setSelectedFilters({ PURPOSE: [purposeKey], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [] }); }}>
                                    {PURPOSE_FILTERS[purposeKey].label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col bg-white overflow-hidden">
                        {currentFilters && (
                            <Tabs defaultValue={Object.keys(currentFilters.tabs)[0]} className="flex-1 flex flex-col">
                                <div className="px-4 pt-2 border-b">
                                    <TabsList className="w-full grid grid-cols-2 h-auto p-1 bg-gray-100 rounded-lg">
                                        {Object.keys(currentFilters.tabs).map((tabKey) => (
                                            <TabsTrigger key={tabKey} value={tabKey} className="text-xs py-1.5">{currentFilters.tabs[tabKey].label}</TabsTrigger>
                                        ))}
                                    </TabsList>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4">
                                    {Object.entries(currentFilters.tabs).map(([tabKey, tabData]: any) => (
                                        <TabsContent key={tabKey} value={tabKey} className="mt-0 h-full">
                                            <div className="grid grid-cols-3 gap-2">
                                                {tabData.options.map((opt: string) => (
                                                    <Button key={opt} variant={selectedFilters[tabKey]?.includes(opt) ? "default" : "outline"} className={`h-auto py-2 px-1 text-xs break-keep ${selectedFilters[tabKey]?.includes(opt) ? "bg-purple-50 text-[#7C3AED] border-[#7C3AED]" : "text-gray-600 border-gray-200"}`} onClick={() => toggleFilter(tabKey, opt)}>
                                                        {opt}
                                                    </Button>
                                                ))}
                                            </div>
                                        </TabsContent>
                                    ))}
                                </div>
                            </Tabs>
                        )}
                    </div>
                    <div className="p-4 border-t bg-white"><Button className="w-full bg-[#7C3AED] hover:bg-purple-700 font-bold" onClick={() => setIsFilterOpen(false)}>선택 완료</Button></div>
                </DialogContent>
            </Dialog>

            {/* 친구/취향 모달 */}
            <Dialog open={isFriendModalOpen} onOpenChange={setIsFriendModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>친구 추가</DialogTitle>
                        <DialogDescription className="hidden">함께 만날 친구를 선택하세요.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">{AI_PERSONAS.map(f => <div key={f.id} onClick={() => toggleFriend(f)} className="flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer border rounded-lg"><Avatar><AvatarFallback>{f.name[0]}</AvatarFallback></Avatar><div><div className="font-bold">{f.name}</div><div className="text-xs text-gray-500">{f.locationName}</div></div>{selectedFriends.find(sf => sf.id === f.id) && <CheckCircle2 className="ml-auto w-4 h-4 text-purple-600" />}</div>)}</div>
                </DialogContent>
            </Dialog>
            <PreferenceModal isOpen={isPreferenceModalOpen} onClose={() => setIsPreferenceModalOpen(false)} onComplete={() => setIsPreferenceModalOpen(false)} />

            {/* 상세 모달 */}
            <Dialog open={isDetailOpen} onOpenChange={(open) => {
                setIsDetailOpen(open);
                if (!open) {
                    polylinesRef.current?.forEach(p => p.setMap(null));
                    polylinesRef.current = [];
                    timeMarkersRef.current?.forEach(m => m.setMap(null));
                    timeMarkersRef.current = [];
                    if (currentDisplayRegion) drawRegionPaths(currentDisplayRegion);
                }
            }}>
                <DialogContent className="sm:max-w-md h-[80vh] flex flex-col font-['Pretendard']">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            {selectedPlace?.name}
                            <Badge variant="outline" className="text-xs font-normal">{selectedPlace?.category}</Badge>
                        </DialogTitle>
                        <DialogDescription className="hidden">장소 상세 정보입니다.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-2 space-y-4">
                        <div className="bg-purple-50 p-4 rounded-lg text-center">
                            <div className="text-sm text-purple-800 font-bold mb-1">AI 추천 점수</div>
                            <div className="text-3xl font-black text-[#7C3AED]">{selectedPlace?.score || selectedPlace?.wemeet_rating || "NEW"}</div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {selectedPlace?.tags?.map((t: string, i: number) => (
                                <Badge key={i} variant="secondary" className="bg-white border border-gray-200 text-gray-500">#{t}</Badge>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                                if (selectedPlace?.id) {
                                    persistSearchState();
                                    setIsDetailOpen(false);
                                    router.push(`/places/${selectedPlace.id}?review=1`);
                                }
                            }}
                        >
                            ✍️ 리뷰 쓰고 AI 학습시키기
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </motion.div>
    )
}

// 🌟 PlaceAutocomplete: 컴포넌트 밖으로 빼서 정의
function PlaceAutocomplete({ value, onChange, onSelect, placeholder }: any) {
    const [list, setList] = useState<any[]>([]);

    useEffect(() => {
        if (!value || value.length < 1) { setList([]); return; }

        const t = setTimeout(async () => {
            try {
                // 🌟 우리 서버의 자동완성 API 호출
                const res = await fetch(`${API_URL}/api/places/autocomplete?query=${value}`);
                if (res.ok) {
                    const data = await res.json();
                    setList(data);
                }
            } catch (e) {
                console.error(e);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [value]);

    return (
        <div className="relative w-full">
            <Input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-8 text-sm bg-transparent border-none p-0 focus-visible:ring-0"
            />
            {list.length > 0 && (
                // 🌟 [수정 포인트] absolute 제거 -> 일반 흐름(Flow)으로 변경 (겹침 방지)
                <div className="w-full bg-white border border-gray-200 rounded-lg shadow-sm mt-2 max-h-60 overflow-y-auto">
                    {list.map((item, i) => (
                        <div
                            key={i}
                            onClick={() => {
                                onSelect(item);
                                setList([]);
                            }}
                            className="p-3 hover:bg-purple-50 cursor-pointer text-sm border-b last:border-0 border-gray-100 transition-colors flex justify-between items-center"
                        >
                            <div className="font-bold text-gray-800">
                                {item.name}
                                {/* 호선 정보가 있으면 표시 */}
                                {item.lines && item.lines.length > 0 && (
                                    <span className="ml-2 text-[10px] font-normal text-gray-500 bg-gray-100 px-1 rounded">
                                        {item.lines.join(",")}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}


