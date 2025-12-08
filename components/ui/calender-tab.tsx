import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MoreHorizontal, Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { fetchWithAuth } from "@/lib/api-client"

export function CalendarTab() {
    const [date, setDate] = useState<Date>(new Date())
    const [events, setEvents] = useState<any[]>([])
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())

    useEffect(() => {
        const loadEvents = async () => {
            const res = await fetchWithAuth("/api/events")
            if (res.ok) {
                setEvents(await res.json())
            }
        }
        loadEvents()
    }, [])

    const getDaysInMonth = (year: number, month: number) => {
        const date = new Date(year, month, 1)
        const days = []
        while (date.getMonth() === month) {
            days.push(new Date(date))
            date.setDate(date.getDate() + 1)
        }
        return days
    }

    const currentYear = date.getFullYear()
    const currentMonth = date.getMonth()
    const days = getDaysInMonth(currentYear, currentMonth)

    // Fill padding for start of week
    const startDay = days[0].getDay()
    const padding = Array(startDay).fill(null)

    const eventsOnDate = (d: Date) => {
        const dateStr = d.toISOString().split('T')[0]
        return events.filter(e => e.date === dateStr)
    }

    const selectedEvents = eventsOnDate(selectedDate)

    const handlePrevMonth = () => setDate(new Date(currentYear, currentMonth - 1, 1))
    const handleNextMonth = () => setDate(new Date(currentYear, currentMonth + 1, 1))

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="p-4 pb-2 bg-white sticky top-0 z-10 shadow-sm">
                <h1 className="text-xl font-bold">Calendar</h1>
            </div>

            <ScrollArea className="flex-1 px-4 pb-4">
                <div className="space-y-6 pb-20">
                    {/* Calendar Widget */}
                    <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 mt-2">
                        <div className="flex justify-between items-center mb-4 px-2">
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-6 w-6"><ChevronLeft className="w-4 h-4" /></Button>
                                <span className="text-lg font-bold">{currentYear}. {currentMonth + 1}.</span>
                                <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-6 w-6"><ChevronRight className="w-4 h-4" /></Button>
                            </div>
                            <Button size="sm" variant="outline" className="h-7 text-xs rounded-full border-teal-200 text-teal-600">공유 캘린더</Button>
                        </div>

                        <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-400 mb-2">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d}>{d}</div>)}
                        </div>
                        <div className="grid grid-cols-7 gap-y-4 text-center text-sm font-medium text-gray-700">
                            {padding.map((_, i) => <div key={`pad-${i}`} />)}

                            {days.map((d, i) => {
                                const dayEvents = eventsOnDate(d)
                                const isSelected = d.toDateString() === selectedDate.toDateString()
                                const isToday = d.toDateString() === new Date().toDateString()

                                return (
                                    <div key={i}
                                        onClick={() => setSelectedDate(d)}
                                        className={`relative rounded-full w-8 h-8 flex items-center justify-center mx-auto cursor-pointer
                                            ${isSelected ? 'bg-indigo-100 text-indigo-700' : ''}
                                            ${isToday && !isSelected ? 'text-teal-600 font-bold' : ''}
                                        `}
                                    >
                                        {d.getDate()}
                                        {dayEvents.length > 0 && (
                                            <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? 'bg-indigo-500' : 'bg-[#2dd4bf]'}`}></span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* AI Briefing */}
                    {selectedEvents.length > 0 ? (
                        <div>
                            <h3 className="font-bold text-sm mb-3">AI 브리핑</h3>
                            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex gap-4">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-xl">🤖</div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-sm mb-1">{selectedEvents[0].title} 준비되셨나요?</h4>
                                    <div className="space-y-1 text-xs text-gray-500">
                                        <div className="flex items-center gap-2"><span>⛅️ 예상 날씨</span> <span className="font-medium text-gray-700">맑음 22°C</span></div>
                                        <div className="flex items-center gap-2"><span>🗺️ 장소</span> <span className="font-medium text-gray-700">{selectedEvents[0].location_name || "미정"}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-xs text-gray-400">
                            해당 날짜에 예정된 일정이 없습니다.
                        </div>
                    )}

                    {/* Upcoming Meeting List */}
                    <div>
                        <h3 className="font-bold text-sm mb-3">일정 목록</h3>
                        <div className="space-y-3">
                            {selectedEvents.length > 0 ? selectedEvents.map((ev: any) => (
                                <div key={ev.id} className="bg-[#f0fdf9] rounded-2xl p-4 shadow-sm border border-[#ccfbf1] relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2 font-bold text-sm">📘 {ev.title}</div>
                                        <div className="text-gray-400"><MoreHorizontal className="w-4 h-4" /></div>
                                    </div>

                                    <div className="flex items-end justify-between">
                                        <div className="flex gap-3">
                                            <div className="space-y-1 text-xs text-gray-600">
                                                <div>📍 {ev.location_name || "장소 미정"}</div>
                                                <div>📅 {ev.date}</div>
                                                <div>🕒 {ev.time}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center text-gray-400 text-xs py-4">일정이 없습니다.</div>
                            )}
                        </div>
                    </div>

                </div>
            </ScrollArea>

            <div className="absolute bottom-20 right-4">
                <Button className="rounded-full h-12 px-6 bg-[#2dd4bf] hover:bg-[#25c2af] text-white shadow-lg font-bold">
                    <Plus className="w-5 h-5 mr-1" /> 새 약속 만들기
                </Button>
            </div>
        </div>
    )
}
