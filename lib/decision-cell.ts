export type TimeBlock = {
  start: string;
  end: string;
};

export type DecisionCell = {
  date: string;
  time_block: TimeBlock;
  party_size: number;
  party_size_bucket?: string;
  day_of_week?: number;
};

const DECISION_CELL_KEY = "rdv_decision_cell_v1";
const REQUEST_ID_KEY = "rdv_request_id_v1";

const DEFAULT_TIME_BLOCK: TimeBlock = { start: "18:00", end: "20:00" };
const DEFAULT_PARTY_SIZE = 2;

const ensureDateString = (value: string) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getDayOfWeek = (dateStr: string) => {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.getDay();
};

const bucketPartySize = (size: number) => {
  if (!size || size <= 2) return "2";
  if (size <= 4) return "4";
  return "6+";
};

const getDefaultDate = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const getDefaultDecisionCell = (): DecisionCell => {
  const date = getDefaultDate();
  return {
    date,
    time_block: { ...DEFAULT_TIME_BLOCK },
    party_size: DEFAULT_PARTY_SIZE,
    party_size_bucket: bucketPartySize(DEFAULT_PARTY_SIZE),
    day_of_week: getDayOfWeek(date),
  };
};

export const normalizeDecisionCell = (input?: Partial<DecisionCell>): DecisionCell => {
  const base = getDefaultDecisionCell();
  const date = ensureDateString(input?.date || base.date);
  const timeBlock = input?.time_block || base.time_block;
  const partySize = input?.party_size || base.party_size;
  return {
    date,
    time_block: {
      start: timeBlock?.start || base.time_block.start,
      end: timeBlock?.end || base.time_block.end,
    },
    party_size: partySize,
    party_size_bucket: bucketPartySize(partySize),
    day_of_week: getDayOfWeek(date),
  };
};

export const loadDecisionCell = (): DecisionCell => {
  if (typeof window === "undefined") return getDefaultDecisionCell();
  const raw = sessionStorage.getItem(DECISION_CELL_KEY);
  if (!raw) return getDefaultDecisionCell();
  try {
    const parsed = JSON.parse(raw) as Partial<DecisionCell>;
    return normalizeDecisionCell(parsed);
  } catch {
    return getDefaultDecisionCell();
  }
};

export const saveDecisionCell = (cell: DecisionCell) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DECISION_CELL_KEY, JSON.stringify(cell));
};

export const getRequestId = () => {
  if (typeof window === "undefined") return "";
  let existing = sessionStorage.getItem(REQUEST_ID_KEY);
  if (!existing) {
    existing = generateRequestId();
    sessionStorage.setItem(REQUEST_ID_KEY, existing);
  }
  return existing;
};

export const resetRequestId = () => {
  if (typeof window === "undefined") return "";
  const next = generateRequestId();
  sessionStorage.setItem(REQUEST_ID_KEY, next);
  return next;
};

export const updateDecisionCell = (partial: Partial<DecisionCell>) => {
  const next = normalizeDecisionCell({ ...loadDecisionCell(), ...partial });
  saveDecisionCell(next);
  return next;
};

const generateRequestId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const DECISION_CELL_STORAGE_KEYS = {
  decisionCell: DECISION_CELL_KEY,
  requestId: REQUEST_ID_KEY,
};
