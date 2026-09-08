# 1주차: 개발 기반과 공개·결제 정책

기준: main `6c26b540`에서 시작. 개발 브랜치 `codex/week1-foundation`.

## 변경 범위

- Node 24.19.0 / npm 11.9.0, Next 16.3.4 / React 19.2.8 / vaul 1.1.2로 호환 조합 고정.
- npm 잠금파일 재생성. `npm ci`, 린트, 타입검사, 프로덕션 빌드를 같은 명령으로 로컬·CI·Vercel에서 실행.
- 크루·리스트 공개 정책을 `services/crew_access.py`에 모음. 직접 URL, 검색, 랭킹, 댓글, 담기에도 적용.
- 모의 충전과 실제 결제·혜택 사용을 서버에서 분리. 기존 잔액/내역/환불은 보존.
- JWT와 이메일을 출력하던 인증 디버그 로그 제거.

## 공개 정책

| 공개 수준 | 비회원·외부인 | 현재 멤버·방장 |
|---|---|---|
| private / 알 수 없는 값 | 크루·리스트·주방·쇼케이스 404 | 크루와 모든 크루 리스트 조회 |
| list_only | 프로필·공개 리스트만. 멤버·작성자 연결·방문·게시물 숨김, 주방 404 | 멤버·방문과 비공개 리스트 조회 |
| public / open | 프로필·멤버·방문·공개 리스트 | 비공개 크루 리스트도 조회 |

개인 비공개 리스트는 소유자만 열람. 게시물은 공개된 글만 쇼케이스에 포함.
크루를 비공개로 바꾸면 과거 `is_public=true` 폴더도 즉시 외부 조회에서 제외된다.
크루를 떠난 작성자는 비공개 크루 폴더를 개인 폴더 API로 다시 읽거나 발행할 수 없다.
list_only 크루는 개인 큐레이터 프로필·추천 후보에서 제외해 작성자 연결을 숨긴다.
공개 리스트에 자발적으로 남긴 댓글 작성자 표시는 유지한다.

## 결제·혜택 정책

| 기능 | 일반 환경 | 격리된 테스트 환경 |
|---|---|---|
| 충전·지도 캐시 적립 | 로그인 후 503, 잔액 변경 없음 | 명시한 테스트 계정만 허용 |
| 캐시 예약금·분담 납부·아이템 구매 | 503 | 503 |
| 핫딜 예약·제휴 사용 확인증 | 사용 중지 | 사용 중지 |
| 예약금 0원 일반 예약 | 유지 | 유지 |
| 과거 잔액·거래내역·예약 취소 환불 | 유지 | 유지 |
| 신규 가입 현금성 보너스 | 0원 | 0원 |

테스트 충전은 `APP_ENV=test`, `MOCK_PAYMENTS_ENABLED=true`, `MOCK_PAYMENT_USER_IDS=...`,
로컬 DB(SQLite 또는 localhost/127.0.0.1/::1 PostgreSQL)를 모두 만족해야 한다.
운영 DB의 터널이나 복제본을 테스트 DB로 연결하지 않는다. 충전 원장에 `mock_charge`로 기록한다.
지갑 API의 `can_charge`, `can_pay`, `mode`가 UI 표시 기준이며, 플래그를 조작해도 서버가 재검사한다.
실제 결제를 켜는 환경변수는 제공하지 않는다. PG 결제 검증·실결제/보너스/테스트 원장 분리·기존 잔액 정리가 선행되어야 한다.
제휴는 방문 증빙 검증과 중복 사용 방지를 구현한 뒤 사용을 재개한다. 현재 체크인은 방문 기록만 저장한다.

## 실행·검증

저장소 루트에서 실행한다. Python 3.12.13, Node는 `.nvmrc`를 사용한다.

```bash
nvm install
nvm use
npm ci
npm run check
npm run build

python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-test.txt
python -m pip check
python -m pytest
```

