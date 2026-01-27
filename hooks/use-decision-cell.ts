import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DecisionCell,
  getDefaultDecisionCell,
  loadDecisionCell,
  saveDecisionCell,
  updateDecisionCell as updateDecisionCellStorage,
  getRequestId,
  resetRequestId as resetRequestIdStorage,
} from "@/lib/decision-cell";

export const useDecisionCell = () => {
  const [decisionCell, setDecisionCell] = useState<DecisionCell>(getDefaultDecisionCell());
  const [requestId, setRequestId] = useState("");

  useEffect(() => {
    const loaded = loadDecisionCell();
    setDecisionCell(loaded);
    setRequestId(getRequestId());
  }, []);

  const updatePartial = useCallback((partial: Partial<DecisionCell>) => {
    const next = updateDecisionCellStorage(partial);
    setDecisionCell(next);
  }, []);

  const resetRequestId = useCallback(() => {
    const next = resetRequestIdStorage();
    setRequestId(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({
      decisionCell,
      requestId,
      updatePartial,
      resetRequestId,
    }),
    [decisionCell, requestId, updatePartial, resetRequestId]
  );

  return value;
};
