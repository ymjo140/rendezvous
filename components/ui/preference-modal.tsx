"use client"

import React, { useState } from "react" // 👈 React import 추가!
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { ChevronRight, ChevronLeft, Check, Sparkles } from "lucide-react" // 사용 안 하는 아이콘 제거

const OPTIONS = {
  foods: ["한식", "일식", "중식", "양식", "아시안", "고기/구이", "해산물/회", "분식", "패스트푸드", "카페/디저트"],
  dislikes: ["매운것", "날것(회)", "오이", "고수", "곱창/내장", "유제품", "갑각류", "견과류", "없음"],
  vibes: ["조용한", "시끌벅적", "힙한", "감성적인", "뷰맛집", "노포감성", "고급진", "프라이빗(룸)", "깨끗한", "이색적인"],
  alcohol: ["소주", "맥주", "와인", "위스키/하이볼", "막걸리/전통주", "술 안 마심"],
}

interface PreferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function PreferenceModal({ isOpen, onClose, onComplete }: PreferenceModalProps) {
  const [step, setStep] = useState(1);
  const [selections, setSelections] = useState<{
      foods: string[];
      disliked_foods: string[];
      vibes: string[];
      alcohol: string[];
      avg_spend: number;
  }>({
      foods: [], disliked_foods: [], vibes: [], alcohol: [], avg_spend: 20000
  });

  const toggleItem = (category: keyof typeof selections, item: string) => {
      setSelections(prev => {
          const list = prev[category] as string[];
          if (list.includes(item)) return { ...prev, [category]: list.filter(i => i !== item) };
          return { ...prev, [category]: [...list, item] };
      });
  };

  const handleSave = async () => {
      const token = localStorage.getItem("token");
      try {
          const res = await fetch("https://subsidiary-women-creator-truly.trycloudflare.com/api/users/me/preferences", {
              method: "PUT",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify(selections)
          });
          if (res.ok) {
              alert("취향 분석이 완료되었습니다! 🎉");
              onComplete();
          }
      } catch (e) { alert("저장 중 오류가 발생했습니다."); }
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md h-[60vh] flex flex-col bg-white">
            <DialogHeader>
                <DialogTitle>
                    {step === 1 && "😋 선호하는 음식 (중복 가능)"}
                    {step === 2 && "🚫 못 먹는 음식"}
                    {step === 3 && "✨ 선호하는 분위기"}
                    {step === 4 && "🍺 주류 취향"}
                    {step === 5 && "💰 1인당 평균 예산"}
                </DialogTitle>
                <DialogDescription>
                    STEP {step} / 5
                </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto py-4">
                {step === 1 && (
                    <div className="flex flex-wrap gap-2">
                        {OPTIONS.foods.map(opt => (
                            <Badge key={opt} variant={selections.foods.includes(opt) ? "default" : "outline"} 
                                className="cursor-pointer py-2 px-3 text-sm" onClick={() => toggleItem('foods', opt)}>
                                {opt} {selections.foods.includes(opt) && <Check className="w-3 h-3 ml-1"/>}
                            </Badge>
                        ))}
                    </div>
                )}
                {step === 2 && (
                    <div className="flex flex-wrap gap-2">
                        {OPTIONS.dislikes.map(opt => (
                            <Badge key={opt} variant={selections.disliked_foods.includes(opt) ? "destructive" : "outline"} 
                                className="cursor-pointer py-2 px-3 text-sm" onClick={() => toggleItem('disliked_foods', opt)}>
                                {opt} {selections.disliked_foods.includes(opt) && <Check className="w-3 h-3 ml-1"/>}
                            </Badge>
                        ))}
                    </div>
                )}
                {step === 3 && (
                    <div className="flex flex-wrap gap-2">
                        {OPTIONS.vibes.map(opt => (
                            <Badge key={opt} variant={selections.vibes.includes(opt) ? "default" : "outline"} 
                                className="cursor-pointer py-2 px-3 text-sm" onClick={() => toggleItem('vibes', opt)}>
                                {opt} {selections.vibes.includes(opt) && <Check className="w-3 h-3 ml-1"/>}
                            </Badge>
                        ))}
                    </div>
                )}
                {step === 4 && (
                    <div className="flex flex-wrap gap-2">
                        {OPTIONS.alcohol.map(opt => (
                            <Badge key={opt} variant={selections.alcohol.includes(opt) ? "secondary" : "outline"} 
                                className="cursor-pointer py-2 px-3 text-sm" onClick={() => toggleItem('alcohol', opt)}>
                                {opt} {selections.alcohol.includes(opt) && <Check className="w-3 h-3 ml-1"/>}
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
                            min={5000} max={100000} step={5000} 
                            onValueChange={(vals) => setSelections(prev => ({...prev, avg_spend: vals[0]}))} 
                        />
                        <p className="text-center text-gray-500 text-sm">대략적인 1인당 식사 예산을 알려주세요.</p>
                    </div>
                )}
            </div>

            <DialogFooter className="flex gap-2">
                {step > 1 && <Button variant="outline" onClick={prevStep} className="flex-1">이전</Button>}
                {step < 5 ? (
                    <Button onClick={nextStep} className="flex-1 bg-indigo-600 hover:bg-indigo-700">다음 <ChevronRight className="w-4 h-4 ml-1"/></Button>
                ) : (
                    <Button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700">완료 및 저장</Button>
                )}
            </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}