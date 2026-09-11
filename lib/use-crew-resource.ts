"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchWithAuth } from "@/lib/api-client"

export async function readApi<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof body?.detail === "string" ? body.detail
      : response.status === 401 ? "로그인 후 다시 시도해주세요."
      : "불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.")
  }
  return body as T
}

export function crewActivityChanged() {
  window.dispatchEvent(new Event("crew:activity"))
}

export function useCrewResource<T>(path: string | null) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null; loading: boolean }>({
    path: null, data: null, error: null, loading: true,
  })
  const reload = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setState({ path, data: null, error: null, loading: !!path })
    if (path) {
      fetchWithAuth(path, { signal: controller.signal }).then(readApi<T>)
        .then(data => { if (!controller.signal.aborted) setState({ path, data, error: null, loading: false }) })
        .catch(e => { if (!controller.signal.aborted) setState({ path, data: null, error: e.message, loading: false }) })
    }
    return () => controller.abort()
  }, [path, version])
  useEffect(() => {
    const refresh = () => { if (!document.hidden) reload() }
    window.addEventListener("focus", refresh)
    window.addEventListener("crew:activity", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener("crew:activity", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [reload])
  // A render for crew B must never expose A's data, even before effect cleanup.
  return state.path === path ? { ...state, reload } : { data: null, error: null, loading: !!path, reload }
}
