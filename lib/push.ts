"use client"

// FCM 푸시 등록 — Capacitor 앱(웹뷰) 안에서만 동작, 브라우저에선 조용히 no-op.
// Capacitor 브릿지는 server.url 원격 페이지에도 주입되므로 window.Capacitor로 감지.
import { fetchWithAuth } from "@/lib/api-client"

declare global {
  interface Window {
    Capacitor?: any
  }
}

function getPushPlugin(): any | null {
  try {
    const cap = window.Capacitor
    if (!cap?.isPluginAvailable?.("PushNotifications")) return null
    return cap.Plugins?.PushNotifications || null
  } catch {
    return null
  }
}

let initialized = false

/** 로그인 후 호출 — 권한 요청 → FCM 토큰 발급 → 서버 등록 + 탭 열기 리스너. */
export async function initPushNotifications(): Promise<void> {
  if (initialized) return
  const push = getPushPlugin()
  if (!push) return // 브라우저/미지원 — no-op
  if (!localStorage.getItem("token")) return // 비로그인
  initialized = true

  try {
    // 토큰 수신 → 서버 등록
    push.addListener("registration", async (t: { value: string }) => {
      try {
        await fetchWithAuth("/api/push/register", {
          method: "POST",
          body: JSON.stringify({ token: t.value, platform: "android" }),
        })
        localStorage.setItem("push_token", t.value)
      } catch { /* graceful */ }
    })

    // 알림 탭 → 해당 채팅방 열기
    push.addListener("pushNotificationActionPerformed", (action: any) => {
      const roomId = action?.notification?.data?.room_id
      if (roomId) {
        try {
          sessionStorage.setItem("activeTab", "chat")
          window.dispatchEvent(new CustomEvent("push:openRoom", { detail: { roomId } }))
        } catch { /* ignore */ }
      }
    })

    // Android 8+ 알림 채널(백엔드 payload의 channel_id와 일치해야 표시됨)
    try {
      await push.createChannel?.({
        id: "rendezvous",
        name: "랑데부 알림",
        description: "채팅·투표·모임 알림",
        importance: 4,
        visibility: 1,
      })
    } catch { /* iOS 등 미지원 */ }

    const perm = await push.requestPermissions()
    if (perm?.receive === "granted") {
      await push.register()
    }
  } catch {
    initialized = false
  }
}
