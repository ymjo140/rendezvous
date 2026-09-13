import { fetchWithAuth } from "@/lib/api-client";
import { loadDecisionCell, getRequestId } from "@/lib/decision-cell";

type LogPayload = {
  action_type: string;
  source: string;
  place_id?: number | null;
  meeting_id?: number | null;
  event_id?: number | null;
  offer_id?: number | null;
  metadata?: Record<string, any>;
};

const ACTION_ENDPOINT = "/api/ai/actions";

export const logAction = async (payload: LogPayload) => {
  try {
    const decisionCell = loadDecisionCell();
    const requestId = getRequestId();
    await fetchWithAuth(ACTION_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        request_id: requestId,
        decision_cell: decisionCell,
      }),
    });
  } catch (error) {
    console.warn("logAction failed", error);
  }
};

    
export type BetaEventName =
  | "crew_created"
  | "crew_member_joined"
  | "poll_created"
  | "decision_confirmed"
  | "visit_verified"
  | "village_viewed"
  | "menu_unlocked"
  | "mission_action_started"
  | "list_place_saved"
  | "partnership_benefit_confirmed"

type BetaEventPayload = {
  event_name: BetaEventName
  entity_type?: string
  entity_id?: string
  metadata?: Record<string, string | number | boolean>
}

const BETA_EVENT_ENDPOINT = "/api/analytics/events"

export const logBetaEvent = async (payload: BetaEventPayload) => {
  try {
    const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `beta-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const response = await fetchWithAuth(BETA_EVENT_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ ...payload, request_id: requestId }),
    })
    // Guests can browse the same screens; an unauthenticated observation is simply skipped.
    if (response.status !== 401 && !response.ok) return
  } catch {
    // Observation must never block the product action or navigation.
  }
}
