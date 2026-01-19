"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { placeApi, RecommendationPayload } from "@/lib/place-api";

type LatLng = { lat: number; lng: number };
type ManualInput = { text: string; lat?: number; lng?: number };

type UseRecommendationParams = {
    selectedPurpose: string;
    selectedFilters: Record<string, string[]>;
    includeMe: boolean;
    myProfile: any;
    myLocation: LatLng | null;
    selectedFriends: any[];
    manualInputs: ManualInput[];
    labels?: {
        noOriginMessage?: string;
        errorMessage?: string;
        locationName?: string;
        searchResultTag?: string;
        searchRegionLabel?: (query: string) => string;
    };
};

export const useRecommendation = ({
    selectedPurpose,
    selectedFilters,
    includeMe,
    myProfile,
    myLocation,
    selectedFriends,
    manualInputs
    ,
    labels
}: UseRecommendationParams) => {
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [currentDisplayRegion, setCurrentDisplayRegion] = useState<any>(null);
    const [activeTabIdx, setActiveTabIdx] = useState(0);

    const recommendMutation = useMutation({
        mutationFn: (payload: RecommendationPayload) => placeApi.recommend(payload)
    });

    const searchMutation = useMutation({
        mutationFn: ({ query, mainCategory }: { query: string; mainCategory?: string }) =>
            placeApi.search(query, mainCategory)
    });

    const resolvedLabels = {
        noOriginMessage: "Please add at least one origin.",
        errorMessage: "Network error.",
        locationName: "midpoint",
        searchResultTag: "search-result",
        searchRegionLabel: (query: string) => `'${query}' results`,
        ...labels
    };

    const searchMidpoint = useCallback(async () => {
        const allPoints: LatLng[] = [];

        if (includeMe) {
            const lat = myProfile?.location?.lat || myLocation?.lat || 37.5665;
            const lng = myProfile?.location?.lng || myLocation?.lng || 126.9780;
            allPoints.push({ lat, lng });
        }

        selectedFriends.forEach((friend) => {
            if (friend.location && friend.location.lat) {
                allPoints.push({ lat: friend.location.lat, lng: friend.location.lng });
            }
        });

        manualInputs.forEach((input) => {
            if (input.lat && input.lng) {
                allPoints.push({ lat: input.lat, lng: input.lng });
            }
        });

        if (allPoints.length === 0) {
            return { ok: false, message: resolvedLabels.noOriginMessage };
        }

        const allTags = Object.values(selectedFilters).flat();

        const payload: RecommendationPayload = {
            purpose: selectedPurpose,
            user_selected_tags: allTags,
            location_name: resolvedLabels.locationName,
            current_lat: allPoints[0].lat,
            current_lng: allPoints[0].lng,
            users: allPoints.slice(1).map((point) => ({
                location: { lat: point.lat, lng: point.lng }
            }))
        };

        try {
            const data = await recommendMutation.mutateAsync(payload);
            setRecommendations(data);
            setActiveTabIdx(0);
            setCurrentDisplayRegion(data?.[0] || null);
            return { ok: true, data };
        } catch (error) {
            return { ok: false, message: resolvedLabels.errorMessage };
        }
    }, [
        includeMe,
        manualInputs,
        myLocation,
        myProfile,
        recommendMutation,
        resolvedLabels.errorMessage,
        resolvedLabels.locationName,
        resolvedLabels.noOriginMessage,
        selectedFilters,
        selectedFriends,
        selectedPurpose
    ]);

    const searchByQuery = useCallback(
        async (query: string, mainCategory?: string) => {
            const trimmed = query.trim();
            if (!trimmed) return null;

            const data = await searchMutation.mutateAsync({ query: trimmed, mainCategory });
            if (!data || data.length === 0) {
                return null;
            }

            const searchResultPlace = data.map((item: any, idx: number) => ({
                id: 90000 + idx,
                name: item.name,
                category: item.category || "Search Place",
                address: item.address,
                lat: item.lat,
                lng: item.lng,
                tags: [resolvedLabels.searchResultTag],
                score: 0,
                image: null
            }));

            const searchRegion = {
                region_name: resolvedLabels.searchRegionLabel(trimmed),
                center: {
                    lat: searchResultPlace[0].lat,
                    lng: searchResultPlace[0].lng
                },
                places: searchResultPlace,
                transit_info: null
            };

            setRecommendations([searchRegion]);
            setCurrentDisplayRegion(searchRegion);
            setActiveTabIdx(0);
            return searchRegion;
        },
        [resolvedLabels.searchRegionLabel, resolvedLabels.searchResultTag, searchMutation]
    );

    const isLoading = useMemo(
        () => recommendMutation.isPending || searchMutation.isPending,
        [recommendMutation.isPending, searchMutation.isPending]
    );

    return {
        recommendations,
        setRecommendations,
        currentDisplayRegion,
        setCurrentDisplayRegion,
        activeTabIdx,
        setActiveTabIdx,
        searchMidpoint,
        searchByQuery,
        isLoading
    };
};
