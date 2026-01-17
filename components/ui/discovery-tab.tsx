"use client"

import React, { useState, useRef, useEffect } from "react"
import { 
    Search, MapPin, Heart, MessageCircle, Share2, Star, ChevronLeft, 
    MoreHorizontal, Utensils, X, Phone, Clock, ChevronRight, Plus,
    Image as ImageIcon, Camera, Send, Bookmark, Grid3X3, Play, Wand2,
    FolderPlus, Check, MessageSquare, Users, ShoppingBag, Trash2
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { motion, AnimatePresence } from "framer-motion"
import { PhotoEditor } from "@/components/ui/photo-editor"

// 폴더 타입
interface SaveFolder {
    id: number;
    name: string;
    icon: string;
    color: string;
    is_default: boolean;
    item_count: number;
}

// 채팅방 타입
interface ChatRoom {
    id: string;
    title: string;
    is_group: boolean;
    member_count: number;
}

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
    const [isLoading, setIsLoading] = useState(false);
    
    // 게시물 작성 관련 상태
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    const [newPostImages, setNewPostImages] = useState<string[]>([]);
    const [newPostContent, setNewPostContent] = useState("");
    const [isPosting, setIsPosting] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState("all");
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // 사진 편집 관련 상태
    const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
    const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
    const [tempImageForEdit, setTempImageForEdit] = useState<string>("");
    
    // 🤖 AI 추천 관련 상태
    const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [showAiSection, setShowAiSection] = useState(true);
    
    // 💾 저장 폴더 관련 상태
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [savingItem, setSavingItem] = useState<{type: string, postId?: string, placeId?: number} | null>(null);
    const [folders, setFolders] = useState<SaveFolder[]>([]);
    const [foldersLoading, setFoldersLoading] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
    
    // 📤 공유 관련 상태
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [sharingItem, setSharingItem] = useState<any>(null);
    const [shareMode, setShareMode] = useState<"direct" | "cart">("direct");
    const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
    const [roomsLoading, setRoomsLoading] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [shareMessage, setShareMessage] = useState("");
    const [cartItems, setCartItems] = useState<any[]>([]);
    
    // 🤖 AI 추천 불러오기
    useEffect(() => {
        const fetchAiRecommendations = async () => {
            try {
                setAiLoading(true);
                const token = localStorage.getItem("token");
                const res = await fetch(`${API_URL}/api/ai/recommendations?limit=6`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.recommendations && data.recommendations.length > 0) {
                        setAiRecommendations(data.recommendations);
                    }
                }
            } catch (error) {
                console.log("AI 추천 로드 오류:", error);
            } finally {
                setAiLoading(false);
            }
        };
        
        fetchAiRecommendations();
    }, []);
    
    // 🤖 AI 행동 기록 함수
    const recordAiAction = async (actionType: string, placeId?: number) => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            
            await fetch(`${API_URL}/api/ai/actions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    action_type: actionType,
                    place_id: placeId,
                    context: { source: "discovery_tab" }
                })
            });
        } catch (error) {
            // 실패해도 무시 (사용자 경험에 영향 없음)
        }
    };
    
    // 💾 폴더 목록 불러오기
    const fetchFolders = async () => {
        try {
            setFoldersLoading(true);
            const token = localStorage.getItem("token");
            if (!token) {
                setFoldersLoading(false);
                return;
            }
            
            const res = await fetch(`${API_URL}/api/folders`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                setFolders(data);
            }
        } catch (error) {
            console.error("폴더 로드 오류:", error);
        } finally {
            setFoldersLoading(false);
        }
    };
    
    // 💾 새 폴더 생성
    const createFolder = async () => {
        if (!newFolderName.trim()) return;
        
        try {
            setIsCreatingFolder(true);
            const token = localStorage.getItem("token");
            if (!token) return;
            
            const res = await fetch(`${API_URL}/api/folders`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: newFolderName.trim() })
            });
            
            if (res.ok) {
                const newFolder = await res.json();
                setFolders(prev => [...prev, newFolder]);
                setNewFolderName("");
                setSelectedFolderId(newFolder.id);
            }
        } catch (error) {
            console.error("폴더 생성 오류:", error);
        } finally {
            setIsCreatingFolder(false);
        }
    };
    
    // 💾 아이템 저장
    const saveToFolder = async () => {
        if (!selectedFolderId || !savingItem) return;
        
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("로그인이 필요합니다.");
                return;
            }
            
            const res = await fetch(`${API_URL}/api/saves`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    folder_id: selectedFolderId,
                    item_type: savingItem.type,
                    post_id: savingItem.postId,
                    place_id: savingItem.placeId
                })
            });
            
            if (res.ok) {
                // UI 업데이트
                if (savingItem.postId) {
                    const feedIdStr = savingItem.postId;
                    setFeeds(feeds.map(f => 
                        String(f.id) === feedIdStr ? { ...f, isSaved: true } : f
                    ));
                    if (selectedFeed && String(selectedFeed.id) === feedIdStr) {
                        setSelectedFeed((prev: any) => prev ? { ...prev, isSaved: true } : null);
                    }
                }
                
                setIsSaveModalOpen(false);
                setSavingItem(null);
                setSelectedFolderId(null);
                
                // AI 학습 기록
                if (savingItem.placeId) {
                    recordAiAction("save", savingItem.placeId);
                }
            }
        } catch (error) {
            console.error("저장 오류:", error);
            alert("저장 중 오류가 발생했습니다.");
        }
    };
    
    // 📤 채팅방 목록 불러오기
    const fetchChatRooms = async () => {
        try {
            setRoomsLoading(true);
            const token = localStorage.getItem("token");
            if (!token) return;
            
            const res = await fetch(`${API_URL}/api/share/rooms`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                setChatRooms(data.rooms || []);
            }
        } catch (error) {
            console.error("채팅방 로드 오류:", error);
        } finally {
            setRoomsLoading(false);
        }
    };
    
    // 📤 담기에 추가
    const addToCart = async (item: any) => {
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("로그인이 필요합니다.");
                return;
            }
            
            const res = await fetch(`${API_URL}/api/share-cart`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    item_type: item.type,
                    post_id: item.postId,
                    place_id: item.placeId
                })
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.already_added) {
                    // 이미 담긴 경우에도 목록 새로고침
                    fetchCartItems();
                } else {
                    // 새로 담긴 경우 목록 새로고침
                    fetchCartItems();
                }
            }
        } catch (error) {
            console.error("담기 오류:", error);
        }
    };
    
    // 📤 바로 공유
    const shareDirectly = async () => {
        if (!selectedRoomId || !sharingItem) return;
        
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("로그인이 필요합니다.");
                return;
            }
            
            const res = await fetch(`${API_URL}/api/share/direct`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    room_id: selectedRoomId,
                    item_type: sharingItem.type,
                    post_id: sharingItem.postId,
                    place_id: sharingItem.placeId,
                    message: shareMessage
                })
            });
            
            if (res.ok) {
                alert("공유되었습니다!");
                setIsShareModalOpen(false);
                setSharingItem(null);
                setSelectedRoomId(null);
                setShareMessage("");
                
                // AI 학습 기록
                if (sharingItem.placeId) {
                    recordAiAction("share", sharingItem.placeId);
                }
            }
        } catch (error) {
            console.error("공유 오류:", error);
            alert("공유 중 오류가 발생했습니다.");
        }
    };
    
    // 💾 저장 모달 열기
    const openSaveModal = (postId?: string, placeId?: number) => {
        setSavingItem({
            type: postId ? "post" : "place",
            postId,
            placeId
        });
        fetchFolders();
        setIsSaveModalOpen(true);
    };
    
    // 📤 공유 모달 열기
    const openShareModal = (item: any) => {
        setSharingItem({
            type: item.postId ? "post" : "place",
            postId: item.postId,
            placeId: item.placeId,
            name: item.name
        });
        fetchChatRooms();
        fetchCartItems(); // 담기 목록도 미리 로드
        setShareMode("direct");
        setIsShareModalOpen(true);
    };
    
    // 📤 담기 목록 불러오기
    const fetchCartItems = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            
            const res = await fetch(`${API_URL}/api/share-cart`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                setCartItems(data.items || []);
            }
        } catch (error) {
            console.error("담기 목록 로드 오류:", error);
        }
    };
    
    // 📤 담기에서 제거
    const removeFromCart = async (itemId: number) => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            
            const res = await fetch(`${API_URL}/api/share-cart/${itemId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                setCartItems(prev => prev.filter(item => item.id !== itemId));
            }
        } catch (error) {
            console.error("담기 제거 오류:", error);
        }
    };
    
    // 📤 담기 전체 공유
    const shareCart = async () => {
        if (!selectedRoomId || cartItems.length === 0) return;
        
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("로그인이 필요합니다.");
                return;
            }
            
            const res = await fetch(`${API_URL}/api/share/cart`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    room_id: selectedRoomId,
                    message: shareMessage
                })
            });
            
            if (res.ok) {
                alert(`${cartItems.length}개 아이템이 공유되었습니다!`);
                setCartItems([]);
                setIsShareModalOpen(false);
                setSelectedRoomId(null);
                setShareMessage("");
            }
        } catch (error) {
            console.error("담기 공유 오류:", error);
            alert("공유 중 오류가 발생했습니다.");
        }
    };
    
    // API에서 게시물 불러오기
    useEffect(() => {
        const fetchPosts = async () => {
            try {
                setIsLoading(true);
                const token = localStorage.getItem("token");
                const res = await fetch(`${API_URL}/api/posts?limit=20`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                
                if (res.ok) {
                    const apiPosts = await res.json();
                    // API 게시물과 더미 데이터 병합 (API 데이터 우선)
                    if (apiPosts.length > 0) {
                        const formattedPosts = apiPosts.map((post: any) => ({
                            id: post.id,
                            type: "image",
                            images: post.image_urls || [],
                            author: { 
                                id: post.user_id, 
                                name: post.user_name || "사용자", 
                                avatar: post.user_avatar || post.user_name?.slice(0, 2) || "US",
                                profileImage: ""
                            },
                            content: post.content || "",
                            likes: post.likes_count || 0,
                            comments: post.comments_count || 0,
                            isLiked: post.is_liked || false,
                            isSaved: post.is_saved || false,
                            createdAt: post.created_at || "방금 전",
                            place: post.location_name ? {
                                id: null,
                                name: post.location_name,
                                category: "",
                                score: 0,
                                address: "",
                                phone: "",
                                openTime: "",
                                menu: [],
                                tags: []
                            } : null
                        }));
                        setFeeds([...formattedPosts, ...MOCK_FEEDS]);
                    }
                }
            } catch (error) {
                console.log("게시물 로드 중 오류:", error);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchPosts();
    }, []);

    // 게시물 클릭 시 상세 뷰 + AI 조회 기록
    const handleFeedClick = (feed: any) => {
        setSelectedFeed(feed);
        // AI: 게시물 조회 기록
        if (feed.place?.id) {
            recordAiAction("view", feed.place.id);
        }
    };

    const closeDetail = () => {
        setSelectedFeed(null);
        setIsPlaceModalOpen(false);
        setCommentText("");
        setShowComments(false);
    };
    
    // 댓글 관련 상태
    const [commentText, setCommentText] = useState("");
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);

    // 🔥 좋아요 토글 + AI 학습 기록
    const handleLike = async (feedId: string | number, e: React.MouseEvent, placeId?: number) => {
        e.stopPropagation();
        const feedIdStr = String(feedId);
        const feed = feeds.find(f => String(f.id) === feedIdStr);
        const newIsLiked = !feed?.isLiked;
        
        // UI 즉시 업데이트
        setFeeds(feeds.map(f => 
            String(f.id) === feedIdStr 
                ? { ...f, isLiked: newIsLiked, likes: newIsLiked ? f.likes + 1 : f.likes - 1 }
                : f
        ));
        
        // 선택된 피드도 업데이트
        if (String(selectedFeed?.id) === feedIdStr) {
            setSelectedFeed((prev: any) => prev ? {
                ...prev,
                isLiked: newIsLiked,
                likes: newIsLiked ? prev.likes + 1 : prev.likes - 1
            } : null);
        }
        
        const token = localStorage.getItem("token");
        if (!token) return;
        
        try {
            // API 게시물인 경우 좋아요 API 호출
            if (typeof feedId === "string" && !feedId.startsWith("local_")) {
                await fetch(`${API_URL}/api/posts/${feedId}/like`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            
            // 🤖 AI: 좋아요 행동 기록 (장소가 있는 경우에만)
            if (newIsLiked && placeId) {
                recordAiAction("like", placeId);
            }
        } catch (error) {
            console.error("좋아요 오류:", error);
        }
    };

    // 🔥 저장/찜 - 폴더 선택 모달 열기
    const handleSave = (feedId: number | string, e: React.MouseEvent, placeId?: number) => {
        e.stopPropagation();
        
        // 폴더 선택 모달 열기
        openSaveModal(
            typeof feedId === "string" ? feedId : undefined,
            placeId
        );
    };
    
    // 🔥 댓글 불러오기
    const loadComments = async (postId: string | number) => {
        if (typeof postId !== "string" || postId.startsWith("local_")) {
            setComments([]);
            return;
        }
        
        setCommentsLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const data = await res.json();
                setComments(data);
            }
        } catch (error) {
            console.error("댓글 로드 오류:", error);
        } finally {
            setCommentsLoading(false);
        }
    };
    
    // 🔥 댓글 작성 + AI 학습 기록
    const handleAddComment = async (feedId: string | number, placeId?: number) => {
        if (!commentText.trim()) return;
        
        const token = localStorage.getItem("token");
        if (!token) {
            alert("로그인이 필요합니다.");
            return;
        }
        
        try {
            if (typeof feedId === "string" && !feedId.startsWith("local_")) {
                const res = await fetch(`${API_URL}/api/posts/${feedId}/comments`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ content: commentText })
                });
                
                if (res.ok) {
                    const newComment = await res.json();
                    setComments(prev => [...prev, newComment]);
                    
                    // 댓글 수 업데이트
                    const feedIdStr = String(feedId);
                    setFeeds(feeds.map(f => 
                        String(f.id) === feedIdStr ? { ...f, comments: f.comments + 1 } : f
                    ));
                    if (String(selectedFeed?.id) === feedIdStr) {
                        setSelectedFeed((prev: any) => prev ? { ...prev, comments: prev.comments + 1 } : null);
                    }
                    
                    // 🤖 AI: 댓글 행동 기록
                    if (placeId) {
                        recordAiAction("review", placeId);
                    }
                }
            }
            setCommentText("");
        } catch (error) {
            console.error("댓글 작성 오류:", error);
        }
    };
    
    // 🔥 공유 기능 - 모달 열기
    const handleShare = (feed: any) => {
        openShareModal({
            postId: typeof feed.id === "string" ? feed.id : undefined,
            placeId: feed.place?.id,
            name: feed.place?.name || feed.content?.slice(0, 20) || "게시물"
        });
    };

    // 이미지 선택
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) {
                    const imageData = e.target.result as string;
                    // 첫 번째 이미지는 바로 편집기 열기
                    if (newPostImages.length === 0) {
                        setTempImageForEdit(imageData);
                        setEditingImageIndex(null);
                        setIsPhotoEditorOpen(true);
                    } else {
                        // 추가 이미지는 바로 추가
                        setNewPostImages(prev => [...prev, imageData]);
                    }
                }
            };
            reader.readAsDataURL(file);
        }
        // input 초기화
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    
    // 기존 이미지 편집하기
    const handleEditImage = (index: number) => {
        setTempImageForEdit(newPostImages[index]);
        setEditingImageIndex(index);
        setIsPhotoEditorOpen(true);
    };
    
    // 편집 완료 후 이미지 저장
    const handlePhotoEditorSave = (editedImage: string) => {
        if (editingImageIndex !== null) {
            // 기존 이미지 교체
            setNewPostImages(prev => prev.map((img, i) => 
                i === editingImageIndex ? editedImage : img
            ));
        } else {
            // 새 이미지 추가
            setNewPostImages(prev => [...prev, editedImage]);
        }
        setEditingImageIndex(null);
        setTempImageForEdit("");
    };

    // 이미지 제거
    const removeImage = (index: number) => {
        setNewPostImages(prev => prev.filter((_, i) => i !== index));
    };

    // 게시물 업로드 (API 연동)
    const handlePost = async () => {
        if (newPostImages.length === 0) return;
        
        setIsPosting(true);
        
        try {
            const token = localStorage.getItem("token");
            
            if (token) {
                // API로 게시물 생성
                const res = await fetch(`${API_URL}/api/posts`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        image_urls: newPostImages,
                        content: newPostContent,
                        location_name: null,
                        place_id: null
                    })
                });
                
                if (res.ok) {
                    const createdPost = await res.json();
                    const newPost = {
                        id: createdPost.id,
                        type: "image" as const,
                        images: createdPost.image_urls || newPostImages,
                        author: { 
                            id: createdPost.user_id, 
                            name: createdPost.user_name || "나", 
                            avatar: createdPost.user_avatar || "ME",
                            profileImage: ""
                        },
                        content: createdPost.content || newPostContent,
                        likes: 0,
                        comments: 0,
                        isLiked: false,
                        isSaved: false,
                        createdAt: createdPost.created_at || "방금 전",
                        place: null as any
                    };
                    setFeeds([newPost as any, ...feeds]);
                } else {
                    // 실패 시 로컬에만 추가
                    addLocalPost();
                }
            } else {
                // 토큰 없으면 로컬에만 추가
                addLocalPost();
            }
        } catch (error) {
            console.error("게시물 업로드 오류:", error);
            addLocalPost();
        }
        
        setNewPostImages([]);
        setNewPostContent("");
        setIsCreatePostOpen(false);
        setIsPosting(false);
    };
    
    // 로컬에만 게시물 추가 (비로그인 또는 API 실패 시)
    const addLocalPost = () => {
        const newPost = {
            id: `local_${Date.now()}`,
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

            {/* 2. AI 맞춤 추천 섹션 */}
            {showAiSection && aiRecommendations.length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                                <Wand2 className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="font-bold text-gray-800 text-sm">AI 맞춤 추천</span>
                            <Badge className="bg-purple-100 text-purple-600 text-[10px] font-medium">For You</Badge>
                        </div>
                        <button 
                            onClick={() => setShowAiSection(false)}
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                        {aiRecommendations.map((rec, index) => (
                            <div 
                                key={rec.place_id}
                                onClick={() => {
                                    recordAiAction("click", rec.place_id);
                                }}
                                className="flex-shrink-0 w-36 bg-white rounded-xl p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center">
                                        <Utensils className="w-4 h-4 text-purple-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-xs text-gray-800 truncate">{rec.place_name}</div>
                                        <div className="text-[10px] text-gray-500">{rec.category || "맛집"}</div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                        <span className="text-[10px] font-bold text-gray-700">
                                            {rec.avg_rating ? rec.avg_rating.toFixed(1) : (rec.score * 5).toFixed(1)}
                                        </span>
                                    </div>
                                    <Badge className="text-[8px] bg-gray-100 text-gray-600 px-1.5 py-0.5">
                                        {rec.reason}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. 인스타그램 탐색탭 스타일 그리드 */}
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
                                            onClick={(e) => handleLike(selectedFeed.id, e, selectedFeed.place?.id)}
                                            className="hover:opacity-60 transition-opacity"
                                        >
                                            <Heart className={`w-6 h-6 ${selectedFeed.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setShowComments(!showComments);
                                                if (!showComments) loadComments(selectedFeed.id);
                                            }}
                                            className="hover:opacity-60 transition-opacity"
                                        >
                                            <MessageCircle className={`w-6 h-6 ${showComments ? 'text-purple-500' : ''}`} />
                                        </button>
                                        <button 
                                            onClick={() => handleShare(selectedFeed)}
                                            className="hover:opacity-60 transition-opacity"
                                        >
                                            <Send className="w-6 h-6" />
                                        </button>
                                    </div>
                                    <button 
                                        onClick={(e) => handleSave(selectedFeed.id, e, selectedFeed.place?.id)}
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
                                        onClick={() => {
                                            setIsPlaceModalOpen(true);
                                            // 🤖 AI: 장소 상세 조회 기록
                                            if (selectedFeed.place?.id) {
                                                recordAiAction("click", selectedFeed.place.id);
                                            }
                                        }}
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
                                
                                {/* 🔥 댓글 섹션 */}
                                {showComments && (
                                    <div className="mt-4 border-t pt-4">
                                        <h4 className="font-semibold text-sm mb-3">
                                            댓글 {selectedFeed.comments}개
                                        </h4>
                                        
                                        {/* 댓글 목록 */}
                                        <div className="space-y-3 max-h-40 overflow-y-auto mb-3">
                                            {commentsLoading ? (
                                                <p className="text-xs text-gray-400 text-center py-2">로딩 중...</p>
                                            ) : comments.length > 0 ? (
                                                comments.map((comment: any) => (
                                                    <div key={comment.id} className="flex gap-2">
                                                        <Avatar className="w-6 h-6">
                                                            <AvatarFallback className="text-[10px] bg-gray-200">
                                                                {comment.user_name?.slice(0, 2) || "??"}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex-1">
                                                            <p className="text-xs">
                                                                <span className="font-semibold">{comment.user_name}</span>{" "}
                                                                {comment.content}
                                                            </p>
                                                            <p className="text-[10px] text-gray-400">{comment.created_at}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs text-gray-400 text-center py-2">
                                                    첫 번째 댓글을 남겨보세요!
                                                </p>
                                            )}
                                        </div>
                                        
                                        {/* 댓글 입력 */}
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="댓글 달기..."
                                                value={commentText}
                                                onChange={(e) => setCommentText(e.target.value)}
                                                className="flex-1 h-9 text-sm"
                                                onKeyPress={(e) => {
                                                    if (e.key === "Enter") {
                                                        handleAddComment(selectedFeed.id, selectedFeed.place?.id);
                                                    }
                                                }}
                                            />
                                            <Button
                                                size="sm"
                                                onClick={() => handleAddComment(selectedFeed.id, selectedFeed.place?.id)}
                                                disabled={!commentText.trim()}
                                                className="bg-purple-500 hover:bg-purple-600 h-9"
                                            >
                                                게시
                                            </Button>
                                        </div>
                                    </div>
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
                                {/* 편집 버튼 */}
                                <button 
                                    onClick={() => handleEditImage(0)}
                                    className="absolute top-2 left-2 bg-black/60 text-white p-1.5 rounded-full hover:bg-black/80 transition-colors"
                                    title="사진 편집"
                                >
                                    <Wand2 className="w-4 h-4" />
                                </button>
                                {/* 삭제 버튼 */}
                                <button 
                                    onClick={() => removeImage(0)}
                                    className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full hover:bg-black/80 transition-colors"
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
                                    <div key={i} className="relative flex-shrink-0 group">
                                        <img 
                                            src={img} 
                                            alt="" 
                                            className="w-16 h-16 rounded-lg object-cover cursor-pointer"
                                            onClick={() => handleEditImage(i)}
                                        />
                                        {/* 호버 시 편집 아이콘 */}
                                        <div 
                                            onClick={() => handleEditImage(i)}
                                            className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                        >
                                            <Wand2 className="w-4 h-4 text-white" />
                                        </div>
                                        <button 
                                            onClick={() => removeImage(i)}
                                            className="absolute -top-1 -right-1 bg-black/60 text-white p-0.5 rounded-full hover:bg-red-500 transition-colors"
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
            
            {/* 6. 사진 편집 모달 */}
            <PhotoEditor
                open={isPhotoEditorOpen}
                onOpenChange={setIsPhotoEditorOpen}
                imageSrc={tempImageForEdit}
                onSave={handlePhotoEditorSave}
            />
            
            {/* 7. 저장 폴더 선택 모달 */}
            <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Bookmark className="w-5 h-5 text-purple-500" />
                            폴더에 저장
                        </DialogTitle>
                        <DialogDescription>
                            저장할 폴더를 선택하세요
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4">
                        {/* 폴더 목록 */}
                        {foldersLoading ? (
                            <div className="text-center py-4 text-gray-400">로딩 중...</div>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {folders.map((folder) => (
                                    <button
                                        key={folder.id}
                                        onClick={() => setSelectedFolderId(folder.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                                            selectedFolderId === folder.id
                                                ? "bg-purple-100 border-2 border-purple-500"
                                                : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                                        }`}
                                    >
                                        <span className="text-xl">{folder.icon}</span>
                                        <div className="flex-1 text-left">
                                            <div className="font-medium">{folder.name}</div>
                                            <div className="text-xs text-gray-500">{folder.item_count}개 저장됨</div>
                                        </div>
                                        {selectedFolderId === folder.id && (
                                            <Check className="w-5 h-5 text-purple-500" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        {/* 새 폴더 만들기 */}
                        <div className="mt-4 pt-4 border-t">
                            <div className="flex gap-2">
                                <Input
                                    placeholder="새 폴더 이름"
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    className="flex-1"
                                />
                                <Button
                                    onClick={createFolder}
                                    disabled={!newFolderName.trim() || isCreatingFolder}
                                    size="icon"
                                    className="bg-purple-500 hover:bg-purple-600"
                                >
                                    <FolderPlus className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSaveModalOpen(false)}>
                            취소
                        </Button>
                        <Button
                            onClick={saveToFolder}
                            disabled={!selectedFolderId}
                            className="bg-purple-500 hover:bg-purple-600"
                        >
                            저장하기
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            {/* 8. 공유 모달 */}
            <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Send className="w-5 h-5 text-purple-500" />
                            공유하기
                        </DialogTitle>
                        <DialogDescription>
                            {sharingItem?.name || "아이템"}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4">
                        {/* 공유 방식 선택 */}
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setShareMode("direct")}
                                className={`flex-1 p-3 rounded-xl text-center transition-all ${
                                    shareMode === "direct"
                                        ? "bg-purple-100 border-2 border-purple-500 text-purple-700"
                                        : "bg-gray-50 border-2 border-transparent text-gray-600"
                                }`}
                            >
                                <MessageSquare className="w-5 h-5 mx-auto mb-1" />
                                <div className="text-sm font-medium">바로 공유</div>
                            </button>
                            <button
                                onClick={() => {
                                    setShareMode("cart");
                                    if (sharingItem) {
                                        addToCart(sharingItem);
                                    }
                                }}
                                className={`flex-1 p-3 rounded-xl text-center transition-all ${
                                    shareMode === "cart"
                                        ? "bg-purple-100 border-2 border-purple-500 text-purple-700"
                                        : "bg-gray-50 border-2 border-transparent text-gray-600"
                                }`}
                            >
                                <ShoppingBag className="w-5 h-5 mx-auto mb-1" />
                                <div className="text-sm font-medium">담기</div>
                            </button>
                        </div>
                        
                        {shareMode === "direct" && (
                            <>
                                {/* 채팅방 선택 */}
                                <div className="mb-4">
                                    <div className="text-sm font-medium text-gray-700 mb-2">채팅방 선택</div>
                                    {roomsLoading ? (
                                        <div className="text-center py-4 text-gray-400">로딩 중...</div>
                                    ) : chatRooms.length > 0 ? (
                                        <div className="space-y-2 max-h-40 overflow-y-auto">
                                            {chatRooms.map((room) => (
                                                <button
                                                    key={room.id}
                                                    onClick={() => setSelectedRoomId(room.id)}
                                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                                                        selectedRoomId === room.id
                                                            ? "bg-purple-100 border-2 border-purple-500"
                                                            : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                                                    }`}
                                                >
                                                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                                                        {room.is_group ? (
                                                            <Users className="w-5 h-5 text-white" />
                                                        ) : (
                                                            <MessageSquare className="w-5 h-5 text-white" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <div className="font-medium">{room.title}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {room.is_group ? `${room.member_count}명` : "1:1 채팅"}
                                                        </div>
                                                    </div>
                                                    {selectedRoomId === room.id && (
                                                        <Check className="w-5 h-5 text-purple-500" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-4 text-gray-400">
                                            채팅방이 없습니다
                                        </div>
                                    )}
                                </div>
                                
                                {/* 메시지 입력 */}
                                <div>
                                    <div className="text-sm font-medium text-gray-700 mb-2">메시지 (선택)</div>
                                    <Textarea
                                        placeholder="함께 보낼 메시지를 입력하세요"
                                        value={shareMessage}
                                        onChange={(e) => setShareMessage(e.target.value)}
                                        className="resize-none"
                                        rows={2}
                                    />
                                </div>
                            </>
                        )}
                        
                        {shareMode === "cart" && (
                            <div className="space-y-4">
                                {/* 담긴 아이템 목록 */}
                                <div>
                                    <div className="text-sm font-medium text-gray-700 mb-2 flex items-center justify-between">
                                        <span>담긴 항목 ({cartItems.length}개)</span>
                                        {sharingItem && (
                                            <button
                                                onClick={() => addToCart(sharingItem)}
                                                className="text-xs text-purple-500 hover:text-purple-600 font-medium"
                                            >
                                                + 현재 아이템 추가
                                            </button>
                                        )}
                                    </div>
                                    
                                    {cartItems.length > 0 ? (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {cartItems.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl group"
                                                >
                                                    {/* 썸네일 */}
                                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                        {item.image ? (
                                                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <MapPin className="w-5 h-5 text-purple-400" />
                                                        )}
                                                    </div>
                                                    {/* 정보 */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-sm text-gray-800 truncate">
                                                            {item.name || "저장된 항목"}
                                                        </div>
                                                        <div className="text-xs text-gray-400">
                                                            {item.item_type === "post" ? "게시물" : "장소"}
                                                        </div>
                                                    </div>
                                                    {/* 삭제 버튼 */}
                                                    <button
                                                        onClick={() => removeFromCart(item.id)}
                                                        className="p-1.5 hover:bg-red-100 rounded-full transition-colors"
                                                    >
                                                        <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-xl">
                                            <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">담긴 항목이 없습니다</p>
                                            {sharingItem && (
                                                <button
                                                    onClick={() => addToCart(sharingItem)}
                                                    className="mt-2 text-sm text-purple-500 hover:text-purple-600 font-medium"
                                                >
                                                    + 현재 아이템 담기
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                {/* 공유할 채팅방 선택 (담긴 아이템이 있을 때만) */}
                                {cartItems.length > 0 && (
                                    <>
                                        <div className="border-t pt-4">
                                            <div className="text-sm font-medium text-gray-700 mb-2">공유할 채팅방</div>
                                            {roomsLoading ? (
                                                <div className="text-center py-4 text-gray-400">로딩 중...</div>
                                            ) : chatRooms.length > 0 ? (
                                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                                    {chatRooms.map((room) => (
                                                        <button
                                                            key={room.id}
                                                            onClick={() => setSelectedRoomId(room.id)}
                                                            className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all ${
                                                                selectedRoomId === room.id
                                                                    ? "bg-purple-100 border-2 border-purple-500"
                                                                    : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                                                            }`}
                                                        >
                                                            <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                                                                {room.is_group ? (
                                                                    <Users className="w-4 h-4 text-white" />
                                                                ) : (
                                                                    <MessageSquare className="w-4 h-4 text-white" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1 text-left">
                                                                <div className="font-medium text-sm">{room.title}</div>
                                                            </div>
                                                            {selectedRoomId === room.id && (
                                                                <Check className="w-4 h-4 text-purple-500" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-4 text-gray-400 text-sm">
                                                    채팅방이 없습니다
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* 메시지 입력 */}
                                        <div>
                                            <div className="text-sm font-medium text-gray-700 mb-2">메시지 (선택)</div>
                                            <Textarea
                                                placeholder="함께 보낼 메시지를 입력하세요"
                                                value={shareMessage}
                                                onChange={(e) => setShareMessage(e.target.value)}
                                                className="resize-none"
                                                rows={2}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsShareModalOpen(false)}>
                            취소
                        </Button>
                        {shareMode === "direct" && (
                            <Button
                                onClick={shareDirectly}
                                disabled={!selectedRoomId}
                                className="bg-purple-500 hover:bg-purple-600"
                            >
                                공유하기
                            </Button>
                        )}
                        {shareMode === "cart" && cartItems.length > 0 && (
                            <Button
                                onClick={shareCart}
                                disabled={!selectedRoomId}
                                className="bg-purple-500 hover:bg-purple-600"
                            >
                                {cartItems.length}개 공유하기
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
