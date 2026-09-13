# 5주차 — 베타 관찰 이벤트와 첫 이탈 신호

4주차의 재방문 지표·운영 상태·점주 방문 확인 API를 바탕으로, 제한 베타에서 실제 사용 흐름을 관찰할 수 있는 최소 계측을 추가한다. 이번 PR은 이탈 원인을 추정하지 않고, 서버가 확인한 사실과 인증 사용자의 행동 신호를 분리해 기록한다.

## 이번 주 완료 범위

- 기존 Supabase `public.action_logs`를 재사용하는 베타 이벤트 계약과 인증 API 추가
- 방문 인증 완료(`visit_verified`)와 크루 리스트 장소 저장(`list_place_saved`)을 서버 사실로 기록
- 크루 상세 화면 조회(`village_viewed`)와 미션 버튼 시작(`mission_action_started`)을 인증 사용자 행동으로 기록
- `/api/admin/beta-metrics`에 최근 28일 이벤트별 횟수와 측정 출처 추가
- 이벤트 metadata는 허용된 짧은 값만 저장하며 토큰·본문·이메일·URL·개인 식별 세부정보는 받지 않음
- 준비 상태 확인에 `action_logs` 테이블을 포함해 계측 누락을 503으로 드러냄

## 이벤트 계약

| 이벤트 | 기록 위치 | 의미 |
| --- | --- | --- |
| `visit_verified` | 백엔드 체크인/점주 승인 | 서버가 방문을 verified로 전환한 1회 |
| `list_place_saved` | 크루 장소 저장·리스트 복사 | 새 장소가 실제로 저장된 작업 |
| `village_viewed` | 크루 상세 화면 | 인증된 사용자가 크루 화면을 연 1회 |
| `mission_action_started` | 미션 액션 버튼 | 인증된 사용자가 저장/빌리기 액션을 시작한 1회 |
| `crew_created`, `crew_member_joined`, `poll_created`, `decision_confirmed`, `menu_unlocked`, `partnership_benefit_confirmed` | 계약에 예약 | 다음 관찰 묶음에서 해당 서버 사실을 연결 |

모든 이벤트는 UTC 시각으로 저장하고 관리자 집계는 최근 28일 창으로 제한한다. 이벤트 수는 전환율이 아니며, 28일 미만의 관찰 대상은 재방문 지표처럼 별도로 성숙도 보정을 하지 않는다.

## 수집 API

`POST /api/analytics/events`는 B2C JWT 인증이 필요하다.

```json
{
  "event_name": "village_viewed",
  "entity_type": "crew",
  "entity_id": "crew-id",
  "request_id": "client-generated-id",
  "metadata": { "surface": "crew_profile" }
}
```

`event_name`은 계약 목록만 허용한다. `request_id`가 같은 재전송은 중복으로 쌓지 않는다. API는 제품 흐름을 막지 않도록 프런트에서 실패를 삼키지만, 서버·관리자 경로의 기록 실패는 상태 코드로 드러낸다.

## 관찰 운영

1. 첫 공동 방문, 리스트 담기, 점주 승인 요청을 각각 한 번씩 실제 계정으로 수행한다.
2. `/admin/beta`에서 방문·장소 저장·마을 조회·미션 시작의 상대적 감소 구간을 확인한다.
3. 요청 로그와 사용자 인터뷰에서 오류/이탈 이유를 모아 상위 3개만 다음 수정 대상으로 선정한다.
4. 혜택은 아직 모의·실운영을 섞지 않고, 실제 혜택 성공률은 별도 원장이 연결될 때까지 측정 대기로 둔다.

## 현재 남은 검증

- 실제 계정 2명과 점주 계정으로 QR 또는 직원 승인 공동 방문 1회
- iOS Safari/Android Chrome에서 크루 화면·미션·점주 승인 흐름 확인
- 7일간 첫 사용자의 이벤트 누락·401/5xx·화면 이탈 이유 관찰
- 충분한 관찰 수가 생긴 뒤 상위 3개 이탈 원인 수정 PR을 별도로 생성

DB migration은 없다. 기존 Supabase `action_logs` 테이블을 서버에서만 사용하므로 Supabase Data API에 새 공개 권한을 추가하지 않는다.
