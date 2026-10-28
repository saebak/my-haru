import { FormEvent, KeyboardEvent, RefObject, useEffect, useId, useRef, useState } from 'react';
import {
  activeTags, availablePresets, nextTagColor, TAG_COLOR_LABEL, TAG_COLORS, TAG_NAME_MAX,
  type Tag, type TagBook, type TagColor, type TagInput,
} from '../domain/tags';

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/** 팝오버 바깥을 누르면 닫는다. 이모지 선택기와 같은 방식이다. */
function useDismiss(open: boolean, root: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) closeRef.current(); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, root]);
}

function Chevron() {
  return <svg className="select-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>;
}

export function TagChip({ tag }: { tag: Tag }) {
  return <span className={`tag-chip tag-${tag.color}`}>{tag.name}</span>;
}

function ColorPicker({ name, value, onChange, disabled }: { name: string; value: TagColor; onChange: (color: TagColor) => void; disabled?: boolean }) {
  return <fieldset className="tag-color-picker" disabled={disabled}>
    <legend className="field-label">색상</legend>
    {TAG_COLORS.map((color) => <label key={color} title={TAG_COLOR_LABEL[color]}>
      <input type="radio" name={name} value={color} checked={value === color} onChange={() => onChange(color)} aria-label={TAG_COLOR_LABEL[color]} />
      <span className={`tag-swatch tag-${color}`} aria-hidden="true" />
    </label>)}
  </fieldset>;
}

/**
 * 등록·수정 폼의 태그 필드(TAG-003). 평소에는 선택한 태그만 보이고,
 * 누르면 팝오버에서 내 태그를 고르거나 새 태그·추천 태그를 바로 만들어 선택한다.
 * 팝오버의 편집 모드에서 태그 이름을 바꾸거나 삭제할 수 있다(TAG-001).
 */
