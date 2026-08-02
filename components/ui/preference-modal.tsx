"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { fetchWithAuth } from "@/lib/api-client"
import { ChevronRight, Check } from "lucide-react"
// 온보딩과 같은 컴포넌트 — 두 벌이면 한쪽만 고쳐서 어긋난다.
import { MenuPicker, useMenuGroups, toggleMenuKey } from "@/components/ui/menu-picker"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "")

const OPTIONS = {
  // 좋아하는 음식은 더 이상 여기 없다. '한식·양식' 같은 굵은 말로는 취향 축이 안 서서
  // (DB에서 '한식'만 46,541곳=37%) 메뉴 단위 MenuPicker로 대체했다.
  // 불호(감점) + 알레르기(추천 제외). 그룹 추천 시 멤버 전원 반영.
  dislikes: ["매운맛", "내장/곱창", "날것/회", "고수", "오이", "양고기", "해산물", "없음"],
  allergies: ["갑각류", "조개류", "견과류", "유제품", "계란", "밀/글루텐", "복숭아"],
  vibes: ["조용한", "감성적인", "힙한", "가성비", "뷰맛집", "인스타감성", "고급진", "야외", "깔끔한", "이국적인"],
  // 술은 '소주·맥주·와인'만으론 얇다. 위스키·사케·고량주는 가게 성격이 확 갈리고,
  // '안 마셔요'는 그룹 추천에서 술집을 빼야 할지 정하는 신호라 알레르기만큼 중요하다.
  alcohol: ["소주", "맥주", "막걸리/전통주", "와인", "위스키", "하이볼",
            "칵테일", "사케/청주", "고량주", "안 마셔요"],
}

interface PreferenceModalProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

