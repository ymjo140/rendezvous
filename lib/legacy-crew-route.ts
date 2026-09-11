// Encode each segment so an old shared URL always stays on this app.
export function legacyCrewRoute(parts: string[], params: Record<string, string | string[] | undefined>) {
  const path = parts.filter(part => part !== "" && part !== "." && part !== "..")
  if (path[0] === "groups" && path.length === 2) path[0] = "crew"
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.append(key, value)
    else if (Array.isArray(value)) value.forEach(v => query.append(key, v))
  }
  const suffix = query.toString()
  return "/" + path.map(encodeURIComponent).join("/") + (suffix ? "?" + suffix : "")
}
