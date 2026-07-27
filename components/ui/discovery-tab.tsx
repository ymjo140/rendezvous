"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { 
    Search, MapPin, Heart, MessageCircle, Share2, Star, ChevronLeft, 
    MoreHorizontal, Utensils, X, Phone, Clock, ChevronRight, Plus,
    Image as ImageIcon, Camera, Send, Bookmark, Grid3X3, Play, Wand2,
    FolderPlus, Check, MessageSquare, Users, ShoppingBag, Trash2, Square, Video,
    Flame, BadgeCheck, UserPlus, UserCheck
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { motion, AnimatePresence } from "framer-motion"
import { PhotoEditor } from "@/components/ui/photo-editor"
import { fetchWithAuth } from "@/lib/api-client"
import { useDecisionCell } from "@/hooks/use-decision-cell"
import { logAction } from "@/lib/analytics-client"
import { recordActivity } from "@/lib/game"
import { compressImageFile } from "@/lib/image"
import { validateAndUploadVideo, captureVideoPoster } from "@/lib/video"
import { RichText } from "@/components/ui/rich-text"
import { useFriends } from "@/hooks/use-friends"

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



// 필터 카테고리 그룹 (main_category 문자열 부분일치로 일반화)
const CATEGORY_GROUPS: Record<string, RegExp> = {
    food: /한식|중식|일식|양식|분식|고기|구이|아시안|치킨|피자|국밥|찌개|곱창|해산물|면|밥|쌀국수|족발|보쌈|뷔페/,
    cafe: /카페|까페|커피|coffee|브런치|차/,
    pub: /술|바|bar|포차|펍|호프|주점|이자카야|와인|칵테일|맥주/,
    dessert: /디저트|디져트|베이커리|빵|케이크|도넛|아이스크림|와플|마카롱|크로플/,
}

const DISCOVERY_FILTERS: { key: string; label: string; reels?: boolean }[] = [
    { key: "all", label: "전체" },
    { key: "video", label: "릴스", reels: true },
    { key: "food", label: "맛집" },
    { key: "cafe", label: "카페" },
    { key: "pub", label: "술집" },
    { key: "dessert", label: "디저트" },
]

// 그리드 타일 — 전부 균일 1x1 (2x2 믹스 패턴 제거)
const getGridClass = (_index: number) => "col-span-1 row-span-1";

// Props 타입 정의
interface DiscoveryTabProps {
    sharedPostId?: string | null;
    onBackFromShared?: () => void;
    hideRankStrips?: boolean;  // 랭킹 스트립 숨김(레거시 옵션)
    crewMode?: boolean;        // v2: '모임'→'크루' 용어 + 크루 프로필로 이동(v1 페이지 점프 방지)
}

