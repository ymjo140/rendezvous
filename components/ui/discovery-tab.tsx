"use client"

import React, { useState } from "react"
import { Search, MapPin, Heart, MessageCircle, Share2, Star, ChevronLeft, MoreHorizontal, Utensils, X, Phone, Clock, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { motion, AnimatePresence } from "framer-motion"

// --- 1. 더미 데이터 (SNS 게시물 + 가게 정보 연동) ---
const MOCK_FEEDS = [
    {
        id: 1,
        type: "shorts", // 숏폼 영상
        thumbnail: "https://images.unsplash.com/photo-1594834749740-74b3f6764be4?w=600&h=800&fit=crop",
        videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-eating-at-a-restaurant-4328-large.mp4", // 예시 비디오
        author: { name: "맛잘알_강남", avatar: "MJ" },
        content: "강남역 오봉집 진짜 미쳤음... 낙지볶음 불향 대박🔥🔥 #강남맛집 #오봉집 #낙지볶음",
        likes: 1240,
        comments: 45,
        // 🌟 게시물과 연결된 가게 정보 (DB에서 join된 데이터)
        place: {
            id: 101,
            name: "오봉집 강남점",
            category: "한식",
            score: 4.8,
            address: "서울 강남구 강남대로 123",
            phone: "02-1234-5678",
            openTime: "11:00 - 22:00",
            menu: ["직화낙지볶음 (13,000원)", "보쌈정식 (12,000원)"],
            tags: ["웨이팅필수", "불맛", "가성비"]
        }
    },
    {
        id: 2,
        type: "review", // 일반 사진 리뷰
        thumbnail: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=800&fit=crop",
        author: { name: "와인러버", avatar: "WL" },
        content: "분위기 깡패 와인바 발견 🍷 데이트 코스로 강추합니다!",
        likes: 850,
        comments: 12,
        place: {
            id: 102,
            name: "무드서울",
            category: "와인바",
            score: 4.9,
            address: "서울 강남구 압구정로",
            phone: "02-555-5555",
            openTime: "17:00 - 02:00",
            menu: ["치즈플래터 (25,000원)", "하우스와인 (15,000원)"],
            tags: ["데이트", "야경", "예약필수"]
        }
    },
    {
        id: 3,
        type: "shorts",
        thumbnail: "https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600&h=800&fit=crop",
        author: { name: "디저트요정", avatar: "DJ" },
        content: "입에서 살살 녹는 수플레 팬케이크 🥞 웨이팅 1시간 했지만 후회 없음!",
        likes: 3200,
        comments: 150,
        place: {
            id: 103,
            name: "플리퍼스",
            category: "카페",
            score: 4.5,
            address: "서울 강남구 테헤란로",
            phone: "02-987-6543",
            openTime: "10:30 - 21:00",
            menu: ["수플레팬케이크 (16,000원)", "딸기라떼 (7,000원)"],
            tags: ["디저트", "핫플", "사진맛집"]
        }
    }
];

// --- 2. 컴포넌트 ---

export function DiscoveryTab() {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFeed, setSelectedFeed] = useState<any>(null); // 클릭한 게시물 상세
    const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false); // 가게 정보 모달

    // 게시물 클릭 시 상세 뷰 오픈
    const handleFeedClick = (feed: any) => {
        setSelectedFeed(feed);
    };

    // 상세 뷰 닫기
    const closeDetail = () => {
        setSelectedFeed(null);
        setIsPlaceModalOpen(false);
    };

    return (
        <div className="h-full bg-white flex flex-col font-['Pretendard'] relative">
            
            {/* 1. 상단 검색 및 필터 (메인 화면) */}
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 z-10 bg-white">
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <Input 
                        placeholder="장소, 리뷰, 숏폼 검색..." 
                        className="pl-9 bg-gray-50 border-none h-10 text-sm rounded-xl" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                    <Badge variant="secondary" className="bg-black text-white px-3 py-1.5 rounded-full cursor-pointer">🔥 인기 급상승</Badge>
                    <Badge variant="outline" className="text-gray-600 border-gray-200 px-3 py-1.5 rounded-full cursor-pointer">🎥 숏폼</Badge>
                    <Badge variant="outline" className="text-gray-600 border-gray-200 px-3 py-1.5 rounded-full cursor-pointer">📝 찐리뷰</Badge>
                    <Badge variant="outline" className="text-gray-600 border-gray-200 px-3 py-1.5 rounded-full cursor-pointer">🍖 맛집</Badge>
                    <Badge variant="outline" className="text-gray-600 border-gray-200 px-3 py-1.5 rounded-full cursor-pointer">☕ 카페</Badge>
                </div>
            </div>

            {/* 2. 피드 그리드 (Pinterest 스타일) */}
            <div className="flex-1 overflow-y-auto p-2 bg-gray-50">
                <div className="columns-2 gap-2 space-y-2">
                    {MOCK_FEEDS.map((feed) => (
                        <div 
                            key={feed.id} 
                            onClick={() => handleFeedClick(feed)}
                            className="break-inside-avoid bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer relative group"
                        >
                            {/* 썸네일 */}
                            <div className="relative aspect-[3/4]">
                                <img src={feed.thumbnail} alt="" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 opacity-60" />
                                
                                {/* 뱃지 */}
                                <div className="absolute top-2 left-2">
                                    {feed.type === 'shorts' ? (
                                        <Badge className="bg-red-500/90 hover:bg-red-500 border-0 text-[10px] px-1.5">▶ Shorts</Badge>
                                    ) : (
                                        <Badge className="bg-gray-800/80 hover:bg-gray-800 border-0 text-[10px] px-1.5">Review</Badge>
                                    )}
                                </div>

                                {/* 하단 정보 */}
                                <div className="absolute bottom-3 left-3 right-3 text-white">
                                    <div className="font-bold text-sm line-clamp-1 mb-1">{feed.place.name}</div>
                                    <div className="text-xs opacity-90 line-clamp-2 mb-2">{feed.content}</div>
                                    <div className="flex items-center justify-between text-xs opacity-80">
                                        <div className="flex items-center gap-1">
                                            <Avatar className="w-4 h-4 border border-white/50">
                                                <AvatarFallback className="text-[8px]">{feed.author.avatar}</AvatarFallback>
                                            </Avatar>
                                            <span>{feed.author.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Heart className="w-3 h-3 fill-white" /> {feed.likes}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="h-20" /> {/* 하단 여백 */}
            </div>

            {/* 3. 상세 뷰 (Full Screen Modal - TikTok/Reels 스타일) */}
            <AnimatePresence>
                {selectedFeed && (
                    <motion.div 
                        initial={{ y: "100%" }} 
                        animate={{ y: 0 }} 
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="absolute inset-0 z-50 bg-black flex flex-col"
                    >
                        {/* 상단 네비게이션 */}
                        <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-center text-white bg-gradient-to-b from-black/50 to-transparent">
                            <button onClick={closeDetail} className="p-2 bg-black/20 rounded-full backdrop-blur-sm">
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                            <span className="font-bold text-sm">탐색</span>
                            <button className="p-2 bg-black/20 rounded-full backdrop-blur-sm">
                                <MoreHorizontal className="w-6 h-6" />
                            </button>
                        </div>

                        {/* 컨텐츠 영역 (이미지 or 비디오) */}
                        <div className="flex-1 relative flex items-center justify-center bg-gray-900">
                             {/* 실제로는 video 태그 등을 사용 */}
                            <img src={selectedFeed.thumbnail} className="w-full h-full object-cover opacity-90" alt="" />
                            
                            {/* 우측 인터랙션 버튼 */}
                            <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6 text-white z-20">
                                <div className="flex flex-col items-center gap-1">
                                    <div className="p-3 bg-white/10 backdrop-blur-md rounded-full active:scale-90 transition-transform">
                                        <Heart className="w-7 h-7" />
                                    </div>
                                    <span className="text-xs font-medium">{selectedFeed.likes}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="p-3 bg-white/10 backdrop-blur-md rounded-full active:scale-90 transition-transform">
                                        <MessageCircle className="w-7 h-7" />
                                    </div>
                                    <span className="text-xs font-medium">{selectedFeed.comments}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="p-3 bg-white/10 backdrop-blur-md rounded-full active:scale-90 transition-transform">
                                        <Share2 className="w-7 h-7" />
                                    </div>
                                    <span className="text-xs font-medium">공유</span>
                                </div>
                            </div>

                            {/* 하단 정보 & 가게 연결 버튼 */}
                            <div className="absolute bottom-0 left-0 right-0 p-5 pt-20 bg-gradient-to-t from-black via-black/60 to-transparent z-10 text-white">
                                <div className="flex items-center gap-2 mb-3">
                                    <Avatar className="w-9 h-9 border-2 border-white">
                                        <AvatarFallback className="text-black font-bold">{selectedFeed.author.avatar}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-bold text-sm">{selectedFeed.author.name}</div>
                                        <div className="text-xs opacity-70">서울 강남구 • 팔로우</div>
                                    </div>
                                </div>
                                
                                <p className="text-sm mb-4 leading-relaxed line-clamp-2">
                                    {selectedFeed.content} <span className="text-gray-400">...더보기</span>
                                </p>

                                {/* 🌟 핵심 기능: 가게 바로가기 버튼 */}
                                <button 
                                    onClick={() => setIsPlaceModalOpen(true)}
                                    className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white p-3 rounded-xl flex items-center justify-between transition-colors shadow-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                            <Utensils className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-sm flex items-center gap-1">
                                                {selectedFeed.place.name} <ChevronRight className="w-4 h-4 opacity-70"/>
                                            </div>
                                            <div className="text-xs opacity-80 flex items-center gap-1">
                                                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {selectedFeed.place.score} • {selectedFeed.place.category}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold">
                                        정보 보기
                                    </div>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 4. 가게 상세 정보 모달 (인스타그램 하단 시트 스타일) */}
            <Dialog open={isPlaceModalOpen} onOpenChange={setIsPlaceModalOpen}>
                <DialogContent className="sm:max-w-md rounded-t-3xl rounded-b-none bottom-0 top-auto translate-y-0 p-0 gap-0 overflow-hidden h-[80vh] font-['Pretendard']">
                    {selectedFeed && (
                        <>
                            {/* 헤더 */}
                            <DialogHeader className="p-4 border-b border-gray-100 flex flex-row items-center justify-between bg-white sticky top-0 z-10">
                                <div>
                                    <DialogTitle className="text-lg font-bold flex items-center gap-1">
                                        {selectedFeed.place.name}
                                        <Badge variant="secondary" className="text-xs font-normal text-purple-600 bg-purple-50">{selectedFeed.place.category}</Badge>
                                    </DialogTitle>
                                    <DialogDescription className="text-xs flex items-center gap-1 mt-1">
                                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> 
                                        <span className="text-black font-bold">{selectedFeed.place.score}</span> 
                                        <span className="text-gray-300">|</span> 
                                        리뷰 1,240개
                                    </DialogDescription>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setIsPlaceModalOpen(false)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </DialogHeader>

                            {/* 상세 내용 */}
                            <div className="overflow-y-auto p-4 space-y-6 bg-white pb-24">
                                {/* 액션 버튼 */}
                                <div className="grid grid-cols-4 gap-2">
                                    <Button variant="outline" className="flex flex-col h-14 gap-1 text-xs border-gray-200">
                                        <Phone className="w-4 h-4" /> 전화
                                    </Button>
                                    <Button variant="outline" className="flex flex-col h-14 gap-1 text-xs border-gray-200">
                                        <Heart className="w-4 h-4" /> 찜하기
                                    </Button>
                                    <Button variant="outline" className="flex flex-col h-14 gap-1 text-xs border-gray-200">
                                        <Share2 className="w-4 h-4" /> 공유
                                    </Button>
                                    <Button variant="outline" className="flex flex-col h-14 gap-1 text-xs border-gray-200">
                                        <MapPin className="w-4 h-4" /> 길찾기
                                    </Button>
                                </div>

                                {/* 기본 정보 */}
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                                        <div className="text-sm text-gray-600">{selectedFeed.place.address}</div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                                        <div className="text-sm text-gray-600">{selectedFeed.place.openTime}</div>
                                    </div>
                                </div>

                                {/* 대표 메뉴 */}
                                <div>
                                    <h3 className="font-bold text-sm mb-3">대표 메뉴</h3>
                                    <div className="space-y-2">
                                        {selectedFeed.place.menu.map((m: string, i: number) => (
                                            <div key={i} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                                                <span>{m.split(' (')[0]}</span>
                                                <span className="font-bold">{m.split(' (')[1].replace(')', '')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 태그 */}
                                <div className="flex flex-wrap gap-2">
                                    {selectedFeed.place.tags.map((tag: string, i: number) => (
                                        <Badge key={i} variant="secondary" className="bg-gray-100 text-gray-600 font-normal">#{tag}</Badge>
                                    ))}
                                </div>
                            </div>

                            {/* 하단 고정 버튼 */}
                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
                                <Button className="w-full h-12 text-base font-bold bg-[#7C3AED] hover:bg-[#6D28D9] rounded-xl shadow-lg">
                                    바로 예약하기
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}