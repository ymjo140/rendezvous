# 2주차 — 방문 인증과 공통 집계

2026-09-10 업데이트: 1주차 PR #3과 2주차 PR #4를 main에 병합했다.
운영 Supabase에 방문 테이블 4개를 추가하고 RLS와 클라이언트 직접 접근 차단을 확인했다.
기존 사용자 17명·크루 11개·장소 125,318개 수는 유지됐다. 실제 방문 테스트 데이터는 넣지 않았다.
Vercel의 rendezvous·wemeet-project 운영 배포 성공을 확인했다. Render API 배포 상태는 이 세션에서 확인하지 못했다.
기존 테이블 64개의 권한 변경 제안은 자동 승인 검토에서 거절되어 `docs/pending/`에 미적용 상태로 보관했다.

## 적용한 방문 기준

- 방문 확인: 매장 소유주가 발급한 **180초 유효 서명 QR + 현재 위치** 또는 **직원의 현장 승인**.
  위치는 300m 이내, 정확도 150m 이내, 측정 시각 90초 이내(미래 오차 최대 10초).
  GPS만으로 통과하지 않는다. 브라우저 GPS는 기기 위변조 방지 수단이 아니므로 QR/직원 확인을 함께 사용한다.
- QR은 매장·발급 점주·용도·발급/만료 시각에 서명한다. 매장 주인이 바뀌면 기존 QR은 무효다.
  반환하는 `checkin_path`의 URL fragment에 토큰이 있어 서버 접근 로그/referrer의 query에 남지 않는다.
- 개인 방문: 확인한 유저별 매장·KST 날짜당 1회.
- 공동 방문: 같은 크루의 현재 멤버 **2명 이상이 같은 KST 날짜, 2시간 이내에 각자 확인**해야 1회.
  최초 1명은 `pending`; 2명 확인 후 `verified`. 나중에 중복 확인해도 횟수를 늘리지 않는다.
  입력한 `party_size`와 예약 인원은 참고용이며 인증된 인원수가 아니다.
- 직원 승인 요청은 본인이 생성하며 15분 유효. 직원은 매장에 실제 있는 사용자를 확인한 뒤 승인한다.
  승인 요청 시각을 방문 시각, 승인 시각을 검증 시각으로 보관한다. 자정 이후 승인되어도 요청 날짜에 귀속한다.
  만료 요청을 다시 보내면 같은 날짜의 요청을 갱신한다. 탈퇴한 멤버는 승인할 수 없다.
- 예약 경로도 동일한 증빙이 필요하다. 예약 소유자·매장·크루·상태와 예약 전후 2시간(KST)을 검증한다.
- 모든 신규 시각은 UTC timezone-aware로 저장. 일자·월·월요일 주 시작은 `Asia/Seoul`로 계산한다.

## 데이터와 트랜잭션

| 테이블 | 역할 | DB 중복 방지 |
| --- | --- | --- |
| `visit_events` | 개인/크루의 매장·날짜 방문 | `(scope_key, place_id, visit_date_kst)` |
| `visit_participants` | 유저별 현장 증빙 | `(visit_id, user_id)` |
| `visit_approval_requests` | 점주 승인 대기 | `(scope_key, place_id, user_id, visit_date_kst)` |
| `partnership_redemptions` | 제휴 혜택 사용 원장 | `(app_id, visit_id)` 및 `(app_id, idempotency_key)` |

`scope_key`는 `crew:<id>` 또는 `user:<id>`이며 DB CHECK가 소유 필드와의 일치를 강제한다.
개인 방문의 NULL `community_id`가 UNIQUE 제약을 빠져나갈 수 없다.
방문은 upsert 후 해당 행을 잠그고 참가자를 기록한다. 크루 → 요청/방문 → 제휴 신청 순서로 잠그고
한 트랜잭션에서 확정한다. 제휴 신청 행 잠금 안에서 월 한도 조회와 원장 추가를 수행한다.
같은 방문의 재시도/다른 요청 키는 기존 사용을 반환한다. 다른 방문에 같은 키를 재사용하면 409다.

