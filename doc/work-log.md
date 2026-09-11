# 작업 로그

## 기록 원칙

- 작업 날짜별로 변경 내용, 검증 결과, 결정, 다음 작업을 기록한다.
- 완료하지 않은 일을 완료로 표시하지 않는다.
- 사용자 데이터, 인증 정보, 운영 광고 ID는 기록하지 않는다.
- 요구사항이나 외부 정책에 영향을 받은 결정은 관련 문서와 요구사항 ID를 함께 적는다.

## 2026-09-08

### 완료

- My Daily Todo 제품 요구사항 초안 작성
- 개인 사용 MVP부터 앱인토스 출시·광고 수익화까지 4단계 범위 정의
- 할 일, 목록, 반복 습관, 알림, 저장, 동기화, 광고, 분석 요구사항에 식별자 부여
- Todo, RecurrenceRule, HabitRecord, Reminder 데이터 모델 요구사항 정리
- 자동·수동 테스트와 출시 완료 기준 정리

### 산출물

- `doc/requirements.md` 버전 `0.1.0`

### 검증

- 요구사항 문서에 제품 목표, 기능·비기능 요구사항, 테스트, 출시 기준이 포함됨
- 구현 전 다시 확인해야 하는 앱인토스 공식 문서 링크가 포함됨

## 2026-09-09

### 완료

- 모바일 중심 단일 화면 UI 목업 작성
- 주간 날짜 선택, 오늘 진행률, 할 일과 습관 목록 구현
- 항목 생성·수정·완료·삭제·실행 취소 상호작용 구현
- 좌측 스와이프 액션과 포인터 기반 순서 변경 구현
- 키보드 `Alt + 방향키` 순서 변경 제공
- 반복 요일·종료일 입력과 이모지 선택 UI 추가
- 브라우저 `localStorage`에 목업 상태 저장
- 프로젝트 README, 참고 자료, 요구사항 분석, 작업 규칙 문서 작성

### 산출물

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `doc/reference.md`
- `doc/requirements-analysis.md`
- `doc/work-log.md`
- `AGENTS.md`

### 검증

- 문서 내부 상대 링크 대상 존재 확인
- 현재 구현과 요구사항의 차이를 `requirements-analysis.md`에 분리 기록
- 기존 `doc/requirements.md`는 변경하지 않음

### 알려진 제한

- 화면 기준 날짜가 2026년 9월 9일로 고정돼 있음
- 데이터 저장이 요구사항의 IndexedDB가 아니라 `localStorage`를 사용함
- 반복 항목은 규칙과 날짜별 기록이 분리되지 않은 목업 상태임
- 필터·정렬·백업·복원·완료 항목 일괄 정리가 없음
- React·TypeScript와 앱인토스 SDK가 아직 구성되지 않음
- 자동 테스트와 실제 토스 앱 검증이 없음

### 다음 작업

> 아래 목록은 2026-09-10 모델 결정으로 대체됐다. 현재 계획은 이 문서의 최신 섹션과 `requirements-analysis.md`를 따른다.

1. React·TypeScript 기반 프로젝트 골격과 테스트 명령 구성
2. 현재 UI를 컴포넌트로 이전하고 실제 현재 날짜 적용
3. Todo CRUD와 IndexedDB 저장소 구현
4. 목록 필터·정렬 및 완료 항목 일괄 정리 구현
5. RecurrenceRule·HabitRecord 분리와 반복 날짜 계산 구현
6. 백업·복원, 마이그레이션, 오류 상태 구현

## 결정 기록

| 날짜 | 결정 | 근거 |
| --- | --- | --- |
| 2026-09-08 | 1단계는 로그인 없는 로컬 우선 MVP로 진행 | 빠른 개인 사용 검증과 핵심 기능 안정화 |
| 2026-09-08 | MVP 영속 저장소는 IndexedDB 사용 | `DATA-001`, 데이터 규모와 마이그레이션 요구 |
| 2026-09-08 | 반복 규칙과 날짜별 기록을 분리 | `HABIT-002`, 통계와 과거 기록 보존 |
| 2026-09-09 | 현재 정적 코드는 구현 전 상호작용 목업으로 취급 | 프로덕션 기술 기준과 저장 방식이 아직 다름 |
| 2026-09-09 | 토스 로그인 대신 고유 닉네임과 기기 세션 사용 | 가벼운 진입을 제공하되 닉네임 사칭으로부터 데이터 격리 |
| 2026-09-09 | 앱인토스 SDK를 최신 3.x로 갱신 | 사용자 결정 |
| 2026-09-09 | TDS는 필요한 컴포넌트에만 도입 | 초기 번들 비용 억제 |
| 2026-09-09 | 주 시작은 월요일, 건너뜀은 달성률 분모 제외 | 사용자 결정 |
| 2026-09-09 | 오늘 이후 수정은 규칙 분할, 과거 표시는 보존 | 반복 기록의 역사적 일관성 |
| 2026-09-09 | 백업은 전체 교체, 삭제는 소프트 삭제 후 정리 | 단순한 복원과 향후 동기화 지원 |

