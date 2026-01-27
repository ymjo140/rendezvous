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
