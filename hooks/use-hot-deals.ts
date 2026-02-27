import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

export type HotDeal = {
  deal_id: number | string;
  benefit_title: string;
  description?: string;
  end_time?: string | null;
  store_id: number | string;
  store_name: string;
  image_url?: string | null;
};

export const useHotDeals = () => {
  return useQuery({
    queryKey: ["hotdeals"],
    queryFn: () => fetchJson<HotDeal[]>("/api/hotdeals"),
    staleTime: 60 * 1000,
    retry: 1,
  });
};
