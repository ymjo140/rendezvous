"use client"

import React from "react"
import { Flame, Shield } from "lucide-react"

interface DateOption {
  id: string
  label: string
  date: string
  intensity: "high" | "medium" | "low"
  flames: number
}

const dateOptions: DateOption[] = [
  { id: "today", label: "Today", date: "Today", intensity: "high", flames: 3 },
  { id: "tomorrow", label: "Tomorrow", date: "Tomorrow", intensity: "medium", flames: 2 },
  { id: "tue", label: "Tue", date: "Tue", intensity: "medium", flames: 2 },
  { id: "wed", label: "Wed", date: "Wed", intensity: "medium", flames: 1 },
  { id: "thu", label: "Thu", date: "Thu", intensity: "medium", flames: 2 },
  { id: "fri", label: "Fri", date: "Fri", intensity: "low", flames: 0 },
  { id: "sat", label: "Sat", date: "Sat", intensity: "low", flames: 0 }
]

interface DateNavigatorProps {
  selectedDate: string
  onSelectDate: (dateId: string) => void
}

export function DateNavigator({ selectedDate, onSelectDate }: DateNavigatorProps) {
  const getBarHeight = (intensity: string) => {
    switch (intensity) {
      case "high":
        return "h-16"
      case "medium":
        return "h-10"
      case "low":
        return "h-6"
      default:
        return "h-8"
    }
  }

  const getBarColor = (intensity: string) => {
    switch (intensity) {
      case "high":
        return "bg-gradient-to-t from-red-600 to-orange-500"
      case "medium":
        return "bg-gradient-to-t from-orange-500 to-yellow-500"
      case "low":
        return "bg-gradient-to-t from-blue-500 to-blue-400"
      default:
        return "bg-gray-600"
    }
  }

  return (
    <div className="bg-[#1c1c1c] border-y border-gray-800">
      <div className="px-6 pt-4 pb-2">
        <h3 className="text-white font-bold text-sm">Deal Intensity</h3>
        <p className="text-gray-400 text-xs mt-0.5">Pick a day with the best momentum</p>
      </div>

      <div className="overflow-x-auto px-4 pb-4 hide-scrollbar">
        <div className="flex gap-3 min-w-max">
          {dateOptions.map((option) => {
            const isSelected = selectedDate === option.id
            return (
              <button
                key={option.id}
                onClick={() => onSelectDate(option.id)}
                className={`flex-shrink-0 w-20 transition-all ${
                  isSelected ? "scale-105" : "opacity-70 hover:opacity-100"
                }`}
              >
                <div
                  className={`p-3 rounded-2xl ${
                    isSelected ? "bg-gradient-to-br from-orange-600 to-orange-500" : "bg-gray-800"
                  }`}
                >
                  <div className="text-center mb-3">
                    <div className="text-white font-bold text-sm">{option.label}</div>
                    <div className={`text-xs mt-0.5 ${isSelected ? "text-orange-100" : "text-gray-400"}`}>
                      {option.date}
                    </div>
                  </div>

                  <div className="flex items-end justify-center h-16 mb-2">
                    <div className={`w-8 rounded-t-md ${getBarHeight(option.intensity)} ${getBarColor(option.intensity)} transition-all`} />
                  </div>

                  <div className="flex justify-center items-center gap-0.5 h-5">
                    {option.intensity === "low" ? (
                      <Shield className="w-4 h-4 text-blue-400" />
                    ) : (
                      Array.from({ length: option.flames }).map((_, i) => (
                        <Flame key={i} className="w-3.5 h-3.5 text-orange-400 fill-current" />
                      ))
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}
