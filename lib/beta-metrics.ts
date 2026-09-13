export type RetentionMetric = {
  converted: number
  eligible: number
  pending: number
  rate: number | null
  observation_days: number
}

export type BetaMetrics = {
  definition_version: string
  as_of: string
  timezone: string
  summary: {
    active_crews: number
    repeat_crews: number
    verified_visits: number
    first_visit_crews: number
    credited_list_copies: number
    verified_feedback_responses: number
  }
  retention: { second_visit_28d: RetentionMetric; same_place_28d: RetentionMetric }
  cohorts: { week_start: string; crews: number; eligible: number; converted: number; pending: number; rate: number | null }[]
  series: { date: string; visits: number; crews: number; first_visit_crews: number }[]
  behavior_events: {
    source: string
    window_days: number
    counts: Record<string, number>
  }
  coverage: { unavailable: { key: string; reason: string }[] }
}

export const percent = (rate: number | null) => rate === null ? "관찰 대기" : `${(rate * 100).toFixed(1)}%`
