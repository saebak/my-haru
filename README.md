# My Daily Todo

앱인토스에서 실행할 개인용 할 일·반복 습관 관리 미니앱 프로젝트다. React·TypeScript·Vite와 최신 앱인토스 WebView SDK를 기반으로 하며, Phase 1 데이터는 IndexedDB에만 저장한다. Supabase는 Phase 2 계정·동기화를 위해 연결만 준비돼 있다.

## 기술 스택

- React 18 + TypeScript
- Vite 6
- 앱인토스 WebView SDK 3.4.0
- TDS Mobile 패키지(필요한 컴포넌트 도입 시 Provider 적용)
- Supabase JavaScript Client 2
- Vitest + ESLint

기존 정적 UI 목업은 `prototype/`에 보존되어 있다. 현재 React 앱은 Phase 1 로컬 모드 시작 화면이며, Todo 기능과 IndexedDB 데이터 스키마는 다음 구현 대상이다. Supabase·닉네임 코드는 Phase 2 검토용으로 보존되어 있지만 현재 실행 경로에서는 호출하지 않는다.

## 파일 구성

```text
.
├── AGENTS.md                       작업 규칙과 구현 원칙
├── README.md                       프로젝트 안내
├── apps-in-toss.config.ts          앱인토스 WebView 설정
├── vite.config.ts                  Vite 설정
├── src/                            React 애플리케이션
├── supabase/                       데이터베이스 마이그레이션과 적용 안내
├── prototype/                      기존 정적 UI 목업
└── doc/
    ├── requirements.md             제품 요구사항 기준선
    ├── requirements-analysis.md    요구사항 분석과 구현 우선순위
    ├── reference.md                공식 참고 자료와 확인 시점
    └── work-log.md                 작업 이력과 다음 작업
```

## 설치와 실행

앱인토스 SDK 3.4.0의 요구사항에 맞춰 Node.js 24 사용을 권장한다.

```powershell
npm install --legacy-peer-deps
npm run dev
```

Phase 1 실행에는 `.env.local`이나 Supabase 연결이 필요하지 않다. 동결된 Phase 2 프로토타입을 별도로 점검할 때만 `.env.example`을 복사하고 Supabase Dashboard의 Connect 화면에서 확인한 공개 값을 입력한다.

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

publishable key는 브라우저용 공개 키다. `service_role` 또는 secret key는 프런트엔드 환경변수에 넣으면 안 된다. Phase 2 접근 제어 방식은 아직 확정되지 않았다.

## 검증과 빌드

```powershell
npm run check       # lint, test, 일반 웹 프로덕션 빌드
npm run build       # 앱인토스 .ait 패키징
npm run preview     # 일반 웹 빌드 미리보기
```

앱인토스 콘솔의 실제 `appName`이 확정되면 `apps-in-toss.config.ts`의 임시 값을 같은 값으로 변경해야 한다. 표시 이름과 아이콘은 최신 SDK 설정 파일이 아니라 앱인토스 콘솔에서 관리한다.

## 개발 방향

1. 일반·반복 정의를 함께 가진 Todo와 날짜별 TodoRecord 도메인 모델을 구현한다.
2. 스키마 버전과 migration fixture가 있는 IndexedDB 저장소를 구현한다.
3. 현재 목업을 React 컴포넌트로 옮기고 날짜 하드코딩을 제거한다.
4. CRUD, 필터·정렬, 반복 계산, 백업·복원 테스트를 추가한다.
5. Phase 1 개인 사용을 검증한다.
6. Phase 2에서 인증 방식을 확정한 뒤 Supabase 백업·재설치 복원·동기화를 추가한다.

세부 범위와 판단 근거는 [요구사항 분석](./doc/requirements-analysis.md), 외부 문서는 [참고 자료](./doc/reference.md), 진행 내역은 [작업 로그](./doc/work-log.md)에서 관리한다.

프로젝트 상세 설계는 다음 문서에서 관리한다.

- [아키텍처 설계](./doc/architecture.md)
- [데이터베이스 설계](./doc/database-design.md)
- [서버 API·동기화 설계](./doc/api-design.md)
- [설계 결정 기록](./doc/decision-log.md)

## 기준 문서

- 제품 요구사항: [doc/requirements.md](./doc/requirements.md)
- 작업 규칙: [AGENTS.md](./AGENTS.md)

요구사항과 구현이 충돌하면 `doc/requirements.md`를 우선한다. 정책이나 SDK처럼 변경될 수 있는 내용은 구현 착수 시점과 출시 직전에 공식 문서를 다시 확인한다.
