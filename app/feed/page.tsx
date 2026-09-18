"use client"

// 기존 /feed 링크도 장소만 검색하던 화면에 머물지 않도록 통합 탐색으로 보낸다.
// 북마크·공유 링크 호환을 위해 라우트 자체는 유지한다.
import HomeSearchPage from "../search/page"

export default function FeedTabPage() {
  return <HomeSearchPage />
}
