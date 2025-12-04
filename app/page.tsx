"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { HomeTab } from "@/components/ui/home-tab"
import { ChatTab } from "@/components/ui/chat-tab"
import { CommunityTab } from "@/components/ui/community-tab"
import { CalendarTab } from "@/components/ui/calendar-tab"
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
    <div className="flex h-screen w-full flex-col bg-background text-foreground sm:mx-auto sm:max-w-md sm:border-x">
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
      <nav className="flex h-16 flex-shrink-0 items-center justify-around border-t bg-background px-2 pb-safe">
        <button onClick={() => setActiveTab("home")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "home" ? "text-indigo-600" : "text-muted-foreground hover:text-foreground"}`}><Map className="h-6 w-6" /><span className="text-[10px] font-medium">홈</span></button>
        <button onClick={() => setActiveTab("chat")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "chat" ? "text-indigo-600" : "text-muted-foreground hover:text-foreground"}`}><MessageCircle className="h-6 w-6" /><span className="text-[10px] font-medium">채팅</span></button>
        <button onClick={() => setActiveTab("community")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "community" ? "text-indigo-600" : "text-muted-foreground hover:text-foreground"}`}><Users className="h-6 w-6" /><span className="text-[10px] font-medium">모임</span></button>
        <button onClick={() => setActiveTab("calendar")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "calendar" ? "text-indigo-600" : "text-muted-foreground hover:text-foreground"}`}><Calendar className="h-6 w-6" /><span className="text-[10px] font-medium">일정</span></button>
        <button onClick={() => setActiveTab("mypage")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === "mypage" ? "text-indigo-600" : "text-muted-foreground hover:text-foreground"}`}><User className="h-6 w-6" /><span className="text-[10px] font-medium">마이</span></button>
      </nav>
    </div>
  )
}