"use client"

import React, { useState } from "react" // ?몚 React import 異붽?!
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { ChevronRight, ChevronLeft, Check, Sparkles } from "lucide-react" // ?ъ슜 ???섎뒗 ?꾩씠肄??쒓굅


const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")

const OPTIONS = {
  foods: ["?쒖떇", "?쇱떇", "以묒떇", "?묒떇", "?꾩떆??, "怨좉린/援ъ씠", "?댁궛臾???, "遺꾩떇", "?⑥뒪?명뫖??, "移댄럹/?붿???],
  dislikes: ["留ㅼ슫寃?, "?좉쾬(??", "?ㅼ씠", "怨좎닔", "怨깆갹/?댁옣", "?좎젣??, "媛묎컖瑜?, "寃ш낵瑜?, "?놁쓬"],
  vibes: ["議곗슜??, "?쒕걣踰낆쟻", "?숉븳", "媛먯꽦?곸씤", "酉곕쭧吏?, "?명룷媛먯꽦", "怨좉툒吏?, "?꾨씪?대퉿(猷?", "源⑤걮??, "?댁깋?곸씤"],
  alcohol: ["?뚯＜", "留μ＜", "???, "?꾩뒪???섏씠蹂?, "留됯구由??꾪넻二?, "????留덉떖"],
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
          const res = await fetch(`${API_URL}/api/users/me/preferences`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify(selections)
          });
          if (res.ok) {
              alert("痍⑦뼢 遺꾩꽍???꾨즺?섏뿀?듬땲?? ?럦");
              onComplete();
          }
      } catch (e) { alert("???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎."); }
  };

  const nextStep = () => setStep(prev => prev + 1);
  const prevStep = () => setStep(prev => prev - 1);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md h-[60vh] flex flex-col bg-white">
            <DialogHeader>
                <DialogTitle>
                    {step === 1 && "?삄 ?좏샇?섎뒗 ?뚯떇 (以묐났 媛??"}
                    {step === 2 && "?슟 紐?癒밸뒗 ?뚯떇"}
                    {step === 3 && "???좏샇?섎뒗 遺꾩쐞湲?}
                    {step === 4 && "?뜿 二쇰쪟 痍⑦뼢"}
                    {step === 5 && "?뮥 1?몃떦 ?됯퇏 ?덉궛"}
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
                            {selections.avg_spend.toLocaleString()}??
                        </div>
                        <Slider 
                            value={[selections.avg_spend]} 
                            min={5000} max={100000} step={5000} 
                            onValueChange={(vals) => setSelections(prev => ({...prev, avg_spend: vals[0]}))} 
                        />
                        <p className="text-center text-gray-500 text-sm">??듭쟻??1?몃떦 ?앹궗 ?덉궛???뚮젮二쇱꽭??</p>
                    </div>
                )}
            </div>

            <DialogFooter className="flex gap-2">
                {step > 1 && <Button variant="outline" onClick={prevStep} className="flex-1">?댁쟾</Button>}
                {step < 5 ? (
                    <Button onClick={nextStep} className="flex-1 bg-indigo-600 hover:bg-indigo-700">?ㅼ쓬 <ChevronRight className="w-4 h-4 ml-1"/></Button>
                ) : (
                    <Button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700">?꾨즺 諛????/Button>
                )}
            </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}
