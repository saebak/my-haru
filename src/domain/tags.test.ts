import { describe, expect, it } from 'vitest';

import {
  activeTags, addTags, availablePresets, deleteTag, emptyTagBook, MAX_ACTIVE_TAGS, moveTag, nextTagColor,
  TAG_PRESETS, updateTag, validateTagBook, type TagBook,
} from './tags';

const deps = {
  now: () => new Date('2026-10-27T01:00:00.000Z'),
  uuid: (() => { let value = 0; return () => `tag-${++value}`; })(),
};

function withPresets(count: number): TagBook {
  return addTags(emptyTagBook(), TAG_PRESETS.slice(0, count), deps).book;
}

describe('tags', () => {
  it('offers ten presets including parenting and pets, and adds several at once in order', () => {
    expect(TAG_PRESETS.map((preset) => preset.name)).toEqual(['건강관리', '자기개발', '이직준비', '업무', '집안일', '재테크', '관계', '마음챙김', '육아', '반려동물']);
    const book = withPresets(3);
    expect(activeTags(book).map((tag) => [tag.name, tag.order])).toEqual([['건강관리', 0], ['자기개발', 1], ['이직준비', 2]]);
    expect(availablePresets(book).map((preset) => preset.name)).not.toContain('건강관리');
    expect(() => validateTagBook(book)).not.toThrow();
  });

  it('trims names and rejects empty, too long, or duplicate active names without partial adds', () => {
    const book = withPresets(1);
    expect(addTags(book, [{ name: '  독서  ', color: 'blue' }], deps).added[0].name).toBe('독서');
    expect(() => addTags(book, [{ name: '   ', color: 'blue' }], deps)).toThrow('1~12자');
    expect(() => addTags(book, [{ name: '열세글자가넘는아주긴태그이름', color: 'blue' }], deps)).toThrow('1~12자');
    expect(() => addTags(book, [{ name: '새 태그', color: 'blue' }, { name: ' 건강관리 ', color: 'green' }], deps)).toThrow('같은 이름');
    expect(activeTags(book)).toHaveLength(1);
  });

  it(`limits active tags to ${MAX_ACTIVE_TAGS}`, () => {
    const many = Array.from({ length: MAX_ACTIVE_TAGS }, (_, index) => ({ name: `태그${index}`, color: 'gray' as const }));
    const book = addTags(emptyTagBook(), many, deps).book;
    expect(() => addTags(book, [{ name: '하나 더', color: 'gray' }], deps)).toThrow(`${MAX_ACTIVE_TAGS}개`);
  });

  it('renames, recolors, soft deletes, and lets a deleted name be reused', () => {
    let book = withPresets(2);
    const [health] = activeTags(book);
    expect(() => updateTag(book, health.id, { name: '자기개발', color: 'green' }, deps)).toThrow('같은 이름');
    book = updateTag(book, health.id, { name: '운동', color: 'teal' }, deps);
    expect(activeTags(book)[0]).toMatchObject({ name: '운동', color: 'teal' });
    book = deleteTag(book, health.id, deps);
    expect(activeTags(book).map((tag) => tag.name)).toEqual(['자기개발']);
    expect(book.tags.find((tag) => tag.id === health.id)?.deletedAt).toBe('2026-10-27T01:00:00.000Z');
    expect(() => addTags(book, [{ name: '운동', color: 'green' }], deps)).not.toThrow();
  });

  it('moves a tag within active order and ignores moves past either end', () => {
    const book = withPresets(3);
    const [first, second, third] = activeTags(book);
    const moved = moveTag(book, third.id, -1, deps);
    expect(activeTags(moved).map((tag) => tag.id)).toEqual([first.id, third.id, second.id]);
    expect(moveTag(book, first.id, -1, deps)).toBe(book);
  });

  it('picks an unused color first', () => {
    expect(nextTagColor(emptyTagBook())).toBe('green');
    expect(nextTagColor(withPresets(2))).toBe('navy');
  });

  it('rejects malformed tag documents', () => {
    expect(() => validateTagBook({ schemaVersion: 2, tags: [] })).toThrow();
    const book = withPresets(1);
    expect(() => validateTagBook({ ...book, tags: [{ ...book.tags[0], color: 'red' }] })).toThrow();
    expect(() => validateTagBook({ ...book, tags: [book.tags[0], { ...book.tags[0], id: 'other' }] })).toThrow();
  });
});
