import { redirect } from "next/navigation"
import { legacyCrewRoute } from "@/lib/legacy-crew-route"

export default async function GroupRedirect({ params, searchParams }: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { groupId } = await params
  redirect(legacyCrewRoute(["crew", groupId], await searchParams))
}
