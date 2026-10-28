import { TodoError } from './todos/todoDomain';
import type { RepositoryDependencies } from './todos/types';

export const TAG_COLORS = ['green', 'blue', 'navy', 'gray', 'brown', 'yellow', 'pink', 'purple', 'orange', 'teal'] as const;
export type TagColor = typeof TAG_COLORS[number];
export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  green: '초록', blue: '파랑', navy: '남색', gray: '회색', brown: '갈색',
  yellow: '노랑', pink: '분홍', purple: '보라', orange: '주황', teal: '청록',
};

export type Tag = {
  id: string;
  name: string;
  color: TagColor;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type TagBook = { schemaVersion: 1; tags: Tag[] };
export type TagInput = { name: string; color: TagColor };

export const TAG_NAME_MAX = 12;
export const MAX_ACTIVE_TAGS = 20;
export const TAG_PRESETS: readonly TagInput[] = [
  { name: '건강관리', color: 'green' },
  { name: '자기개발', color: 'blue' },
  { name: '이직준비', color: 'navy' },
  { name: '업무', color: 'gray' },
  { name: '집안일', color: 'brown' },
  { name: '재테크', color: 'yellow' },
  { name: '관계', color: 'pink' },
  { name: '마음챙김', color: 'purple' },
  { name: '육아', color: 'orange' },
  { name: '반려동물', color: 'teal' },
];

export const emptyTagBook = (): TagBook => ({ schemaVersion: 1, tags: [] });

const nameKey = (name: string) => name.trim().toLocaleLowerCase('ko-KR');
const instant = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

export function activeTags(book: TagBook): Tag[] {
  return book.tags.filter((tag) => !tag.deletedAt).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function validateTagBook(value: unknown): asserts value is TagBook {
  const book = value as TagBook | null;
  const invalid = !book || book.schemaVersion !== 1 || !Array.isArray(book.tags) || book.tags.length > 1_000
    || book.tags.some((tag) => !tag || typeof tag.id !== 'string' || !tag.id || typeof tag.name !== 'string'
      || !tag.name.trim() || tag.name.trim().length > TAG_NAME_MAX
      || !TAG_COLORS.includes(tag.color) || !Number.isInteger(tag.order)
      || !instant(tag.createdAt) || !instant(tag.updatedAt) || (tag.deletedAt !== null && !instant(tag.deletedAt)))
    || new Set(book.tags.map((tag) => tag.id)).size !== book.tags.length;
  if (invalid) throw new Error('태그 데이터 형식이 올바르지 않아요.');
  const active = book.tags.filter((tag) => !tag.deletedAt);
  if (active.length > MAX_ACTIVE_TAGS || new Set(active.map((tag) => nameKey(tag.name))).size !== active.length) {
    throw new Error('태그 데이터 형식이 올바르지 않아요.');
  }
}

function checkName(book: TagBook, name: string, exceptId?: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > TAG_NAME_MAX) throw new TodoError('VALIDATION', `태그 이름은 1~${TAG_NAME_MAX}자로 입력해 주세요.`, false);
  if (activeTags(book).some((tag) => tag.id !== exceptId && nameKey(tag.name) === nameKey(trimmed))) {
    throw new TodoError('VALIDATION', '같은 이름의 태그가 이미 있어요.', false);
  }
  return trimmed;
}

/** 여러 태그를 한 번에 추가한다. 하나라도 규칙에 어긋나면 아무것도 추가하지 않는다. */
export function addTags(book: TagBook, inputs: readonly TagInput[], deps: Pick<RepositoryDependencies, 'now' | 'uuid'>): { book: TagBook; added: Tag[] } {
  if (activeTags(book).length + inputs.length > MAX_ACTIVE_TAGS) throw new TodoError('VALIDATION', `태그는 ${MAX_ACTIVE_TAGS}개까지 만들 수 있어요.`, false);
  const timestamp = deps.now().toISOString();
  let next = book;
  const added: Tag[] = [];
  let order = Math.max(-1, ...book.tags.map((tag) => tag.order)) + 1;
  for (const input of inputs) {
    if (!TAG_COLORS.includes(input.color)) throw new TodoError('VALIDATION', '태그 색상이 올바르지 않아요.', false);
    const tag: Tag = { id: deps.uuid(), name: checkName(next, input.name), color: input.color, order, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
    order += 1;
    added.push(tag);
    next = { ...next, tags: [...next.tags, tag] };
  }
  return { book: next, added };
}

export function updateTag(book: TagBook, id: string, patch: { name: string; color: TagColor }, deps: Pick<RepositoryDependencies, 'now'>): TagBook {
  const target = activeTags(book).find((tag) => tag.id === id);
  if (!target) throw new TodoError('NOT_FOUND', '태그를 찾을 수 없어요.', false);
  if (!TAG_COLORS.includes(patch.color)) throw new TodoError('VALIDATION', '태그 색상이 올바르지 않아요.', false);
  const name = checkName(book, patch.name, id);
  return { ...book, tags: book.tags.map((tag) => tag.id === id ? { ...tag, name, color: patch.color, updatedAt: deps.now().toISOString() } : tag) };
}

export function deleteTag(book: TagBook, id: string, deps: Pick<RepositoryDependencies, 'now'>): TagBook {
  if (!activeTags(book).some((tag) => tag.id === id)) throw new TodoError('NOT_FOUND', '태그를 찾을 수 없어요.', false);
  const timestamp = deps.now().toISOString();
  return { ...book, tags: book.tags.map((tag) => tag.id === id ? { ...tag, deletedAt: timestamp, updatedAt: timestamp } : tag) };
}

/** 활성 태그 순서에서 한 칸 위(-1) 또는 아래(+1)로 옮기고 order를 0부터 다시 매긴다. */
export function moveTag(book: TagBook, id: string, amount: -1 | 1, deps: Pick<RepositoryDependencies, 'now'>): TagBook {
  const ordered = activeTags(book);
  const from = ordered.findIndex((tag) => tag.id === id);
  const to = from + amount;
  if (from < 0 || to < 0 || to >= ordered.length) return book;
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  const timestamp = deps.now().toISOString();
  const orders = new Map(ordered.map((tag, index) => [tag.id, index]));
  return { ...book, tags: book.tags.map((tag) => orders.has(tag.id) && orders.get(tag.id) !== tag.order ? { ...tag, order: orders.get(tag.id)!, updatedAt: timestamp } : tag) };
}

export function availablePresets(book: TagBook): TagInput[] {
  const used = new Set(activeTags(book).map((tag) => nameKey(tag.name)));
  return TAG_PRESETS.filter((preset) => !used.has(nameKey(preset.name)));
}

/** 새 태그에 아직 쓰지 않은 색을 우선 배정한다. */
export function nextTagColor(book: TagBook): TagColor {
  const used = new Set(activeTags(book).map((tag) => tag.color));
  return TAG_COLORS.find((color) => !used.has(color)) ?? TAG_COLORS[activeTags(book).length % TAG_COLORS.length];
}
