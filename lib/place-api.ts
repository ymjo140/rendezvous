import { fetchWithAuthJson } from "./api-client";
import type { DecisionCell } from "./decision-cell";

export type PlaceSearchResult = {
    id?: number;
    name: string;
    category?: string;
    address?: string;
    lat: number;
    lng: number;
    tags?: string[];
};

export type RecommendationPayload = {
    purpose: string;
    user_selected_tags: string[];
    location_name: string;
    current_lat: number;
    current_lng: number;
    users: { location: { lat: number; lng: number } }[];
    decision_cell?: DecisionCell;
    request_id?: string;
};

export const placeApi = {
    search: async (query: string, mainCategory?: string) => {
        const params = new URLSearchParams({ query });
        if (mainCategory) {
            params.set("main_category", mainCategory);
        }
        return fetchWithAuthJson<PlaceSearchResult[]>(`/api/places/search?${params.toString()}`);
    },
    searchDbOnly: async (query: string) => {
        const params = new URLSearchParams({ query, db_only: "true" });
        return fetchWithAuthJson<PlaceSearchResult[]>(`/api/places/search?${params.toString()}`);
    },
    autocomplete: async (query: string) => {
        const params = new URLSearchParams({ query });
        return fetchWithAuthJson<any[]>(`/api/places/autocomplete?${params.toString()}`);
    },
    recommend: async (payload: RecommendationPayload) => {
        return fetchWithAuthJson<any[]>(`/api/recommend`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    }
};