export function TagField({ book, value, onChange, onCreate, onRename, onDelete, disabled }: {
  book: TagBook;
  value: string;
  onChange: (tagId: string) => void;
  onCreate: (input: TagInput) => Promise<Tag>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  disabled: boolean;
}) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tags = activeTags(book);
  const presets = availablePresets(book);
  const selected = tags.find((tag) => tag.id === value) ?? null;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [managing, setManaging] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function resetEdit() { setManaging(false); setRenaming(null); setConfirmDelete(null); }
  function close(returnFocus = false) {
    setOpen(false); setError(''); setName(''); resetEdit();
    if (returnFocus) queueMicrotask(() => triggerRef.current?.focus());
  }
  useDismiss(open, rootRef, () => close());
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('[aria-pressed="true"], button, input')?.focus();
  }, [open]);
  useEffect(() => { if (!tags.length) resetEdit(); }, [tags.length]);

  function pick(tagId: string) { onChange(tagId); close(true); }
  async function create(input: TagInput) {
    setError('');
    try { pick((await onCreate(input)).id); }
    catch (reason) { setError(errorMessage(reason, '태그를 만들지 못했어요. 다시 시도해 주세요.')); }
  }
  async function rename(id: string, nextName: string) {
    setError('');
    try { await onRename(id, nextName); setRenaming(null); }
    catch (reason) { setError(errorMessage(reason, '태그 이름을 바꾸지 못했어요. 다시 시도해 주세요.')); }
  }
  async function remove(id: string) {
    setError('');
    try {
      await onDelete(id);
      setConfirmDelete(null);
      if (value === id) onChange('');
    } catch (reason) { setError(errorMessage(reason, '태그를 삭제하지 못했어요. 다시 시도해 주세요.')); }
  }
  function onPanelKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (renaming || confirmDelete) { setRenaming(null); setConfirmDelete(null); return; }
    close(true);
  }

  return <div className="tag-field" ref={rootRef}>
    <span className="field-label" id={`${baseId}-label`}>태그 <em>선택</em></span>
    <button ref={triggerRef} className={`tag-trigger ${selected ? `has-value tag-${selected.color}` : ''}`} type="button" disabled={disabled && !open}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={`${baseId}-panel`} aria-labelledby={`${baseId}-label ${baseId}-value`}
      onClick={() => open ? close() : setOpen(true)}>
      <span id={`${baseId}-value`} className="tag-trigger-value">{selected ? selected.name : '태그 없음'}</span>
      <small>{selected ? '바꾸기' : '눌러서 선택'}</small>
      <Chevron />
    </button>
    {open && <div ref={panelRef} id={`${baseId}-panel`} className="tag-popover" role="dialog" aria-label="태그 선택" onKeyDown={onPanelKeyDown}>
      {tags.length > 0 && <div className="tag-popover-head">
        <span>{managing ? '태그 편집' : '내 태그'}</span>
        <button type="button" className="tag-popover-mode" aria-pressed={managing} onClick={() => { setError(''); if (managing) resetEdit(); else setManaging(true); }}>{managing ? '완료' : '편집'}</button>
      </div>}
      {managing ? <ul className="tag-popover-manage" aria-label="태그 편집">
        {tags.map((tag) => <li key={tag.id} className={`tag-${tag.color}`}>
          {/* 등록·수정 폼 안에 있으므로 중첩 <form>을 쓰지 않는다. 중첩 폼은 브라우저가 바깥 폼을 제출해 페이지가 새로고침됐다. */}
          {renaming?.id === tag.id ? <div className="tag-popover-rename" role="group" aria-label={`${tag.name} 이름 수정`}>
            <label className="sr-only" htmlFor={`${baseId}-rename`}>{tag.name} 새 이름</label>
            <input id={`${baseId}-rename`} type="text" value={renaming.name} maxLength={TAG_NAME_MAX} autoComplete="off" autoFocus disabled={disabled}
              onChange={(event) => setRenaming({ id: tag.id, name: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (renaming.name.trim()) void rename(tag.id, renaming.name); } }} />
            <button type="button" className="is-primary" disabled={disabled || !renaming.name.trim()} onClick={() => void rename(tag.id, renaming.name)}>저장</button>
            <button type="button" onClick={() => setRenaming(null)}>취소</button>
          </div> : confirmDelete === tag.id ? <div className="tag-popover-confirm" role="group" aria-label={`${tag.name} 삭제 확인`}>
            <p><strong>{tag.name}</strong>을(를) 삭제할까요? 할 일은 남고 태그만 사라져요.</p>
            <div>
              <button type="button" onClick={() => setConfirmDelete(null)}>취소</button>
              <button type="button" className="is-danger" disabled={disabled} onClick={() => void remove(tag.id)}>삭제</button>
            </div>
          </div> : <div className="tag-popover-manage-row">
            <span className="tag-pill">{tag.name}</span>
            <button type="button" aria-label={`${tag.name} 이름 수정`} disabled={disabled} onClick={() => { setError(''); setConfirmDelete(null); setRenaming({ id: tag.id, name: tag.name }); }}>수정</button>
            <button type="button" className="is-danger" aria-label={`${tag.name} 삭제`} disabled={disabled} onClick={() => { setError(''); setRenaming(null); setConfirmDelete(tag.id); }}>삭제</button>
          </div>}
        </li>)}
      </ul> : <>
        <div className="tag-popover-options" role="group" aria-label="내 태그">
          <button type="button" className="tag-popover-option" aria-pressed={!value} onClick={() => pick('')}>태그 없음</button>
          {tags.map((tag) => <button key={tag.id} type="button" className={`tag-popover-option tag-${tag.color}`} aria-pressed={value === tag.id} onClick={() => pick(tag.id)}><span className="tag-pill">{tag.name}</span></button>)}
        </div>
        <div className="tag-popover-create">
          <label className="sr-only" htmlFor={`${baseId}-new`}>새 태그 이름</label>
          <input id={`${baseId}-new`} type="text" value={name} maxLength={TAG_NAME_MAX} placeholder="새 태그 이름" autoComplete="off" disabled={disabled}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (name.trim()) void create({ name, color: nextTagColor(book) }); } }} />
          <button type="button" disabled={disabled || !name.trim()} onClick={() => void create({ name, color: nextTagColor(book) })}>추가</button>
        </div>
        {presets.length > 0 && <div className="tag-popover-presets" role="group" aria-label="추천 태그 바로 추가">
          <p>추천 태그</p>
          <div>{presets.map((preset) => <button key={preset.name} type="button" className={`tag-preset tag-${preset.color}`} disabled={disabled} onClick={() => void create(preset)}>+ {preset.name}</button>)}</div>
        </div>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}
  </div>;
}

