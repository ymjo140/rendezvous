"use client"

import React from "react"

// 게시물 본문의 #해시태그 / @멘션을 하이라이트 렌더.
// 해시태그 클릭 → onHashtag(tag) 호출(탐색 검색에 연결).

const TOKEN_RE = /([#@][0-9A-Za-z가-힣_]+)/g

export function RichText({
  text,
  onHashtag,
  className,
}: {
  text?: string | null
  onHashtag?: (tag: string) => void
  className?: string
}) {
  if (!text) return null
  const parts = text.split(TOKEN_RE)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("#")) {
          const tag = part.slice(1)
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onHashtag?.(tag)
              }}
              className="text-amber-600 font-medium hover:underline"
            >
              {part}
            </button>
          )
        }
        if (part.startsWith("@")) {
          return (
            <span key={i} className="text-sky-600 font-medium">
              {part}
            </span>
          )
        }
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </span>
  )
}