// 실시간 급상승 — 최근 관여(예약·재방문·저장·게시물) velocity 순위 + ▲/NEW
function TrendingStrip() {
    const router = useRouter();
    const [items, setItems] = useState<any[]>([]);
    useEffect(() => {
        fetchWithAuth("/api/trending/places?days=7&limit=10")
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((d) => setItems(d.items || []))
            .catch(() => {});
    }, []);
    if (items.length === 0) return null;
    return (
        <div className="px-3 py-1.5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                    <Flame className="w-3 h-3 text-orange-500" />
                    <span className="font-bold text-gray-800 text-[11px]">실시간 급상승</span>
                </div>
                <button onClick={() => router.push("/trending")} className="text-[10px] font-medium text-amber-600 flex items-center">
                    전체 <ChevronRight className="w-3 h-3" />
                </button>
            </div>
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                {items.map((it) => (
                    <button
                        key={it.place_id}
                        onClick={() => it.place_id && router.push(`/places/${it.place_id}`)}
                        className="flex-shrink-0 flex items-center gap-1 bg-gray-50 hover:bg-gray-100 rounded-full px-2 py-1 transition-colors"
                    >
                        <span className="text-[10px] font-extrabold text-amber-600">{it.rank}</span>
                        <span className="text-[11px] font-bold text-gray-800 truncate max-w-[96px]">{it.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// 👑 금주의 큐레이터 — 주간 영향력 랭킹(월요일 리셋). 팔로우 유도 + 인증 표시
function CuratorStrip() {
    const router = useRouter();
    const [items, setItems] = useState<any[]>([]);
    useEffect(() => {
        fetchWithAuth("/api/curators/ranking?scope=all&limit=10")
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((d) => setItems(d.items || []))
            .catch(() => {});
    }, []);
    if (items.length === 0) return null;
    const toggle = async (e: React.MouseEvent, c: any) => {
        e.stopPropagation();
        const next = !c.is_following;
        const patch = (on: boolean) =>
            setItems((prev) => prev.map((x) => x.id === c.id ? { ...x, is_following: on, follower_count: x.follower_count + (on ? 1 : -1) } : x));
        patch(next);
        try {
            const res = await fetchWithAuth(`/api/users/${c.id}/follow`, { method: next ? "POST" : "DELETE" });
            if (res.status === 401) { patch(!next); alert("로그인이 필요해요."); }
        } catch { patch(!next); }
    };
    return (
        <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                    <span className="text-base">👑</span>
                    <span className="font-bold text-gray-800 text-sm">금주의 큐레이터</span>
                    <span className="text-[11px] text-gray-400">· 월요일 리셋</span>
                </div>
                <button onClick={() => router.push("/curators")} className="text-[10px] font-medium text-amber-600 flex items-center">
                    전체 <ChevronRight className="w-3 h-3" />
                </button>
            </div>
            <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
                {items.map((c) => (
                    <div
                        key={c.id}
                        onClick={() => router.push(`/users/${c.id}`)}
                        className="flex-shrink-0 w-40 bg-gradient-to-b from-amber-50 to-white border border-amber-100 rounded-2xl p-3 cursor-pointer hover:shadow-sm transition-shadow"
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className="relative">
                                <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center text-3xl mb-1.5">{c.avatar || "🙂"}</div>
                                <span className={`absolute -top-1 -left-1 w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
                                    c.rank === 1 ? "bg-amber-400 text-white" : c.rank <= 3 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"
                                }`}>{c.rank}</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <span className="font-bold text-sm text-gray-900 truncate max-w-[100px]">{c.name}</span>
                                {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-[#F5A623] flex-shrink-0" />}
                            </div>
                            <div className="text-[11px] text-gray-500 line-clamp-1 mt-0.5 h-4">{c.tagline}</div>
                            <div className="text-[11px] text-gray-400 mt-0.5">이번 주 {c.weekly_score}점 · 팔로워 {c.follower_count}</div>
                            <button
                                onClick={(e) => toggle(e, c)}
                                className={`mt-2 w-full h-7 rounded-lg text-[12px] font-bold flex items-center justify-center gap-1 transition-colors ${
                                    c.is_following ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-[#F5A623] text-white hover:bg-amber-600"
                                }`}
                            >
                                {c.is_following ? (<><UserCheck className="w-3 h-3" />팔로잉</>) : (<><UserPlus className="w-3 h-3" />팔로우</>)}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// 인기 모임/크루 — 공개 집단이 큐레이션한 맛집. 팔로워·리스트좋아요로 랭크
function GroupStrip({ crewMode }: { crewMode?: boolean }) {
    const router = useRouter();
    const [items, setItems] = useState<any[]>([]);
    useEffect(() => {
        fetchWithAuth("/api/group-ranking?limit=8")
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((d) => setItems(d.items || []))
            .catch(() => {});
    }, []);
    if (items.length === 0) return null;
    return (
        <div className="px-3 py-1.5 border-b border-gray-100 bg-amber-50/40">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                    <span className="text-[11px]">👥</span>
                    <span className="font-bold text-gray-800 text-[11px]">{crewMode ? "인기 크루" : "인기 모임"}</span>
                </div>
                <button onClick={() => router.push(crewMode ? "/crews" : "/groups")} className="text-[10px] font-medium text-amber-600 flex items-center">
                    전체 <ChevronRight className="w-3 h-3" />
                </button>
            </div>
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                {items.map((g) => (
                    <button
                        key={g.community_id}
                        onClick={() => router.push(crewMode ? `/crew/${g.community_id}` : `/groups/${g.community_id}`)}
                        className="flex-shrink-0 flex items-center gap-1 bg-white border border-amber-100 rounded-full px-2 py-1 transition-colors hover:bg-amber-50"
                    >
                        <span className={`text-[10px] font-extrabold ${g.rank <= 3 ? "text-amber-500" : "text-gray-400"}`}>{g.rank}</span>
                        <span className="text-[11px] font-bold text-gray-800 truncate max-w-[96px]">{g.title}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// 인기 맛집 리스트 랭킹 — 추천·댓글·팔로워로 랭크 상승(뿌듯함 루프)
function ListRankingStrip() {
    const router = useRouter();
    const [items, setItems] = useState<any[]>([]);
    useEffect(() => {
        fetchWithAuth("/api/list-ranking?limit=10")
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((d) => setItems(d.items || []))
            .catch(() => {});
    }, []);
    if (items.length === 0) return null;
    return (
        <div className="px-3 py-1.5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                    <span className="text-[11px]">🏆</span>
                    <span className="font-bold text-gray-800 text-[11px]">인기 맛집 리스트</span>
                </div>
                <button onClick={() => router.push("/lists")} className="text-[10px] font-medium text-amber-600 flex items-center">
                    전체 <ChevronRight className="w-3 h-3" />
                </button>
            </div>
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                {items.map((l) => (
                    <button
                        key={l.folder_id}
                        onClick={() => router.push(`/lists/${l.folder_id}`)}
                        className="flex-shrink-0 flex items-center gap-1 bg-gray-50 hover:bg-gray-100 rounded-full px-2 py-1 transition-colors"
                    >
                        <span className={`text-[10px] font-extrabold ${l.rank <= 3 ? "text-amber-500" : "text-gray-400"}`}>{l.rank}</span>
                        <span className="text-[11px] font-bold text-gray-800 truncate max-w-[96px]">{l.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function DiscoveryTab({ sharedPostId, onBackFromShared, hideRankStrips, crewMode }: DiscoveryTabProps = {}) {
    const router = useRouter();
    const { decisionCell, requestId } = useDecisionCell();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFeed, setSelectedFeed] = useState<any>(null);
    const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);
    const [feeds, setFeeds] = useState<any[]>([]); // 실제 게시물만(MOCK 제거)
    const [isLoading, setIsLoading] = useState(true);
    
    // ?? 공유된 게시물로 진입했는지 여부
    const [isFromSharedPost, setIsFromSharedPost] = useState(false);
    
    // 게시물 작성 관련 상태
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    const [newPostImages, setNewPostImages] = useState<string[]>([]);
    const [newPostContent, setNewPostContent] = useState("");
    // 게시물 미디어 종류 — 'image'(사진) | 'video'(숏폼). 영상은 Storage URL 1개.
    const [draftMediaType, setDraftMediaType] = useState<"image" | "video">("image");
    const [draftVideoUrl, setDraftVideoUrl] = useState<string>("");
    const [draftVideoPoster, setDraftVideoPoster] = useState<string>("");
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const videoInputRef = useRef<HTMLInputElement>(null);

    // @멘션 — 친구 목록 + 작성 중 자동완성
    const { friends: myFriends } = useFriends();
    const [draftMentions, setDraftMentions] = useState<{ id: number; name: string }[]>([]);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null); // @뒤 입력값(null=비활성)
    const contentRef = useRef<HTMLTextAreaElement>(null);

    const mentionMatches = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.trim().toLowerCase();
        return (myFriends || [])
            .filter((f: any) => !q || String(f.name || "").toLowerCase().includes(q))
            .slice(0, 6);
    }, [mentionQuery, myFriends]);

    // 본문 변경 시 마지막 토큰이 @… 인지 감지해 자동완성 트리거
    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setNewPostContent(val);
        const upto = val.slice(0, e.target.selectionStart ?? val.length);
        const m = /@([0-9A-Za-z가-힣_]*)$/.exec(upto);
        setMentionQuery(m ? m[1] : null);
    };

    const pickMention = (friend: { id: number; name: string }) => {
        // 마지막 @토큰을 @이름 으로 치환
        const ta = contentRef.current;
        const caret = ta?.selectionStart ?? newPostContent.length;
        const before = newPostContent.slice(0, caret).replace(/@([0-9A-Za-z가-힣_]*)$/, `@${friend.name} `);
        const after = newPostContent.slice(caret);
        setNewPostContent(before + after);
        setDraftMentions(prev => prev.some(m => m.id === friend.id) ? prev : [...prev, friend]);
        setMentionQuery(null);
        setTimeout(() => ta?.focus(), 0);
    };
    const [locationQuery, setLocationQuery] = useState("");
    const [locationResults, setLocationResults] = useState<any[]>([]);
    const [locationSearching, setLocationSearching] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState<any | null>(null);
    const [placeQuery, setPlaceQuery] = useState("");
    const [placeResults, setPlaceResults] = useState<any[]>([]);
    const [placeSearching, setPlaceSearching] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState<any | null>(null);
    const [isPosting, setIsPosting] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState("all");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 🔍 검색(장소) + 취향 발견 피드 상태
    const [searchPlaceHits, setSearchPlaceHits] = useState<any[]>([]);
    const [searchPlaceLoading, setSearchPlaceLoading] = useState(false);
    const [myPrefTags, setMyPrefTags] = useState<string[]>([]);

    // 🚨 신고/차단 (스토어 UGC 정책)
    const [modTarget, setModTarget] = useState<any>(null); // 신고/차단 시트 대상 게시물

    const reportPost = async (feed: any, reason: string) => {
        try {
            const res = await fetchWithAuth("/api/reports", {
                method: "POST",
                body: JSON.stringify({ target_type: "post", target_id: String(feed.id), reason }),
            });
            if (res.ok) {
                alert("신고가 접수되었습니다. 검토 후 조치할게요.");
                setFeeds(prev => prev.filter(f => f.id !== feed.id));
                setSelectedFeed(null);
                setModTarget(null);
            } else {
                alert("로그인 후 이용할 수 있어요.");
            }
        } catch {
            alert("신고 처리 중 오류가 발생했어요.");
        }
    };

    const blockAuthor = async (feed: any) => {
        const authorId = feed?.author?.id;
        if (!authorId) return;
        if (!confirm(`${feed.author?.name || "이 사용자"}님을 차단할까요?\n차단하면 이 사용자의 게시물이 더 이상 보이지 않습니다.`)) return;
        try {
            const res = await fetchWithAuth(`/api/users/${authorId}/block`, { method: "POST" });
            if (res.ok) {
                alert("차단했어요.");
                setFeeds(prev => prev.filter(f => f.author?.id !== authorId));
                setSelectedFeed(null);
                setModTarget(null);
            } else {
                const e = await res.json().catch(() => null);
                alert(e?.detail || "차단에 실패했어요.");
            }
        } catch {
            alert("차단 처리 중 오류가 발생했어요.");
        }
    };

    // 📸 인스타식 뷰 모드(그리드↔피드) + 더블탭 좋아요
    const [viewMode, setViewMode] = useState<"grid" | "feed">("grid");
    const [heartOverlayId, setHeartOverlayId] = useState<string | number | null>(null);
    const lastTapRef = useRef<{ id: string | number; time: number } | null>(null);

    const handleImageTap = (feed: any) => {
        const now = Date.now();
        const last = lastTapRef.current;
        if (last && last.id === feed.id && now - last.time < 300) {
            // 더블탭 → 좋아요(이미 좋아요면 유지) + 하트 연출
            lastTapRef.current = null;
            setHeartOverlayId(feed.id);
            setTimeout(() => setHeartOverlayId(null), 800);
            if (!feed.isLiked) {
                handleLike(feed.id, { stopPropagation: () => undefined } as any, feed.place?.id);
            }
        } else {
            lastTapRef.current = { id: feed.id, time: now };
        }
    };
    
    // 사진 편집 관련 상태
    const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
    const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
    const [tempImageForEdit, setTempImageForEdit] = useState<string>("");
    
    // ?? AI 추천 관련 상태
    const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    
    // ?? 저장 폴더 관련 상태
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [savingItem, setSavingItem] = useState<{type: string, postId?: string, placeId?: number} | null>(null);
    const [folders, setFolders] = useState<SaveFolder[]>([]);
    const [foldersLoading, setFoldersLoading] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
    
    // ?? 공유 관련 상태
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [sharingItem, setSharingItem] = useState<any>(null);
    const [shareMode, setShareMode] = useState<"direct" | "cart">("direct");
    const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
    const [roomsLoading, setRoomsLoading] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [shareMessage, setShareMessage] = useState("");
    const [cartItems, setCartItems] = useState<any[]>([]);
    
    // ?? 공유된 게시물 로딩 상태
    const [sharedPostLoading, setSharedPostLoading] = useState(false);
    
    // ?? 공유된 게시물 열기 (채팅에서 온 경우) - 전체 피드 로드 안 함
    useEffect(() => {
        if (sharedPostId) {
            setSharedPostLoading(true);
            setIsFromSharedPost(true);
            
            const fetchSharedPost = async () => {
                try {
                    const res = await fetchWithAuth(`/api/posts/${sharedPostId}`);
                    
                    if (res.ok) {
                        const post = await res.json();
                        // 피드 형식으로 변환
                        const formattedPost = {
                            id: post.id,
                            type: post.media_type === "video" ? "video" : "image",
                            images: post.image_urls || [],
                            author: {
                                id: post.user_id,
                                name: post.user_name || "??",
                                avatar: post.user_name?.slice(0, 2) || "US",
                                profileImage: ""
                            },
                            content: post.content || "",
                            likes: post.likes_count || 0,
                            comments: post.comments_count || 0,
                            isLiked: post.is_liked || false,
                            isSaved: post.is_saved || false,
                            createdAt: post.created_at || "방금 전",
                            locationName: post.location_name || null,
                            place: formatPlaceFromPost(post)
                        };
                        
                        setSelectedFeed(formattedPost);
                    } else {
                        // 게시물 로드 실패 시 채팅으로 돌아가기
                        alert("게시물을 찾을 수 없습니다.");
                        onBackFromShared?.();
                    }
                } catch (e) {
                    console.error("공유된 게시물 로드 실패:", e);
                    onBackFromShared?.();
                } finally {
                    setSharedPostLoading(false);
                }
            };
            
            fetchSharedPost();
        }
    }, [sharedPostId]);

    useEffect(() => {
        if (selectedLocation) {
            setLocationResults([]);
            return;
        }
        if (locationQuery.length < 2) {
            setLocationResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setLocationSearching(true);
            try {
                const res = await fetchWithAuth(`/api/places/search?query=${encodeURIComponent(locationQuery)}`);
                if (res.ok) {
                    setLocationResults(await res.json());
                }
            } catch (error) {
                console.error("Location search failed:", error);
            } finally {
                setLocationSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [locationQuery, selectedLocation]);

    useEffect(() => {
        if (selectedPlace) {
            setPlaceResults([]);
            return;
        }
        if (placeQuery.length < 2) {
            setPlaceResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setPlaceSearching(true);
            try {
                const res = await fetchWithAuth(`/api/places/search?query=${encodeURIComponent(placeQuery)}&db_only=true`);
                if (res.ok) {
                    setPlaceResults(await res.json());
                }
            } catch (error) {
                console.error("Place search failed:", error);
            } finally {
                setPlaceSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [placeQuery, selectedPlace]);
    
    // ?? AI 추천 불러오기 (공유된 게시물로 온 경우는 스킵)
    useEffect(() => {
        // 공유된 게시물로 접근한 경우 AI 추천 로드 안 함
        if (sharedPostId) return;

        const fetchAiRecommendations = async () => {
            try {
                setAiLoading(true);
                // 개인 취향 벡터 추천(Gemini-free, 이유 포함). 미로그인/빈결과면 섹션 숨김.
                const res = await fetchWithAuth("/api/vector/recommendations?limit=20");
                if (res.ok) {
                    const data = await res.json();
                    const recs = (data.recommendations || []).map((r: any) => ({
                        place_id: r.place_id ?? r.id,
                        place_name: r.name || r.place_name || "추천 장소",
                        category: r.category || "",
                        avg_rating: r.rating ?? r.avg_rating ?? 0,
                        score: r.similarity_score ?? r.score ?? 0,
                        reason: r.reason || "취향 맞춤",
                    }));
                    setAiRecommendations(recs);
                }
            } catch (error) {
                console.log("AI 추천 로드 오류:", error);
            } finally {
                setAiLoading(false);
            }
        };

        fetchAiRecommendations();
    }, [sharedPostId]);

    // 🔍 장소 키워드 검색(검색바 입력 시) — 게시물 외 장소 바로가기 결과
    useEffect(() => {
        const q = searchQuery.trim();
        if (q.length < 2) {
            setSearchPlaceHits([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearchPlaceLoading(true);
            try {
                const res = await fetchWithAuth(`/api/places/search?query=${encodeURIComponent(q)}&db_only=true`);
                if (res.ok) {
                    const data = await res.json();
                    setSearchPlaceHits(Array.isArray(data) ? data.slice(0, 12) : []);
                }
            } catch (error) {
                console.log("장소 검색 오류:", error);
            } finally {
                setSearchPlaceLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // 취향 발견 피드용: 내 취향 태그 로드(음식/분위기/주류)
    useEffect(() => {
        const loadPrefs = async () => {
            try {
                const res = await fetchWithAuth("/api/users/me");
                if (!res.ok) return;
                const me = await res.json();
                const p = me?.preferences || {};
                const tags: string[] = [];
                for (const k of ["foods", "vibes", "alcohol"]) {
                    if (Array.isArray(p[k])) tags.push(...p[k].map((x: any) => String(x)));
                }
                setMyPrefTags(tags);
            } catch {
                /* 무시 */
            }
        };
        loadPrefs();
    }, []);

    useEffect(() => {
        if (!aiRecommendations.length) return;
        aiRecommendations.slice(0, 6).forEach((rec) => {
            logAction({
                action_type: "impression",
                place_id: rec.place_id ?? rec.id ?? null,
                source: "discovery_tab",
                metadata: { reason: rec.reason ?? null }
            });
        });
    }, [aiRecommendations]);
    
    // ?? AI 행동 기록 함수 (벡터 AI 시스템)
    const recordAiAction = async (actionType: string, placeId?: number, postId?: string) => {
        const actionMap: Record<string, string> = {
            VIEW: "impression",
            CLICK: "detail_view",
            LIKE: "like",
            SAVE: "save",
            SHARE: "share",
            REVIEW: "review_submit"
        };
        const mapped = actionMap[actionType.toUpperCase()] || actionType.toLowerCase();
        await logAction({
            action_type: mapped,
            place_id: placeId ?? null,
            source: "discovery_tab",
            metadata: {
                post_id: postId ?? null,
                location_name: selectedLocation?.name || selectedLocation?.address || selectedPlace?.address || null
            }
        });
    };

    const formatPlaceFromPost = (post: any) => {
        if (post.place) {
            const place = post.place;
            const features = place.features || {};
            const tags = place.tags || place.vibe_tags || features.tags || [];
            const rawMenus = place.menus || place.menu || features.menus || features.menu || [];
            const menus = Array.isArray(rawMenus)
                ? rawMenus.map((item: any) => {
                    if (typeof item === "string") return item;
                    const name = item?.name || item?.title || "";
                    const price = item?.price ? ` (${item.price})` : "";
                    return `${name}${price}`.trim();
                })
                : [];
            return {
                id: place.id,
                name: place.name,
                category: place.category || "",
                score: place.rating ?? place.wemeet_rating ?? place.score ?? 0,
                address: place.address || "",
                phone: place.phone || "",
                openTime: place.business_hours || "",
                menu: menus,
                tags,
                review_count: place.review_count || 0,
                price_range: place.price_range || "",
                external_link: place.external_link || ""
            };
        }
        if (post.place_name) {
            return {
                id: post.place_id ?? null,
                name: post.place_name,
                category: post.place_category || "",
                score: post.place_rating || 0,
                address: post.place_address || "",
                phone: "",
                openTime: "",
                menu: [],
                tags: [],
                review_count: post.place_review_count || 0,
                price_range: "",
                external_link: ""
            };
        }
        return null;
    };

    const buildPlaceFromSelection = (place: any) => {
        if (!place) return null;
        return formatPlaceFromPost({ place });
    };

    const handleSelectLocation = (item: any) => {
        setSelectedLocation(item);
        setLocationQuery(item?.name || item?.title || item?.address || "");
        setLocationResults([]);
    };

    const clearLocationSelection = () => {
        setSelectedLocation(null);
        setLocationQuery("");
        setLocationResults([]);
    };

    const handleSelectPlace = (item: any) => {
        setSelectedPlace(item);
        setPlaceQuery(item?.name || item?.title || "");
        setPlaceResults([]);
    };

    const clearPlaceSelection = () => {
        setSelectedPlace(null);
        setPlaceQuery("");
        setPlaceResults([]);
    };

    const resetCreatePostDraft = () => {
        setNewPostImages([]);
        setNewPostContent("");
        setDraftMediaType("image");
        setDraftVideoUrl("");
        setDraftVideoPoster("");
        setIsUploadingVideo(false);
        setDraftMentions([]);
        setMentionQuery(null);
        setLocationQuery("");
        setLocationResults([]);
        setLocationSearching(false);
        setSelectedLocation(null);
        setPlaceQuery("");
        setPlaceResults([]);
        setPlaceSearching(false);
        setSelectedPlace(null);
    };
    
    // ?? 폴더 목록 불러오기
    const fetchFolders = async () => {
        try {
            setFoldersLoading(true);
            const token = localStorage.getItem("token");
            if (!token) {
                setFoldersLoading(false);
                return;
            }
            
            const res = await fetchWithAuth(`/api/folders`);
            
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
    
    // ?? 새 폴더 생성
    const createFolder = async () => {
        if (!newFolderName.trim()) return;
        
        try {
            setIsCreatingFolder(true);
            const token = localStorage.getItem("token");
            if (!token) return;
            
            const res = await fetchWithAuth(`/api/folders`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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
    
    // ?? 아이템 저장
    const saveToFolder = async () => {
        if (!selectedFolderId || !savingItem) return;
        
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("로그인이 필요합니다.");
                return;
            }
            
            const res = await fetchWithAuth(`/api/saves`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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
                recordAiAction("SAVE", savingItem.placeId, savingItem.postId);
            }
        } catch (error) {
            console.error("저장 오류:", error);
            alert("저장 중 오류가 발생했습니다.");
        }
    };
    
    // ?? 채팅방 목록 불러오기
    const fetchChatRooms = async () => {
        try {
            setRoomsLoading(true);
            const token = localStorage.getItem("token");
            if (!token) return;
            
            const res = await fetchWithAuth(`/api/share/rooms`);
            
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
    
    // ?? 담기에 추가
    const addToCart = async (item: any) => {
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("로그인이 필요합니다.");
                return;
            }
            
            const res = await fetchWithAuth(`/api/share-cart`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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
    
    // ?? 바로 공유
    const shareDirectly = async () => {
        if (!selectedRoomId || !sharingItem) return;
        
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("로그인이 필요합니다.");
                return;
            }
            
            const res = await fetchWithAuth(`/api/share/direct`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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
                recordAiAction("SHARE", sharingItem.placeId, sharingItem.postId);
            }
        } catch (error) {
            console.error("공유 오류:", error);
            alert("공유 중 오류가 발생했습니다.");
        }
    };
    
    // ?? 저장 모달 열기
    const openSaveModal = (postId?: string, placeId?: number) => {
        setSavingItem({
            type: postId ? "post" : "place",
            postId,
            placeId
        });
        fetchFolders();
        setIsSaveModalOpen(true);
    };
    
    // ?? 공유 모달 열기
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
    
    // ?? 담기 목록 불러오기
    const fetchCartItems = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            
            const res = await fetchWithAuth(`/api/share-cart`);
            
            if (res.ok) {
                const data = await res.json();
                setCartItems(data.items || []);
            }
        } catch (error) {
            console.error("담기 목록 로드 오류:", error);
        }
    };
    
    // ?? 담기에서 제거
    const removeFromCart = async (itemId: number) => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            
            const res = await fetchWithAuth(`/api/share-cart/${itemId}`, {
                method: "DELETE"
            });
            
            if (res.ok) {
                setCartItems(prev => prev.filter(item => item.id !== itemId));
            }
        } catch (error) {
            console.error("담기 제거 오류:", error);
        }
    };
    
    // ?? 담기 전체 공유
    const shareCart = async () => {
        if (!selectedRoomId || cartItems.length === 0) return;
        
        try {
            const token = localStorage.getItem("token");
            if (!token) {
                alert("로그인이 필요합니다.");
                return;
            }
            
            const res = await fetchWithAuth(`/api/share/cart`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
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
    
    // API에서 게시물 불러오기 (공유된 게시물로 온 경우는 스킵)
    useEffect(() => {
        // 공유된 게시물로 접근한 경우 전체 피드 로드 안 함 (성능 최적화)
        if (sharedPostId) return;
        
        const fetchPosts = async () => {
            try {
                setIsLoading(true);
                const res = await fetchWithAuth(`/api/posts?limit=100`);
                
                if (res.ok) {
                    const apiPosts = await res.json();
                    // 실제 게시물만 표시 (게시물 없으면 빈 상태 UI)
                    const formattedPosts = (apiPosts || []).map((post: any) => ({
                        id: post.id,
                        type: post.media_type === "video" ? "video" : "image",
                        images: post.image_urls || [],
                        author: {
                            id: post.user_id,
                            name: post.user_name || "??",
                            avatar: post.user_avatar || post.user_name?.slice(0, 2) || "US",
                            profileImage: ""
                        },
                        content: post.content || "",
                        likes: post.likes_count || 0,
                        comments: post.comments_count || 0,
                        isLiked: post.is_liked || false,
                        isSaved: post.is_saved || false,
                        createdAt: post.created_at || "방금 전",
                        locationName: post.location_name || null,
                        place: formatPlaceFromPost(post)
                    }));
                    setFeeds(formattedPosts);
                }
            } catch (error) {
                console.log("게시물 로드 중 오류:", error);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchPosts();
    }, [sharedPostId]);

    // 게시물 클릭 시 상세 뷰 + AI 조회 기록
    const handleFeedClick = (feed: any) => {
        setSelectedFeed(feed);
        // AI: 게시물 조회 기록 (장소 또는 게시물 ID)
        const postId = typeof feed.id === "string" ? feed.id : undefined;
        recordAiAction("VIEW", feed.place?.id, postId);
        // 게임: 탐험 활동(일일 퀘스트/XP)
        recordActivity("explore");
    };

    const closeDetail = () => {
        setSelectedFeed(null);
        setIsPlaceModalOpen(false);
        setCommentText("");
        setShowComments(false);
        
        // 공유된 게시물에서 온 경우 채팅으로 돌아가기
        if (isFromSharedPost && onBackFromShared) {
            setIsFromSharedPost(false);
            onBackFromShared();
        }
    };
    
    // 댓글 관련 상태
    const [commentText, setCommentText] = useState("");
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);

    // ?? 좋아요 토글 + AI 학습 기록
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
                await fetchWithAuth(`/api/posts/${feedId}/like`, {
                    method: "POST"
                });
            }
            
            // ?? AI: 좋아요 행동 기록
            if (newIsLiked) {
                const postId = typeof feedId === "string" ? feedId : undefined;
                recordAiAction("LIKE", placeId, postId);
            }
        } catch (error) {
            console.error("좋아요 오류:", error);
        }
    };

    // ?? 저장/찜 - 폴더 선택 모달 열기
    const handleSave = (feedId: number | string, e: React.MouseEvent, placeId?: number) => {
        e.stopPropagation();
        
        // 폴더 선택 모달 열기
        openSaveModal(
            typeof feedId === "string" ? feedId : undefined,
            placeId
        );
    };
    
    // ?? 댓글 불러오기
    const loadComments = async (postId: string | number) => {
        if (typeof postId !== "string" || postId.startsWith("local_")) {
            setComments([]);
            return;
        }
        
        setCommentsLoading(true);
        try {
            const res = await fetchWithAuth(`/api/posts/${postId}/comments`);
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
    
    // ?? 댓글 작성 + AI 학습 기록
    const handleAddComment = async (feedId: string | number, placeId?: number) => {
        if (!commentText.trim()) return;
        
        const token = localStorage.getItem("token");
        if (!token) {
            alert("로그인이 필요합니다.");
            return;
        }
        
        try {
            if (typeof feedId === "string" && !feedId.startsWith("local_")) {
                const res = await fetchWithAuth(`/api/posts/${feedId}/comments`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
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
                    
                    // ?? AI: 댓글 행동 기록
                    const postId = typeof feedId === "string" ? feedId : undefined;
                    recordAiAction("REVIEW", placeId, postId);
                }
            }
            setCommentText("");
        } catch (error) {
            console.error("댓글 작성 오류:", error);
        }
    };
    
    // ?? 공유 기능 - 모달 열기
    const handleShare = (feed: any) => {
        openShareModal({
            postId: typeof feed.id === "string" ? feed.id : undefined,
            placeId: feed.place?.id,
            name: feed.place?.name || feed.content?.slice(0, 20) || "게시물"
        });
    };

    // 이미지 선택 — 클라이언트 압축(1080px JPEG) 후 사용. 폰 원본(수 MB) 그대로 올리면
    // base64 저장 구조상 업로드 실패/응답 지연이 나므로 압축이 실업로드의 핵심.
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            try {
                const imageData = await compressImageFile(file);
                // 첫 번째 이미지는 바로 편집기 열기
                if (newPostImages.length === 0) {
                    setTempImageForEdit(imageData);
                    setEditingImageIndex(null);
                    setIsPhotoEditorOpen(true);
                } else {
                    // 추가 이미지는 바로 추가
                    setNewPostImages(prev => [...prev, imageData]);
                }
            } catch {
                alert("이미지를 불러오지 못했어요. 다른 사진으로 시도해주세요.");
            }
        }
        // input 초기화
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    
    // 숏폼 영상 선택 → 백엔드 Storage 업로드. 포스터(첫 프레임)도 캡처.
    const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (videoInputRef.current) videoInputRef.current.value = "";
        if (!file) return;
        const token = localStorage.getItem("token");
        if (!token) {
            alert("로그인 후 영상을 올릴 수 있어요.");
            return;
        }
        setIsUploadingVideo(true);
        try {
            const poster = await captureVideoPoster(file).catch(() => null);
            const { url } = await validateAndUploadVideo(file);
            setDraftMediaType("video");
            setDraftVideoUrl(url);
            setDraftVideoPoster(poster || "");
            // 사진과 동시 사용 방지 — 영상 모드면 이미지 비움
            setNewPostImages([]);
        } catch (err: any) {
            alert(err?.message || "영상 업로드에 실패했어요.");
        } finally {
            setIsUploadingVideo(false);
        }
    };

    const removeDraftVideo = () => {
        setDraftMediaType("image");
        setDraftVideoUrl("");
        setDraftVideoPoster("");
    };

    // 해시태그 클릭 → 탐색 검색에 연결 (# 제거한 태그로 검색)
    const handleHashtagClick = (tag: string) => {
        setSelectedFeed(null);
        setSearchQuery(tag);
        setViewMode("grid");
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

    // 게시물 업로드 (API 연동) — 사진 또는 숏폼 영상
    const isVideoDraft = draftMediaType === "video" && !!draftVideoUrl;
    const canPost = isVideoDraft || newPostImages.length > 0;

    const handlePost = async () => {
        if (!canPost) return;

        setIsPosting(true);
        const locationName = selectedLocation?.name || selectedLocation?.address || selectedPlace?.address || null;
        const placePreview = buildPlaceFromSelection(selectedPlace);
        const mediaUrls = isVideoDraft ? [draftVideoUrl] : newPostImages;

        try {
            const token = localStorage.getItem("token");

            if (token) {
                // API로 게시물 생성
                // 본문에 @이름이 아직 남아있는 멘션만 전송
                const activeMentionIds = draftMentions
                    .filter(m => newPostContent.includes(`@${m.name}`))
                    .map(m => m.id);
                const res = await fetchWithAuth(`/api/posts`, {
                    method: "POST",
                    body: JSON.stringify({
                        image_urls: mediaUrls,
                        content: newPostContent,
                        location_name: locationName,
                        place_id: selectedPlace?.id || null,
                        media_type: draftMediaType,
                        mention_user_ids: activeMentionIds
                    })
                });

                if (res.ok) {
                    const createdPost = await res.json();
                    const createdPlace = formatPlaceFromPost(createdPost) || placePreview;
                    const newPost = {
                        id: createdPost.id,
                        type: (createdPost.media_type === "video" ? "video" : "image") as "video" | "image",
                        images: createdPost.image_urls || mediaUrls,
                        poster: isVideoDraft ? draftVideoPoster : undefined,
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
                        locationName: createdPost.location_name || locationName,
                        place: createdPlace as any
                    };
                    setFeeds(prev => [newPost as any, ...prev]);
                } else {
                    // 실패 시 로컬에만 추가
                    addLocalPost(locationName, placePreview);
                }
            } else {
                // 토큰 없으면 로컬에만 추가
                addLocalPost(locationName, placePreview);
            }
        } catch (error) {
            console.error("게시물 업로드 오류:", error);
            addLocalPost(locationName, placePreview);
        }

        resetCreatePostDraft();
        setIsCreatePostOpen(false);
        setIsPosting(false);
    };

    // 로컬에만 게시물 추가 (비로그인 또는 API 실패 시)
    const addLocalPost = (locationName: string | null, placePreview: any | null) => {
        const newPost = {
            id: `local_${Date.now()}`,
            type: (draftMediaType === "video" ? "video" : "image") as "video" | "image",
            images: draftMediaType === "video" && draftVideoUrl ? [draftVideoUrl] : newPostImages,
            poster: draftMediaType === "video" ? draftVideoPoster : undefined,
            author: { id: 999, name: "나", avatar: "ME", profileImage: "" },
            content: newPostContent,
            likes: 0,
            comments: 0,
            isLiked: false,
            isSaved: false,
            createdAt: "방금 전",
            locationName,
            place: placePreview as any
        };
        setFeeds(prev => [newPost as any, ...prev]);
    };

    // 필터 + 검색 + 취향 정렬된 피드
    const filteredFeeds = useMemo(() => {
        let list = [...feeds];

        // 1) 카테고리 필터 (main_category 그룹 부분일치)
        if (selectedFilter === "video") {
            list = list.filter((f) => f.type === "video");
        } else if (selectedFilter !== "all") {
            const re = CATEGORY_GROUPS[selectedFilter];
            if (re) {
                list = list.filter((f) => {
                    const cat = String(f.place?.category || "");
                    return cat && re.test(cat);
                });
            }
        }

        // 2) 검색어 필터 (내용/장소명/카테고리/지역/태그)
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            list = list.filter((f) => {
                const hay = [
                    f.content,
                    f.place?.name,
                    f.place?.category,
                    (f as any).locationName,
                    ...((f.place?.tags as string[]) || []),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return hay.includes(q);
            });
        }

        // 3) 취향 발견 피드: 검색어 없을 때 내 취향 매칭 우선 정렬
        if (!q && myPrefTags.length > 0) {
            // tsconfig target이 낮아 Set 직접 순회 불가 → 배열로 처리
            const prefTags = Array.from(new Set(myPrefTags));
            const scoreOf = (f: any) => {
                const candList = [
                    ...((f.place?.tags as string[]) || []),
                    f.place?.category,
                ].filter(Boolean) as string[];
                const cand = new Set<string>(candList);
                let s = 0;
                prefTags.forEach((t) => {
                    if (cand.has(t)) s += 1;
                });
                return s;
            };
            list = list
                .map((f, i) => ({ f, i, s: scoreOf(f) }))
                .sort((a, b) => b.s - a.s || a.i - b.i)
                .map((x) => x.f);
        }

        return list;
    }, [feeds, selectedFilter, searchQuery, myPrefTags]);

    // 취향 매칭 여부(그리드 배지용)
    const isTasteMatch = (feed: any) => {
        if (!myPrefTags.length) return false;
        const cand = new Set<string>(
            [...((feed.place?.tags as string[]) || []), feed.place?.category].filter(Boolean)
        );
        return myPrefTags.some((t) => cand.has(t));
    };

    // ?? 공유된 게시물 로딩 중일 때 로딩 UI만 표시
    if (sharedPostLoading) {
        return (
            <div className="h-full bg-white flex flex-col items-center justify-center font-['Pretendard']">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent mb-4"></div>
                <p className="text-gray-500 text-sm">게시물 불러오는 중...</p>
            </div>
        );
    }

    return (
        <div className="h-full bg-white flex flex-col font-['Pretendard'] relative">
            
            {/* 1. 상단 헤더 - 인스타그램 스타일 */}
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 z-10 bg-white">
                <div className="flex items-center justify-between mb-3">
                    <h1 className="text-xl font-bold">탐색</h1>
                    <div className="flex items-center gap-2">
                        {/* 그리드 ↔ 피드 전환 */}
                        <div className="flex rounded-xl bg-gray-100 p-0.5">
                            <button
                                onClick={() => setViewMode("grid")}
                                className={`px-2.5 py-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}
                                title="그리드 보기"
                            >
                                <Grid3X3 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode("feed")}
                                className={`px-2.5 py-1.5 rounded-lg transition-colors ${viewMode === "feed" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}
                                title="피드 보기"
                            >
                                <Square className="w-4 h-4" />
                            </button>
                        </div>
                        {/* 게시물 작성 버튼 */}
                        <Button
                            onClick={() => setIsCreatePostOpen(true)}
                            size="icon"
                            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl w-9 h-9"
                        >
                            <Plus className="w-5 h-5 text-white" />
                        </Button>
                    </div>
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
                
                {/* 필터 탭 (main_category 기반 일반화) */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    {DISCOVERY_FILTERS.map((f) => (
                        <Badge
                            key={f.key}
                            variant={selectedFilter === f.key ? "default" : "outline"}
                            className={`px-4 py-2 rounded-full cursor-pointer transition-all whitespace-nowrap ${
                                selectedFilter === f.key
                                    ? "bg-black text-white"
                                    : "text-gray-600 border-gray-200 hover:bg-gray-100"
                            }`}
                            onClick={() => setSelectedFilter(f.key)}
                        >
                            {f.reels && <Play className="w-3 h-3 mr-1" />}
                            {f.label}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* AI 맞춤 추천 섹션 제거됨 — 장소 추천(장소 상세)에서 제공하므로 탐색 탭에선 뺌 */}

            {/* 2-1. 장소 검색 결과 (검색바 입력 시) */}
            {searchQuery.trim().length >= 2 && (searchPlaceHits.length > 0 || searchPlaceLoading) && (
                <div className="px-4 py-3 border-b border-gray-100 bg-white">
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-xs font-bold text-gray-600">장소 바로가기</span>
                        {searchPlaceLoading && <span className="text-[10px] text-gray-400">검색 중...</span>}
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                        {searchPlaceHits.map((p: any, i: number) => (
                            <button
                                key={p.id ?? `${p.name}_${i}`}
                                onClick={() => {
                                    if (p.id) {
                                        recordAiAction("CLICK", p.id);
                                        router.push(`/places/${p.id}`);
                                    }
                                }}
                                className="flex-shrink-0 w-40 text-left bg-gray-50 hover:bg-gray-100 rounded-xl p-3 border border-gray-100 transition-colors"
                            >
                                <div className="font-bold text-xs text-gray-800 truncate">{p.name}</div>
                                <div className="text-[10px] text-gray-500 truncate mt-0.5">
                                    {[p.category, p.address].filter(Boolean).join(" · ") || "장소"}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. 게시물 — 그리드(인스타 탐색) ↔ 피드(인스타 홈) */}
            <div className="flex-1 overflow-y-auto bg-white">
                {/* 급상승 · 인기 크루 · 인기 리스트 — 발견의 입구라 탐색 탭이 담당 */}
                {!hideRankStrips && (
                    <>
                        <TrendingStrip />
                        <GroupStrip crewMode={crewMode} />
                        <ListRankingStrip />
                    </>
                )}
                {isLoading && (
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent mx-auto mb-3"></div>
                        <p className="text-sm text-gray-400">게시물 불러오는 중...</p>
                    </div>
                )}
                {filteredFeeds.length === 0 && !isLoading && (
                    <div className="py-16 text-center space-y-3">
                        <div className="text-4xl">📸</div>
                        <p className="text-sm text-gray-500 font-medium">
                            {searchQuery.trim()
                                ? `'${searchQuery.trim()}' 검색 결과가 없어요`
                                : "아직 게시물이 없어요"}
                        </p>
                        {!searchQuery.trim() && (
                            <Button
                                onClick={() => setIsCreatePostOpen(true)}
                                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl"
                            >
                                <Plus className="w-4 h-4 mr-1" /> 첫 게시물 올리기
                            </Button>
                        )}
                    </div>
                )}

                {viewMode === "grid" ? (
                    <div className="grid grid-cols-3 gap-0.5 p-0.5">
                        {filteredFeeds.map((feed, index) => (
                            <React.Fragment key={feed.id}>
                            <div
                                onClick={() => handleFeedClick(feed)}
                                className={`relative aspect-square cursor-pointer group overflow-hidden ${getGridClass(index)}`}
                            >
                                {feed.type === "video" ? (
                                    (feed as any).poster ? (
                                        <img
                                            src={(feed as any).poster}
                                            alt=""
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                        />
                                    ) : (
                                        <video
                                            src={feed.images[0]}
                                            muted
                                            playsInline
                                            preload="metadata"
                                            className="w-full h-full object-cover"
                                        />
                                    )
                                ) : (
                                    <img
                                        src={feed.images[0]}
                                        alt=""
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                    />
                                )}

                                {/* 취향 매칭 배지(검색어 없을 때만) */}
                                {!searchQuery.trim() && isTasteMatch(feed) && (
                                    <div className="absolute top-1.5 left-1.5 bg-amber-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                                        ✨ 취향
                                    </div>
                                )}

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
                            {/* 그리드 중간(6번째 이후)에 큐레이터 추천 한 줄 끼움 */}
                            {index === 5 && filteredFeeds.length > 6 && (
                                <div className="col-span-3">
                                    <CuratorStrip />
                                </div>
                            )}
                            </React.Fragment>
                        ))}
                    </div>
                ) : (
                    /* 📜 세로 피드 뷰 (인스타 홈 스타일) */
                    <div className="divide-y divide-gray-100">
                        {filteredFeeds.map((feed) => (
                            <div key={`feed-${feed.id}`} className="pb-3">
                                {/* 작성자 헤더 */}
                                <div className="flex items-center gap-2.5 px-4 py-3">
                                    <button
                                        onClick={() => { const _id = feed.author?.id; if (_id && _id !== 999) router.push(`/users/${_id}`) }}
                                        className="flex-shrink-0"
                                    >
                                        <Avatar className="w-8 h-8">
                                            <AvatarFallback className="text-xs bg-gradient-to-r from-amber-400 to-orange-400 text-white">
                                                {feed.author?.avatar || "US"}
                                            </AvatarFallback>
                                        </Avatar>
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <div
                                            className="text-sm font-semibold text-gray-900 truncate cursor-pointer"
                                            onClick={() => { const _id = feed.author?.id; if (_id && _id !== 999) router.push(`/users/${_id}`) }}
                                        >{feed.author?.name}</div>
                                        {(feed.place?.name || feed.locationName) && (
                                            <div className="text-[11px] text-gray-500 truncate flex items-center gap-0.5">
                                                <MapPin className="w-3 h-3" />
                                                {feed.place?.name || feed.locationName}
                                            </div>
                                        )}
                                    </div>
                                    {!searchQuery.trim() && isTasteMatch(feed) && (
                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">✨ 취향</span>
                                    )}
                                    <button onClick={() => setModTarget(feed)} className="p-1 text-gray-400">
                                        <MoreHorizontal className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* 미디어 (더블탭 좋아요) — 영상이면 <video> */}
                                <div className="relative select-none" onClick={() => handleImageTap(feed)}>
                                    {feed.type === "video" ? (
                                        <video
                                            src={feed.images[0]}
                                            poster={(feed as any).poster || undefined}
                                            controls
                                            playsInline
                                            className="w-full aspect-square object-contain bg-black"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <img src={feed.images[0]} alt="" className="w-full aspect-square object-cover" />
                                    )}
                                    {heartOverlayId === feed.id && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <Heart className="w-24 h-24 text-white fill-white drop-shadow-2xl animate-ping" />
                                        </div>
                                    )}
                                    {feed.images.length > 1 && (
                                        <div className="absolute top-3 right-3 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                                            1/{feed.images.length}
                                        </div>
                                    )}
                                </div>

                                {/* 액션 바 */}
                                <div className="flex items-center justify-between px-4 pt-3">
                                    <div className="flex items-center gap-4">
                                        <button onClick={(e) => handleLike(feed.id, e, feed.place?.id)}>
                                            <Heart className={`w-6 h-6 ${feed.isLiked ? "fill-red-500 text-red-500" : "text-gray-800"}`} />
                                        </button>
                                        <button onClick={() => handleFeedClick(feed)}>
                                            <MessageCircle className="w-6 h-6 text-gray-800" />
                                        </button>
                                        <button onClick={() => handleShare(feed)}>
                                            <Send className="w-6 h-6 text-gray-800" />
                                        </button>
                                    </div>
                                    <button onClick={(e) => handleSave(feed.id, e, feed.place?.id)}>
                                        <Bookmark className={`w-6 h-6 ${feed.isSaved ? "fill-gray-900 text-gray-900" : "text-gray-800"}`} />
                                    </button>
                                </div>

                                {/* 좋아요/내용 */}
                                <div className="px-4 pt-2 space-y-1">
                                    <div className="text-sm font-semibold text-gray-900">좋아요 {Number(feed.likes || 0).toLocaleString()}개</div>
                                    {feed.content && (
                                        <p className="text-sm text-gray-800 leading-snug">
                                            <span className="font-semibold mr-1.5">{feed.author?.name}</span>
                                            <RichText text={feed.content} onHashtag={handleHashtagClick} />
                                        </p>
                                    )}
                                    {feed.comments > 0 && (
                                        <button onClick={() => handleFeedClick(feed)} className="text-xs text-gray-400">
                                            댓글 {feed.comments}개 모두 보기
                                        </button>
                                    )}
                                    <div className="text-[10px] text-gray-400">{feed.createdAt}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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
                                    {/* 공유된 게시물에서 온 경우 뒤로가기 버튼 */}
                                    {isFromSharedPost && onBackFromShared && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => {
                                                setSelectedFeed(null);
                                                setIsFromSharedPost(false);
                                                onBackFromShared();
                                            }}
                                            className="mr-1"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </Button>
                                    )}
                                    <button
                                        onClick={() => { const _id = selectedFeed.author?.id; if (_id && _id !== 999) router.push(`/users/${_id}`) }}
                                        className="flex-shrink-0"
                                    >
                                        <Avatar className="w-8 h-8">
                                            <AvatarFallback className="text-xs bg-gradient-to-r from-amber-400 to-orange-400 text-white">
                                                {selectedFeed.author.avatar}
                                            </AvatarFallback>
                                        </Avatar>
                                    </button>
                                    <div>
                                        <div
                                            className="font-semibold text-sm cursor-pointer"
                                            onClick={() => { const _id = selectedFeed.author?.id; if (_id && _id !== 999) router.push(`/users/${_id}`) }}
                                        >{selectedFeed.author.name}</div>
                                        {selectedFeed.place ? (
                                            <div className="text-xs text-gray-500">{selectedFeed.place.name}</div>
                                        ) : selectedFeed.locationName ? (
                                            <div className="text-xs text-gray-500">{selectedFeed.locationName}</div>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    {/* 신고/차단 메뉴 */}
                                    <Button variant="ghost" size="icon" onClick={() => setModTarget(selectedFeed)}>
                                        <MoreHorizontal className="w-5 h-5 text-gray-400" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => {
                                        setSelectedFeed(null);
                                        if (isFromSharedPost && onBackFromShared) {
                                            setIsFromSharedPost(false);
                                            onBackFromShared();
                                        }
                                    }}>
                                        <X className="w-5 h-5" />
                                    </Button>
                                </div>
                            </div>

                            {/* 미디어 — 영상이면 <video> */}
                            <div className="aspect-square relative bg-black">
                                {selectedFeed.type === "video" ? (
                                    <video
                                        src={selectedFeed.images[0]}
                                        poster={(selectedFeed as any).poster || undefined}
                                        controls
                                        playsInline
                                        autoPlay
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <img
                                        src={selectedFeed.images[0]}
                                        alt=""
                                        className="w-full h-full object-contain"
                                    />
                                )}
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
                                            <MessageCircle className={`w-6 h-6 ${showComments ? 'text-amber-500' : ''}`} />
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
                                    <RichText text={selectedFeed.content} onHashtag={handleHashtagClick} />
                                </p>
                                <p className="text-xs text-gray-400 mt-2">{selectedFeed.createdAt}</p>
                                {selectedFeed.locationName && !selectedFeed.place && (
                                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        <span>{selectedFeed.locationName}</span>
                                    </div>
                                )}
                                
                                {/* 가게 정보 버튼 */}
                                {selectedFeed.place && (
                                    <button 
                                        onClick={() => {
                                            const postId = typeof selectedFeed.id === "string" ? selectedFeed.id : undefined;
                                            recordAiAction("CLICK", selectedFeed.place?.id, postId);
                                            if (selectedFeed.place?.id) {
                                                router.push(`/places/${selectedFeed.place.id}`);
                                                return;
                                            }
                                            setIsPlaceModalOpen(true);
                                        }}
                                        className="mt-3 w-full bg-gray-100 hover:bg-gray-200 rounded-xl p-3 flex items-center gap-3 transition-colors"
                                    >
                                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                                            <Utensils className="w-5 h-5 text-amber-600" />
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
                                
                                {/* ?? 댓글 섹션 */}
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
                                                className="bg-amber-500 hover:bg-amber-600 h-9"
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
            <Dialog
                open={isCreatePostOpen}
                onOpenChange={(open) => {
                    if (!open) resetCreatePostDraft();
                    setIsCreatePostOpen(open);
                }}
            >
                <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-xl max-h-[85dvh] flex flex-col">
                    <DialogHeader className="p-4 border-b flex flex-row items-center justify-between flex-shrink-0">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                                resetCreatePostDraft();
                                setIsCreatePostOpen(false);
                            }}
                        >
                            취소
                        </Button>
                        <DialogTitle className="text-base font-semibold">새 게시물</DialogTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-600 font-semibold hover:text-amber-700"
                            onClick={handlePost}
                            disabled={!canPost || isPosting}
                        >
                            {isPosting ? "게시 중..." : "공유"}
                        </Button>
                    </DialogHeader>

                    {/* 사진 아래 정보 입력까지 모바일에서 스크롤 가능해야 함 */}
                    <div className="p-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
                        {/* 사진 ↔ 동영상(숏폼) 전환 — 빈 상태에서만 노출 */}
                        {newPostImages.length === 0 && !isVideoDraft && (
                            <div className="flex rounded-xl bg-gray-100 p-1 mb-4 text-sm font-semibold">
                                <button
                                    onClick={() => setDraftMediaType("image")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 transition-colors ${draftMediaType === "image" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}
                                >
                                    <ImageIcon className="w-4 h-4" /> 사진
                                </button>
                                <button
                                    onClick={() => setDraftMediaType("video")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 transition-colors ${draftMediaType === "video" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}
                                >
                                    <Video className="w-4 h-4" /> 동영상
                                </button>
                            </div>
                        )}

                        {/* === 영상 미리보기/선택 === */}
                        {isVideoDraft ? (
                            <div className="relative mb-4">
                                <div className="aspect-square rounded-xl overflow-hidden bg-black">
                                    <video
                                        src={draftVideoUrl}
                                        poster={draftVideoPoster || undefined}
                                        controls
                                        playsInline
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <button
                                    onClick={removeDraftVideo}
                                    className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-full hover:bg-black/80 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    숏폼
                                </div>
                            </div>
                        ) : draftMediaType === "video" ? (
                            <div
                                onClick={() => !isUploadingVideo && videoInputRef.current?.click()}
                                className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors mb-4"
                            >
                                {isUploadingVideo ? (
                                    <>
                                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent mb-3" />
                                        <p className="text-sm text-gray-500">영상 올리는 중...</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                            <Video className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <p className="text-sm text-gray-500">동영상을 선택하세요</p>
                                        <p className="text-xs text-gray-400 mt-1">최대 60초 · 50MB (mp4/mov/webm)</p>
                                    </>
                                )}
                            </div>
                        ) : newPostImages.length > 0 ? (
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
                                                className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-amber-500' : 'bg-white/60'}`}
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
                                <p className="text-xs text-gray-400 mt-1">사진 위에 글·필터를 입혀보세요 · 최대 10장</p>
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
                        <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/mp4,video/quicktime,video/webm"
                            onChange={handleVideoSelect}
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
                        
                        {/* 문구 입력 — #해시태그 / @멘션 지원 */}
                        <div className="relative">
                            <Textarea
                                ref={contentRef}
                                placeholder="문구를 작성하세요...  #해시태그  @친구"
                                value={newPostContent}
                                onChange={handleContentChange}
                                className="resize-none border-none bg-gray-50 rounded-xl min-h-[100px] focus-visible:ring-0"
                            />
                            {/* @멘션 자동완성 */}
                            {mentionQuery !== null && mentionMatches.length > 0 && (
                                <div className="absolute left-0 right-0 bottom-full mb-1 z-30 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden">
                                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 border-b">친구 멘션</div>
                                    {mentionMatches.map((f: any) => (
                                        <button
                                            key={f.id}
                                            onClick={() => pickMention({ id: f.id, name: f.name })}
                                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-amber-50 text-left"
                                        >
                                            <Avatar className="w-7 h-7">
                                                <AvatarFallback className="bg-amber-50 text-amber-600 text-xs font-bold">
                                                    {f.name?.[0] || "?"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm text-gray-800">{f.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* 멘션 칩 */}
                        {draftMentions.filter(m => newPostContent.includes(`@${m.name}`)).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {draftMentions.filter(m => newPostContent.includes(`@${m.name}`)).map(m => (
                                    <span key={m.id} className="text-[11px] bg-sky-50 text-sky-600 font-medium px-2 py-0.5 rounded-full">
                                        @{m.name}
                                    </span>
                                ))}
                            </div>
                        )}
                        {(myFriends || []).length === 0 && (
                            <p className="text-[11px] text-gray-400 mt-1.5">친구를 추가하면 @로 멘션할 수 있어요.</p>
                        )}
                        
                        {/* 위치/장소 태그 */}
                        <div className="mt-4 space-y-3">
                            <div className="rounded-xl border border-gray-200 p-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <MapPin className="w-4 h-4 text-gray-400" />
                                    <span>위치</span>
                                </div>
                                {selectedLocation && (
                                    <div className="mt-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-gray-800 truncate">
                                                {selectedLocation.name || selectedLocation.title || selectedLocation.address}
                                            </div>
                                            {selectedLocation.address && (
                                                <div className="text-gray-500 truncate">{selectedLocation.address}</div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={clearLocationSelection}
                                            className="ml-2 text-gray-400 hover:text-gray-600"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                                <div className="mt-2">
                                    <Input
                                        placeholder="지역/역/주소 검색"
                                        value={locationQuery}
                                        onChange={(e) => {
                                            if (selectedLocation) setSelectedLocation(null);
                                            setLocationQuery(e.target.value);
                                        }}
                                        className="bg-gray-50 border-none h-10 text-sm rounded-xl"
                                    />
                                </div>
                                {locationSearching && (
                                    <p className="text-xs text-gray-400 mt-2">검색 중...</p>
                                )}
                                {!locationSearching && locationQuery.length >= 2 && locationResults.length === 0 && (
                                    <p className="text-xs text-gray-400 mt-2">검색 결과가 없습니다.</p>
                                )}
                                {locationResults.length > 0 && (
                                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-white shadow-sm">
                                        {locationResults.map((item: any, idx: number) => (
                                            <button
                                                type="button"
                                                key={`${item.name || item.title || item.address}_${idx}`}
                                                onClick={() => handleSelectLocation(item)}
                                                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-50"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-800 truncate">
                                                        {item.name || item.title || item.address}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">
                                                        {item.address || "주소 정보 없음"}
                                                    </div>
                                                </div>
                                                {item.source && (
                                                    <Badge variant="secondary" className="text-[10px] font-normal">
                                                        {item.source === "db" ? "DB" : "외부"}
                                                    </Badge>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-xl border border-gray-200 p-3">
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                    <Utensils className="w-4 h-4 text-gray-400" />
                                    <span>장소 태그</span>
                                </div>
                                {selectedPlace && (
                                    <div className="mt-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-gray-800 truncate">{selectedPlace.name}</div>
                                            <div className="text-gray-500 truncate">{selectedPlace.address || "주소 정보 없음"}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={clearPlaceSelection}
                                            className="ml-2 text-gray-400 hover:text-gray-600"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                                <div className="mt-2">
                                    <Input
                                        placeholder="장소 이름 검색"
                                        value={placeQuery}
                                        onChange={(e) => {
                                            if (selectedPlace) setSelectedPlace(null);
                                            setPlaceQuery(e.target.value);
                                        }}
                                        className="bg-gray-50 border-none h-10 text-sm rounded-xl"
                                    />
                                </div>
                                {placeSearching && (
                                    <p className="text-xs text-gray-400 mt-2">검색 중...</p>
                                )}
                                {!placeSearching && placeQuery.length >= 2 && placeResults.length === 0 && (
                                    <p className="text-xs text-gray-400 mt-2">검색 결과가 없습니다.</p>
                                )}
                                {placeResults.length > 0 && (
                                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-white shadow-sm">
                                        {placeResults.map((item: any, idx: number) => (
                                            <button
                                                type="button"
                                                key={`${item.name || item.title}_${idx}`}
                                                onClick={() => handleSelectPlace(item)}
                                                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-50"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-800 truncate">{item.name || item.title}</div>
                                                    <div className="text-xs text-gray-500 truncate">{item.address || "주소 정보 없음"}</div>
                                                    {item.category && (
                                                        <div className="text-[10px] text-gray-400 mt-0.5">{item.category}</div>
                                                    )}
                                                </div>
                                                {typeof item.wemeet_rating === "number" && (
                                                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                                        {item.wemeet_rating.toFixed(1)}
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
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
                                        <Badge variant="secondary" className="text-xs font-normal text-amber-600 bg-amber-50">
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
                                <Button className="w-full h-12 text-base font-bold bg-amber-600 hover:bg-amber-700 rounded-xl">
                                    바로 예약하기
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
            
            {/* 6. 사진 편집 모달 */}
            {/* 🚨 신고/차단 액션 시트 */}
            {modTarget && (
                <div
                    className="fixed inset-0 z-[90] bg-black/50 flex items-end justify-center"
                    onClick={() => setModTarget(null)}
                >
                    <div
                        className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-2 font-['Pretendard']"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-sm font-bold text-gray-800 mb-1">이 게시물 신고하기</div>
                        {[
                            { key: "spam", label: "스팸 / 광고" },
                            { key: "abuse", label: "욕설 / 혐오 발언" },
                            { key: "adult", label: "음란물 / 부적절한 콘텐츠" },
                            { key: "false_info", label: "허위 정보" },
                        ].map((r) => (
                            <button
                                key={r.key}
                                onClick={() => reportPost(modTarget, r.key)}
                                className="w-full text-left px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-sm text-gray-700"
                            >
                                {r.label}
                            </button>
                        ))}
                        {modTarget?.author?.id && (
                            <button
                                onClick={() => blockAuthor(modTarget)}
                                className="w-full text-left px-4 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-sm font-semibold text-rose-600"
                            >
                                🚫 {modTarget.author?.name || "이 사용자"} 차단하기
                            </button>
                        )}
                        <button
                            onClick={() => setModTarget(null)}
                            className="w-full px-4 py-3 rounded-xl text-sm text-gray-400"
                        >
                            취소
                        </button>
                    </div>
                </div>
            )}

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
                            <Bookmark className="w-5 h-5 text-amber-500" />
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
                                                ? "bg-amber-100 border-2 border-amber-500"
                                                : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                                        }`}
                                    >
                                        <span className="text-xl">{folder.icon}</span>
                                        <div className="flex-1 text-left">
                                            <div className="font-medium">{folder.name}</div>
                                            <div className="text-xs text-gray-500">{folder.item_count}개 저장됨</div>
                                        </div>
                                        {selectedFolderId === folder.id && (
                                            <Check className="w-5 h-5 text-amber-500" />
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
                                    className="bg-amber-500 hover:bg-amber-600"
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
                            className="bg-amber-500 hover:bg-amber-600"
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
                            <Send className="w-5 h-5 text-amber-500" />
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
                                        ? "bg-amber-100 border-2 border-amber-500 text-amber-700"
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
                                        ? "bg-amber-100 border-2 border-amber-500 text-amber-700"
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
                                                            ? "bg-amber-100 border-2 border-amber-500"
                                                            : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                                                    }`}
                                                >
                                                    <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-400 rounded-full flex items-center justify-center">
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
                                                        <Check className="w-5 h-5 text-amber-500" />
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
                                                className="text-xs text-amber-500 hover:text-amber-600 font-medium"
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
                                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                        {item.image ? (
                                                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <MapPin className="w-5 h-5 text-amber-400" />
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
                                                    className="mt-2 text-sm text-amber-500 hover:text-amber-600 font-medium"
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
                                                                    ? "bg-amber-100 border-2 border-amber-500"
                                                                    : "bg-gray-50 hover:bg-gray-100 border-2 border-transparent"
                                                            }`}
                                                        >
                                                            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-400 rounded-full flex items-center justify-center">
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
                                                                <Check className="w-4 h-4 text-amber-500" />
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
                                className="bg-amber-500 hover:bg-amber-600"
                            >
                                공유하기
                            </Button>
                        )}
                        {shareMode === "cart" && cartItems.length > 0 && (
                            <Button
                                onClick={shareCart}
                                disabled={!selectedRoomId}
                                className="bg-amber-500 hover:bg-amber-600"
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




