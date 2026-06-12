"use client"

import { Star, MapPin, Heart } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface PlaceCardProps {
  place: any;
  onClick: () => void;
  isFavorite?: boolean; // 즐겨찾기 여부 표시용 (선택)
}

export function PlaceCard({ place, onClick, isFavorite = false }: PlaceCardProps) {
  // 이미지가 없을 경우 카테고리별 랜덤 이미지
  const getPlaceholderImage = (category: string) => {
    if (category?.includes('cafe')) return "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80";
    if (category?.includes('pub')) return "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80";
    return "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80";
  };

  return (
    <div 
      onClick={onClick}
      className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100 mb-4"
    >
      {/* 1. 이미지 영역 */}
      <div className="relative h-40 w-full overflow-hidden">
        <img 
          src={place.image_url || getPlaceholderImage(place.category)} 
          alt={place.name} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        
        {/* 평점 뱃지 */}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-bold text-[#F5A623] shadow-sm">
          <Star className="w-3 h-3 fill-[#F5A623]" /> {place.score || "4.5"}
        </div>

        {/* 하트 아이콘 (장식용) */}
        <div className="absolute top-3 left-3 text-white drop-shadow-md">
            <Heart className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : "text-white"}`} />
        </div>

        {/* 카테고리 뱃지 */}
        {place.category && (
            <Badge className="absolute bottom-3 left-3 bg-black/40 hover:bg-black/50 text-white backdrop-blur-md border-0 text-[10px] px-2 py-0.5">
                {place.category === 'restaurant' ? '🍽️ 맛집' : place.category === 'cafe' ? '☕ 카페' : '🍺 술집'}
            </Badge>
        )}
      </div>

      {/* 2. 정보 영역 */}
      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-lg text-gray-800 truncate pr-2">{place.name}</h3>
        </div>
        
        <div className="flex items-center text-xs text-gray-500 mb-3">
          <MapPin className="w-3 h-3 mr-1 text-[#14B8A6]" /> {place.address || "서울시 핫플레이스"}
        </div>

        {/* 태그 영역 */}
        <div className="flex flex-wrap gap-1.5">
          {(place.tags || []).slice(0, 3).map((tag: string, i: number) => (
            <span key={i} className="text-[10px] bg-[#F3F4F6] text-[#6B7280] px-2 py-1 rounded-full font-medium">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}