# 서버 API와 동기화 설계

## 1. 현재 범위

클라이언트는 Supabase 업무 테이블을 직접 호출하지 않고 `account-sync` Edge Function 하나만 사용한다. 현재 구현은 앱인토스 익명 사용자 식별, 내부 계정·세션 발급, Todo 전체 스냅샷 백업·복원을 제공한다. 증분 동기화, 충돌 UI, 계정 삭제 API와 앱스토어용 Apple·Google·이메일 공급자는 후속 범위다.

```text
POST /functions/v1/account-sync
```

공통 헤더는 Supabase 공개 키를 담은 `apikey`와 `Content-Type: application/json`이다. `service_role`, HMAC secret과 다른 서버 비밀값은 브라우저 번들에 포함하지 않는다.

## 2. 식별자 교환

요청:

```json
{
  "action": "exchange",
  "provider": "toss_anonymous",
  "anonymousKey": "opaque-provider-value"
}
```

서버 처리:

1. 허용 provider와 입력 크기를 검증한다.
2. 선택적 검증 어댑터가 설정된 경우 공급자 서버에서 키를 검증한다.
3. 원문 식별키를 `IDENTITY_HMAC_SECRET`으로 HMAC-SHA256 처리한다.
4. `(provider, subject_hash)`로 내부 `account_id`를 찾거나 생성한다.
5. 30일 만료 불투명 세션을 발급하고 서버에는 SHA-256 해시만 저장한다.
6. 원문 식별키와 세션 토큰을 로그·DB에 남기지 않는다.

응답:

```json
{
  "accountId": "uuid",
  "sessionToken": "opaque-token",
  "expiresAt": "2026-10-18T00:00:00.000Z"
}
```

### 계정 생성 제한

1시간 고정 창에서 전체 2,000회, HMAC 처리한 네트워크 출처별 300회, HMAC 처리한 식별 주체별 10회로 제한한다. 제한 초과 시 `429 RATE_LIMITED`와 `Retry-After`를 반환한다. 원문 IP와 식별키는 제한 테이블에 저장하지 않는다.

## 3. 스냅샷 동기화

요청:

```json
{
  "action": "sync",
  "sessionToken": "opaque-token",
  "schemaVersion": 2,
  "todos": [],
  "records": []
}
```

처리 규칙:

- 세션 토큰의 SHA-256 해시와 만료·폐기 상태로 계정을 결정한다. 요청 본문의 계정 ID는 받거나 신뢰하지 않는다.
- JSON 구조, 스키마 버전, 엔터티 개수·크기와 필수 식별자를 서버에서 재검증한다.
- 같은 엔터티는 `updatedAt`이 더 최신이거나 같은 입력을 upsert한다.
- 누락된 엔터티는 삭제로 해석하지 않는다. 삭제는 `deletedAt` tombstone으로 전파한다.
- 서버에 저장된 해당 계정의 정규 스냅샷을 반환한다.
- 브라우저는 전체 응답을 백업 validator로 검증한 뒤 IndexedDB 단일 transaction으로 교체한다.

응답:

```json
{
  "schemaVersion": 2,
  "todos": [],
  "records": [],
  "syncedAt": "2026-09-18T00:00:00.000Z"
}
```

클라우드 실패는 로컬 저장을 실패로 바꾸지 않는다. 클라이언트는 재연결이 필요한 오류와 일시 오류를 설정 상태로 구분해 표시한다.

## 4. 보안 경계

- `accounts`, `account_identities`, `account_sessions`, `account_todos`, `account_todo_records`, `identity_exchange_limits`는 RLS를 활성화한다.
- `anon`과 `authenticated`의 업무 테이블 직접 권한을 철회하고 서버 전용 함수 실행 권한은 `service_role`에만 부여한다.
- Edge Function은 검증된 세션에서 `account_id`를 주입한다.
- 공개 키는 프로젝트 식별용이며 권한 비밀값이 아니다.
- 현재의 저위험 Todo 백업은 mTLS 공급자 검증 없이 익명 키를 계정 증명값으로 사용한다. 결제·포인트·민감정보를 추가하기 전에는 mTLS 검증 어댑터를 필수화한다.
- 로그에는 요청 action, 익명화된 오류 코드, 처리 시간만 허용하며 식별키·토큰·Todo 내용은 금지한다.

## 5. 오류 계약

| 코드 | HTTP | 클라이언트 처리 |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | 자동 재시도하지 않고 로컬 사용 유지 |
| `IDENTITY_UNAVAILABLE` | 400/503 | 기기 저장 상태 유지, 지원 환경에서 재연결 |
| `SESSION_INVALID` | 401 | 로컬 세션 제거 후 식별자 재교환 |
| `SESSION_EXPIRED` | 401 | 식별자 재교환 |
| `RATE_LIMITED` | 429 | `Retry-After` 이후 재시도 |
| `SCHEMA_UNSUPPORTED` | 409 | 앱 업데이트 안내, 로컬 데이터 유지 |
| `TEMPORARILY_UNAVAILABLE` | 503 | 백오프 후 재시도 |

응답에 SQL, 테이블명, 비밀값 일부나 사용자 입력을 포함하지 않는다.

## 6. 후속 고도화

- IndexedDB outbox와 멱등 `operationId`
- 변경 sequence 기반 증분 pull과 불투명 cursor
- version 충돌 감지, 삭제 우선 정책과 로컬 충돌 보관함
- 세션 폐기·계정 삭제·보존 기간 후 purge API
- Apple·Google·이메일 identity adapter와 계정 연결 UX
- 동기화 성공률·지연·복원 성공률을 개인정보 없이 측정