/** 날짜별 목록의 태그 필터 드롭다운(TAG-005). 키보드로 위아래 이동·선택·닫기를 지원한다. */
export function TagSelect({ tags, value, onChange }: { tags: Tag[]; value: string | null; onChange: (tagId: string | null) => void }) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const options: { id: string | null; tag: Tag | null }[] = [{ id: null, tag: null }, ...tags.map((tag) => ({ id: tag.id, tag }))];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value));
  const selected = options[selectedIndex].tag;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);

  function close(returnFocus = false) {
    setOpen(false);
    if (returnFocus) queueMicrotask(() => triggerRef.current?.focus());
  }
  function show() { setActive(selectedIndex); setOpen(true); }
  useDismiss(open, rootRef, () => close());
  useEffect(() => { if (open) listRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  function choose(index: number) { onChange(options[index].id); close(true); }
  function onTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
  }
  function onListKeyDown(event: KeyboardEvent) {
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (event.key in moves) { event.preventDefault(); setActive(moves[event.key]); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') close();
  }

  return <div className="tag-select" ref={rootRef}>
    <button ref={triggerRef} type="button" className={`tag-select-trigger ${selected ? `has-value tag-${selected.color}` : ''}`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={`${baseId}-list`} aria-label={`태그 필터: ${selected?.name ?? '전체'}`}
      onClick={() => open ? close() : show()} onKeyDown={onTriggerKeyDown}>
      <span>{selected?.name ?? '전체 태그'}</span>
      <Chevron />
    </button>
    {open && <ul ref={listRef} id={`${baseId}-list`} className="tag-select-list" role="listbox" tabIndex={-1} aria-label="태그 필터"
      aria-activedescendant={`${baseId}-option-${active}`} onKeyDown={onListKeyDown}>
      {options.map((option, index) => <li key={option.id ?? 'all'} id={`${baseId}-option-${index}`} data-index={index} role="option" aria-selected={index === selectedIndex}
        className={`tag-select-option ${option.tag ? `tag-${option.tag.color}` : ''} ${index === active ? 'is-active' : ''}`}
        onPointerEnter={() => setActive(index)} onClick={() => choose(index)}>
        {option.tag ? <span className="tag-pill">{option.tag.name}</span> : <span>전체 태그</span>}
        {index === selectedIndex && <svg className="select-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>}
      </li>)}
    </ul>}
  </div>;
}

/** 설정의 태그 관리(TAG-001, TAG-002). 저장은 부모가 하나의 트랜잭션으로 처리하고 실패하면 예외를 던진다. */
export function TagManager({ book, busy, onAddMany, onUpdate, onDelete, onMove }: {
  book: TagBook;
  busy: boolean;
  onAddMany: (inputs: TagInput[]) => Promise<unknown>;
  onUpdate: (id: string, patch: { name: string; color: TagColor }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onMove: (id: string, amount: -1 | 1) => Promise<unknown>;
}) {
  const nameId = useId();
  const tags = activeTags(book);
  const presets = availablePresets(book);
  const [picked, setPicked] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<TagColor | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; color: TagColor } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function attempt(action: () => Promise<unknown>, done: string) {
    setError(''); setStatus('');
    try { await action(); setStatus(done); return true; }
    catch (reason) { setError(errorMessage(reason, '태그를 저장하지 못했어요. 다시 시도해 주세요.')); return false; }
  }
  async function addPicked() {
    const inputs = presets.filter((preset) => picked.includes(preset.name));
    if (await attempt(() => onAddMany(inputs), `추천 태그 ${inputs.length}개를 추가했어요.`)) setPicked([]);
  }
  async function addCustom(event: FormEvent) {
    event.preventDefault();
    if (await attempt(() => onAddMany([{ name: newName, color: newColor ?? nextTagColor(book) }]), '태그를 추가했어요.')) { setNewName(''); setNewColor(null); }
  }

  return <div className="tag-manager">
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="sr-only" role="status" aria-live="polite">{status}</p>

    {presets.length > 0 && <section className="tag-section" aria-labelledby={`${nameId}-presets`}>
      <h3 id={`${nameId}-presets`}>추천 태그</h3>
      <p className="tag-section-copy">쓰고 싶은 태그를 골라 한 번에 추가하세요.</p>
      <div className="tag-preset-grid">
        {presets.map((preset) => {
          const selected = picked.includes(preset.name);
          return <button key={preset.name} type="button" className={`tag-preset tag-${preset.color}`} aria-pressed={selected} disabled={busy}
            onClick={() => setPicked((value) => selected ? value.filter((name) => name !== preset.name) : [...value, preset.name])}>
            {selected ? <svg className="select-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg> : null}{preset.name}
          </button>;
        })}
      </div>
      <button className="primary-button tag-section-action" type="button" disabled={busy || !picked.length} onClick={() => void addPicked()}>{picked.length ? `선택한 ${picked.length}개 추가` : '추가할 태그를 골라 주세요'}</button>
    </section>}

    <section className="tag-section" aria-labelledby={`${nameId}-mine`}>
      <h3 id={`${nameId}-mine`}>내 태그 <span>{tags.length}개</span></h3>
      {!tags.length && <p className="tag-section-copy">아직 태그가 없어요. 추천 태그를 고르거나 직접 만들어 보세요.</p>}
      <ul className="tag-list">
        {tags.map((tag, index) => <li key={tag.id}>
          {editing?.id === tag.id ? <form className="tag-edit-form" onSubmit={(event) => { event.preventDefault(); void attempt(() => onUpdate(tag.id, { name: editing.name, color: editing.color }), '태그를 수정했어요.').then((ok) => ok && setEditing(null)); }}>
            <label className="field-label" htmlFor={`${nameId}-edit`}>태그 이름</label>
            <input id={`${nameId}-edit`} type="text" value={editing.name} maxLength={TAG_NAME_MAX} autoComplete="off" disabled={busy} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            <ColorPicker name={`${nameId}-edit-color`} value={editing.color} onChange={(color) => setEditing({ ...editing, color })} disabled={busy} />
            <div className="tag-edit-actions">
              <button type="button" onClick={() => setEditing(null)}>취소</button>
              <button type="submit" className="is-primary" disabled={busy || !editing.name.trim()}>저장</button>
            </div>
          </form> : confirmDelete === tag.id ? <div className="tag-delete-confirm" role="group" aria-label={`${tag.name} 삭제 확인`}>
            <p><strong>{tag.name}</strong> 태그를 삭제할까요? 항목은 그대로 남고 태그 표시만 사라져요.</p>
            <div className="tag-edit-actions">
              <button type="button" onClick={() => setConfirmDelete(null)}>취소</button>
              <button type="button" className="is-danger" disabled={busy} onClick={() => void attempt(() => onDelete(tag.id), '태그를 삭제했어요.').then((ok) => ok && setConfirmDelete(null))}>삭제</button>
            </div>
          </div> : <div className="tag-row">
            <TagChip tag={tag} />
            <div className="tag-row-actions">
              <button type="button" aria-label={`${tag.name} 위로 이동`} disabled={busy || index === 0} onClick={() => void attempt(() => onMove(tag.id, -1), '순서를 바꿨어요.')}>↑</button>
              <button type="button" aria-label={`${tag.name} 아래로 이동`} disabled={busy || index === tags.length - 1} onClick={() => void attempt(() => onMove(tag.id, 1), '순서를 바꿨어요.')}>↓</button>
              <button type="button" aria-label={`${tag.name} 수정`} disabled={busy} onClick={() => { setConfirmDelete(null); setEditing({ id: tag.id, name: tag.name, color: tag.color }); }}>수정</button>
              <button type="button" className="is-danger" aria-label={`${tag.name} 삭제`} disabled={busy} onClick={() => { setEditing(null); setConfirmDelete(tag.id); }}>삭제</button>
            </div>
          </div>}
        </li>)}
      </ul>
    </section>

    <form className="tag-section" aria-labelledby={`${nameId}-new`} onSubmit={(event) => void addCustom(event)}>
      <h3 id={`${nameId}-new`}>직접 만들기</h3>
      <label className="field-label" htmlFor={`${nameId}-new-name`}>태그 이름</label>
      <input id={`${nameId}-new-name`} type="text" value={newName} maxLength={TAG_NAME_MAX} placeholder={`${TAG_NAME_MAX}자 이내`} autoComplete="off" disabled={busy} onChange={(event) => setNewName(event.target.value)} />
      <ColorPicker name={`${nameId}-new-color`} value={newColor ?? nextTagColor(book)} onChange={setNewColor} disabled={busy} />
      <button className="primary-button tag-section-action" type="submit" disabled={busy || !newName.trim()}>태그 추가</button>
    </form>
  </div>;
}
