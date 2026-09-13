"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchWithAuth } from "@/lib/api-client"

type ResourceState<T> = {
  path: string | null
  data: T | null
  error: string | null
  loading: boolean
  refreshing: boolean
}

type CacheEntry = {
  data: unknown
  updatedAt: number
}

const resourceCache = new Map<string, CacheEntry>()
const STALE_AFTER_MS = 30_000
const MIN_REFRESH_INTERVAL_MS = 5_000

function cacheKey(path: string) {
  let token = "guest"
  try {
    token = localStorage.getItem("token") || "guest"
  } catch {
    /* localStorage may be unavailable in private browsing */
  }
  return token + ":" + path
}

function readCache<T>(path: string | null) {
  if (!path) return null
  const entry = resourceCache.get(cacheKey(path))
  return entry ? { data: entry.data as T, updatedAt: entry.updatedAt } : null
}

function writeCache<T>(path: string, data: T) {
  resourceCache.set(cacheKey(path), { data, updatedAt: Date.now() })
}

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
  const [state, setState] = useState<ResourceState<T>>(() => {
    const cached = readCache<T>(path)
    return {
      path,
      data: cached?.data ?? null,
      error: null,
      loading: !!path && !cached,
      refreshing: !!path && !!cached,
    }
  })
  const lastRefreshAt = useRef(0)

  const reload = useCallback(() => {
    const now = Date.now()
    if (now - lastRefreshAt.current < MIN_REFRESH_INTERVAL_MS) return
    lastRefreshAt.current = now
    setVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const cached = readCache<T>(path)
    const cacheIsFresh = !!cached && version === 0 && Date.now() - cached.updatedAt < STALE_AFTER_MS

    setState((previous) => {
      const retained = cached?.data ?? (previous.path === path ? previous.data : null)
      return {
        path,
        data: retained,
        error: null,
        loading: !!path && !retained,
        refreshing: !!path && !cacheIsFresh && !!retained,
      }
    })

    if (!path || cacheIsFresh) {
      return () => controller.abort()
    }

    fetchWithAuth(path, { signal: controller.signal })
      .then(readApi<T>)
      .then((data) => {
        writeCache(path, data)
        if (!controller.signal.aborted) {
          setState({ path, data, error: null, loading: false, refreshing: false })
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState((previous) => ({
          ...previous,
          path,
          error: error instanceof Error ? error.message : "불러오지 못했어요.",
          loading: !previous.data,
          refreshing: false,
        }))
      })

    return () => controller.abort()
  }, [path, version])

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) reload()
    }
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
  if (state.path === path) return { ...state, reload }
  return {
    data: null,
    error: null,
    loading: !!path,
    refreshing: false,
    reload,
  }
}
