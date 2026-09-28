import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../domain/notes';
import { loadNotebook, saveNote } from '../infrastructure/indexed-db/todoRepository';
import { ActionIcon } from './ActionIcon';

type View = 'list' | 'create' | 'detail' | 'edit';
type Confirmation = 'discard-close' | 'discard-back' | 'delete' | null;

function noteTitle(text: string) {
  return text.split(/\r?\n/).find(line => line.trim())?.trim() ?? '제목 없는 메모';
}

function notePreview(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.slice(1).join(' ') || lines[0] || '';
}

function formatNoteDate(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
}

export function Notebook({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Note | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation>(null);
  const lock = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const heading = view === 'list' ? '메모장' : view === 'create' ? '새 메모' : view === 'edit' ? '메모 수정' : '메모 상세';
  const dirty = (view === 'create' || view === 'edit') && text !== (selected?.text ?? '');
  const sortedNotes = useMemo(() => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [notes]);

  async function refresh() {
    const book = await loadNotebook();
    setNotes(book.notes.filter(note => !note.deletedAt));
  }

  useEffect(() => { void refresh().then(() => setReady(true)).catch(() => setError('메모를 불러오지 못했어요. 닫았다가 다시 열어 주세요.')); }, []);
  useEffect(() => {
    const shell = document.querySelector('.app-shell');
    shell?.setAttribute('inert', '');
    return () => shell?.removeAttribute('inert');
  }, []);
  useEffect(() => { if (view === 'create' || view === 'edit') input.current?.focus(); }, [view]);

  function showList() { setView('list'); setSelected(null); setText(''); setConfirm(null); }
  function back() {
    if (busy) return;
    if (view === 'list') { onClose(); return; }
    if (dirty) { setConfirm('discard-back'); return; }
    if (view === 'edit' && selected) { setText(selected.text); setView('detail'); return; }
    showList();
  }
  function close() {
    if (busy) return;
    if (dirty) setConfirm('discard-close');
    else onClose();
  }
  function openCreate() { setSelected(null); setText(''); setError(''); setView('create'); }
  function openDetail(note: Note) { setSelected(note); setText(note.text); setError(''); setView('detail'); }

  async function persist(deleted = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await saveNote(selected?.id ?? null, text, deleted);
      await refresh();
      showList();
    } catch {
      setError('메모를 저장하지 못했어요. 내용을 유지했으니 다시 시도해 주세요.');
    } finally {
      lock.current = false; setBusy(false);
    }
  }

  function confirmAction() {
    if (confirm === 'delete') { void persist(true); return; }
    if (confirm === 'discard-close') { onClose(); return; }
    if (view === 'edit' && selected) { setText(selected.text); setView('detail'); setConfirm(null); return; }
    showList();
  }

  return <section className="notebook-view calendar-view" aria-labelledby="notebook-heading" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <header className="calendar-header notebook-header">
      <button autoFocus={view === 'list'} className="icon-button notebook-back" aria-label={view === 'list' ? '일정으로 돌아가기' : '메모 목록으로 돌아가기'} onClick={back}>‹</button>
      <h1 id="notebook-heading">{heading}</h1>
      {view === 'list' && <button className="icon-button notebook-add" type="button" aria-label="새 메모 작성" title="새 메모 작성" onClick={openCreate}><ActionIcon name="add" /></button>}
      {view === 'detail' && <button className="icon-button notebook-edit" type="button" aria-label="메모 수정" title="메모 수정" onClick={() => setView('edit')}><ActionIcon name="edit" /></button>}
      {(view === 'create' || view === 'edit') && <button className="icon-button note-save" type="button" aria-label={busy ? '저장 중…' : '메모 저장'} title="메모 저장" disabled={!ready || busy || !text.trim()} onClick={() => void persist()}><ActionIcon name="save" /></button>}
    </header>

    {error && <p className="notebook-status" role="alert">{error}</p>}
    {!ready && !error && <p className="notebook-status" role="status">메모를 불러오는 중이에요.</p>}

    {view === 'list' && ready && <main className="notebook-content">
      <div className="notebook-list-heading"><div><p className="section-kicker">MY NOTES</p><h2>저장한 메모</h2></div><span>{sortedNotes.length}개</span></div>
      {!sortedNotes.length && <div className="empty-state notebook-empty"><strong>아직 메모가 없어요</strong><p>오른쪽 위 + 버튼으로 첫 메모를 작성해 보세요.</p></div>}
      <div className="note-list">{sortedNotes.map(note => <button className="note-preview" key={note.id} onClick={() => openDetail(note)}>
        <span className="note-preview-icon"><ActionIcon name="note" /></span>
        <span className="note-preview-body"><strong>{noteTitle(note.text)}</strong><span>{notePreview(note.text)}</span><small>{formatNoteDate(note.updatedAt)}</small></span>
        <span className="note-preview-arrow"><ActionIcon name="chevron" /></span>
      </button>)}</div>
    </main>}

    {(view === 'create' || view === 'edit') && <form className="note-editor-card" onSubmit={event => { event.preventDefault(); void persist(); }}>
      <label htmlFor="notebook-text">{view === 'create' ? '새 메모' : '메모 내용'}</label>
      <textarea ref={input} id="notebook-text" value={text} maxLength={20000} rows={14} disabled={!ready || busy} onChange={event => setText(event.target.value)} placeholder="기억하고 싶은 내용을 적어보세요" />
      <div className="note-editor-footer"><span>{text.length.toLocaleString()} / 20,000</span>{view === 'edit' && <button className="note-delete-button" type="button" disabled={busy} onClick={() => setConfirm('delete')}><ActionIcon name="delete" /><span>삭제</span></button>}</div>
      <button className="primary-button" type="submit" disabled={!ready || busy || !text.trim()}>{busy ? '저장 중…' : '저장하기'}</button>
    </form>}

    {view === 'detail' && selected && <main className="note-detail-card">
      <div className="note-detail-meta"><span className="note-detail-icon"><ActionIcon name="note" /></span><div><p className="section-kicker">MEMO</p><time dateTime={selected.updatedAt}>{formatNoteDate(selected.updatedAt)}</time></div></div>
      <h2>{noteTitle(selected.text)}</h2>
      <p>{selected.text}</p>
      <button className="note-delete-button detail-delete" type="button" disabled={busy} onClick={() => setConfirm('delete')}><ActionIcon name="delete" /><span>메모 삭제</span></button>
    </main>}

    {confirm && <div className="note-confirm" role="alertdialog" aria-modal="true" aria-label="메모 변경 확인">
      <p>{confirm === 'delete' ? '이 메모를 삭제할까요?' : '저장하지 않은 내용을 버릴까요?'}</p>
      <div><button disabled={busy} onClick={confirmAction}>{confirm === 'delete' ? '삭제' : '버리기'}</button><button autoFocus disabled={busy} onClick={() => setConfirm(null)}>계속 작성</button></div>
    </div>}
  </section>;
}
