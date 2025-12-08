"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { HomeTab } from "@/components/ui/home-tab"
import { ChatTab } from "@/components/ui/chat-tab"
import { CommunityTab } from "@/components/ui/community-tab"
import { CalendarTab } from "@/components/ui/calendar-tab-v2"
import { MyPageTab } from "@/components/ui/mypage-tab"
import { SettingsTab } from "@/components/ui/settings-tab"
import { Map, MessageCircle, Users, Calendar, User } from "lucide-react"

export default function WeMeetApp() {
  const [activeTab, setActiveTab] = useState("home")
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    // 🚨 강제 리다이렉트 제거됨: 비로그인 상태에서도 홈 화면 접근 가능
  }, [])

  if (!isMounted) return null

  const renderContent = () => {
    switch (activeTab) {
      case "home": return <HomeTab />
      case "chat": return <ChatTab />
      case "community": return <CommunityTab />
      case "calendar": return <CalendarTab />
      case "mypage": return <MyPageTab />
      case "settings": return <SettingsTab />
      default: return <HomeTab />
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground sm:mx-auto sm:max-w-md sm:border-x overflow-hidden">
      <main className="flex-1 overflow-hidden relative">
        {renderContent()}
      </main>
      <nav className="flex h-16 flex-shrink-0 items-center justify-around border-t bg-white px-2 pb-safe z-30 shadow-[0_-5px_10px_rgba(0,0,0,0.02)]">
        <button onClick={() => setActiveTab("home")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "home" ? "text-[#2dd4bf]" : "text-gray-300 hover:text-gray-500"}`}>
          <Map className="h-6 w-6" />
        </button>
        <button onClick={() => setActiveTab("chat")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "chat" ? "text-[#2dd4bf]" : "text-gray-300 hover:text-gray-500"}`}>
          <MessageCircle className="h-6 w-6" />
        </button>
        <button onClick={() => setActiveTab("community")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "community" ? "text-[#2dd4bf]" : "text-gray-300 hover:text-gray-500"}`}>
          <Users className="h-6 w-6" />
        </button>
        <button onClick={() => setActiveTab("calendar")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "calendar" ? "text-[#2dd4bf]" : "text-gray-300 hover:text-gray-500"}`}>
          <Calendar className="h-6 w-6" />
        </button>
        <button onClick={() => setActiveTab("mypage")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "mypage" ? "text-[#2dd4bf]" : "text-gray-300 hover:text-gray-500"}`}>
          <User className="h-6 w-6" />
        </button>
      </nav>
    </div>
  )
}