import { fetchWithAuth } from "@/lib/api-client";

/**
 * 사용자 상호작용 로깅 (임베딩 학습 + CTR 측정용).
 * 비핵심 기능이라 실패해도 UX를 막지 않는다.
 */
export async function logVectorInteraction(payload: {
  place_id?: number;
  post_id?: string;
  action_type: string; // VIEW, CLICK, LIKE, SAVE, SHARE, DISMISS, ...
  recommendation_id?: number;
  position_in_list?: number;
  action_value?: number;
}) {
  try {
    await fetchWithAuth("/api/vector/interaction", {
      method: "POST",
      body: JSON.stringify({ action_value: 1.0, ...payload }),
    });
  } catch {
    /* 무시 */
  }
}

export type GroupRecResult = {
  algorithm: string;
  members_total: number;
  members_with_taste: number;
  recommendation_id?: number | null;
  recommendations: Array<{
    place_id: number;
    name: string;
    category?: string;
    address?: string;
    group_score?: number;
    min_member_score?: number;
    reason?: string;
    tags?: string[];
  }>;
};

/**
 * 그룹 취향 합성 추천 (Group Vector AI). user_ids 멤버들의 취향을 합성.
 */
export async function getGroupRecommendations(
  userIds: number[],
  limit = 10
): Promise<GroupRecResult | null> {
  try {
    const res = await fetchWithAuth("/api/vector/group-recommendations", {
      method: "POST",
      body: JSON.stringify({ user_ids: userIds, limit }),
    });
    if (!res.ok) return null;
    return (await res.json()) as GroupRecResult;
  } catch {
    return null;
  }
}
