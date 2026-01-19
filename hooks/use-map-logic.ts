"use client";

import { useCallback, useEffect, useRef } from "react";
import { placeApi } from "@/lib/place-api";

type LatLng = { lat: number; lng: number };
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
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const lootMarkersRef = useRef<any[]>([]);
    const friendMarkersRef = useRef<any[]>([]);
    const manualMarkersRef = useRef<any[]>([]);
    const myMarkerRef = useRef<any>(null);
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
            }

            if (myLocation) {
                if (myMarkerRef.current) myMarkerRef.current.setMap(null);
                if (includeMe) {
                    myMarkerRef.current = new window.naver.maps.Marker({
                        position: new window.naver.maps.LatLng(myLocation.lat, myLocation.lng),
                        map: mapRef.current,
                        zIndex: 100,
                        icon: { content: '<div style="font-size:30px;">??</div>' }
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
                        icon: { content: '<div style="font-size:24px; animation: bounce 2s infinite;">??</div>' }
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
                    origins.push({ lat, lng, color: "#7C3AED", name });
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
