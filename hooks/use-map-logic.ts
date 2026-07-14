"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { placeApi } from "@/lib/place-api";
import { fetchWithAuth } from "@/lib/api-client";

type LatLng = { lat: number; lng: number };

// 지도 라벨용 HTML 이스케이프(가게명에 특수문자 대비)
const escapeHtml = (s: any) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
type ManualInput = { text: string; lat?: number; lng?: number };

type UseMapLogicParams = {
    myLocation: LatLng | null;
    currentDisplayRegion: any;
    loots: any[];
    selectedFriends: any[];
    includeMe: boolean;
    manualInputs: ManualInput[];
    myProfile: any;
    fallbackName?: string;
    formatTravelTime?: (minutes: number) => string;
};

declare global {
    interface Window {
        naver: any;
    }
}

export const useMapLogic = ({
    myLocation,
    currentDisplayRegion,
    loots,
    selectedFriends,
    includeMe,
    manualInputs,
    myProfile,
    fallbackName = "Me",
    formatTravelTime = (minutes: number) => `~${minutes} min`
}: UseMapLogicParams) => {
    const router = useRouter();
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const nearbyMarkersRef = useRef<any[]>([]);   // 지도 영역 내 가게 핀(클릭→상세)
    const nearbyBoundRef = useRef(false);         // idle 리스너 중복 부착 방지
    const nearbyPlacesRef = useRef<any[]>([]);    // 뷰포트 가게 캐시(지도 탭→근처 가게 매칭용)
    const lootMarkersRef = useRef<any[]>([]);
    const friendMarkersRef = useRef<any[]>([]);
    const manualMarkersRef = useRef<any[]>([]);
    const myMarkerRef = useRef<any>(null);
    const centeredRef = useRef(false); // 내 저장 위치로 최초 중심 이동 완료 여부
    const polylinesRef = useRef<any[]>([]);
    const timeMarkersRef = useRef<any[]>([]);

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3;
        const phi1 = (lat1 * Math.PI) / 180;
        const phi2 = (lat2 * Math.PI) / 180;
        const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
        const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
        const a =
            Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    useEffect(() => {
        const initMap = () => {
            if (typeof window.naver === "undefined" || !window.naver.maps) {
                setTimeout(initMap, 100);
                return;
            }
            const center = myLocation || { lat: 37.5665, lng: 126.9780 };
            if (!mapRef.current) {
                mapRef.current = new window.naver.maps.Map("map", {
                    center: new window.naver.maps.LatLng(center.lat, center.lng),
                    zoom: 16
                });
                if (myLocation) centeredRef.current = true;

                // 🗺️ 지도 영역 내 가게를 클릭 가능한 핀으로 (idle=이동/줌 멈추면 재조회 → 클릭 시 상세)
                if (!nearbyBoundRef.current && window.naver?.maps?.Event) {
                    nearbyBoundRef.current = true;

                    // 🎯 지도 탭 → 근처 가게 매칭 (네이버 라벨이 사실상 우리 버튼이 되는 효과)
                    // 라벨 자체 클릭은 못 잡지만(타일 그림) 탭 좌표는 잡히므로, 탭 지점 ~30px 내 가게로 연결
                    window.naver.maps.Event.addListener(mapRef.current, "click", (e: any) => {
                        const map = mapRef.current;
                        if (!map || !e?.coord) return;
                        const proj = map.getProjection();
                        if (!proj) return;
                        const tap = proj.fromCoordToOffset(e.coord);
                        let best: any = null;
                        let bestD = 30; // px 반경(네이버 라벨 텍스트는 가게 좌표에서 10~20px 아래라 커버됨)
                        nearbyPlacesRef.current.forEach((g: any) => {
                            const pt = proj.fromCoordToOffset(new window.naver.maps.LatLng(g.lat, g.lng));
                            const d = Math.hypot(pt.x - tap.x, pt.y - tap.y);
                            if (d < bestD) { bestD = d; best = g; }
                        });
                        if (!best) return; // 빈 곳/도로 탭 = 무시(토스트 없음 — 일반 지도 조작이 많아서)
                        if (best.members.length > 1) {
                            window.dispatchEvent(new CustomEvent("map:place-group", { detail: { places: best.members } }));
                        } else {
                            router.push(`/places/${best.members[0].id}`);
                        }
                    });

                    window.naver.maps.Event.addListener(mapRef.current, "idle", () => {
                        const map = mapRef.current;
                        if (!map) return;
                        const clearNearby = () => {
                            nearbyMarkersRef.current.forEach((m: any) => m.setMap(null));
                            nearbyMarkersRef.current = [];
                        };
                        const zoom = map.getZoom();
                        if (zoom < 14) { clearNearby(); nearbyPlacesRef.current = []; return; }  // 너무 넓으면 노이즈라 생략
                        // 확대할수록 더 많이(동네 수준이면 사실상 전부). 너무 많으면 렉+칩 떡칠이라 줌별 상한.
                        const lim = zoom >= 18 ? 400 : zoom >= 17 ? 300 : zoom >= 16 ? 180 : 100;
                        // 줌별 칩 크기(축소하면 글씨도 작게, 더 축소(≤15)하면 점만 — 글씨가 안 읽히는 수준이라)
                        const chip = zoom >= 18 ? { font: 11, maxw: 96, dot: 9, padV: 2, padH: 8 }
                            : zoom >= 17 ? { font: 10, maxw: 80, dot: 8, padV: 1, padH: 7 }
                            : zoom >= 16 ? { font: 8.5, maxw: 60, dot: 7, padV: 1, padH: 5 }
                            : null;
                        const b = map.getBounds();
                        const sw = b.getMin ? b.getMin() : b.getSW();
                        const ne = b.getMax ? b.getMax() : b.getNE();
                        const q = `min_lat=${sw.lat()}&max_lat=${ne.lat()}&min_lng=${sw.lng()}&max_lng=${ne.lng()}&limit=${lim}`;
                        fetchWithAuth(`/api/places/nearby?${q}`)
                            .then((r) => (r.ok ? r.json() : { items: [] }))
                            .then((d) => {
                                clearNearby();
                                const items = (d.items || []).filter((p: any) => p.id && p.lat && p.lng);

                                // ① 같은 건물 묶기(≈11m 격자) — 한 건물 여러 가게는 핀 하나 + "외 N"
                                const groups = new Map<string, any[]>();
                                items.forEach((p: any) => {
                                    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
                                    const arr = groups.get(key);
                                    if (arr) arr.push(p); else groups.set(key, [p]);
                                });

                                // 지도 탭 매칭용 캐시 갱신
                                nearbyPlacesRef.current = Array.from(groups.values()).map((members: any[]) => ({
                                    lat: members[0].lat, lng: members[0].lng, members,
                                }));

                                // ② 라벨 충돌 감지 — 화면 픽셀로 투영, 겹치는 칩은 점으로 강등(확대하면 복귀)
                                const proj = map.getProjection();
                                const keptBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
                                const dotSize = chip ? chip.dot : 7;

                                groups.forEach((members) => {
                                    const p = members[0];
                                    const n = members.length;
                                    const label = n > 1 ? `${p.name} 외 ${n - 1}` : p.name;

                                    let showChip = false;
                                    if (chip && proj) {
                                        const pt = proj.fromCoordToOffset(new window.naver.maps.LatLng(p.lat, p.lng));
                                        const w = Math.min(chip.maxw, label.length * chip.font) + chip.padH * 2 + 2;
                                        const h = chip.font + chip.padV * 2 + 6;
                                        const box = { x1: pt.x - w / 2, y1: pt.y - dotSize - h, x2: pt.x + w / 2, y2: pt.y - dotSize };
                                        const collide = keptBoxes.some((k) => box.x1 < k.x2 && box.x2 > k.x1 && box.y1 < k.y2 && box.y2 > k.y1);
                                        if (!collide) { keptBoxes.push(box); showChip = true; }
                                    }

                                    const chipHtml = showChip && chip
                                        ? `<div style="position:absolute;left:0;bottom:${dotSize}px;transform:translateX(-50%);background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:${chip.padV}px ${chip.padH}px;box-shadow:0 1px 3px rgba(0,0,0,0.16);white-space:nowrap;">
                                                <span style="font-size:${chip.font}px;font-weight:700;color:#374151;max-width:${chip.maxw}px;display:inline-block;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;">${escapeHtml(label)}</span>
                                            </div>`
                                        : "";
                                    const marker = new window.naver.maps.Marker({
                                        position: new window.naver.maps.LatLng(p.lat, p.lng),
                                        map,
                                        title: label,
                                        icon: {
                                            content: `<div style="position:relative;width:0;height:0;cursor:pointer;">
                                                <div style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;background:#F5A623;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>
                                                ${chipHtml}
                                            </div>`,
                                            anchor: new window.naver.maps.Point(0, 0),
                                        },
                                    });
                                    window.naver.maps.Event.addListener(marker, "click", () => {
                                        if (n > 1) {
                                            // 같은 건물 여러 곳 → 하단 시트에서 선택(home-tab이 수신)
                                            window.dispatchEvent(new CustomEvent("map:place-group", { detail: { places: members } }));
                                        } else {
                                            router.push(`/places/${p.id}`);
                                        }
                                    });
                                    nearbyMarkersRef.current.push(marker);
                                });
                            })
                            .catch(() => {});
                    });
                }
            } else if (myLocation && !centeredRef.current && !currentDisplayRegion) {
                // 지도 생성 후 내 저장 위치(비동기 로드)가 도착하면 그 위치로 중심 이동(최초 1회).
                // 검색 결과 표시 중일 땐 검색 위치가 우선이라 건드리지 않음.
                mapRef.current.setCenter(new window.naver.maps.LatLng(myLocation.lat, myLocation.lng));
                centeredRef.current = true;
            }

            if (myLocation) {
                if (myMarkerRef.current) myMarkerRef.current.setMap(null);
                if (includeMe) {
                    myMarkerRef.current = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(myLocation.lat, myLocation.lng),
                        map: mapRef.current,
                        zIndex: 100,
                        icon: { content: '<div style="font-size:30px;">📍</div>' }
                    });
                }
            }

            if (Array.isArray(markersRef.current)) {
                markersRef.current.forEach((marker: any) => marker.setMap(null));
            }
            markersRef.current = [];

            if (currentDisplayRegion && Array.isArray(currentDisplayRegion.places)) {
                currentDisplayRegion.places.forEach((place: any) => {
                    const marker = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(place.lat, place.lng),
                        map: mapRef.current,
                        title: place.name
                    });
                    if (place.id) {
                        window.naver.maps.Event.addListener(marker, "click", () => router.push(`/places/${place.id}`));
                    }
                    markersRef.current.push(marker);
                });

                if (currentDisplayRegion.center) {
                    mapRef.current.morph(
                        new window.naver.maps.LatLng(
                            currentDisplayRegion.center.lat,
                            currentDisplayRegion.center.lng
                        )
                    );
                }
            }

            if (Array.isArray(lootMarkersRef.current)) {
                lootMarkersRef.current.forEach((marker: any) => marker.setMap(null));
            }
            lootMarkersRef.current = [];

            if (Array.isArray(loots)) {
                loots.forEach((loot: any) => {
                    const marker = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(loot.lat, loot.lng),
                        map: mapRef.current,
                        icon: { content: '<div style="font-size:24px; animation: bounce 2s infinite;">🎁</div>' }
                    });
                    lootMarkersRef.current.push(marker);
                });
            }

            if (Array.isArray(friendMarkersRef.current)) {
                friendMarkersRef.current.forEach((marker: any) => marker.setMap(null));
            }
            friendMarkersRef.current = [];

            if (Array.isArray(selectedFriends)) {
                selectedFriends.forEach((friend: any) => {
                    const marker = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(friend.location.lat, friend.location.lng),
                        map: mapRef.current,
                        icon: {
                            content: `<div style="padding:5px; background:white; border-radius:50%; border:2px solid #F59E0B; font-weight:bold;">${friend.name[0]}</div>`
                        }
                    });
                    friendMarkersRef.current.push(marker);
                });
            }

            if (Array.isArray(manualMarkersRef.current)) {
                manualMarkersRef.current.forEach((marker: any) => marker.setMap(null));
            }
            manualMarkersRef.current = [];

            manualInputs.forEach((input) => {
                if (input.lat && input.lng) {
                    const marker = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(input.lat, input.lng),
                        map: mapRef.current,
                        icon: {
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
    }, [currentDisplayRegion, includeMe, loots, manualInputs, myLocation, selectedFriends]);

    const clearPaths = useCallback(() => {
        polylinesRef.current?.forEach((polyline) => polyline.setMap(null));
        polylinesRef.current = [];
        timeMarkersRef.current?.forEach((marker) => marker.setMap(null));
        timeMarkersRef.current = [];
    }, []);

    const drawPathsToTarget = useCallback(
        async (destLat: number, destLng: number, transitInfo: any = null) => {
            clearPaths();

            if (!mapRef.current) return;

            const destLatLng = new window.naver.maps.LatLng(destLat, destLng);
            const origins: any[] = [];

            if (includeMe) {
                const lat = myProfile?.location?.lat || myLocation?.lat;
                const lng = myProfile?.location?.lng || myLocation?.lng;
                const name = myProfile?.name || fallbackName;
                if (lat && lng) {
                    origins.push({ lat, lng, color: "#F5A623", name });
                }
            }

            selectedFriends?.forEach((friend) => {
                if (friend.location) {
                    origins.push({
                        lat: friend.location.lat,
                        lng: friend.location.lng,
                        color: "#F59E0B",
                        name: friend.name
                    });
                }
            });

            for (const input of manualInputs) {
                if (!input.text || input.text.trim() === "") continue;

                if (input.lat && input.lng) {
                    origins.push({
                        lat: input.lat,
                        lng: input.lng,
                        color: "#10B981",
                        name: input.text
                    });
                    continue;
                }

                try {
                    const data = await placeApi.search(input.text);
                    if (data.length > 0) {
                        const topHit = data[0];
                        origins.push({
                            lat: topHit.lat,
                            lng: topHit.lng,
                            color: "#10B981",
                            name: input.text
                        });
                    }
                } catch (error) {
                    console.error("Manual input lookup failed:", error);
                }
            }

            const travelTimes = transitInfo?.travel_times || [];

            origins?.forEach((origin, index) => {
                const polyline = new window.naver.maps.Polyline({
                    map: mapRef.current,
                    path: [new window.naver.maps.LatLng(origin.lat, origin.lng), destLatLng],
                    strokeColor: origin.color,
                    strokeWeight: 5,
                    strokeStyle: "shortdash",
                    strokeOpacity: 0.8,
                    endIcon: window.naver.maps.PointingIcon.OPEN_ARROW
                });
                polylinesRef.current.push(polyline);

                let timeMinutes: number;
                if (travelTimes[index] !== undefined && travelTimes[index] > 0) {
                    timeMinutes = travelTimes[index];
                } else {
                    const dist = calculateDistance(origin.lat, origin.lng, destLat, destLng);
                    timeMinutes = Math.ceil((dist / 1000) * 3 + 5);
                }
                const timeText = formatTravelTime(timeMinutes);

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
        },
        [includeMe, manualInputs, myLocation, myProfile, selectedFriends]
    );

    const drawRegionPaths = useCallback(
        (region: any) => {
            if (!region || !region.center || !mapRef.current) return;
            drawPathsToTarget(region.center.lat, region.center.lng, {
                travel_times: region.travel_times || []
            });
        },
        [drawPathsToTarget]
    );

    useEffect(() => {
        if (!currentDisplayRegion || !currentDisplayRegion.center || !mapRef.current) return;
        drawRegionPaths(currentDisplayRegion);
    }, [currentDisplayRegion, drawRegionPaths]);

    return { mapRef, drawPathsToTarget, clearPaths, drawRegionPaths };
};
