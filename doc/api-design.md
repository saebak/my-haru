# 서버 API와 동기화 설계

> 이 문서는 동결된 Phase 2 검토 초안이다. 경로, 헤더, 기기 토큰, Edge Function, 동기화 계약은 확정되지 않았으며 구현 기준으로 사용하지 않는다. Phase 1 앱 실행과 Todo 저장에서는 이 API 또는 Supabase를 호출하지 않는다.

## 1. API 경계

프런트엔드는 Supabase 업무 테이블과 public RPC를 직접 호출하지 않는다. 다음 Edge Function을 통해 접근한다.

```text
/functions/v1/nickname-session
/functions/v1/sync
/functions/v1/account
```

Supabase publishable key는 Function 호출에 사용하고, 회원 데이터 권한은 별도의 기기 세션 검증으로 결정한다.

## 2. 공통 요청

### 헤더

| 헤더 | 용도 |
| --- | --- |
| `apikey` | Supabase 프로젝트 공개 키 |
| `Content-Type: application/json` | JSON 본문 |
| `X-Session-Id` | 등록 후 발급된 기기 세션 ID |
| `X-Device-Token` | 기기에 저장된 256비트 원문 토큰 |
| `X-Request-Id` | 추적용 UUID, 내용 없는 로그에만 사용 |

등록 요청에는 세션 헤더가 없다. 그 외 회원 데이터 요청에는 둘 다 필수다.

### 성공 응답

```json
{
  "data": {},
  "requestId": "uuid",
  "serverTime": "2026-09-10T00:00:00.000Z"
}
```

### 오류 응답

```json
{
  "error": {
    "code": "NICKNAME_ALREADY_EXISTS",
    "message": "이미 사용 중인 닉네임이에요.",
    "retryable": false
  },
  "requestId": "uuid"
}
```

사용자에게 보여줄 문구와 서버 오류 코드는 분리한다. 서버 응답에 SQL, 테이블명, 토큰 일부를 포함하지 않는다.

## 3. 닉네임 세션 API

### `POST /nickname-session/register`

요청:

```json
{
  "nickname": "데일리",
  "sessionToken": "64-char-hex-token",
  "installationId": "uuid"
}
```

처리:

1. 닉네임 trim, 길이·문자 규칙 검증
2. IP·installation ID 요청 제한
3. DB unique 제약을 이용한 회원 생성
4. token SHA-256 해시 저장
5. `userId`, `sessionId`, 정규화된 nickname 반환

중요 오류: `NICKNAME_INVALID`, `NICKNAME_ALREADY_EXISTS`, `RATE_LIMITED`.

세션 검증은 해시 길이를 먼저 확인한 뒤 timing-safe 비교를 사용한다. 원문 토큰은 요청 처리 후 보관하거나 로그에 남기지 않는다.

### `POST /nickname-session/resume`

세션 헤더를 검증하고 최소 회원 정보만 반환한다. 성공 시 `last_used_at`을 제한된 빈도로 갱신한다.

### `POST /nickname-session/revoke`

현재 세션의 `revoked_at`을 즉시 기록한다. 클라이언트는 서버 성공 여부와 무관하게 로컬 원문 토큰을 제거한다.

## 4. 동기화 API

### `POST /sync/push`

요청 본문:

```json
{
  "operations": [
    {
      "operationId": "uuid",
      "entityType": "todo",
      "entityId": "uuid",
      "operation": "upsert",
      "baseVersion": 2,
      "payload": {},
      "clientTimestamp": "2026-09-10T00:00:00.000Z"
    }
  ]
}
```

- 한 요청 최대 operation 수와 payload 크기를 제한한다.
- 요청의 `userId`는 무시하고 검증 세션에서 주입한다.
- `operationId`로 멱등 처리한다.
- operation별 `accepted`, `duplicate`, `conflict`, `invalid` 결과를 반환한다.
- 부분 성공을 허용하되 한 엔터티의 연관 작업은 transaction group으로 묶을 수 있다.

### `GET /sync/pull?cursor=<opaque>&limit=200`

