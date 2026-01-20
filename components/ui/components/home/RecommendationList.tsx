import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"

type RecommendationListProps = {
  recommendations: any[]
  activeTabIdx: number
  onSelectTab: (index: number) => void
  currentDisplayRegion: any
  onPlaceClick: (place: any) => void
  onReset: () => void
}

const PlaceCard = ({ place, onClick }: { place: any; onClick: () => void }) => (
  <div
    className="bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
    onClick={onClick}
  >
    <div className="flex-1">
      <div className="font-bold text-gray-800 flex items-center gap-2">
        {place.name || place.title}
        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
          {place.wemeet_rating
            ? `⭐${place.wemeet_rating.toFixed(1)}`
            : place.score
            ? `⭐${place.score}`
            : ""}
        </span>
      </div>
      <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
        <MapPin className="w-3 h-3" /> {place.category || "장소"}
        {place.tags && <span className="text-gray-400">| {place.tags.slice(0, 2).join(", ")}</span>}
      </div>
      <div className="text-[10px] text-gray-400 mt-1">{place.address}</div>
    </div>
    <Button size="sm" variant="outline" className="ml-2 h-8 text-xs">
      상세
    </Button>
  </div>
)

export const RecommendationList = ({
  recommendations,
  activeTabIdx,
  onSelectTab,
  currentDisplayRegion,
  onPlaceClick,
  onReset,
}: RecommendationListProps) => {
  return (
    <AnimatePresence>
      {recommendations.length > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] max-h-[60vh] overflow-y-auto z-20"
        >
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">추천 지역</h3>
            <button onClick={onReset} className="text-xs text-gray-400">
              다시 찾기
            </button>
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
            {recommendations.map((r, i) => (
              <button
                key={i}
                onClick={() => onSelectTab(i)}
                className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                  activeTabIdx === i ? "bg-[#7C3AED] text-white shadow-md" : "bg-gray-100 text-gray-500"
                }`}
              >
                {r.region_name}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {currentDisplayRegion?.places?.map((p: any) => (
              <PlaceCard key={p.id} place={p} onClick={() => onPlaceClick(p)} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
