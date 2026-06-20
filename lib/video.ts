"use client"

import { fetchWithAuth } from "@/lib/api-client"

// 숏폼 영상 업로드 — 백엔드(/api/posts/upload-media) 경유 Supabase Storage.
// 영상은 용량이 커서 base64 DB저장 대신 Storage URL만 게시물에 담는다.

export const MAX_VIDEO_MB = 50
export const MAX_VIDEO_SECONDS = 60
const ALLOWED = ["video/mp4", "video/quicktime", "video/webm"]

export type VideoMeta = { duration: number; width: number; height: number }

/** 영상 길이/해상도 메타 읽기(클라) — 길이 제한 사전 검증용 */
export function readVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    v.preload = "metadata"
    v.onloadedmetadata = () => {
      const meta = { duration: v.duration || 0, width: v.videoWidth, height: v.videoHeight }
      URL.revokeObjectURL(url)
      resolve(meta)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("영상 정보를 읽지 못했어요."))
    }
    v.src = url
  })
}

/** 영상 첫 프레임을 캡처해 포스터(썸네일) dataURL 생성 — 그리드/프리뷰용 */
export function captureVideoPoster(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    v.preload = "metadata"
    v.muted = true
    v.playsInline = true
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.1, (v.duration || 1) / 2)
      } catch {
        resolve(null)
      }
    }
    v.onseeked = () => {
      try {
        const canvas = document.createElement("canvas")
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, 1))
        canvas.width = Math.round(v.videoWidth * scale)
        canvas.height = Math.round(v.videoHeight * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve(null)
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        const poster = canvas.toDataURL("image/jpeg", 0.7)
        URL.revokeObjectURL(url)
        resolve(poster)
      } catch {
        URL.revokeObjectURL(url)
        resolve(null)
      }
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    v.src = url
  })
}

export async function validateAndUploadVideo(file: File): Promise<{ url: string }> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("mp4 / mov / webm 영상만 올릴 수 있어요.")
  }
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`영상은 ${MAX_VIDEO_MB}MB 이하만 올릴 수 있어요.`)
  }
  try {
    const meta = await readVideoMeta(file)
    if (meta.duration > MAX_VIDEO_SECONDS + 1) {
      throw new Error(`숏폼은 ${MAX_VIDEO_SECONDS}초 이하 영상만 올릴 수 있어요.`)
    }
  } catch (e: any) {
    // 메타 못 읽어도 업로드는 시도(일부 코덱) — 길이 초과 메시지는 그대로 전파
    if (e?.message?.includes("초")) throw e
  }

  const form = new FormData()
  form.append("file", file)
  // fetchWithAuth는 Content-Type을 JSON으로 강제하지 않도록 FormData면 헤더 생략됨
  const res = await fetchWithAuth("/api/posts/upload-media", {
    method: "POST",
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.detail || "영상 업로드에 실패했어요.")
  }
  return res.json()
}
