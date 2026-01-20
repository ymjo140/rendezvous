"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { MapPin, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { fetchWithAuth } from "@/lib/api-client"
import { placeApi } from "@/lib/place-api"
import { useMapLogic } from "@/hooks/use-map-logic"
import { useRecommendation } from "@/hooks/use-recommendation"
import { useSystemConfig } from "@/hooks/use-system-config"
import { HomeHeader } from "@/components/ui/components/home/HomeHeader"
import { ActionButtons } from "@/components/ui/components/home/ActionButtons"
import { MidpointSelector } from "@/components/ui/components/home/MidpointSelector"
import { RecommendationList } from "@/components/ui/components/home/RecommendationList"
import { FilterDialog } from "@/components/ui/components/home/FilterDialog"
import { FriendModal } from "@/components/ui/components/home/FriendModal"

// --- 1. Local utilities ---

const HOME_STATE_KEY = "home_tab_state_v1";

const PreferenceModal = ({ isOpen, onClose, onComplete }: any) => (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
            <DialogHeader><DialogTitle>Preference Check</DialogTitle></DialogHeader>
            <div className="py-4 text-center text-gray-600">Tell us your preferences to improve recommendations.</div>
            <DialogFooter><Button onClick={onComplete}>Done</Button></DialogFooter>
        </DialogContent>
    </Dialog>
);

const AI_PERSONAS = [
    { id: 2, name: "Office Worker (Gangnam)", locationName: "Gangnam Station", location: { lat: 37.498085, lng: 127.027621 } },
    { id: 3, name: "Student (Hongdae)", locationName: "Hongdae", location: { lat: 37.557527, lng: 126.924467 } },
    { id: 4, name: "Friend (Seongsu)", locationName: "Seongsu", location: { lat: 37.544581, lng: 127.056035 } },
];


// --- 2. Main component ---

