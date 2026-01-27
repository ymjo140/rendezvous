import { useQuery } from "@tanstack/react-query";
import { fetchWithAuthJson } from "@/lib/api-client";

export type MeProfile = {
  id: number;
  name?: string;
  email?: string;
  location?: { lat?: number; lng?: number };
  location_name?: string;
};

export const useMe = () => {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchWithAuthJson<MeProfile>("/api/users/me"),
    staleTime: 60 * 1000,
    retry: 1,
  });

  return {
    me: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
};