제휴 사용은 당일 확인한 현재 멤버만 요청할 수 있으며, 동시간대 확인 인원으로 `min_party`를 검사한다.
수락 당시 `terms_snapshot`의 빈 조건도 그대로 존중한다. 시간·요일·월 한도는 KST다.
**운영 혜택 사용 스위치는 1주차와 동일하게 닫혀 있다(503).** 테스트에서만 명시적으로 열어 원장을 검증한다.
체크인으로 할인 확인증이나 포인트를 발급하지 않는다.

## 공통 집계와 자격

홈의 내 크루/방문 추천, 크루 상세, 주방, 쇼케이스, 방문 미션, 제휴 화면,
점주 크루 제휴 성과·후보·요약이 검증된 `visit_events`를 사용한다.
재방문 수는 매장별 `max(방문수 - 1, 0)`의 합이며, 같은 매장 3회부터 단골이다.
같은 날 다른 매장을 함께 방문하면 각각 1회로 센다. 주간 미션은 승인 시각 대신 방문 시각을 사용한다.
리스트만 공개/비공개 크루의 활동 노출 제한을 유지한다.

제휴 자격은 현재 멤버 3명 + 공동 방문 3회, 또는 해당 학교/회사 소속을 인증한 현재 멤버 1명 이상이다.
소속 문자열만으로 자격을 주지 않는다. 인증의 종류·도메인·상태와 `verified_at`부터 365일 유효성을 확인한다.
OTP용 `expires_at`(10분)을 소속 유효기간으로 오해하지 않는다.
서버가 `members_ok`, `visits_ok`, 요구 횟수/인원, `next_action`을 반환하며 프론트가 이를 표시한다.

## 이전 데이터

기존 체크인·예약·분담결제·피드백과 예전 혜택 필드는 수정/삭제/자동 승격하지 않는다.
이전 방문은 `legacy_visits`, 이전 분담 금액은 `legacy_amount`/`legacy_spent`로 분리한다.
주방에 이전 기록 수를 표시한다. 신규 검증 방문이 아직 없으면 해금·단골·활동 자격은 0부터 시작한다.
예전 모의 분담 잔액을 검증된 매출로 표시하지 않는다(`amount`/`spent`는 현재 0).

이번 통합 대상은 **크루 활동과 크루 제휴 성과**다. 기존 점주 개인 CRM/매출 데모의 예약 기반 보고,
기존 후기 대기열·추천 가중치의 이전 체크인 참조는 별도 경로이며 이번 지표와 섞지 않는다.
새 참가자 기록을 후기·취향 신호까지 연결하는 작업은 후속 미션/피드백 정리에 포함한다.

## API와 점주 앱 연결

| 메서드·경로 | 인증 | 동작 |
| --- | --- | --- |
| `POST /api/merchant/stores/{id}/checkin-qr` | Supabase 점주 토큰 + 매장 소유 | token/expires_at/checkin_path 발급 |
| `POST /api/checkin` | 앱 사용자 | 서명 QR·위치·멤버십 검증 후 개인 확인 |
| `POST /api/checkin/approval-requests` | 앱 사용자 | place_id, community_id?, reservation_id?로 직원 승인 요청 |
| `GET /api/checkin/approval-requests/{id}` | 요청자 + 현재 멤버 | pending/expired/approved 및 방문 상태 |
| `GET /api/merchant/stores/{id}/visit-requests` | 점주 + 매장 소유 | 유효한 승인 대기 목록, 사용자 이름 |
| `POST /api/merchant/visit-requests/{id}/approve` | 점주 + 매장 소유 | 해당 사용자의 현장 방문 승인 |
| `GET /api/visits/{id}` | 현재 크루 멤버 또는 개인 방문 주인 | 다른 멤버 확인 후 공동 방문 상태 조회 |
| `POST /api/visits/{id}/redeem` | 확인한 현재 멤버 | 별도 사용 원장, 현재 운영에서는 503 |

체크인 요청 예시(날짜/혜택 ID는 클라이언트가 정하지 않는다):

```json
{
  "place_id": 1,
  "community_id": "crew-id",
  "qr_token": "매장에서 발급한 토큰",
  "lat": 37.5,
  "lng": 127.0,
  "accuracy_m": 10,
  "position_at": "2026-09-08T03:00:00Z"
}
```