위 닉네임·기기 세션 결정은 2026-09-10 Phase 2 동결 결정으로 대체됐다.

## 2026-09-09 — 프로젝트 스캐폴딩

### 완료

- 기존 정적 목업을 `prototype/`으로 이동해 보존
- React 18, TypeScript, Vite 6 프로젝트 구성
- ESLint, Vitest, TypeScript 빌드 명령 구성
- 앱인토스 WebView SDK와 설정 파일 구성
- TDS Mobile 패키지 설치 및 Provider 연결 검증(이후 선택적 도입 결정으로 전역 Provider 제거)
- Supabase JavaScript Client와 환경변수 검증 구성
- Supabase REST 엔드포인트 연결 상태를 확인하는 시작 화면 추가
- `.env.example`과 비밀 환경 파일 제외 규칙 추가

### 검증

- ESLint 통과
- Supabase 환경 설정 단위 테스트 3개 통과
- 일반 웹 프로덕션 빌드 통과
- 앱인토스 CLI `.ait` 패키징 통과
- 생성 산출물: `my-daily-todo.ait` (Git 제외)
- `.env.local`의 실제 Supabase URL·publishable key로 Auth 엔드포인트 응답 `200` 확인

### 남은 설정

- 앱인토스 콘솔 값에 맞춰 `apps-in-toss.config.ts`의 `appName` 확정
- Supabase 테이블과 RLS 정책은 도메인 모델 확정 후 추가

### 주의사항

- 앱인토스 SDK 3.4.0의 전이 의존성 `@apps-in-toss/ait-format@1.0.0`은 Node.js 24 이상을 선언한다. 현재 Node.js 22에서도 웹 빌드와 `.ait` 패키징은 통과했지만 개발 환경은 Node.js 24로 올린다.
- SDK 3.4.0 전환 후 npm audit 보고가 39건에서 6건으로 감소했다. 남은 전이 의존성은 강제 자동 수정하지 않고 영향 범위를 검토한다.
- TDS Provider를 포함한 초기 JavaScript 번들은 약 1.43MB이며 Vite의 500KB 청크 경고가 발생한다. 기능 화면이 늘기 전에 lazy loading과 청크 분리를 적용한다.

## 2026-09-09 — 제품 결정 반영

### 완료

- 닉네임 입력 화면과 중복 등록 오류 처리 구현
- 원문을 저장하지 않는 기기 세션 토큰 해시 방식 설계
- `app_users`, `nickname_sessions`, 등록·재접속 RPC 마이그레이션 추가
- TDS 전역 Provider 제거, 컴포넌트 도입 시점까지 지연
- 앱인토스 SDK 3.4.0으로 갱신하고 `apps-in-toss.config.ts` 형식으로 마이그레이션
- 주 시작·건너뜀 통계·규칙 분할·과거 보존·백업·삭제 결정 문서화

### 제한

- Supabase Auth는 사용하지 않는다.
- 다른 기기에서 닉네임만 입력한 계정 복구는 사칭 방지를 위해 제공하지 않는다.
- SQL 마이그레이션은 Supabase 프로젝트에 아직 적용되지 않았다.

### 검증

- ESLint 통과
- Supabase 연결 5개, 닉네임 검증 3개 등 단위 테스트 8개 통과
- SDK 3.4.0 타입 검사와 Vite 프로덕션 빌드 통과
- `apps-in-toss.config.ts`를 사용한 `.ait` 패키징 통과
- TDS 전역 Provider 제거 후 초기 JavaScript 번들 약 376KB로 감소

## 2026-09-10 — 아키텍처 및 데이터 설계

### 완료

- Local-first 클라이언트·Supabase Edge Function·Postgres 구성 설계
- Todo, 반복 규칙, 수행 기록, override, 알림, 동기화 테이블 설계
- IndexedDB object store와 outbox·충돌 저장 구조 설계
- 닉네임 세션, 동기화, 계정 삭제 API 계약 설계
- 확정 결정과 사용자 결정 필요 항목을 ADR 형식으로 분리

