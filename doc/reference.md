# 참고 자료

## 1. 문서 목적

My Daily Todo의 설계·개발·검수에 사용하는 외부 자료를 한곳에서 관리한다. 외부 정책과 SDK 사양은 바뀔 수 있으므로 이 문서는 고정된 사실의 사본이 아니라 공식 문서로 이동하기 위한 색인으로 사용한다.

## 2. 앱인토스 공식 문서

| 주제 | 공식 문서 | 사용하는 단계 | 확인할 내용 |
| --- | --- | --- | --- |
| 플랫폼 개요 | [앱인토스 시작하기](https://developers-apps-in-toss.toss.im/bedrock/intro.html) | 프로젝트 시작 | 지원 환경, 기본 구조, 용어 |
| WebView 연동 | [기존 웹 프로젝트에 SDK 연동하기](https://developers-apps-in-toss.toss.im/tutorials/webview.html) | 프로젝트 기반 구성 | 최신 SDK 설치·초기화·빌드 방식 |
| 앱 등록 | [콘솔에서 앱 등록하기](https://developers-apps-in-toss.toss.im/prepare/console-workspace.html) | 공개 준비 | 앱 정보, 식별자, 콘솔 설정 |
| 오픈 절차 | [서비스 오픈 프로세스](https://developers-apps-in-toss.toss.im/intro/onboarding-process.html) | 출시 준비 | 샌드박스, 검수, 출시 순서 |
| 비게임 검수 | [비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame.html) | UI 완료·제출 전 | 내비게이션, Safe Area, 정책 체크리스트 |
| 광고 | [인앱 광고](https://developers-apps-in-toss.toss.im/ads/intro.html) | 수익화 단계 | 테스트·운영 ID, 지원 형식, 정책 |
| 알림 | [스마트 발송](https://developers-apps-in-toss.toss.im/smart-message/intro.html) | 알림 단계 | 동의, 발송 조건, 딥링크 |
| 분석 | [로그 이벤트 가이드](https://developers-apps-in-toss.toss.im/analytics/logging.html) | 분석 설계 | 이벤트 API, 제한 사항, 검증 |

## 3. 프로젝트 내부 기준

| 문서 | 역할 |
| --- | --- |
| [requirements.md](./requirements.md) | 기능·비기능·데이터·출시 요구사항의 기준선 |
| [requirements-analysis.md](./requirements-analysis.md) | 현재 목업과 요구사항 사이의 차이 및 우선순위 |
| [architecture.md](./architecture.md) | Local-first 구성, 계층과 보안 경계 |
| [database-design.md](./database-design.md) | IndexedDB·Postgres 데이터 모델과 보존 정책 |
| [api-design.md](./api-design.md) | 닉네임 세션·동기화·계정 API 계약 |
| [decision-log.md](./decision-log.md) | 확정·보류·사용자 결정 사항 |
| [work-log.md](./work-log.md) | 실제 수행 작업, 검증 결과, 남은 작업 기록 |
| [../AGENTS.md](../AGENTS.md) | 저장소에서 작업하는 에이전트의 실행 규칙 |

## 4. 구현 전 확인 체크리스트

### React·TypeScript 전환 전

- 앱인토스 WebView SDK의 최신 설치 방식과 요구 Node.js 버전
- 권장 프로젝트 생성 방식과 번들 명령
- 앱 식별자 및 로컬 개발 환경 설정 방법
- 브라우저 환경에서 SDK 기능을 대체할 fallback 필요 여부

### 알림 구현 전

- 사용자 동의 획득과 철회 요건
- 발송 가능한 메시지 유형과 빈도 제한
- 딥링크 형식과 실제 기기 테스트 절차
- 실패·재시도·중복 방지에 플랫폼이 제공하는 범위

### 광고 구현 전

- 검수용 테스트 광고 ID와 운영 광고 ID 분리 방법
- 지원 광고 형식과 최소 SDK 버전
- 광고 이벤트 수집 범위
- No Fill 및 로드 실패 시 권장 처리
- 앱인토스와 Google AdMob의 최신 금지 행위

### 출시 제출 전

- 최신 번들 크기 제한
- Android·iOS 지원 버전
- 앱 스킴, 내비게이션, 뒤로가기, Safe Area 기준
- 이용약관·개인정보처리방침·고객센터·탈퇴 요구사항
- 사업자·정산 정보와 광고 승인 상태

## 5. 기록 규칙

- 외부 문서에서 확인한 구현 결정은 확인 날짜와 링크를 `work-log.md`에 남긴다.
- 버전 번호, 용량 제한, 정책 문구를 기억에 의존해 코드나 문서에 고정하지 않는다.
- 블로그나 예제보다 공식 앱인토스 문서를 우선한다.
- 공식 문서와 실제 SDK 타입이 다르면 설치된 SDK 타입과 샌드박스 결과를 함께 기록한다.
- 인증 비밀키, 인증서, 운영 광고 ID는 어떤 문서에도 복사하지 않는다.

## 6. 확인 이력

| 확인일 | 범위 | 결과 |
| --- | --- | --- |
| 2026-09-09 | 요구사항에 포함된 공식 링크를 참고 자료로 정리 | 구현 착수 시 최신 내용 재확인 필요 |
| 2026-09-09 | 앱인토스 기존 웹 프로젝트 연동 및 설정 가이드 확인 | 당시 SDK 설정 기준 확인 |
| 2026-09-09 | TDS Mobile 시작 가이드 확인 | React 18과 Provider 사용 조건 확인 |
| 2026-09-09 | Supabase React Quickstart 확인 | Vite 공개 환경변수와 `createClient` 적용 |
| 2026-09-10 | 설치된 앱인토스 SDK 3.4.0 타입과 CLI 도움말 확인 | `apps-in-toss.config.ts`, `webBundleDir`, 선행 웹 빌드 방식으로 전환 |
| 2026-09-10 | Supabase RLS·Data API 보안·Database Functions 공식 문서 확인 | 업무 테이블 직접 권한 회수, 공개 `SECURITY DEFINER` RPC 대신 서버 경계 사용 제안 |

## 7. 추가 공식 자료

- [TDS Mobile 시작하기](https://tossmini-docs.toss.im/tds-mobile/start/)
- [Supabase React Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Supabase JavaScript Client 설치](https://supabase.com/docs/reference/javascript/installing)
- [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Data API 보안](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
