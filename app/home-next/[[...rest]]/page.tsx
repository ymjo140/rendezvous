import { redirect } from "next/navigation"

// 라우트 스왑(v2 → 루트) 이전에 공유된 /home-next/... 링크 호환용.
// 카톡으로 나간 크루 초대 링크가 여기로 들어와 같은 경로의 루트로 넘어간다.
export default async function LegacyHomeNextRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ rest?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { rest } = await params
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v)
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0])
  }
  const q = qs.toString()
  redirect("/" + (rest ?? []).join("/") + (q ? "?" + q : ""))
}