### 보안 검토 결과

- 초기 `public SECURITY DEFINER` RPC 방식은 최종안에서 제외 제안
- 업무 테이블의 anon 직접 권한을 회수하고 Edge Function에서 기기 세션을 검증하는 구조 채택 제안
- 기존 닉네임 SQL migration은 대체 migration 작성 전 배포 보류

### 검증

- README와 설계 문서의 상대 링크 검사 통과
- ESLint 통과
- Vitest 테스트 8개 통과
- TypeScript 검사와 Vite 프로덕션 빌드 통과

### 사용자 확인 필요

- 기존 공개 RPC 대신 Edge Function을 서버 보안 경계로 사용할지
- 닉네임을 한글·영문·숫자·밑줄만 허용하고 공백을 금지할지

## 2026-09-10 — Phase 1 저장소 범위 확정

### 결정

- Phase 1의 Todo, 반복 규칙, 수행 기록은 IndexedDB에만 저장
- Phase 1 앱 실행에서 Supabase 쓰기, 인증, outbox, 충돌 처리를 제외
- 앱 삭제·WebView 저장소 초기화 후 복원, 서버 백업과 다중 기기 동기화는 Phase 2로 이동
- 인증 방식은 Phase 2 시작 전에 다시 결정

### 영향

- IndexedDB schema version 1에는 로컬 도메인 store와 `meta`만 포함
- Supabase Postgres·API 설계는 Phase 2 목표 문서로 유지
- 현재 Supabase·닉네임 프로토타입은 삭제하지 않지만 Phase 1 실행 기준으로 사용하지 않음
- React 시작 화면에서 Supabase 연결 확인과 닉네임 로그인 게이트를 제거하고 Phase 1 로컬 모드로 전환

## 2026-09-10 — 독립 설계 감사 후 Phase 1 모델 확정

### 확정

- 별도 Habit·RecurrenceRule 없이 `Todo.type = one_time | recurring`으로 통합
- 반복 정의와 콘텐츠는 Todo가 소유하고 날짜별 수행·단일 날짜 override는 TodoRecord가 소유
- 반복 수정·삭제 범위는 `이 날짜만`, `이 날짜부터 이후` 두 가지로 단순화
- 이후 수정은 기존 Todo를 전날 종료하고 같은 `seriesId`의 새 revision Todo를 생성
- 통계와 알림은 Phase 3으로 이동
- Phase 1은 `Asia/Seoul`의 `dueDate/targetDate + dueTime` 문자열로 정렬하고 DST는 처리하지 않음
- Phase 2 인증·동기화·Supabase 상세 설계와 기존 API·migration을 동결

### 설계 보완

- IndexedDB v1의 Todo·TodoRecord 저장 레코드, unique 인덱스와 불변식 명시
- migration의 abort, blocked, versionchange와 미래 DB version 처리 규칙 추가
- 백업 전체 검증과 단일 transaction 전체 교체 알고리즘 명시
- 날짜 단일 수정에서 값 제거와 미수정을 구분하도록 `overrides` 객체의 속성 존재 여부 사용
- TodoRecord의 논리 키를 `[seriesId,targetDate]`로 변경해 revision 분할 후에도 기록을 재귀속하지 않도록 보완
- 동결된 Supabase README에서 실제 적용·RPC 실행 절차 제거
- Phase 1 실행 절차에서 `.env.local` 필수 설정 제거
- 과거 revision에서 이후 수정·삭제할 때 series suffix 전체를 원자적으로 정리하고 새 revision은 max + 1로 생성
- 이후 삭제 시 대상일 이후 TodoRecord도 같은 transaction에서 소프트 삭제
- 소프트 삭제 TodoRecord 논리 키 재사용과 실행 취소의 서로 다른 복원 규칙 명시

## 2026-09-10 — 정적 목업 UX 개선

> 이 절은 프로토타입 작업 기록이다. 아래 `전체 수정` UI와 RecurrenceRule·HabitRecord 표현은 같은 날짜에 확정된 Todo·TodoRecord 모델과 두 가지 수정 범위 결정으로 대체됐으며 프로덕션 구현에 이전하지 않는다.

### 완료

