// A local check-in return path only; never redirect to arbitrary URLs.
const KEY = "post-login-checkin"
export function safeCheckinReturn(path: string | null): string | null {
  if (!path || !/^\/checkin\/[1-9]\d*(?:\?[^#]*)?$/.test(path)) return null
  const url = new URL(path, "https://checkin.invalid")
  const keys = Array.from(url.searchParams.keys())
  if (new Set(keys).size !== keys.length || keys.some(k => k !== "rid" && k !== "cid")) return null
  if (Array.from(url.searchParams.values()).some(v => !/^[A-Za-z0-9._~-]{1,100}$/.test(v))) return null
  return url.pathname + url.search
}
export function rememberCheckinReturn(path: string | null) {
  const safe = safeCheckinReturn(path)
  try { if (safe) sessionStorage.setItem(KEY, safe); else sessionStorage.removeItem(KEY) } catch { /* optional return preference */ }
}
export function consumeCheckinReturn(): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return safeCheckinReturn(path)
  } catch { return null }
}
