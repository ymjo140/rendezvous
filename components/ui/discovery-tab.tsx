"use client"

import React, { useState, useRef } from "react"
import { 
    Search, MapPin, Heart, MessageCircle, Share2, Star, ChevronLeft, 
    MoreHorizontal, Utensils, X, Phone, Clock, ChevronRight, Plus,
    Image as ImageIcon, Camera, Send, Bookmark, Grid3X3, Play
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { motion, AnimatePresence } from "framer-motion"

// --- API URL ---
const API_URL = "https://wemeet-backend-xqlo.onrender.com";

// --- 더미 데이터 (SNS 게시물 + 가게 정보 연동) ---
const MOCK_FEEDS = [
    {
        id: 1,
        type: "image",
        images: ["https://images.unsplash.com/photo-1594834749740-74b3f6764be4?w=600&h=600&fit=crop"],
        author: { id: 1, name: "맛잘알_강남", avatar: "MJ", profileImage: "" },
        content: "강남역 오봉집 진짜 미쳤음... 낙지볶음 불향 대박 #강남맛집 #오봉집",
        likes: 1240,
        comments: 45,
        isLiked: false,
        isSaved: false,
        createdAt: "2시간 전",
        place: {
            id: 101, name: "오봉집 강남점", category: "한식", score: 4.8,
            address: "서울 강남구 강남대로 123", phone: "02-1234-5678",
            openTime: "11:00 - 22:00",
            menu: ["직화낙지볶음 (13,000원)", "보쌈정식 (12,000원)"],
            tags: ["웨이팅필수", "불맛", "가성비"]
        }
    },
    {
        id: 2,
        type: "image",
        images: ["https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=600&fit=crop"],
        author: { id: 2, name: "와인러버", avatar: "WL", profileImage: "" },
        content: "분위기 깡패 와인바 발견 데이트 코스로 강추!",
        likes: 850,
        comments: 12,
        isLiked: true,
        isSaved: false,
        createdAt: "5시간 전",
        place: {
            id: 102, name: "무드서울", category: "와인바", score: 4.9,
            address: "서울 강남구 압구정로", phone: "02-555-5555",
            openTime: "17:00 - 02:00",
            menu: ["치즈플래터 (25,000원)", "하우스와인 (15,000원)"],
            tags: ["데이트", "야경", "예약필수"]
        }
    },
    {
        id: 3,
        type: "video",
        images: ["https://images.unsplash.com/photo-1544148103-0773bf10d330?w=600&h=600&fit=crop"],
        author: { id: 3, name: "디저트요정", avatar: "DJ", profileImage: "" },
        content: "입에서 살살 녹는 수플레 팬케이크 웨이팅 1시간 했지만 후회 없음!",
        likes: 3200,
        comments: 150,
        isLiked: false,
        isSaved: true,
        createdAt: "1일 전",
        place: {
            id: 103, name: "플리퍼스", category: "카페", score: 4.5,
            address: "서울 강남구 테헤란로", phone: "02-987-6543",
            openTime: "10:30 - 21:00",
            menu: ["수플레팬케이크 (16,000원)", "딸기라떼 (7,000원)"],
            tags: ["디저트", "핫플", "사진맛집"]
        }
    },
    {
        id: 4,
        type: "image",
        images: ["https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&h=600&fit=crop"],
        author: { id: 4, name: "푸드파이터", avatar: "FF", profileImage: "" },
        content: "혼밥러의 성지 발견! 가성비 미쳤음",
        likes: 2100,
        comments: 89,
        isLiked: false,
        isSaved: false,
        createdAt: "3시간 전",
        place: {
            id: 104, name: "혼밥천국", category: "한식", score: 4.6,
            address: "서울 마포구 연남동", phone: "02-333-4444",
            openTime: "10:00 - 22:00",
            menu: ["된장찌개 (7,000원)", "제육정식 (8,000원)"],
            tags: ["혼밥", "가성비", "점심"]
        }
    },
    {
        id: 5,
        type: "image",
        images: ["https://images.unsplash.com/photo-1551024601-bec78aea704b?w=600&h=600&fit=crop"],
        author: { id: 5, name: "카페투어러", avatar: "CT", profileImage: "" },
        content: "이태원 숨은 카페 찾았다! 분위기 대박",
        likes: 1890,
        comments: 67,
        isLiked: true,
        isSaved: false,
        createdAt: "6시간 전",
        place: {
            id: 105, name: "숨은카페", category: "카페", score: 4.7,
            address: "서울 용산구 이태원로", phone: "02-777-8888",
            openTime: "11:00 - 23:00",
            menu: ["아메리카노 (5,500원)", "크로플 (8,000원)"],
            tags: ["분위기", "인스타", "조용한"]
        }
    },
    {
        id: 6,
        type: "video",
        images: ["https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=600&h=600&fit=crop"],
        author: { id: 6, name: "먹방유튜버", avatar: "MY", profileImage: "" },
        content: "이거 진짜 맛있어서 3번 갔음 ㄹㅇ",
        likes: 5400,
        comments: 234,
        isLiked: false,
        isSaved: false,
        createdAt: "12시간 전",
        place: {
            id: 106, name: "피자명가", category: "양식", score: 4.8,
            address: "서울 강남구 역삼동", phone: "02-222-3333",
            openTime: "11:30 - 22:00",
            menu: ["마르게리타 (18,000원)", "페퍼로니 (20,000원)"],
            tags: ["피자", "데이트", "분위기"]
        }
    },
];

// 인스타그램 탐색탭 그리드 사이즈 패턴 (큰 이미지와 작은 이미지 믹스)
const getGridClass = (index: number) => {
    const pattern = index % 10;
    // 0번째와 5번째는 큰 이미지 (2x2)
    if (pattern === 0) return "col-span-2 row-span-2";
    return "col-span-1 row-span-1";
};

export function DiscoveryTab() {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFeed, setSelectedFeed] = useState<any>(null);
    const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);
    const [feeds, setFeeds] = useState(MOCK_FEEDS);
    
    // 게시물 작성 관련 상태
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    const [newPostImages, setNewPostImages] = useState<string[]>([]);
    const [newPostContent, setNewPostContent] = useState("");
    const [isPosting, setIsPosting] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState("all");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 게시물 클릭 시 상세 뷰
    const handleFeedClick = (feed: any) => {
        setSelectedFeed(feed);
    };

    const closeDetail = () => {
        setSelectedFeed(null);
        setIsPlaceModalOpen(false);
    };

    // 좋아요 토글
    const handleLike = (feedId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setFeeds(feeds.map(f => 
            f.id === feedId 
                ? { ...f, isLiked: !f.isLiked, likes: f.isLiked ? f.likes - 1 : f.likes + 1 }
                : f
        ));
    };

    // 저장 토글
    const handleSave = (feedId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setFeeds(feeds.map(f => 
            f.id === feedId ? { ...f, isSaved: !f.isSaved } : f
        ));
    };

    // 이미지 선택
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const newImages: string[] = [];
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (e.target?.result) {
                        newImages.push(e.target.result as string);
                        if (newImages.length === files.length) {
                            setNewPostImages(prev => [...prev, ...newImages]);
                        }
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    };

    // 이미지 제거
    const removeImage = (index: number) => {
        setNewPostImages(prev => prev.filter((_, i) => i !== index));
    };

    // 게시물 업로드
    const handlePost = async () => {
        if (newPostImages.length === 0) return;
        
        setIsPosting(true);
        
        // 실제로는 API 호출
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const newPost = {
            id: Date.now(),
            type: "image" as const,
            images: newPostImages,
            author: { id: 999, name: "나", avatar: "ME", profileImage: "" },
            content: newPostContent,
            likes: 0,
            comments: 0,
            isLiked: false,
            isSaved: false,
            createdAt: "방금 전",
            place: null as any
        };
        
        setFeeds([newPost as any, ...feeds]);
        setNewPostImages([]);
        setNewPostContent("");
        setIsCreatePostOpen(false);
        setIsPosting(false);
    };

    // 필터된 피드
    const filteredFeeds = feeds.filter(feed => {
        if (selectedFilter === "all") return true;
        if (selectedFilter === "video") return feed.type === "video";
        if (selectedFilter === "food") return feed.place?.category === "한식" || feed.place?.category === "양식";
        if (selectedFilter === "cafe") return feed.place?.category === "카페";
        return true;
    });

    return (
        <div className="h-full bg-white flex flex-col font-['Pretendard'] relative">
            
            {/* 1. 상단 헤더 - 인스타그램 스타일 */}
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 z-10 bg-white">
                <div className="flex items-center justify-between mb-3">
                    <h1 className="text-xl font-bold">탐색</h1>
                    {/* 게시물 작성 버튼 */}
                    <Button 
                        onClick={() => setIsCreatePostOpen(true)}
                        size="icon"
                        className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-xl w-9 h-9"
                    >
                        <Plus className="w-5 h-5 text-white" />
                    </Button>
                </div>
                
                {/* 검색바 */}
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <Input 
                        placeholder="검색" 
                        className="pl-9 bg-gray-100 border-none h-10 text-sm rounded-xl" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                
                {/* 필터 탭 */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    <Badge 
                        variant={selectedFilter === "all" ? "default" : "outline"}
                        className={`px-4 py-2 rounded-full cursor-pointer transition-all ${
                            selectedFilter === "all" 
                                ? "bg-black text-white" 
                                : "text-gray-600 border-gray-200 hover:bg-gray-100"
                        }`}
                        onClick={() => setSelectedFilter("all")}
                    >
                        전체
                    </Badge>
                    <Badge 
                        variant={selectedFilter === "video" ? "default" : "outline"}
                        className={`px-4 py-2 rounded-full cursor-pointer transition-all ${
                            selectedFilter === "video" 
                                ? "bg-black text-white" 
                                : "text-gray-600 border-gray-200 hover:bg-gray-100"
                        }`}
                        onClick={() => setSelectedFilter("video")}
                    >
                        <Play className="w-3 h-3 mr-1" /> 릴스
                    </Badge>
                    <Badge 
                        variant={selectedFilter === "food" ? "default" : "outline"}
                        className={`px-4 py-2 rounded-full cursor-pointer transition-all ${
                            selectedFilter === "food" 
                                ? "bg-black text-white" 
                                : "text-gray-600 border-gray-200 hover:bg-gray-100"
                        }`}
                        onClick={() => setSelectedFilter("food")}
                    >
                        맛집
                    </Badge>
                    <Badge 
                        variant={selectedFilter === "cafe" ? "default" : "outline"}
                        className={`px-4 py-2 rounded-full cursor-pointer transition-all ${
                            selectedFilter === "cafe" 
                                ? "bg-black text-white" 
                                : "text-gray-600 border-gray-200 hover:bg-gray-100"
                        }`}
                        onClick={() => setSelectedFilter("cafe")}
                    >
                        카페
                    </Badge>
                </div>
            </div>

            {/* 2. 인스타그램 탐색탭 스타일 그리드 */}
            <div className="flex-1 overflow-y-auto bg-white">
                <div className="grid grid-cols-3 gap-0.5 p-0.5">
                    {filteredFeeds.map((feed, index) => (
                        <div 
                            key={feed.id} 
                            onClick={() => handleFeedClick(feed)}
                            className={`relative aspect-square cursor-pointer group overflow-hidden ${getGridClass(index)}`}
                        >
                            <img 
                                src={feed.images[0]} 
                                alt="" 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" 
                            />
                            
                            {/* 비디오 아이콘 */}
                            {feed.type === "video" && (
                                <div className="absolute top-2 right-2">
                                    <Play className="w-5 h-5 text-white drop-shadow-lg fill-white" />
                                </div>
                            )}
                            
                            {/* 여러 장 사진 아이콘 */}
                            {feed.images.length > 1 && (
                                <div className="absolute top-2 right-2">
                                    <Grid3X3 className="w-5 h-5 text-white drop-shadow-lg" />
                                </div>
                            )}
                            
                            {/* 호버 시 좋아요/댓글 수 표시 */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white font-semibold">
                                <div className="flex items-center gap-1">
                                    <Heart className="w-5 h-5 fill-white" />
                                    <span>{feed.likes >= 1000 ? `${(feed.likes/1000).toFixed(1)}K` : feed.likes}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <MessageCircle className="w-5 h-5 fill-white" />
                                    <span>{feed.comments}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="h-20" />
            </div>

            {/* 3. 게시물 상세 모달 - 인스타그램 스타일 */}
            <AnimatePresence>
                {selectedFeed && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                        onClick={closeDetail}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }} 
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white w-full max-w-lg mx-4 rounded-xl overflow-hidden max-h-[90vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* 헤더 */}
                            <div className="flex items-center justify-between p-3 border-b">
                                <div className="flex items-center gap-3">
                                    <Avatar className="w-8 h-8">
                                        <AvatarFallback className="text-xs bg-gradient-to-r from-purple-400 to-pink-400 text-white">
                                            {selectedFeed.author.avatar}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-semibold text-sm">{selectedFeed.author.name}</div>
                                        {selectedFeed.place && (
                                            <div className="text-xs text-gray-500">{selectedFeed.place.name}</div>
                                        )}
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={closeDetail}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                            
                            {/* 이미지 */}
                            <div className="aspect-square relative bg-black">
                                <img 
                                    src={selectedFeed.images[0]} 
                                    alt="" 
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            
                            {/* 액션 버튼 */}
                            <div className="p-3 border-b">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={(e) => handleLike(selectedFeed.id, e)}
                                            className="hover:opacity-60 transition-opacity"
                                        >
                                            <Heart className={`w-6 h-6 ${selectedFeed.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                                        </button>
                                        <button className="hover:opacity-60 transition-opacity">
                                            <MessageCircle className="w-6 h-6" />
                                        </button>
                                        <button className="hover:opacity-60 transition-opacity">
                                            <Send className="w-6 h-6" />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={(e) => handleSave(selectedFeed.id, e)}
                                        className="hover:opacity-60 transition-opacity"
                                    >
                                        <Bookmark className={`w-6 h-6 ${selectedFeed.isSaved ? 'fill-black' : ''}`} />
                                    </button>
                                </div>
                                <div className="mt-2 font-semibold text-sm">
                                    좋아요 {selectedFeed.likes.toLocaleString()}개
                                </div>
                            </div>
                            
                            {/* 내용 */}
                            <div className="p-3 flex-1 overflow-y-auto">
                                <p className="text-sm">
                                    <span className="font-semibold mr-2">{selectedFeed.author.name}</span>
                                    {selectedFeed.content}
                                </p>
                                <p className="text-xs text-gray-400 mt-2">{selectedFeed.createdAt}</p>
                                
                                {/* 가게 정보 버튼 */}
                                {selectedFeed.place && (
                                    <button 
                                        onClick={() => setIsPlaceModalOpen(true)}
                                        className="mt-3 w-full bg-gray-100 hover:bg-gray-200 rounded-xl p-3 flex items-center gap-3 transition-colors"
                                    >
                                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                            <Utensils className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div className="font-semibold text-sm">{selectedFeed.place.name}</div>
                                            <div className="text-xs text-gray-500 flex items-center gap-1">
                                                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                                {selectedFeed.place.score} · {selectedFeed.place.category}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-gray-400" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 4. 게시물 작성 모달 */}
            <Dialog open={isCreatePostOpen} onOpenChange={setIsCreatePostOpen}>
                <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-xl">
                    <DialogHeader className="p-4 border-b flex flex-row items-center justify-between">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                                setIsCreatePostOpen(false);
                                setNewPostImages([]);
                                setNewPostContent("");
                            }}
                        >
                            취소
                        </Button>
                        <DialogTitle className="text-base font-semibold">새 게시물</DialogTitle>
                        <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-blue-500 font-semibold hover:text-blue-600"
                            onClick={handlePost}
                            disabled={newPostImages.length === 0 || isPosting}
                        >
                            {isPosting ? "게시 중..." : "공유"}
                        </Button>
                    </DialogHeader>
                    
                    <div className="p-4">
                        {/* 이미지 미리보기 */}
                        {newPostImages.length > 0 ? (
                            <div className="relative mb-4">
                                <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                                    <img 
                                        src={newPostImages[0]} 
                                        alt="" 
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                {/* 여러 장일 때 인디케이터 */}
                                {newPostImages.length > 1 && (
                                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                                        {newPostImages.map((_, i) => (
                                            <div 
                                                key={i} 
                                                className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-blue-500' : 'bg-white/60'}`}
                                            />
                                        ))}
                                    </div>
                                )}
                                {/* 삭제 버튼 */}
                                <button 
                                    onClick={() => removeImage(0)}
                                    className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors mb-4"
                            >
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                    <ImageIcon className="w-8 h-8 text-gray-400" />
                                </div>
                                <p className="text-sm text-gray-500">사진을 선택하세요</p>
                                <p className="text-xs text-gray-400 mt-1">최대 10장까지 업로드 가능</p>
                            </div>
                        )}
                        
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleImageSelect}
                            className="hidden"
                        />
                        
                        {/* 이미지 추가 버튼 */}
                        {newPostImages.length > 0 && newPostImages.length < 10 && (
                            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                {newPostImages.map((img, i) => (
                                    <div key={i} className="relative flex-shrink-0">
                                        <img 
                                            src={img} 
                                            alt="" 
                                            className="w-16 h-16 rounded-lg object-cover"
                                        />
                                        <button 
                                            onClick={() => removeImage(i)}
                                            className="absolute -top-1 -right-1 bg-black/60 text-white p-0.5 rounded-full"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center hover:border-gray-300 flex-shrink-0"
                                >
                                    <Plus className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                        )}
                        
                        {/* 문구 입력 */}
                        <Textarea
                            placeholder="문구를 작성하세요..."
                            value={newPostContent}
                            onChange={(e) => setNewPostContent(e.target.value)}
                            className="resize-none border-none bg-gray-50 rounded-xl min-h-[100px] focus-visible:ring-0"
                        />
                        
                        {/* 추가 옵션 */}
                        <div className="mt-4 space-y-2">
                            <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <MapPin className="w-5 h-5 text-gray-400" />
                                    <span className="text-sm">위치 추가</span>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                            </button>
                            <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Utensils className="w-5 h-5 text-gray-400" />
                                    <span className="text-sm">장소 태그</span>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 5. 가게 상세 정보 모달 */}
            <Dialog open={isPlaceModalOpen} onOpenChange={setIsPlaceModalOpen}>
                <DialogContent className="sm:max-w-md rounded-t-3xl rounded-b-none bottom-0 top-auto translate-y-0 p-0 gap-0 overflow-hidden h-[70vh]">
                    {selectedFeed?.place && (
                        <>
                            <DialogHeader className="p-4 border-b flex flex-row items-center justify-between bg-white sticky top-0 z-10">
                                <div>
                                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                        {selectedFeed.place.name}
                                        <Badge variant="secondary" className="text-xs font-normal text-purple-600 bg-purple-50">
                                            {selectedFeed.place.category}
                                        </Badge>
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

                            <div className="overflow-y-auto p-4 space-y-6 bg-white pb-24">
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

                                <div>
                                    <h3 className="font-bold text-sm mb-3">대표 메뉴</h3>
                                    <div className="space-y-2">
                                        {selectedFeed.place.menu.map((m: string, i: number) => (
                                            <div key={i} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                                                <span>{m.split(' (')[0]}</span>
                                                <span className="font-bold">{m.split(' (')[1]?.replace(')', '')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {selectedFeed.place.tags.map((tag: string, i: number) => (
                                        <Badge key={i} variant="secondary" className="bg-gray-100 text-gray-600 font-normal">
                                            #{tag}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
                                <Button className="w-full h-12 text-base font-bold bg-purple-600 hover:bg-purple-700 rounded-xl">
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