Windows PowerShell에서는 `source` 대신 `.venv\Scripts\Activate.ps1`을 실행한다.
`npm run test:backend`는 현재 활성화된 Python 환경을 사용한다.
프론트는 `.env.example`을 `.env.local`로 복사하고 `npm run dev`로 실행한다.
백엔드 전체 실행은 별도 개발 PostgreSQL+pgvector 및 기존 스키마/마이그레이션이 필요하다.

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn main:app --app-dir backend/src --env-file .env.local --reload
```

`.env.local`의 SECRET_KEY는 `python -c "import secrets; print(secrets.token_urlsafe(48))"`로 생성한 값을 사용한다.
테스트는 운영 main/startup을 실행하지 않고 실제 FastAPI 라우터·SQLAlchemy 모델을 메모리 SQLite에서 검사한다.
인증 사용자/DB 의존성과 추천 캐시 갱신만 교체한다. 카카오·Supabase 인증, pgvector 추천,
운영 데이터/마이그레이션, 브라우저 상호작용은 이 테스트의 검증 범위 밖이다.

## CI와 배포

로컬 검증(2026-09-08): `npm ci`, `npm run check`, `npm run build`, `pip check`,
백엔드 소스 컴파일 성공. pytest **59개 통과**, 린트 **오류 0 / 기존 경고 93**.
pytest의 기존 라이브러리 폐기 예정 API 경고 4개는 남아 있다.

`.github/workflows/ci.yml`: PR 및 main/codex 브랜치에서 프론트 검사와 백엔드 테스트를 실행.
`Quality gate`는 두 작업이 모두 성공해야 통과한다. Vercel도 설치·린트·타입·빌드 실패 시 배포를 중단한다.
GitHub 저장소의 main 보호 규칙에 `Quality gate`를 필수 검사로 등록하고,
Render 자동 배포를 CI 통과 후 배포하도록 연결해야 백엔드 배포까지 강제된다.
이 외부 관리 설정은 코드만으로 적용되지 않으며, 이번 PR은 main 병합·운영 배포를 수행하지 않는다.

린트 오류는 0개로 유지한다. 기존 화면에 남은 경고 93개를 기준 상한으로 고정해 증가 시 실패시킨다.
React Compiler를 사용하지 않는 현재 앱에서 컴파일러 도입 권고 6개 규칙은 경고로 보존한다.
훅 호출 순서 등 나머지 오류는 CI를 실패시킨다. 경고 정리는 3주차 화면 정리와 함께 상한을 낮추며 진행한다.
ESLint 9는 현재 Next의 React 플러그인 peer 범위와 맞춰 사용하며, ESLint 10 전환은 플러그인 호환성 확보 후 진행한다.

## 2주차에 이어갈 방문 정책

1. 방문 사실과 혜택 사용을 별도 이벤트로 기록. 예약·좋아요·리뷰만으로 현장 방문을 확정하지 않음.
2. 서버가 검증한 QR 토큰/위치·예약 증빙과 현재 크루 멤버십을 함께 확인.
3. 저장 시각은 UTC, 일/월 집계 경계는 Asia/Seoul. 클라이언트 날짜를 신뢰하지 않음.
4. 유저 방문 중복 키 `(user_id, place_id, community_id, KST 날짜)`를 DB에서 보장.
   크루 활동 집계는 `(community_id, place_id, KST 날짜)`. 개인 방문의 NULL 키 처리도 설계.
5. 혜택 사용은 신청 ID와 방문 이벤트를 연결하고 원자적 한도 차감·멱등 키를 적용.
6. 크루 프로필·주방·미션·가게 통계를 같은 검증된 방문 집계로 전환. 기존 기록은 legacy로 구분.

이번 변경에는 이 방문 스키마/집계 전환 및 미션 개편을 포함하지 않는다.

## 버전 선택 참고

- [Next 보안 업데이트](https://nextjs.org/blog/august-2026-security-release)
- [Next ESLint 설정](https://nextjs.org/docs/app/api-reference/config/eslint)
- [GitHub setup-node](https://github.com/actions/setup-node), [setup-python](https://github.com/actions/setup-python)
