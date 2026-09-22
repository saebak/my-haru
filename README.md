# My Daily Todo

앱인토스 WebView에서 실행하는 개인용 할 일·반복 습관 관리 미니앱이다. IndexedDB를 원본 저장소로 사용하는 로컬 우선 구조이며, 앱인토스 익명 사용자 식별키와 Supabase를 이용한 서버 백업·복원 베타가 연결돼 있다.

## 현재 구현

- 할 일과 반복 습관 생성·수정·완료·완료 취소·삭제
- 반복 여부와 할 일·습관 분류를 분리해 할 일도 습관으로 바뀌지 않고 반복 설정 가능
- 반복 습관의 매일·요일·사용자 지정 N일 반복, 날짜별 완료·건너뛰기와 날짜만/이후/전체 범위 수정·삭제
- 반복 습관의 선택 날짜 기준 연속 달성 표시
- 선택 날짜의 단일 목록과 완료 항목 자동 하단 배치
- 한국어 날짜·시간 선택기와 날짜별 목록, 진행률·완료 안내
- 상단 날짜 탐색: 첫 화면과 오늘 복귀 시 오늘 중앙 배치, 좌우 버튼의 7일 슬라이드 전환, 날짜 선택 시 표시 배치 유지
- 입력 팝업을 열 때 모바일 키보드를 자동으로 띄우지 않고, 캘린더 날짜를 25·50·75·100% 달성률 단계로 꾸밈
- `dnd-kit` 기반 포인터·키보드 목록 정렬과 드래그 오버레이, 날짜별 수동 순서 저장
- 이모지 40종, 중요도 세그먼트 선택, 날짜·중요도 한 줄 입력
- 새 할 일·습관의 기본 이모지 `💡`, 할 일은 반복 꺼짐·습관은 반복 켜짐 기본값
- 시간 기본값 없음, 반복 기본값 꺼짐, 모바일 중앙 입력 팝업과 화면 안에 고정된 저장 버튼
- 완료 카드의 체크·배경·취소선·`완료됨` 배지 표시와 완료 토스트 억제
- IndexedDB 저장·마이그레이션, JSON 백업 내보내기·가져오기·전체 삭제
- 토스 WebView에서는 `File.saveBase64`, 일반 브라우저에서는 다운로드 API를 사용하는 백업 내보내기
- 첫 실행에 핵심 화면을 가리지 않는 인라인 사용 가이드와 설정에서 다시 보기
- 로딩·빈 상태·오류·저장 중 중복 제출 방지와 접근성 포커스 복귀
- 앱인토스 `User.getAnonymousKey()` 기반 무로그인 사용자 식별과 Supabase 전체 스냅샷 백업·복원
- 원문 식별키 HMAC 처리, 불투명 세션 토큰 해시 저장, 계정·호출원·식별자별 속도 제한

## 기술과 라이브러리

- React 18.3 + TypeScript 5.7
- Vite 6.4, 앱인토스 WebView SDK `@apps-in-toss/web-framework` 3.4.1
- `@dnd-kit/core` 6.3, `@dnd-kit/sortable` 10.0, `@dnd-kit/utilities` 3.2: 목록 드래그 정렬
- `react-datepicker` 9.1 + `date-fns` 4.4: 한국어 날짜·시간 선택
- `fake-indexeddb`: 저장소 테스트 환경
- Vitest 5, Testing Library, ESLint 9
- TDS Mobile 패키지는 설치되어 있으나 현재 화면에는 전역 Provider를 적용하지 않는다.
- Supabase Edge Functions·Postgres: 계정 식별, 세션 교환, 서버 스냅샷 백업·복원

## 구조

```text
src/
├── App.tsx                         메인 화면, 입력 팝업, 캘린더, 설정
├── styles.css                      프로토타입 스타일을 확장한 앱 스타일
├── components/SchedulePicker.tsx   날짜·시간 선택 컴포넌트
├── domain/todos/                   날짜 계산, 반복 규칙, 도메인 타입
├── infrastructure/indexed-db/      IndexedDB 저장소와 마이그레이션
├── infrastructure/identity/        앱인토스 익명 식별 어댑터
├── infrastructure/sync/            Supabase 백업·복원 클라이언트
└── features/backup/                백업 검증·복원·토스 파일 저장

prototype/                           기존 정적 UI 목업과 공통 스타일
doc/                                 요구사항·설계·공식 참고·작업 로그
supabase/                            DB 마이그레이션과 account-sync Edge Function
apps-in-toss.config.ts               앱인토스 WebView 설정
```

## 설치와 로컬 실행

앱인토스 SDK 도구의 실행 조건에 맞춰 Node.js 24 이상을 사용한다.

```powershell
npm install --legacy-peer-deps
npm run dev
```

브라우저에서 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)을 열면 된다. 로컬 할 일 기능은 환경 변수 없이 동작한다. 클라우드 백업을 확인하려면 `supabase/.env.example`을 참고해 프로젝트 URL과 공개 키를 `.env.local`에 설정한다. 비밀키는 클라이언트 환경 변수에 넣지 않는다.

## 검증과 빌드

```powershell
npm run lint       # ESLint
npm test           # Vitest 전체 테스트
npm run build:web  # TypeScript 검사와 일반 웹 프로덕션 빌드
npm run check      # lint + test + build:web
npm run build      # 웹 빌드와 앱인토스 .ait 패키징
npm run preview    # 웹 빌드 미리보기
```

`my-daily-todo.ait`는 로컬 패키징 산출물이며 저장소에는 커밋하지 않는다. 앱인토스 콘솔에서 `.ait`를 업로드한 뒤 테스트 QR로 토스 앱에서 검증한다. 2026-09-18 패키지를 콘솔에 등록해 사용자가 테스트했으며, 공개 반영은 앱인토스 검토 절차를 따른다.

## 데이터와 범위

Todo 정의와 반복 수행 기록은 버전이 있는 IndexedDB 스키마에 우선 저장한다. 백업 가져오기와 서버 복원은 형식 검증 후 한 트랜잭션으로 로컬 데이터를 교체한다. 앱인토스에서는 별도 로그인 화면 없이 익명 식별키를 내부 계정에 연결하고, 변경 시 Supabase 스냅샷을 백그라운드 동기화한다. 네트워크나 동기화 실패가 로컬 저장을 막지는 않는다. 증분 동기화·충돌 UI·계정 삭제 API, 알림과 광고는 후속 범위다.

제품 요구사항은 [doc/requirements.md](./doc/requirements.md), 현재 상태와 우선순위는 [doc/requirements-analysis.md](./doc/requirements-analysis.md), 설계는 [doc/architecture.md](./doc/architecture.md)·[doc/database-design.md](./doc/database-design.md), 공식 자료는 [doc/reference.md](./doc/reference.md), 변경·검증 이력은 [doc/work-log.md](./doc/work-log.md)에서 관리한다. 작업 규칙은 [AGENTS.md](./AGENTS.md)를 따른다.
