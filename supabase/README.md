# Supabase 계정 백업

앱은 IndexedDB를 먼저 사용하고, 앱인토스 안에서 `User.getAnonymousKey()`를 받을 수 있을 때만 Supabase 백업을 비차단 방식으로 연결한다.

## 현재 파일

- `migrations/20260917000100_create_account_sync.sql`: 공급자 독립 계정, 식별자, 세션, Todo 스냅샷 테이블과 서버 전용 RPC
- `functions/account-sync/index.ts`: 토스 식별 교환과 양방향 스냅샷 수렴 함수
- `migrations/20260918000100_add_identity_exchange_rate_limits.sql`: HMAC 버킷 기반 계정 교환 호출 제한
- `archive/*.disabled`: 배포하면 안 되는 과거 닉네임 프로토타입

## 필수 서버 비밀값

- `IDENTITY_HMAC_SECRET`: 충분히 긴 무작위 비밀값. 원문 외부 식별자를 HMAC 처리한다.
- `TOSS_IDENTITY_VERIFY_URL`(선택): 토스 사용자 키를 추가 검증하는 mTLS 가능 서버 엔드포인트
- `TOSS_IDENTITY_VERIFY_SECRET`(선택): Edge Function과 검증 서버 사이의 인증값
- `SUPABASE_SECRET_KEY`: Edge Function에서 서버 테이블과 RPC에 접근하는 Supabase secret key

검증 서버가 없으면 `getAnonymousKey()` 값을 계정 증명값으로 받아 즉시 HMAC-SHA256 처리한다. 원문은 저장하지 않지만, 키가 유출되면 재사용될 수 있으므로 이 경로는 Todo 백업처럼 저위험 데이터에만 사용한다. 결제·포인트·민감정보를 추가할 때는 mTLS 검증 서버를 연결한다.

## 배포 순서

1. Supabase CLI 로그인 및 프로젝트 연결
2. 새 migration 적용
3. `IDENTITY_HMAC_SECRET` 등록. 선택적으로 mTLS 검증 서버 비밀값 등록
4. `account-sync` 함수 배포
5. 토스 앱 Sandbox에서 최초 연결, 재실행, 앱 데이터 삭제 후 복원을 확인

`service_role`, secret key, 데이터베이스 비밀번호, HMAC secret과 원문 인증 토큰은 브라우저 환경변수나 Git에 저장하지 않는다. 브라우저에는 publishable key만 둔다.

## 계정 교환 호출 제한

- 전체: 시간당 2,000회
- 네트워크 출처 HMAC 버킷: 시간당 300회
- 익명 식별 주체 HMAC 버킷: 시간당 10회
- 초과 응답: HTTP `429`, 코드 `RATE_LIMITED`, `Retry-After: 3600`

제한 초과나 제한 확인 장애는 클라우드 연결만 중단하며 IndexedDB CRUD에는 영향을 주지 않는다.
