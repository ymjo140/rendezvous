import { useQuery } from "@tanstack/react-query"
import { fetchJson } from "@/lib/api-client"

export type PurposeConfig = Record<string, {
  label: string
  mainCategory: string
  tabs: Record<string, { label: string; options: string[] }>
}>

export const useSystemConfig = () => {
  return useQuery({
    queryKey: ["system-config"],
    queryFn: () => fetchJson<PurposeConfig>("/api/system/config"),
    staleTime: 5 * 60 * 1000,
  })
}
