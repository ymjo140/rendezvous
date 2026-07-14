"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronRight, Bell, Lock, User, HelpCircle, LogOut, Palette } from "lucide-react"

const settingsItems = [
  {
    icon: User,
    label: "프로필 설정",
    description: "프로필 사진 및 정보 변경",
  },
  {
    icon: Bell,
    label: "알림 설정",
    description: "알림 및 푸시 설정",
  },
  {
    icon: Lock,
    label: "개인정보 및 보안",
    description: "비밀번호 및 보안 설정",
  },
  {
    icon: Palette,
    label: "테마 설정",
    description: "라이트/다크 모드",
  },
  {
    icon: HelpCircle,
    label: "도움말",
    description: "자주 묻는 질문 및 지원",
  },
]

export function SettingsTab() {
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">마이</h1>
        <p className="text-sm text-muted-foreground mt-1">설정 및 개인정보</p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarImage src="/abstract-profile.png" />
              <AvatarFallback>나</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">김온사</h2>
              <p className="text-sm text-muted-foreground">onsa@example.com</p>
            </div>
            <Button variant="outline" size="sm">
              편집
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settings Items */}
      <div className="space-y-2">
        {settingsItems.map((item, index) => (
          <button
            key={index}
            className="w-full p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium">{item.label}</p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>

      {/* Logout Button */}
      <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive bg-transparent">
        <LogOut className="w-5 h-5" />
        로그아웃
      </Button>

      {/* App Version */}
      <p className="text-center text-xs text-muted-foreground">랑데부 v1.0.0</p>
    </div>
  )
}