- 선택 날짜를 할 일 목록, 습관 노출, 완료 기록, 진행률과 캘린더 일정에 연결
- 할 일 등록 폼에 날짜를 추가하고 선택 날짜를 기본값으로 적용
- 습관 반복 요일과 종료일을 실제 날짜별 노출에 반영
- 반복 항목의 오늘만·오늘 이후·전체 수정 및 삭제 범위 목업 추가
- 습관 건너뜀 상태와 날짜별 연속 달성 표시 추가
- 캘린더 일정 점·개수·목록을 등록 데이터에서 계산하고 선택 날짜 화면으로 이동하도록 연결
- 항목 작업 더보기와 오른쪽 순서 변경 손잡이를 추가하고 완료 버튼 터치 영역을 확대
- 모달 포커스 이동·가두기·호출 버튼 복귀와 날짜별 접근성 이름을 보완
- 기존 목업 localStorage 데이터를 새 목업 상태 형식으로 마이그레이션

### 검증

- `node --check prototype/app.js` 통과
- 로컬 정적 서버 HTTP 200 확인
- 모바일 세로 화면에서 날짜 이동, 날짜별 빈 상태, 캘린더 일정 연동, 캘린더에서 날짜 이동, 새 항목 폼 기본 날짜와 닫기 후 포커스 복귀 확인
- 수정·건너뜀·삭제 작업 영역이 더보기 버튼으로 노출되는 것을 확인
- 후속 피드백에 따라 점 3개 더보기 버튼을 제거하고, 점 6개 순서 변경 손잡이의 시각적 대비를 낮춤
- 날짜 영역의 포인터 캡처가 일반 클릭 대상을 잃게 하던 문제를 수정해, 짧은 탭은 날짜 선택으로 확정하고 좌우 드래그는 주 이동으로 유지
- 실제 브라우저 마우스 클릭으로 9월 10일에서 9월 11일로 선택 날짜와 화면 제목이 갱신되고 다시 오늘 날짜로 복귀하는 것을 확인
- 할 일과 습관 섹션을 하나의 날짜별 목록으로 통합하고 제목 옆 `TODO`·`ROUTINE` 태그로 유형을 구분
- 통합 목록의 혼합 순서 변경을 저장하도록 보완하고, 진행률을 건너뛴 습관을 제외한 전체 표시 항목 기준으로 변경

### 제한

- 정적 목업은 localStorage를 사용하며 프로덕션 IndexedDB 모델과 별개다.
- 실제 삭제 실행과 실행 취소, 반복 수정 범위별 데이터 결과, Android·iOS 토스 WebView는 이번 검증에서 실행하지 않았다.
## 2026-09-10 - Phase 1 목업 React 이전 시작

- 정적 `prototype/`의 날짜 헤더, 주간 날짜 선택, 진행률, 일일 목록, 새 할 일 바텀시트를 `src/App.tsx`로 이전했다.
- 일반 Todo 생성과 완료/미완료 전환을 IndexedDB `my-daily-todo/todos` 저장소에 연결했다. 최초 실행에만 오늘 날짜용 예시 데이터를 생성한다.
- 완료 상태와 `completedAt`은 하나의 객체 저장 작업으로 함께 변경한다. 저장 중 추가 버튼을 비활성화해 중복 제출을 막는다.
- `npm run check` 결과 ESLint, Vitest 8개, TypeScript와 Vite production build가 모두 통과했다.
- 브라우저에서 목업 기반 목록과 진행률 표시를 확인했다.
- 제한: 수정·삭제, 반복 Todo/TodoRecord, 월간 캘린더, 필터·정렬, 백업·복원 및 IndexedDB 통합 테스트는 아직 구현되지 않았다.
## 2026-09-11 - 목업 DOM·스타일 정합성 보정

- React 목록을 정적 목업과 같은 `swipe-item`, `item-card`, `item-icon`, `item-body`, `item-check`, `drag-handle` 구조로 변경했다.
- TODO/ROUTINE 태그, 우선순위 표시, 루틴 연속 기록, 수정·건너뜀·삭제 액션 영역과 SVG 캘린더 아이콘을 목업 기준으로 복원했다.
- 기존 IndexedDB가 존재하는 개발 환경에도 오늘 날짜 루틴 예시가 누락되지 않도록 ID 기준 병합을 추가했다.
- `npm run check` 결과 ESLint, Vitest 8개, TypeScript와 Vite production build가 모두 통과했다.
- 제한: 스와이프/드래그, 수정·삭제, 월간 캘린더와 반복 입력의 실제 동작은 후속 구현 대상이다.
