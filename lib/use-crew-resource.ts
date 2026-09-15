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
const PERSISTED_MAX_AGE_MS = 15 * 60_000

/** 화면을 다시 열 때도 먼저 보여줄 가치가 있는 크루 리소스만 저장한다. */
function shouldPersist(path: string | null): path is string {
  return Boolean(path && (path === "/api/home/feed" || path.startsWith("/api/groups/") || path.startsWith("/api/group-ranking")))
}

function storageKey(path: string) {
  return `rendezvous:resource:${cacheKey(path)}`
}

function cacheKey(path: string) {
  let token = "guest"
  try {
    token = localStorage.getItem("token") || "guest"
  } catch {
    /* localStorage may be unavailable in private browsing */
  }
  return token + ":" + path
}

function readMemoryCache<T>(path: string | null) {
  if (!path) return null
  const entry = resourceCache.get(cacheKey(path))
  return entry ? { data: entry.data as T, updatedAt: entry.updatedAt } : null
}

function readCache<T>(path: string | null) {
  if (!path) return null
  const key = cacheKey(path)
  const memory = readMemoryCache<T>(path)
  if (memory) return { data: memory.data as T, updatedAt: memory.updatedAt }
  if (!shouldPersist(path) || typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey(path))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!parsed || Date.now() - parsed.updatedAt > PERSISTED_MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(path))
      return null
    }
    resourceCache.set(key, { data: parsed.data, updatedAt: parsed.updatedAt })
    return { data: parsed.data as T, updatedAt: parsed.updatedAt }
  } catch {
    return null
  }
}

function writeCache<T>(path: string, data: T) {
  const entry = { data, updatedAt: Date.now() }
  resourceCache.set(cacheKey(path), entry)
  if (!shouldPersist(path) || typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(path), JSON.stringify(entry))
  } catch {
    // 저장 공간이 부족한 환경에서도 메모리 캐시만으로 정상 동작한다.
  }
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
    // localStorage는 서버 렌더와 클라이언트 첫 렌더의 결과를 다르게 만들 수
    // 있으므로 초기화에서는 메모리 캐시만 읽는다. 영속 캐시는 effect에서
    // 즉시 복원해 hydration mismatch 없이 빠른 stale-while-revalidate를 유지한다.
    const cached = readMemoryCache<T>(path)
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
