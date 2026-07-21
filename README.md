# 랑데부 (Rendezvous) 📍

> **"광고 아닌, 내가 신뢰하는 크루가 실제로 다녀온 맛집 리스트."**

랑데부는 **크루(취향으로 뭉친 무리)가 함께 쌓는 맛집 리스트**를 신뢰 기반으로 발견·소비하는 플랫폼입니다. 별점·블로그 광고에 오염된 맛집 정보 대신, **실제 방문·재방문 데이터로 검증된 집단의 큐레이션**을 제공합니다.

## 핵심 개념

| 개념 | 설명 |
|---|---|
| **크루** | 취향으로 뭉쳐 맛집 리스트를 함께 쌓는 지속적 집단 (예: "성수 와인 크루"). 크루마다 채팅방이 1:1로 연결됩니다. |
| **3층 저장 모델** | ① 개인 폴더(내 것) ② 크루 공유 리스트(크루원 누구나 담는 협업 폴더) ③ 신뢰 지표(멤버 방문·재방문 자동 집계) |
| **방문 인증 배지** | 크루 멤버들이 리스트 장소에 남긴 실제 방문·재방문 기록이 기준치를 넘으면 자동 부여 — 블로그가 흉내낼 수 없는 신뢰 신호 |
| **취향 매칭 %** | 유저의 저장·재방문 장소 임베딩(pgvector 768차원) centroid와 리스트 centroid의 코사인 유사도 |
| **맥락 태그 8종** | `date` `work` `drink` `cafe` `solo` `friends` `family` `special` — 발견 랙·검색·필터의 공통 뼈대 |

## 아키텍처

```
[B2C 프론트]  Next.js 16 (이 저장소, Vercel 배포)
[백엔드]      FastAPI  (backend/, Render 배포)
[DB]         Supabase PostgreSQL + pgvector (장소 12만+, 임베딩)
[B2B 콘솔]   사장님용 별도 저장소 (rendezvous-merchant: 단골 CRM·핫딜·예약)
```

## 코드 구조 — v1과 v2가 공존합니다

현재 **리디자인 진행 중**이라 두 세대의 홈이 한 코드베이스에 있습니다:

| | 위치 | 상태 |
|---|---|---|
| **v1 (기존)** | `app/page.tsx` (탭 SPA) + `components/ui/*-tab.tsx` | 프로덕션 (`/`) |
| **v2 (리디자인)** | `app/home-next/**` | `redesign/group-home` 브랜치, `/home-next` 라우트로 격리 |

v2가 확정되면 홈 라우트를 스왑할 예정입니다. 리디자인의 전략·결정 기록은 [`docs/redesign-group-home.md`](docs/redesign-group-home.md) 참고.

### 주요 디렉토리

```
app/
  page.tsx              # v1 홈 (탭 SPA: 지도·채팅·장소추천·탐색·마이페이지)
  home-next/            # v2 홈 (크루·리스트 중심) ← 리뷰 대상의 중심
    page.tsx            #   홈: 필터 시트 → 랭킹 → 크루/개인 추천 → 리스트 섹션
    crew-new/           #   크루 만들기 3스텝
    crew/[cid]/         #   크루 프로필 (방문 인증 배지·초대·합류)
    crews/              #   내 크루 탭 (방문·지출 집계)
    search/  browse/    #   검색·전체보기
    chats/              #   채팅 (기존 ChatTab 편입, ?room= 딥링크)
    map/ feed/ profile/ #   기존 탭 컴포넌트 편입 래퍼
  lists/[listId]/       # 공개 리스트 상세 (내 폴더/크루에 담기)
  places/[placeId]/     # 장소 상세
backend/src/
  api/routers/
    home.py             # v2 신규: 홈 피드·크루 생성/합류·리스트 검색·전체 장소 검색
    social.py           # 큐레이터·공개 리스트·담기(크루에 담기 포함)
    groups.py           # 크루(커뮤니티) 상세·팔로우·크루 폴더
    meetings.py         # 추천 엔진 진입 (모임 추천·지오코딩)
  services/meeting_service.py  # 벡터 추천·재랭킹
  domain/models.py      # SQLAlchemy 모델 전부
```

## v2에서 새로 만든 것 (리뷰 포인트)

1. **홈 피드 API** `GET /api/home/feed` — 취향 매칭 리스트·내 크루(방문/지출)·크루 추천·맥락 랙·급상승을 한 호출로
2. **검색 2종** — `GET /api/home/search`(공개 리스트, 태그·지역·음식 키워드 매칭) + `GET /api/home/search-places`(전체 12만 장소, 좌표 반경 × 음식 하드필터 × 목적 소프트부스트)
3. **크루 생명주기** — `POST /api/crews`(경량 생성+첫 리스트) / `POST /api/crews/{cid}/join`(초대 링크 합류, 멱등) / 크루에 담기(`/api/lists/{id}/save`에 `community_id`)
4. **cuisine 2차 정제** — 크롤 원본 category 오염 대응, 장소 이름 강토큰 우선 재분류 (15,013건 적용)
5. **채팅 편입** — 채팅을 탭에서 빼고 홈 상단 아이콘 + 크루 카드 버튼으로 (크루의 작업실 포지셔닝)

### 알려진 트레이드오프 (의도된 것)

- **키워드 매칭(TAG_NAME_HINTS)은 콜드스타트 브릿지** — 데이터가 얇은 초기에 저장 태그 대신 리스트/장소 이름으로 맥락을 추정합니다. 유저 데이터가 쌓이면 행동 기반으로 대체 예정.
- **백엔드는 additive-only로 main 직행** — v1 화면이 새 필드를 무시하므로 안전. 프론트만 브랜치 격리.
- **`/api/home/feed`의 임베딩 centroid 계산은 상위 40개 리스트로 제한** — 성능 상한. 스케일 시 캐싱 필요.

## 실행

```bash
# 프론트
npm install && npm run dev        # localhost:3000

# 백엔드
cd backend
pip install -r requirements.txt
uvicorn src.main:app --reload     # SECRET_KEY, DATABASE_URL 등 env 필요
```

환경 변수: `SECRET_KEY` `DATABASE_URL`(Supabase PG) `KAKAO_REST_API_KEY` `GEMINI_API_KEY` 등 — 값은 별도 전달.
