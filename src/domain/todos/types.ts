export type CalendarDate = string;
export type Priority = 'low' | 'normal' | 'high';
export type TodoStatus = 'pending' | 'completed';
export type TodoRecordStatus = TodoStatus | 'skipped';
export type RepeatFrequency = 'daily' | 'weekly' | 'interval_days';

export type TodoOverrides = {
  title?: string;
  memo?: string;
  priority?: Priority;
  dueTime?: string | null;
};

export type TodoData = {
  id: string;
  type: 'one_time' | 'recurring';
  seriesId: string | null;
  revision: number | null;
  title: string;
  memo: string;
  emoji: string;
  status: TodoStatus | null;
  priority: Priority;
  dueDate: CalendarDate | null;
  dueTime: string | null;
  completedAt: string | null;
  repeatFrequency: RepeatFrequency | null;
  repeatInterval: number | null;
  repeatWeekdays: number[];
  repeatStartDate: CalendarDate | null;
  repeatEndDate: CalendarDate | null;
  timezone: 'Asia/Seoul' | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type TodoRecordData = {
  id: string;
  seriesId: string;
  targetDate: CalendarDate;
  status: TodoRecordStatus;
  completedAt: string | null;
  overrides: TodoOverrides | null;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DisplayTodo = {
  key: string;
  todoId: string;
  type: TodoData['type'];
  seriesId: string | null;
  targetDate: CalendarDate;
  title: string;
  memo: string;
  emoji: string;
  priority: Priority;
  dueTime: string | null;
  status: TodoRecordStatus;
  completedAt: string | null;
  createdAt: string;
  revision: number | null;
};

export type TodoContentPatch = {
  title: string;
  memo: string;
  emoji: string;
  priority: Priority;
  dueDate: CalendarDate;
  dueTime: string | null;
};

export type RecurringPatch = Omit<TodoContentPatch, 'dueDate'> & {
  repeatFrequency: RepeatFrequency;
  repeatInterval: number;
  repeatWeekdays: number[];
  repeatEndDate: CalendarDate | null;
};

export type CreateTodoInput =
  | ({ type: 'one_time' } & TodoContentPatch)
  | ({ type: 'recurring'; repeatStartDate: CalendarDate } & RecurringPatch);

export type RepositoryDependencies = {
  now: () => Date;
  uuid: () => string;
};

export type DeleteReceipt = {
  todos: TodoData[];
  records: TodoRecordData[];
  createdRecordIds: string[];
};

export type ListQuery = {
  priority: Priority | 'all';
  status: TodoRecordStatus | 'all';
  sort: 'due' | 'priority' | 'created';
};
