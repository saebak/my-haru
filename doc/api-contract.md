# 클라이언트 데이터·동기화 계약

## 1. 범위

이 문서는 React 화면, 도메인 함수, IndexedDB 저장소와 Supabase 백업 경계 사이의 구현 계약이다. Todo와 TodoRecord는 IndexedDB에 먼저 저장되고, 지원 환경에서는 검증된 전체 스냅샷이 `account-sync` Edge Function으로 동기화된다. 관련 요구사항은 `TODO-001`~`TODO-008`, `LIST-001`~`LIST-005`, `HABIT-001`~`HABIT-005`, `HABIT-007`~`HABIT-008`, `DATA-001`~`DATA-007`, `SYNC-001`~`SYNC-013`, `UX-005`~`UX-007`이다.

## 2. 값과 엔터티

```ts
type CalendarDate = string; // Asia/Seoul의 YYYY-MM-DD
type UtcInstant = string; // UTC ISO 8601
type Priority = 'low' | 'normal' | 'high';
type TodoStatus = 'pending' | 'completed';
type TodoRecordStatus = 'pending' | 'completed' | 'skipped';
type RepeatFrequency = 'daily' | 'weekly' | 'interval_days';

type TodoData = {
  id: string;
  type: 'one_time' | 'recurring';
  category: 'todo' | 'habit';
  seriesId: string | null;
  revision: number | null;
  title: string;
  memo: string;
  emoji: string;
  status: TodoStatus | null;
  priority: Priority;
  dueDate: CalendarDate | null;
  dueTime: string | null; // HH:mm
  completedAt: UtcInstant | null;
  repeatFrequency: RepeatFrequency | null;
  repeatInterval: number | null;
  repeatWeekdays: number[]; // ISO 월=1 ... 일=7
  repeatStartDate: CalendarDate | null;
  repeatEndDate: CalendarDate | null;
  timezone: 'Asia/Seoul' | null;
  createdAt: UtcInstant;
  updatedAt: UtcInstant;
  deletedAt: UtcInstant | null;
};

type TodoOverrides = {
  title?: string;
  memo?: string;
  priority?: Priority;
  dueTime?: string | null;
};

type TodoRecordData = {
  id: string;
  seriesId: string;
  targetDate: CalendarDate;
  status: TodoRecordStatus;
  completedAt: UtcInstant | null;
  overrides: TodoOverrides | null;
  hidden: boolean;
  createdAt: UtcInstant;
  updatedAt: UtcInstant;
  deletedAt: UtcInstant | null;
};
```

제목은 trim 후 1~120자, 메모는 최대 2,000자다. `type`은 단일·반복 저장 방식이고 `category`는 할 일·습관 표시 의미다. 일반 Todo의 상태와 `completedAt`, 반복 기록의 상태와 `completedAt`은 항상 함께 바뀐다. 반복 Todo는 날짜별 상태를 TodoRecord에만 기록한다.

## 3. 오류 모델

```ts
type TodoErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STORAGE_OPEN_FAILED'
  | 'STORAGE_BLOCKED'
  | 'STORAGE_WRITE_FAILED'
  | 'UNSUPPORTED_DATABASE_VERSION';

class TodoError extends Error {
  code: TodoErrorCode;
  retryable: boolean;
  field?: 'title' | 'memo' | 'dueDate' | 'dueTime' | 'repeatWeekdays';
}
```

UI는 입력 오류를 필드 가까이에 표시하고, 저장 오류 때 입력과 현재 화면을 유지하며 재시도를 안내한다. 오류 메시지나 로그에 제목과 메모를 포함하지 않는다.

## 4. 도메인 함수

```ts
validateTodo(todo: TodoData): void;
occursOn(todo: TodoData, targetDate: CalendarDate): boolean;
materializeItems(todos: TodoData[], records: TodoRecordData[], date: CalendarDate): DisplayTodo[];
filterAndSortItems(items: DisplayTodo[], query: ListQuery): DisplayTodo[];
```

반복 계산은 UI와 저장소에서 분리하며 `Asia/Seoul` 달력 문자열만 사용한다. 정렬은 마감일시, 우선순위, 생성시각을 지원하고 마지막 비교 키는 ID다.

## 5. 저장소 함수

```ts
openTodoDatabase(): Promise<IDBDatabase>;
loadSnapshot(): Promise<{ todos: TodoData[]; records: TodoRecordData[] }>;
createTodo(input: CreateTodoInput, deps?: RepositoryDependencies): Promise<TodoData>;
updateOneTime(id: string, patch: TodoContentPatch, deps?: RepositoryDependencies): Promise<TodoData>;
convertOneTimeToRecurring(id: string, input: Extract<CreateTodoInput, { type: 'recurring' }>, deps?: RepositoryDependencies): Promise<TodoData>;
setOneTimeStatus(id: string, status: TodoStatus, deps?: RepositoryDependencies): Promise<TodoData>;
updateRecurring(seriesId: string, targetDate: CalendarDate, scope: 'date' | 'future', patch: RecurringPatch, deps?: RepositoryDependencies): Promise<void>;
setRecurringStatus(seriesId: string, targetDate: CalendarDate, status: TodoRecordStatus, deps?: RepositoryDependencies): Promise<TodoRecordData>;
deleteOccurrence(item: DisplayTodo, scope: 'date' | 'future', deps?: RepositoryDependencies): Promise<DeleteReceipt>;
undoDelete(receipt: DeleteReceipt): Promise<void>;
softDeleteCompleted(deps?: RepositoryDependencies): Promise<DeleteReceipt>;
replaceSnapshot(snapshot: { todos: TodoData[]; records: TodoRecordData[] }): Promise<void>;
clearAllData(): Promise<void>;
```

