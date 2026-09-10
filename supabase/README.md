# Supabase 프로토타입 — 동결

Phase 1은 IndexedDB만 사용한다. 이 디렉터리의 SQL과 닉네임 코드는 과거 검토용 프로토타입이며 현재 설계나 배포 대상이 아니다.

## 적용 금지

- `migrations/20260909000100_create_nickname_accounts.sql`을 Dashboard SQL Editor에서 실행하지 않는다.
- `supabase db push`로 원격 프로젝트에 적용하지 않는다.
- 프로토타입 RPC를 앱 실행 경로에 다시 연결하지 않는다.

이 migration은 고유 닉네임, 기기 토큰 해시와 공개 RPC 방식을 실험했던 기록이다. Phase 2 인증·계정 복구·서버 경계는 확정되지 않았으며 기존 SQL의 보안 모델을 채택한 것으로 간주하지 않는다.

## Phase 2 재개 조건

1. 인증과 계정 복구 방식을 먼저 결정한다.
2. `Todo`와 `TodoRecord(seriesId + targetDate)` 모델을 기준으로 서버 스키마를 새로 설계한다.
3. RLS, 서버 경계, 동기화 충돌과 삭제 보존 정책을 독립 검증한다.
4. 기존 프로토타입을 수정 적용하지 않고 새 migration을 작성한다.
5. 로컬 환경과 별도 테스트 프로젝트에서 검증한 뒤 적용 절차를 문서화한다.

`service_role`, secret key, 데이터베이스 비밀번호와 원문 인증 토큰은 브라우저 환경변수나 Git에 저장하지 않는다.
