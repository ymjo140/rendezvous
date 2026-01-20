import React from "react"
import { Search, Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

type HomeHeaderProps = {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  onSearchSubmit: () => void
  onOpenFilter: () => void
  selectedFilters: Record<string, string[]>
  currentFiltersLabel?: string
  onRemoveTag: (tag: string) => void
}

export const HomeHeader = ({
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  onOpenFilter,
  selectedFilters,
  currentFiltersLabel,
  onRemoveTag,
}: HomeHeaderProps) => {
  return (
    <div className="absolute top-4 left-4 right-4 z-10">
      <div className="flex items-center bg-white rounded-2xl shadow-md h-12 px-4 border border-gray-100">
        <Search className="w-5 h-5 text-gray-400 mr-2" />
        <Input
          className="border-none bg-transparent h-full text-base p-0"
          placeholder="빠른 장소 검색(예: 강남)"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto mt-2 pb-1 scrollbar-hide">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full bg-white shadow-sm border-[#7C3AED] text-[#7C3AED]"
          onClick={onOpenFilter}
        >
          <Filter className="w-3 h-3 mr-1" />필터</Button>
        {currentFiltersLabel && (
          <Badge className="rounded-full bg-gradient-to-r from-[#7C3AED] to-[#14B8A6] border-0 text-white h-9 px-3 flex items-center">
            {currentFiltersLabel}
          </Badge>
        )}
        {Object.entries(selectedFilters)
          .flatMap(([, v]) => v)
          .map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-9 px-3 rounded-full bg-white text-gray-600 border border-gray-200 text-xs font-normal whitespace-nowrap flex-shrink-0 cursor-pointer"
              onClick={() => onRemoveTag(tag)}
            >
              {tag} <X className="w-3 h-3 ml-1" />
            </Badge>
          ))}
      </div>
    </div>
  )
}