`RepositoryDependencies`로 현재 시각과 UUID 생성을 주입할 수 있어야 한다. UI는 각 제출이 완료될 때까지 같은 제출 버튼을 비활성화한다.

## 6. 원자성과 삭제 실행 취소

- 일반 Todo 생성·수정·상태 변경·소프트 삭제는 각각 단일 `todos` readwrite transaction이다.
- 단일 할 일의 반복 켜기는 같은 ID를 유지한 채 `category=todo`, 새 `seriesId`, `revision=1`인 반복 Todo로 단일 transaction에서 전환한다.
- 반복 날짜 기록 upsert는 단일 `todoRecords` readwrite transaction이며 `[seriesId,targetDate]`를 재사용한다.
- 반복의 이후 수정·삭제는 대상 revision 종료, 이후 revision 정리, 새 revision 생성 또는 미래 record 정리를 `todos + todoRecords` 단일 transaction에서 수행한다.
- 삭제는 변경 전 스냅샷을 담은 `DeleteReceipt`를 반환한다. 5초 안의 실행 취소는 receipt의 이전 Todo/TodoRecord를 같은 transaction에서 복원한다.
- transaction abort 또는 commit 실패 시 메모리 UI를 성공 상태로 확정하지 않는다.

## 7. 백업 계약

```ts
type TodoBackup = {
  format: 'my-daily-todo-backup';
  schemaVersion: 2;
  exportedAt: UtcInstant;
  timezone: 'Asia/Seoul';
  data: { todos: TodoData[]; records: TodoRecordData[] };
};

createBackup(deps?: Pick<RepositoryDependencies, 'now'>): Promise<TodoBackup>;
parseAndValidateBackup(text: string): TodoBackup;
restoreBackup(text: string): Promise<void>;
```

가져오기는 5MB, Todo 10,000개, TodoRecord 100,000개를 상한으로 한다. JSON과 루트 메타데이터, 모든 엔터티 불변식, 중복 ID, 중복 `[seriesId,revision]`, 중복 `[seriesId,targetDate]`, 활성 반복 범위 중첩, 활성 고아 record를 쓰기 전에 전부 검증한다. 검증에 실패하면 기존 데이터에 transaction을 열지 않는다. 검증이 끝난 데이터는 `todos + todoRecords + meta` 단일 readwrite transaction에서 clear 후 put하며, 중간 오류는 전체 abort한다.

## 8. IndexedDB와 마이그레이션

DB 이름은 `my-daily-todo`, 현재 물리 버전은 `2`다. v1은 초기 React 목업이 `todos` store만 생성한 레거시 버전이므로, v2 upgrade transaction에서 `todoRecords`, `meta`와 정식 인덱스를 추가하고 기존 목업 필드를 정식 `TodoData`로 변환한다. 변환할 수 없는 row가 있으면 upgrade를 abort해 기존 DB를 보존한다.

정식 store는 다음과 같다.

- `todos`: keyPath `id`; `type`, `seriesId`, `[seriesId,revision]`, `dueDate`, `[dueDate,dueTime]`, `status`, `priority`, `createdAt`, `deletedAt` 인덱스
- `todoRecords`: keyPath `id`; `[seriesId,targetDate]` unique, `seriesId`, `targetDate`, `status`, `deletedAt` 인덱스
- `meta`: keyPath `key`; `schemaVersion=2`

`versionchange`를 받은 연결은 닫는다. 열기가 다른 탭에 막히면 `STORAGE_BLOCKED`, 더 높은 버전이면 `UNSUPPORTED_DATABASE_VERSION`으로 UI가 안내한다.

## 9. 익명 식별과 클라우드 동기화

클라이언트는 앱인토스 `User.getAnonymousKey()` 원문을 영속화하지 않고 `provider='toss_anonymous'`와 함께 교환 요청에만 사용한다. 서버는 원문을 HMAC 처리해 내부 계정과 연결하고, 30일 만료 세션 토큰을 한 번 반환한다. 클라이언트는 세션을 IndexedDB `meta.cloudSession`에 보관하며 서버는 토큰의 SHA-256 해시만 저장한다.

```ts
type CloudSnapshot = {
  schemaVersion: 2;
  todos: TodoData[];
  records: TodoRecordData[];
};

exchangeIdentity(anonymousKey: string): Promise<CloudSession>;
syncSnapshot(session: CloudSession, snapshot: CloudSnapshot): Promise<CloudSnapshot>;
```

동기화 응답은 로컬 백업과 같은 불변식·개수 제한으로 전부 검증한 뒤 단일 IndexedDB transaction으로 교체한다. 엔터티별 `updatedAt`이 더 최신이거나 같은 입력을 반영하고, 누락은 삭제로 보지 않으며 `deletedAt` tombstone만 삭제를 전달한다. 네트워크·세션·서버 오류는 로컬 변경 성공을 되돌리지 않는다.

서버 요청·응답과 오류 코드는 `api-design.md`를 따른다. 원문 식별키, 세션 토큰, 제목과 메모는 로그에 남기지 않는다.