B2C `/checkin/{placeId}`에는 QR·위치 확인, 직원 승인 요청/대기, 공동 방문 대기/완료 UI를 연결했다.
동일 탭 로그인 후 체크인으로 복귀하며, QR이 만료되면 새 매장 QR을 요청한다.
별도 저장소 `rendezvous-merchant`의 화면은 이 PR에 포함되지 않는다.
실제 매장 사용 전 그 콘솔에서 **약 2분마다 새 QR을 발급·표시**, 만료 시 숨김,
**요청자 이름을 현장에서 확인한 뒤 승인**하는 화면을 위 API에 연결해야 한다.
기존에 인쇄한 정적 URL만으로는 인증이 되지 않으며 직원 승인 경로를 이용한다.

## 배포 순서 / 롤백

1. 1주차 기반 변경과 이 PR의 CI 결과를 확인한다. `Quality gate`는 frontend, backend, PostgreSQL 모두 성공해야 한다.
2. 스테이징 PostgreSQL에서 기존 앱 테이블이 있는 상태로 아래 명령을 실행한다.
   운영 적용 전 스냅샷/백업과 아래 방문 시나리오를 확인한다.
3. **Render와 같은 DB 연결 역할**로 `--check`가 통과하는지 확인한 뒤 API → 프론트 순서로 배포한다.
   자동 배포 시 Render의 Pre-Deploy Command에 `--apply` 명령을 설정할 수 있다.
   기존 동시 자동 배포라면 잠시 중지하고 순서를 맞춘다. Vercel 프리뷰도 운영 API가 아닌 새 스테이징 API를 가리켜야 한다.
4. 점주 콘솔에서 2명 확인 → 홈/주방/제휴 성과 1회, 반복 요청 → 여전히 1회인지 스모크 확인한다.
5. 이상 시 API/프론트를 이전 배포로 되돌리고 **신규 테이블은 유지**한다. 새 증빙/원장을 삭제하지 않는다.
   구 버전은 새 테이블을 읽지 않으므로 되돌린 기간의 화면은 구 집계로 보일 수 있다.

프로젝트 루트 기준, 비밀값은 기존 배포 환경 변수 `DATABASE_URL`을 사용한다:

```sh
python backend/scripts/migrate_verified_visits.py --apply
python backend/scripts/migrate_verified_visits.py --check
```

`--apply`는 SQL 전체를 트랜잭션/마이그레이션 잠금 안에서 실행한다. 재실행 가능하며 API 시작 시 자동 수행하지 않는다.
신규 4개 테이블에 RLS를 활성화하고 공개 읽기/쓰기 정책을 만들지 않는다.
API DB 역할은 테이블 소유자 또는 승인된 서버 역할이어야 한다. 브라우저의 Supabase anon/service 키를 새로 요구하지 않는다.

## 검증

- SQLite 실제 모델/라우터 회귀 테스트 93개: 1주차 권한·결제 테스트 + QR/승인/시간 경계/집계 일치/원장 테스트.
- 별도 PostgreSQL 16 CI: 배포 SQL 신규 생성/재실행, RLS/DB 제약, 동시 중복 체크인,
  여러 멤버의 동시 확인, 개인 방문 NULL 중복, QR/승인 경합, 월 한도 마지막 1회 경합, 실패 롤백.
- 프론트: `npm run check`, `npm run build`. 기존 lint 경고 상한 93은 늘리지 않는다.
- 로컬 명령: `python -m pytest`; PostgreSQL 테스트는 `TEST_POSTGRES_URL`이 없으면 명시적으로 skip한다.
  CI의 PostgreSQL 작업에는 해당 변수가 필수로 주입되므로 접속 실패/마이그레이션 실패는 작업 실패다.
  테스트는 localhost의 `rdv_test*` DB 안에서 임의 스키마만 생성·정리한다.

구현 참고: [PostgreSQL 행 잠금](https://www.postgresql.org/docs/current/explicit-locking.html),
[SQLAlchemy upsert](https://docs.sqlalchemy.org/en/20/orm/queryguide/dml.html#orm-upsert-statements),
[Python zoneinfo](https://docs.python.org/3/library/zoneinfo.html).
