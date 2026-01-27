"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { HomeTab } from "@/components/ui/home-tab"
import { ChatTab } from "@/components/ui/chat-tab" 
// 🌟 [수정 1] CalendarTab 제거하고 DiscoveryTab 추가
import { DiscoveryTab } from "@/components/ui/discovery-tab" 
import { MyPageTab } from "@/components/ui/mypage-tab"
import { HotDealTab } from "@/components/ui/hotdeal-tab"
// 🌟 [수정 2] 아이콘 변경: Calendar -> Compass (탐색용 나침반 아이콘)
import { Map, MessageCircle, Compass, User, Flame, Lock } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export default function Page() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("home")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  
  // 📤 공유된 게시물로 이동 (채팅에서 탐색탭으로)
  const [sharedPostId, setSharedPostId] = useState<string | null>(null)
  const [returnToRoomId, setReturnToRoomId] = useState<string | null>(null)
  
  // 채팅방 직접 열기용
  const [openRoomId, setOpenRoomId] = useState<string | null>(null)

  // 초기 로그인 상태 확인
  useEffect(() => {
    const token = localStorage.getItem("token")
    setIsLoggedIn(!!token)
  }, [])
  
  // 📤 공유된 게시물 이동 이벤트 리스너
  useEffect(() => {
    const handleNavigateToPost = (e: CustomEvent) => {
      const { postId, roomId } = e.detail;
      if (postId) {
        setReturnToRoomId(roomId); // 돌아갈 채팅방 ID 저장
        setSharedPostId(postId);
        setActiveTab("discovery");
      }
    };
    
    window.addEventListener("navigateToPost" as any, handleNavigateToPost);
    return () => window.removeEventListener("navigateToPost" as any, handleNavigateToPost);
  }, [])

  // 🌟 탭 변경 핸들러 (접근 제어 로직)
  const handleTabChange = (tab: string) => {
    // 1. 홈 탭은 무조건 접근 허용
    if (tab === "home") {
        setActiveTab("home")
        return
    }

    // 2. 다른 탭(탐색 포함)은 로그인 필요
    const token = localStorage.getItem("token")
    if (token) {
        setIsLoggedIn(true)
        setActiveTab(tab)
    } else {
        setIsLoggedIn(false)
        setShowLoginModal(true) // 로그인 유도 모달 띄우기
    }
  }

  const handleGoToLogin = () => {
      router.push("/login")
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[#F3F4F6] mx-auto max-w-md shadow-2xl overflow-hidden font-['Pretendard']">
      
      {/* 메인 콘텐츠 영역 */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === "home" && <HomeTab />}
        {activeTab === "hotdeals" && <HotDealTab />}
        {activeTab === "chat" && (
          <ChatTab 
            openRoomId={openRoomId} 
            onRoomOpened={() => setOpenRoomId(null)} 
          />
        )}
        {/* 🌟 [수정 3] activeTab이 'discovery'일 때 DiscoveryTab 렌더링 */}
        {activeTab === "discovery" && (
          <DiscoveryTab 
            sharedPostId={sharedPostId} 
            onBackFromShared={() => {
              setSharedPostId(null);
              if (returnToRoomId) {
                setOpenRoomId(returnToRoomId);
                setReturnToRoomId(null);
                setActiveTab("chat");
              }
            }}
          />
        )}
        {activeTab === "mypage" && <MyPageTab />}
      </main>

      {/* 하단 네비게이션 바 */}
      <nav className="flex h-20 flex-shrink-0 items-center justify-around border-t border-gray-100 bg-white px-2 pb-2 z-30 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
        
        {/* 1. 홈 (누구나 접근 가능) */}
        <button 
            onClick={() => handleTabChange("home")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "home" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <Map className={`w-6 h-6 ${activeTab === "home" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-bold">홈</span>
        </button>

        {/* 2. 채팅 (로그인 필요) */}
        <button 
            onClick={() => handleTabChange("chat")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "chat" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <MessageCircle className={`w-6 h-6 ${activeTab === "chat" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-medium">채팅</span>
        </button>

        {/* 3. 커뮤니티 (로그인 필요) */}
        <button 
            onClick={() => handleTabChange("hotdeals")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "hotdeals" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <Flame className={`w-6 h-6 ${activeTab === "hotdeals" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-medium">커뮤니티</span>
        </button>

        {/* 🌟 [수정 4] 일정 -> 탐색 (아이콘 및 텍스트 변경) */}
        <button 
            onClick={() => handleTabChange("discovery")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "discovery" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          {/* Compass 아이콘 사용 */}
          <Compass className={`w-6 h-6 ${activeTab === "discovery" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-medium">탐색</span>
        </button>

        {/* 5. 마이 (로그인 필요) */}
        <button 
            onClick={() => handleTabChange("mypage")} 
            className={`flex flex-col items-center gap-1 p-2 w-14 transition-all duration-300 ${
                activeTab === "mypage" ? "text-[#7C3AED] -translate-y-1" : "text-gray-300 hover:text-gray-400"
            }`}
        >
          <User className={`w-6 h-6 ${activeTab === "mypage" ? "fill-[#7C3AED]/10" : ""}`} />
          <span className="text-[10px] font-medium">마이</span>
        </button>

      </nav>

      {/* 로그인 유도 모달 */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-xs rounded-3xl p-6 font-['Pretendard']">
            <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center">
                    <Lock className="w-7 h-7 text-[#7C3AED]" />
                </div>
                <div>
                    <DialogTitle className="text-lg font-bold mb-1">로그인이 필요해요</DialogTitle>
                    <DialogDescription className="text-xs text-gray-500">
                        회원가입하고 채팅, 모임, 일정 관리 등<br/>더 많은 기능을 사용해보세요!
                    </DialogDescription>
                </div>
                <div className="w-full space-y-2 mt-2">
                    <Button onClick={handleGoToLogin} className="w-full h-11 bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold rounded-xl shadow-sm">
                        <MessageCircle className="w-4 h-4 mr-2 fill-black border-none"/> 카카오로 3초 시작
                    </Button>
                    <Button variant="ghost" onClick={() => setShowLoginModal(false)} className="w-full h-11 rounded-xl text-gray-500">
                        나중에 할게요
                    </Button>
                </div>
            </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}