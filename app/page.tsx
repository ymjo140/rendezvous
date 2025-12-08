"use client"

import { useState } from "react"
import { Map, MessageCircle, Calendar, User, Users } from "lucide-react"

// 🌟 모든 탭 컴포넌트 불러오기 (로직 생략 없음)
import { HomeTab } from "@/components/ui/home-tab"
import { CommunityTab } from "@/components/ui/community-tab"
import { ChatTab } from "@/components/ui/chat-tab"
import { CalendarTab } from "@/components/ui/calendar-tab"
import { MyPageTab } from "@/components/ui/mypage-tab"

export default function Page() {
  const [activeTab, setActiveTab] = useState("home")

  return (
    <div className="flex h-screen w-full flex-col bg-[#F3F4F6] mx-auto max-w-md shadow-2xl overflow-hidden font-['Pretendard']">
      
      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 overflow-hidden relative">
        {/* 1. 홈 탭 */}
        {activeTab === "home" && <HomeTab />}

        {/* 2. 커뮤니티 탭 (컴포넌트 연결) */}
        {activeTab === "community" && <CommunityTab />}

        {/* 3. 채팅 탭 (컴포넌트 연결) */}
        {activeTab === "chat" && <ChatTab />}

        {/* 4. 일정 탭 (컴포넌트 연결) */}
        {activeTab === "calendar" && <CalendarTab />}

        {/* 5. 마이페이지 탭 */}
        {activeTab === "mypage" && <MyPageTab />}
      </main>

      {/* 하단 네비게이션 바 */}
      <nav className="flex h-20 flex-shrink-0 items-center justify-around border-t border-gray-100 bg-white px-1 pb-2 z-30 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
        
        {/* 1. 홈 */}
        <button 
            onClick={() => setActiveTab("home")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "home" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <Map className={`w-6 h-6 ${activeTab === "home" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-bold">홈</span>
        </button>

        {/* 2. 커뮤니티 */}
        <button 
            onClick={() => setActiveTab("community")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "community" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <Users className={`w-6 h-6 ${activeTab === "community" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-medium">커뮤니티</span>
        </button>

        {/* 3. 채팅 */}
        <button 
            onClick={() => setActiveTab("chat")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "chat" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <MessageCircle className={`w-6 h-6 ${activeTab === "chat" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-medium">채팅</span>
        </button>

        {/* 4. 일정 */}
        <button 
            onClick={() => setActiveTab("calendar")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "calendar" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <Calendar className={`w-6 h-6 ${activeTab === "calendar" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-medium">일정</span>
        </button>

        {/* 5. 마이 */}
        <button 
            onClick={() => setActiveTab("mypage")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "mypage" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <User className={`w-6 h-6 ${activeTab === "mypage" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-medium">마이</span>
        </button>

      </nav>
    </div>
  )
}