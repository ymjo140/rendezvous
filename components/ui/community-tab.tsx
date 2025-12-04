"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, Users, MapPin, Calendar, Star, Search, X, Lock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface Community {
  id: string; host_id: number; title: string; category: string;
  location: string; date_time: string; max_members: number;
  description: string; tags: string[]; rating: number;
  current_members: { id: number; name: string }[];
}

const CATEGORIES = [
  { id: "meal", label: "🍚 식사" }, { id: "hobby", label: "🎨 취미/여가" },
  { id: "alcohol", label: "🍺 술/친목" }, { id: "study", label: "📚 스터디" }, { id: "exercise", label: "⚽ 운동" },
]

export function CommunityTab() {
  const router = useRouter();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  
  const [newForm, setNewForm] = useState({ title: "", category: "meal", location: "", date_time: "", max_members: 4, description: "", tags: "" });

  const fetchCommunities = async () => {
    try {
        const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/communities");
        if (res.ok) setCommunities(await res.json());
    } catch (e) {}
  }

  useEffect(() => { fetchCommunities(); }, []);

  const handleCreate = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
        if(confirm("모임을 만드려면 로그인이 필요합니다.")) router.push("/login");
        return;
    }
    // ... (생성 로직)
    try {
      const res = await fetch("https://wemeet-backend-xqlo.onrender.com/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ ...newForm, tags: newForm.tags.split(",").map(t => t.trim()) })
      });
      if (res.ok) {
          setIsCreateOpen(false);
          fetchCommunities();
      }
    } catch (e) { alert("오류 발생"); }
  }

  const handleJoin = async (id: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
        if(confirm("모임에 참여하려면 로그인이 필요합니다.")) router.push("/login");
        return;
    }
    // ... (참여 로직)
    try {
      const res = await fetch(`https://wemeet-backend-xqlo.onrender.com/api/communities/${id}/join`, {
        method: "POST", headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
          alert("참여 완료!");
          setSelectedCommunity(null);
          fetchCommunities();
      }
    } catch (e) { alert("오류 발생"); }
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 p-4 space-y-4 overflow-y-auto pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">모임 찾기</h1>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> 모임 만들기
        </Button>
      </div>

      {communities.map(comm => (
          <Card key={comm.id} className="cursor-pointer hover:border-indigo-300 transition-all" onClick={() => setSelectedCommunity(comm)}>
              <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                      <Badge variant="secondary" className="mb-2">{CATEGORIES.find(c=>c.id===comm.category)?.label}</Badge>
                      <div className="text-xs text-gray-500 flex items-center gap-1"><Users className="w-3 h-3"/> {comm.current_members?.length}/{comm.max_members}</div>
                  </div>
                  <CardTitle className="text-lg">{comm.title}</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2"><Calendar className="w-3 h-3"/> {comm.date_time}</div>
                      <div className="flex items-center gap-2"><MapPin className="w-3 h-3"/> {comm.location}</div>
                  </div>
                  <div className="mt-3 flex gap-1 flex-wrap">
                      {comm.tags.map((tag, i) => <Badge key={i} variant="outline" className="text-[10px] bg-white">#{tag}</Badge>)}
                  </div>
              </CardContent>
          </Card>
      ))}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
            <DialogHeader><DialogTitle>새 모임 만들기</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
                <Input placeholder="모임 제목" value={newForm.title} onChange={e => setNewForm({...newForm, title: e.target.value})} />
                <div className="grid grid-cols-2 gap-2">
                    <Select value={newForm.category} onValueChange={v => setNewForm({...newForm, category: v})}>
                        <SelectTrigger><SelectValue placeholder="카테고리" /></SelectTrigger>
                        <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" placeholder="인원" value={newForm.max_members} onChange={e => setNewForm({...newForm, max_members: parseInt(e.target.value)})} />
                </div>
                <Input placeholder="장소" value={newForm.location} onChange={e => setNewForm({...newForm, location: e.target.value})} />
                <Input type="datetime-local" onChange={e => setNewForm({...newForm, date_time: e.target.value.replace('T', ' ')})} />
                <Textarea placeholder="설명" value={newForm.description} onChange={e => setNewForm({...newForm, description: e.target.value})} />
                <Input placeholder="태그 (쉼표 구분)" value={newForm.tags} onChange={e => setNewForm({...newForm, tags: e.target.value})} />
                <Button className="w-full bg-indigo-600" onClick={handleCreate}>개설하기</Button>
            </div>
        </DialogContent>
      </Dialog>

      {selectedCommunity && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 p-0">
              <div className="bg-white w-full max-w-md sm:rounded-xl rounded-t-xl p-5 space-y-5 animate-in slide-in-from-bottom-10">
                  <div className="flex justify-between"><h2 className="text-xl font-bold">{selectedCommunity.title}</h2><Button variant="ghost" size="icon" onClick={() => setSelectedCommunity(null)}><X className="w-6 h-6"/></Button></div>
                  <div className="space-y-2 text-sm"><p>📅 {selectedCommunity.date_time}</p><p>📍 {selectedCommunity.location}</p><p className="text-gray-600 mt-2">{selectedCommunity.description}</p></div>
                  <Button className="w-full bg-indigo-600" onClick={() => handleJoin(selectedCommunity.id)}>참여하기</Button>
              </div>
          </div>
      )}
    </div>
  )
}