- 서버가 발급한 opaque cursor 이후 변경을 반환한다.
- `updated_at` 단독 커서는 같은 시각 충돌이 있으므로 `(change_sequence, id)` 기반 커서를 사용한다.
- 삭제 tombstone도 반환한다.
- 최대 limit과 응답 크기를 제한한다.

응답:

```json
{
  "data": {
    "changes": [],
    "nextCursor": "opaque-cursor",
    "hasMore": false
  }
}
```

## 5. 계정 API

### `PATCH /account/nickname`

닉네임 변경 정책이 확정된 뒤 활성화한다. unique 제약과 변경 빈도 제한을 적용한다.

### `DELETE /account`

1. 세션 검증
2. 회원 `deleted_at`, `purge_after` 설정
3. 모든 기기 세션 revoke
4. 클라이언트 로컬 데이터 삭제 확인
5. 보존 기간 후 하드 삭제 작업 수행

## 6. 검증 규칙

| 값 | 규칙 |
| --- | --- |
| nickname | trim, 2~20자, 대소문자 무관 unique, 공백 정책 미확정 |
| UUID | 표준 UUID 문자열만 허용 |
| title | trim 후 1~120자 |
| memo | 최대 2,000자 |
| timezone | 서버 허용 IANA 목록으로 확인 |
| targetDate | `YYYY-MM-DD` 실제 달력 날짜 |
| weekdays | ISO 1~7, 중복 제거 후 정렬 |
| operation batch | 최대 개수·바이트 제한 필요 |

클라이언트 검증은 UX용이며 Edge Function과 DB 제약에서 다시 검증한다.

## 7. 요청 제한과 남용 방지

- 닉네임 등록: IP와 installation ID 기준 저빈도 제한
- 세션 검증 실패: 지수 백오프와 일시 차단
- sync push: 세션별 분당 요청·operation 수 제한
- account delete: 짧은 시간 내 중복 요청 멱등 처리
- CORS origin allowlist와 허용 method/header를 명시

구체적인 숫자는 실제 사용량과 Supabase 요금제 제한을 확인한 뒤 결정한다.

앱인토스 서버 API를 호출하는 알림 단계에서는 `SYNC-010`에 따라 mTLS 전용 서버 어댑터를 둔다. Edge Function 런타임의 클라이언트 인증서 지원을 구현 시점에 공식 문서로 확인하고, 지원하지 않으면 해당 호출만 mTLS를 지원하는 별도 백엔드로 분리한다.

## 8. 오류 코드

| 코드 | HTTP | 재시도 |
| --- | --- | --- |
| `NICKNAME_INVALID` | 400 | 아니요 |
| `NICKNAME_ALREADY_EXISTS` | 409 | 아니요 |
| `SESSION_INVALID` | 401 | 아니요 |
| `SESSION_REVOKED` | 401 | 아니요 |
| `RATE_LIMITED` | 429 | `Retry-After` 이후 |
| `VERSION_CONFLICT` | 409 | pull 후 사용자/정책 판단 |
| `OPERATION_INVALID` | 422 | 수정 후 |
| `TEMPORARILY_UNAVAILABLE` | 503 | 예 |

## 9. 클라이언트 재시도

- 네트워크·`429`·`503`만 자동 재시도한다.
- 지수 백오프와 jitter를 사용하고 최대 지연을 제한한다.
- 앱 재실행 뒤에도 outbox의 `retryAt`, `attemptCount`를 유지한다.
- 입력 오류·세션 오류·충돌은 무한 재시도하지 않는다.
- 같은 변경 재전송에는 같은 operation ID를 사용한다.

## 10. API 버전과 호환성

- Function route는 초기에는 `/v1`을 유지한다.
- request와 entity에 `schemaVersion`을 포함한다.
- 필드 추가는 하위 호환으로 처리하고 제거·의미 변경은 새 버전을 사용한다.
- 최소 지원 앱 버전을 서버 설정으로 관리하고 강제 업데이트는 데이터 유실 위험이 있을 때만 사용한다.