export function PreferenceModal({ isOpen, onClose, onComplete }: PreferenceModalProps) {
  const [step, setStep] = useState(1)
  // 모달이 열릴 때만 받는다. 이 컴포넌트는 마이페이지에 늘 렌더돼 있어서,
  // 조건 없이 받으면 마이페이지를 열 때마다 쓰지도 않을 요청이 나간다.
  const { groups: menuGroups, loading: menusLoading } = useMenuGroups(API_URL, isOpen)
  const [pickedMenus, setPickedMenus] = useState<string[]>([])
  const [selections, setSelections] = useState<{
    foods: string[]
    disliked_foods: string[]
    vibes: string[]
    alcohol: string[]
    avg_spend: number
  }>({
    foods: [],
    disliked_foods: [],
    vibes: [],
    alcohol: [],
    avg_spend: 20000
  })

  const toggleItem = (category: keyof typeof selections, item: string) => {
    setSelections(prev => {
      const list = prev[category] as string[]
      if (list.includes(item)) return { ...prev, [category]: list.filter(i => i !== item) }
      return { ...prev, [category]: [...list, item] }
    })
  }

  const handleSave = async () => {
    try {
      // 고른 메뉴 이름도 foods에 실어둔다 — 취향 덩어리는 아래 taste-menus가 만들지만,
      // 예전 경로(선호 단어 → 벡터 하나)가 예비로 남아 있어서 비워두면 그게 빈손이 된다.
      const titles = pickedMenus
        .map((k) => menuGroups.flatMap((g) => g.menus).find((m) => m.key === k)?.title)
        .filter(Boolean) as string[]
      const res = await fetchWithAuth("/api/users/me/preferences", {
        method: "PUT",
        body: JSON.stringify({ ...selections, foods: titles })
      })
      if (res.ok) {
        // 메뉴 선택은 별도 경로다. 실패해도 나머지 취향은 저장됐으니 흐름을 막지 않는다.
        if (pickedMenus.length > 0) {
          try {
            await fetchWithAuth("/api/users/me/taste-menus", {
              method: "POST",
              body: JSON.stringify({ menus: pickedMenus }),
            })
          } catch { /* noop */ }
        }
        alert("취향 분석이 완료되었습니다! 🎉")
        onComplete()
      }
    } catch (e) {
      alert("저장 중 오류가 발생했습니다.")
    }
  }

  const nextStep = () => setStep(prev => prev + 1)
  const prevStep = () => setStep(prev => prev - 1)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md h-[60vh] flex flex-col bg-white">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "좋아하는 메뉴 (최대 3개)"}
            {step === 2 && "싫어하는 음식 · 알레르기"}
            {step === 3 && "선호하는 분위기"}
            {step === 4 && "주류 취향"}
            {step === 5 && "1인당 평균 예산"}
          </DialogTitle>
          <DialogDescription>STEP {step} / 5</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {step === 1 && (
            <MenuPicker
              groups={menuGroups}
              loading={menusLoading}
              picked={pickedMenus}
              onToggle={(k) => setPickedMenus((prev) => toggleMenuKey(prev, k, 3))}
              max={3}
            />
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-bold text-gray-500 mb-2">싫어하는 음식 (추천에서 뒤로 밀려요)</div>
                <div className="flex flex-wrap gap-2">
                  {OPTIONS.dislikes.map(opt => (
                    <Badge
                      key={opt}
                      variant={selections.disliked_foods.includes(opt) ? "destructive" : "outline"}
                      className="cursor-pointer py-2 px-3 text-sm"
                      onClick={() => toggleItem("disliked_foods", opt)}
                    >
                      {opt} {selections.disliked_foods.includes(opt) && <Check className="w-3 h-3 ml-1" />}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-rose-500 mb-2">⚠️ 알레르기 (추천에서 제외돼요 · 그룹 모임에도 반영)</div>
                <div className="flex flex-wrap gap-2">
                  {OPTIONS.allergies.map(opt => (
                    <Badge
                      key={opt}
                      variant={selections.disliked_foods.includes(opt) ? "destructive" : "outline"}
                      className="cursor-pointer py-2 px-3 text-sm border-rose-200"
                      onClick={() => toggleItem("disliked_foods", opt)}
                    >
                      {opt} {selections.disliked_foods.includes(opt) && <Check className="w-3 h-3 ml-1" />}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="flex flex-wrap gap-2">
              {OPTIONS.vibes.map(opt => (
                <Badge
                  key={opt}
                  variant={selections.vibes.includes(opt) ? "default" : "outline"}
                  className="cursor-pointer py-2 px-3 text-sm"
                  onClick={() => toggleItem("vibes", opt)}
                >
                  {opt} {selections.vibes.includes(opt) && <Check className="w-3 h-3 ml-1" />}
                </Badge>
              ))}
            </div>
          )}
          {step === 4 && (
            <div className="flex flex-wrap gap-2">
              {OPTIONS.alcohol.map(opt => (
                <Badge
                  key={opt}
                  variant={selections.alcohol.includes(opt) ? "secondary" : "outline"}
                  className="cursor-pointer py-2 px-3 text-sm"
                  onClick={() => toggleItem("alcohol", opt)}
                >
                  {opt} {selections.alcohol.includes(opt) && <Check className="w-3 h-3 ml-1" />}
                </Badge>
              ))}
            </div>
          )}
          {step === 5 && (
            <div className="px-4 py-8 space-y-6">
              <div className="text-center text-3xl font-bold text-indigo-600">
                {selections.avg_spend.toLocaleString()}원
              </div>
              <Slider
                value={[selections.avg_spend]}
                min={5000}
                max={100000}
                step={5000}
                onValueChange={(vals) => setSelections(prev => ({ ...prev, avg_spend: vals[0] }))}
              />
              <p className="text-center text-gray-500 text-sm">대략적인 1인당 식사 예산을 알려주세요.</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          {step > 1 && <Button variant="outline" onClick={prevStep} className="flex-1">이전</Button>}
          {step < 5 ? (
            <Button onClick={nextStep} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
              다음 <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700">완료</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