export function HomeTab() {
    const router = useRouter();

    // State
    const [searchQuery, setSearchQuery] = useState("")
    const [myLocation, setMyLocation] = useState<{ lat: number, lng: number } | null>(null)
    const [myLocationInput, setMyLocationInput] = useState("Checking location...")

    // manualInputs: 媛앹껜 諛곗뿴
    const [manualInputs, setManualInputs] = useState<{ text: string, lat?: number, lng?: number }[]>([{ text: "" }]);
    const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
    const [includeMe, setIncludeMe] = useState(true);

    const [loots, setLoots] = useState<any[]>([])
    const [gpsError, setGpsError] = useState<string>("");

    const [nearbyPlace, setNearbyPlace] = useState<any>(null);
    const [nearbyLoot, setNearbyLoot] = useState<any>(null);
    const [interactionLoading, setInteractionLoading] = useState(false);

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isFriendModalOpen, setIsFriendModalOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState<any>(null);
    const [isPreferenceModalOpen, setIsPreferenceModalOpen] = useState(false);

    const [selectedPurpose, setSelectedPurpose] = useState("")
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
        PURPOSE: [],
        CATEGORY: [],
        PRICE: [],
        VIBE: [],
        CONDITION: []
    });
    const [myProfile, setMyProfile] = useState<any>(null)

    const { data: purposeConfig } = useSystemConfig()

    const {
        recommendations,
        setRecommendations,
        currentDisplayRegion,
        setCurrentDisplayRegion,
        activeTabIdx,
        setActiveTabIdx,
        searchMidpoint,
        searchByQuery,
        isLoading
    } = useRecommendation({
        selectedPurpose,
        selectedFilters,
        includeMe,
        myProfile,
        myLocation,
        selectedFriends,
        manualInputs,
        labels: {
            noOriginMessage: "Please enter at least one origin location.",
            errorMessage: "A network error occurred.",
            locationName: "Midpoint",
            searchResultTag: "Search results",
            searchRegionLabel: (query: string) => `'${query}' results`
        }
    });

    const { mapRef, drawPathsToTarget, clearPaths, drawRegionPaths } = useMapLogic({
        myLocation,
        currentDisplayRegion,
        loots,
        selectedFriends,
        includeMe,
        manualInputs,
        myProfile,
        fallbackName: "Unknown",
        formatTravelTime: (minutes) => `${minutes} min`
    });

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

    useEffect(() => {
        if (!purposeConfig) return;
        if (!selectedPurpose || !purposeConfig[selectedPurpose]) {
            const firstPurpose = Object.keys(purposeConfig)[0];
            if (firstPurpose) {
                setSelectedPurpose(firstPurpose);
                setSelectedFilters(prev => ({ ...prev, PURPOSE: [firstPurpose] }));
            }
        }
    }, [purposeConfig, selectedPurpose]);

    // ?? [?듭떖] n媛?異쒕컻吏 諛??꾪꽣 ?꾩넚
    const handleMidpointSearch = async () => {
        const result = await searchMidpoint();
        if (!result.ok) {
            alert(result.message || "Recommendation failed due to a server error.");
        }
    };
    // --- Handlers ---
    const handleTopSearch = async () => {
        if (!searchQuery || searchQuery.trim() === "") return;

        try {
            const mainCategory = purposeConfig?.[selectedPurpose]?.mainCategory || "";
            const searchRegion = await searchByQuery(searchQuery, mainCategory);
            if (!searchRegion) {
                alert("Search failed due to a network error.");
                return;
            }
            if (mapRef.current) {
                const newCenter = new window.naver.maps.LatLng(searchRegion.center.lat, searchRegion.center.lng);
                mapRef.current.morph(newCenter);
            }
        } catch (e) {
            console.error("Search failed:", e);
            alert("Search failed due to a network error.");
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
            alert("Check-in complete. +50 coins!");
            setNearbyPlace(null);
        } catch (e) {
            alert("Something went wrong.");
        } finally {
            setInteractionLoading(false);
        }
    }
    const handleClaimLoot = async () => {
        if (!nearbyLoot) return;
        setInteractionLoading(true);
        try {
            await fetchWithAuth("/api/coins/claim-loot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loot_id: nearbyLoot.id, amount: nearbyLoot.amount }) });
            alert(`${nearbyLoot.amount} coins claimed!`);
            setLoots(p => p.filter(l => l.id !== nearbyLoot.id));
            setNearbyLoot(null);
        } catch (e) {
            alert("Something went wrong.");
        } finally {
            setInteractionLoading(false);
        }
    }

    const handlePlaceClick = async (p: any) => {
        persistSearchState();
        if (p?.id) {
            router.push(`/places/${p.id}`);
            return;
        }
        if (p?.name) {
            try {
                const matches = await placeApi.searchDbOnly(p.name);
                const matched = matches.find((item: any) => item.name === p.name) || matches[0];
                if (matched?.id) {
                    router.push(`/places/${matched.id}`);
                    return;
                }
            } catch (error) {
                console.log("Place lookup failed:", error);
            }
        }
        setSelectedPlace(p);
        setIsDetailOpen(true);
        drawPathsToTarget(p.lat, p.lng, currentDisplayRegion?.transit_info);
    };

    const currentFilters = purposeConfig ? purposeConfig[selectedPurpose] : null;
    const handleResetSearch = () => {
        setRecommendations([]);
        setManualInputs([{ text: "" }]);
        setCurrentDisplayRegion(null);
        setActiveTabIdx(0);
        if (typeof window !== "undefined") {
            sessionStorage.removeItem(HOME_STATE_KEY);
        }
    };
    const handleSelectTab = (idx: number) => {
        setActiveTabIdx(idx);
        setCurrentDisplayRegion(recommendations[idx]);
    };
    const handleSelectPurpose = (purposeKey: string) => {
        setSelectedPurpose(purposeKey);
        setSelectedFilters({ PURPOSE: [purposeKey], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [] });
    };

    // --- Render ---
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col bg-[#F3F4F6] relative font-['Pretendard']">
            <HomeHeader
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                onSearchSubmit={handleTopSearch}
                onOpenFilter={() => setIsFilterOpen(true)}
                selectedFilters={selectedFilters}
                currentFiltersLabel={currentFilters?.label}
                onRemoveTag={removeTag}
            />

            <div id="map" className="w-full h-full bg-gray-200"></div>

            <ActionButtons
                nearbyLoot={nearbyLoot}
                nearbyPlace={nearbyPlace}
                interactionLoading={interactionLoading}
                onClaimLoot={handleClaimLoot}
                onCheckIn={handleCheckIn}
            />

            {!recommendations.length && (
                <MidpointSelector
                    includeMe={includeMe}
                    myLocationInput={myLocationInput}
                    selectedFriends={selectedFriends}
                    manualInputs={manualInputs}
                    onToggleFriend={toggleFriend}
                    onManualInputChange={handleManualInputChange}
                    onManualSelect={handleManualSelect}
                    onRemoveManualInput={removeManualInput}
                    onAddManualInput={addManualInput}
                    onOpenFriendModal={() => setIsFriendModalOpen(true)}
                    onIncludeMeChange={setIncludeMe}
                    onSearch={handleMidpointSearch}
                    PlaceAutocompleteComponent={PlaceAutocomplete}
                />
            )}

            <RecommendationList
                recommendations={recommendations}
                activeTabIdx={activeTabIdx}
                onSelectTab={handleSelectTab}
                currentDisplayRegion={currentDisplayRegion}
                onPlaceClick={handlePlaceClick}
                onReset={handleResetSearch}
            />

            {/* Loading & Error */}
            {isLoading && (
                <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-[#7C3AED] animate-spin" />
                </div>
            )}
            {gpsError && (
                <div className="absolute top-24 left-4 right-4 bg-red-100 text-red-600 p-2 rounded-lg text-xs z-50">
                    {gpsError}
                </div>
            )}

            <FilterDialog
                isOpen={isFilterOpen}
                onOpenChange={setIsFilterOpen}
                purposeConfig={purposeConfig || null}
                selectedPurpose={selectedPurpose}
                onSelectPurpose={handleSelectPurpose}
                selectedFilters={selectedFilters}
                onToggleFilter={toggleFilter}
            />

            <FriendModal
                isOpen={isFriendModalOpen}
                onOpenChange={setIsFriendModalOpen}
                aiPersonas={AI_PERSONAS}
                selectedFriends={selectedFriends}
                onToggleFriend={toggleFriend}
            />
            <PreferenceModal
                isOpen={isPreferenceModalOpen}
                onClose={() => setIsPreferenceModalOpen(false)}
                onComplete={() => setIsPreferenceModalOpen(false)}
            />

            {/* ?ì„¸ ëª¨ë‹¬ */}
            <Dialog open={isDetailOpen} onOpenChange={(open) => {
                setIsDetailOpen(open);
                if (!open) {
                    clearPaths();
                    if (currentDisplayRegion) drawRegionPaths(currentDisplayRegion);
                }
            }}>
                <DialogContent className="sm:max-w-md h-[80vh] flex flex-col font-['Pretendard']">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            {selectedPlace?.name}
                            <Badge variant="outline" className="text-xs font-normal">{selectedPlace?.category}</Badge>
                        </DialogTitle>
                        <DialogDescription className="hidden">Place details</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-2 space-y-4">
                        <div className="bg-purple-50 p-4 rounded-lg text-center">
                            <div className="text-sm text-purple-800 font-bold mb-1">AI Score</div>
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
                            Write a review and train AI
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </motion.div>
    )
}
// ?? PlaceAutocomplete: 而댄룷?뚰듃 諛뽰쑝濡?鍮쇱꽌 ?뺤쓽
function PlaceAutocomplete({ value, onChange, onSelect, placeholder }: any) {
    const [list, setList] = useState<any[]>([]);
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedValue(value), 300);
        return () => clearTimeout(t);
    }, [value]);

    const { data } = useQuery({
        queryKey: ["place-autocomplete", debouncedValue],
        queryFn: () => placeApi.autocomplete(debouncedValue),
        enabled: !!debouncedValue && debouncedValue.length > 0,
        staleTime: 60 * 1000
    });

    useEffect(() => {
        if (!debouncedValue) {
            setList([]);
            return;
        }
        if (Array.isArray(data)) {
            setList(data);
        }
    }, [data, debouncedValue]);

    return (
        <div className="relative w-full">
            <Input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-8 text-sm bg-transparent border-none p-0 focus-visible:ring-0"
            />
            {list.length > 0 && (
                // ?? [?섏젙 ?ъ씤?? absolute ?쒓굅 -> ?쇰컲 ?먮쫫(Flow)?쇰줈 蹂寃?(寃뱀묠 諛⑹?)
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
                                {/* ?몄꽑 ?뺣낫媛 ?덉쑝硫??쒖떆 */}
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












