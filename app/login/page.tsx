// app/login/page.tsx

"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

// 👇 여기에 본인의 카카오 REST API 키를 넣으세요!
const KAKAO_REST_API_KEY = "ee65ae84782ed20fc6df3256de747e74"; 
const REDIRECT_URI = "https://v0-we-meet-app-features.vercel.app/auth/callback/kakao";
const KAKAO_AUTH_URL = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${REDIRECT_URI}&response_type=code`;

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const router = useRouter()

  const handleLogin = async () => {
    const formData = new FormData()
    formData.append("username", email)
    formData.append("password", password)

    try {
      const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/login", {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        localStorage.setItem("token", data.access_token)
        localStorage.setItem("userId", data.user_id)
        localStorage.setItem("userName", data.name)
        alert("로그인 성공!")
        router.push("/") 
      } else {
        alert("로그인 실패")
      }
    } catch (e) { alert("에러 발생") }
  }

  const handleKakaoLogin = () => {
    window.location.href = KAKAO_AUTH_URL;
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">WeMeet 로그인</h1>
        <Input placeholder="이메일 (me@test.com)" value={email} onChange={e=>setEmail(e.target.value)}/>
        <Input type="password" placeholder="비밀번호 (1234)" value={password} onChange={e=>setPassword(e.target.value)}/>
        <Button className="w-full" onClick={handleLogin}>로그인</Button>
        
        <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-muted-foreground">또는</span></div>
        </div>

        <button 
            onClick={handleKakaoLogin}
            className="w-full h-10 bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold rounded-md flex items-center justify-center gap-2"
        >
            <span className="text-lg">💬</span> 카카오로 3초 만에 시작하기
        </button>
      </div>
    </div>
  )
}