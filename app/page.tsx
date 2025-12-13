"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, MapPin, CheckCircle2 } from "lucide-react"

export default function SignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    lat: 0,
    lng: 0
  })
  const [loading, setLoading] = useState(false)
  const [locLoading, setLocLoading] = useState(false)
  const [locationStatus, setLocationStatus] = useState("위치 미설정 (가입 후 설정 가능)")

  // 🌟 [GPS] 현재 위치 가져오기
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("브라우저가 위치 정보를 지원하지 않습니다.");
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({
          ...prev,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        }));
        setLocationStatus("📍 위치 확인 완료! (가입 시 주소 자동 변환)");
        setLocLoading(false);
      },
      (err) => {
        console.error(err);
        alert("위치를 가져올 수 없습니다. 설정에서 위치 권한을 허용해주세요.");
        setLocLoading(false);
      }
    );
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.email || !formData.password || !formData.name) {
      alert("모든 필수 정보를 입력해주세요.");
      return;
    }

    setLoading(true)
    try {
      // 🌟 좌표 정보도 함께 전송
      const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            name: formData.name,
            lat: formData.lat || null, 
            lng: formData.lng || null
        })
      })

      if (res.ok) {
        const data = await res.json()
        localStorage.setItem("token", data.access_token)
        alert("가입을 환영합니다! 🎉")
        router.push("/")
      } else {
        const err = await res.json()
        alert(`가입 실패: ${err.detail}`)
      }
    } catch (err) {
      alert("오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F4F6] p-4 font-['Pretendard']">
      <Card className="w-full max-w-md rounded-3xl shadow-xl border-none">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold text-[#7C3AED]">WeMeet 회원가입</CardTitle>
          <CardDescription>친구들과 더 쉽고 편하게 만나세요!</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600 ml-1">이메일</label>
              <Input 
                type="email" 
                placeholder="example@email.com" 
                className="rounded-xl h-12 bg-gray-50 border-gray-200 focus:border-[#7C3AED]"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600 ml-1">비밀번호</label>
              <Input 
                type="password" 
                placeholder="********" 
                className="rounded-xl h-12 bg-gray-50 border-gray-200 focus:border-[#7C3AED]"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600 ml-1">닉네임</label>
              <Input 
                type="text" 
                placeholder="사용할 이름" 
                className="rounded-xl h-12 bg-gray-50 border-gray-200 focus:border-[#7C3AED]"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>

            {/* 🌟 위치 설정 버튼 */}
            <div className="pt-2">
                <label className="text-sm font-bold text-gray-600 ml-1 block mb-2">내 동네 설정 (추천용)</label>
                <Button 
                    type="button" 
                    variant="outline" 
                    className={`w-full h-12 rounded-xl border-dashed border-2 ${formData.lat ? "border-[#7C3AED] text-[#7C3AED] bg-purple-50" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}
                    onClick={handleGetLocation}
                    disabled={locLoading}
                >
                    {locLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <MapPin className="w-4 h-4 mr-2"/>}
                    {formData.lat ? "위치 확인됨 (자동 저장)" : "📍 현재 위치로 주소 찾기"}
                </Button>
                <p className="text-xs text-center mt-2 text-gray-400">
                    {locationStatus}
                </p>
            </div>

            <Button 
                type="submit" 
                className="w-full h-12 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-lg shadow-md mt-4" 
                disabled={loading}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin"/> : "가입하기"}
            </Button>
            
            <div className="text-center mt-4">
                <button type="button" onClick={() => router.push("/login")} className="text-xs text-gray-500 hover:text-[#7C3AED] underline">
                    이미 계정이 있으신가요? 로그인
                </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}