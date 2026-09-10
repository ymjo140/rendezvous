import { redirect } from "next/navigation"
import { legacyCrewRoute } from "@/lib/legacy-crew-route"

export default async function LegacyRedirect({ params, searchParams }: {
  params: Promise<{ rest?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(legacyCrewRoute((await params).rest || [], await searchParams))
}
