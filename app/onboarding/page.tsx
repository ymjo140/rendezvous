"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, MapPin, Check, ChevronRight, Utensils, GlassWater, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "")

const FOOD_TAGS = ["한식", "일식", "중식", "양식", "분식", "아시아음식", "패스트푸드", "카페/디저트"]
const VIBE_TAGS = ["조용한", "감성적인", "힙한", "가성비", "고급스러운", "뷰맛집", "야외", "인스타감성"]
const ALCOHOL_TAGS = ["소주", "맥주", "와인", "하이볼", "막걸리/전통주", "칵테일"]
const AGE_GROUPS = ["10대", "20대", "30대", "40대", "50대+"]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [locLoading, setLocLoading] = useState(false)

  const [name, setName] = useState("")
  const [gender, setGender] = useState("")
  const [ageGroup, setAgeGroup] = useState("")
  const [jobStatus, setJobStatus] = useState("")

  const [locationName, setLocationName] = useState("위치 확인 필요")
  const [coords, setCoords] = useState({ lat: 0, lng: 0 })

  const [selectedFoods, setSelectedFoods] = useState<string[]>([])
  const [selectedVibes, setSelectedVibes] = useState<string[]>([])
  const [selectedAlcohol, setSelectedAlcohol] = useState<string[]>([])
  const [budget, setBudget] = useState([20000])

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) router.push("/login")

    fetch(`${API_URL}/api/users/me`, { headers: { "Authorization": `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.name && !data.name.startsWith("User_")) setName(data.name)
      })
  }, [router])

  const handleGetLocation = () => {
    if (!navigator.geolocation) return alert("위치 권한을 허용해주세요.")
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationName("현재 위치 확인됨 (자동 저장)")
        setLocLoading(false)
      },
      () => {
        alert("위치 확인 실패")
        setLocLoading(false)
      }
    )
  }

  const toggleSelection = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    if (list.includes(item)) setList(list.filter(i => i !== item))
    else setList([...list, item])
  }

  const handleSubmit = async () => {
    if (selectedFoods.length === 0) return alert("선호 음식은 최소 1개 선택해주세요.")

    setLoading(true)
    const token = localStorage.getItem("token")
    try {
      const payload = {
        name,
        gender,
        age_group: ageGroup,
        job_status: jobStatus,
        lat: coords.lat,
        lng: coords.lng,
        location_name: coords.lat !== 0 ? "GPS 인증 위치" : "위치 미설정",
        preferred_foods: selectedFoods,
        preferred_vibes: selectedVibes,
        preferred_alcohol: selectedAlcohol,
        avg_budget: budget[0]
      }

      const res = await fetch(`${API_URL}/api/users/me/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        alert("설정이 완료되었습니다! 🎉")
        router.push("/")
      } else {
        alert("저장 중 오류가 발생했습니다.")
      }
    } catch (e) {
      alert("서버 오류")
    } finally {
      setLoading(false)
    }
  }

  const renderStep1 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
      <div className="space-y-2">
        <label className="text-sm font-bold text-gray-700">닉네임</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="사용할 닉네임" className="h-12 rounded-xl bg-gray-50 border-none" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-gray-700">성별</label>
        <div className="flex gap-2">
          {["남성", "여성", "기타"].map(g => (
            <button key={g} onClick={() => setGender(g)} className={`flex-1 h-12 rounded-xl border-2 font-bold transition-all ${gender === g ? "border-[#F5A623] bg-amber-50 text-[#F5A623]" : "border-gray-100 bg-white text-gray-400"}`}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-gray-700">연령대</label>
        <div className="grid grid-cols-5 gap-1">
          {AGE_GROUPS.map(a => (
            <button key={a} onClick={() => setAgeGroup(a)} className={`h-10 rounded-lg text-xs font-bold transition-all ${ageGroup === a ? "bg-[#F5A623] text-white" : "bg-gray-100 text-gray-500"}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-gray-700">직업 (AI 추천 참고용)</label>
        <div className="flex gap-2">
          <button onClick={() => setJobStatus("student")} className={`flex-1 h-12 rounded-xl border-2 font-bold ${jobStatus === "student" ? "border-[#F5A623] text-[#F5A623]" : "border-gray-100 text-gray-400"}`}>학생</button>
          <button onClick={() => setJobStatus("worker")} className={`flex-1 h-12 rounded-xl border-2 font-bold ${jobStatus === "worker" ? "border-[#F5A623] text-[#F5A623]" : "border-gray-100 text-gray-400"}`}>직장인</button>
        </div>
      </div>

      <Button className="w-full h-14 rounded-xl bg-[#F5A623] text-white font-bold text-lg mt-4" onClick={() => {
        if (!name || !gender || !ageGroup) return alert("정보를 모두 입력해주세요.")
        setStep(2)
      }}>다음으로 <ChevronRight className="w-5 h-5" /></Button>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
      <div className="text-center py-6">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-[#F5A623]">
          <MapPin className="w-10 h-10" />
        </div>
        <h3 className="text-lg font-bold text-gray-800">어디에 주로 활동하시나요?</h3>
        <p className="text-sm text-gray-500 mt-1">거주지 또는 자주 가는 곳을 설정해주세요.</p>
      </div>

      <Button variant="outline" className={`w-full h-16 rounded-xl justify-start px-4 gap-3 border-2 ${coords.lat !== 0 ? "border-[#F5A623] bg-amber-50 text-[#F5A623]" : "border-dashed border-gray-300"}`} onClick={handleGetLocation}>
        {locLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <MapPin className="w-6 h-6" />}
        <div className="flex-1 text-left">
          <div className="font-bold text-sm">현재 위치로 설정</div>
          <div className="text-xs opacity-70">{locationName}</div>
        </div>
        {coords.lat !== 0 && <Check className="w-5 h-5" />}
      </Button>

      <Button className="w-full h-14 rounded-xl bg-[#F5A623] text-white font-bold text-lg mt-8" onClick={() => {
        if (coords.lat === 0) return alert("위치를 설정해주세요.")
        setStep(3)
      }}>다음으로 <ChevronRight className="w-5 h-5" /></Button>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-8 animate-in slide-in-from-right-4 fade-in duration-300 pb-10">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-800"><Utensils className="w-4 h-4 text-[#F5A623]" /> 좋아하는 음식 (복수 선택)</label>
        <div className="flex flex-wrap gap-2">
          {FOOD_TAGS.map(t => (
            <Badge key={t} variant="outline" onClick={() => toggleSelection(selectedFoods, setSelectedFoods, t)} className={`cursor-pointer px-3 py-2 rounded-lg transition-all ${selectedFoods.includes(t) ? "bg-[#F5A623] text-white border-transparent" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
              {t}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-800">선호하는 분위기</label>
        <div className="flex flex-wrap gap-2">
          {VIBE_TAGS.map(t => (
            <Badge key={t} variant="outline" onClick={() => toggleSelection(selectedVibes, setSelectedVibes, t)} className={`cursor-pointer px-3 py-2 rounded-lg transition-all ${selectedVibes.includes(t) ? "bg-indigo-500 text-white border-transparent" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
              {t}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-800"><GlassWater className="w-4 h-4 text-blue-500" /> 주류 취향</label>
        <div className="flex flex-wrap gap-2">
          {ALCOHOL_TAGS.map(t => (
            <Badge key={t} variant="outline" onClick={() => toggleSelection(selectedAlcohol, setSelectedAlcohol, t)} className={`cursor-pointer px-3 py-2 rounded-lg transition-all ${selectedAlcohol.includes(t) ? "bg-blue-500 text-white border-transparent" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
              {t}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-800"><Wallet className="w-4 h-4 text-green-500" /> 1인당 평균 예산</label>
          <span className="text-sm font-bold text-[#F5A623]">{budget[0].toLocaleString()}원</span>
        </div>
        <Slider defaultValue={[20000]} max={100000} step={5000} min={5000} onValueChange={setBudget} className="py-2" />
        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>5천원</span>
          <span>10만원+</span>
        </div>
      </div>

      <Button className="w-full h-14 rounded-xl bg-gradient-to-r from-[#F5A623] to-[#14B8A6] text-white font-bold text-lg shadow-lg mt-6" onClick={handleSubmit} disabled={loading}>
        {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "WeMeet 시작하기! 🚀"}
      </Button>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-white font-['Pretendard']">
      <div className="w-full h-1 bg-gray-100 fixed top-0 left-0 z-10">
        <div className="h-full bg-[#F5A623] transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }}></div>
      </div>

      <div className="p-6 mt-4 flex-1 overflow-y-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {step === 1 && (
              <>
                반가워요! 👋
                <span className="block">어떤 분인지 알려주세요</span>
              </>
            )}
            {step === 2 && (
              <>
                주로 어디에서
                <span className="block">활동하시나요?</span>
              </>
            )}
            {step === 3 && (
              <>
                맞춤 장소를 위한
                <span className="block">취향을 알려주세요</span>
              </>
            )}
          </h1>
          <p className="text-sm text-gray-500">AI가 입력하신 정보를 바탕으로 맞춤 추천을 제공합니다.</p>
        </div>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  )
}
