// A local check-in return path only; never redirect to arbitrary URLs.
const KEY = "post-login-checkin"
export function rememberCheckinReturn(path: string | null) {
  if (path && /^\/checkin\/\d+(?:\?rid=[A-Za-z0-9%._~-]+)?$/.test(path)) {
    sessionStorage.setItem(KEY, path)
  }
}
export function consumeCheckinReturn(): string | null {
  const path = sessionStorage.getItem(KEY)
  sessionStorage.removeItem(KEY)
  return path && /^\/checkin\/\d+(?:\?rid=[A-Za-z0-9%._~-]+)?$/.test(path) ? path : null
}
