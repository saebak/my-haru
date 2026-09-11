import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type Todo = { id: string; title: string; memo: string; emoji: string; time: string; date: string; priority: 'high' | 'normal' | 'low'; completedAt: string | null; createdAt: string; kind?: 'todo' | 'routine'; streak?: number };
const DB = 'my-daily-todo';
const STORE = 'todos';

function key(date: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function database() { return new Promise<IDBDatabase>((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function readAll() { const db = await database(); return new Promise<Todo[]>((ok, no) => { const r = db.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => ok(r.result as Todo[]); r.onerror = () => no(r.error); }); }
async function put(todo: Todo) { const db = await database(); return new Promise<void>((ok, no) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(todo); tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); }); }
function samples(today: string): Todo[] {
  const rows = [['주간 업무 계획 정리하기','이번 주 우선순위 3개 정리','🗂️','09:30','high',true],['디자인 시안 피드백 보내기','확인한 내용만 간단히 전달','💬','11:00','normal',true],['점심 후 20분 산책','가까운 공원 한 바퀴','🚶','13:10','low',false],['앱인토스 문서 읽기','알림 API 부분 확인','📖','16:00','high',false],['장보기 목록 확인','우유와 과일 잊지 않기','🛒','19:30','normal',false]] as const;
  const tasks = rows.map(([title,memo,emoji,time,priority,done], i) => ({ id:`sample-${today}-${i}`, title,memo,emoji,time,date:today,priority,completedAt:done?new Date().toISOString():null,createdAt:new Date(Date.now()+i).toISOString(),kind:'todo' as const }));
  return [...tasks,
    { id:`routine-water-${today}`,title:'물 2L 마시기',memo:'오전과 오후에 나눠 마시기',emoji:'💧',time:'',date:today,priority:'normal',completedAt:new Date().toISOString(),createdAt:new Date().toISOString(),kind:'routine',streak:8 },
    { id:`routine-english-${today}`,title:'영어 단어 10개',memo:'어제 틀린 단어부터 복습',emoji:'Aa',time:'',date:today,priority:'normal',completedAt:null,createdAt:new Date().toISOString(),kind:'routine',streak:3 },
  ];
}

export default function App() {
  const today = key(new Date());
  const [selected, setSelected] = useState(today), [todos, setTodos] = useState<Todo[]>([]), [ready, setReady] = useState(false), [open, setOpen] = useState(false), [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { readAll().then(async data => { const seed = samples(today); if (!data.length) data = seed; else { const ids = new Set(data.map(item => item.id)); data = [...data, ...seed.filter(item => !ids.has(item.id))]; } await Promise.all(data.map(put)); setTodos(data); setReady(true); }).catch(() => setReady(true)); }, [today]);
  useEffect(() => { if (open) setTimeout(() => titleRef.current?.focus(), 0); }, [open]);
  const week = useMemo(() => { const d = new Date(`${selected}T12:00:00+09:00`), sun = new Date(d); sun.setDate(d.getDate()-d.getDay()); return Array.from({length:7},(_,i)=>{const x=new Date(sun);x.setDate(sun.getDate()+i);return {key:key(x),day:x.getDate(),name:['일','월','화','수','목','금','토'][i]};}); }, [selected]);
  const visible = todos.filter(t => t.date === selected).sort((a,b)=>a.time.localeCompare(b.time));
  const done = visible.filter(t=>t.completedAt).length, percent = visible.length ? Math.round(done/visible.length*100) : 0;
  const heading = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(`${selected}T12:00:00+09:00`));
  async function toggle(todo: Todo) { const changed={...todo,completedAt:todo.completedAt?null:new Date().toISOString()}; setTodos(xs=>xs.map(x=>x.id===todo.id?changed:x)); await put(changed); }
  async function add(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if(saving)return; setSaving(true); const f=new FormData(e.currentTarget); const todo:Todo={id:crypto.randomUUID(),title:String(f.get('title')).trim(),memo:String(f.get('memo')||'').trim(),emoji:String(f.get('emoji')||'✅'),time:String(f.get('time')||''),date:String(f.get('date')||selected),priority:String(f.get('priority')) as Todo['priority'],completedAt:null,createdAt:new Date().toISOString()}; await put(todo); setTodos(xs=>[...xs,todo]); setSelected(todo.date); setOpen(false); setSaving(false); }
  return <>
    <main className="app-shell" aria-label="My Daily Todo">
      <header className="app-header"><div className="header-date"><p className="eyebrow">{heading}</p><button className="today-button" onClick={()=>setSelected(today)}>현재</button></div><div className="header-actions"><button className="icon-button calendar-button" aria-label="캘린더 열기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm0 5h14M8 2v4m8-4v4"/></svg></button><button className="icon-button avatar-button" aria-label="설정 열기"><span>MJ</span></button></div></header>
      <div className="date-row"><section className="week-strip" aria-label="날짜 선택">{week.map(d=><button key={d.key} className={`day-button ${d.key===selected?'is-selected':''}`} onClick={()=>setSelected(d.key)}><span>{d.name}</span><strong>{d.day}</strong>{d.key===selected&&<i/>}</button>)}</section></div>
      <section className="progress-card"><div className="progress-heading"><h2>선택한 날짜 진행률</h2><div className="progress-numbers"><span>{done}</span> / <span>{visible.length}</span><strong>{percent}%</strong></div></div><div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${percent}%`}}/></div></section>
      <section className="content-section"><div className="section-heading-row"><div><p className="section-kicker">DAILY LIST</p><h2>오늘의 목록</h2></div><button className="mini-add-button" onClick={()=>setOpen(true)}>NEW TASK <span>+</span></button></div><div className="unified-list" aria-live="polite">
        {!ready&&<p className="empty-state">목록을 불러오고 있어요.</p>}{ready&&!visible.length&&<p className="empty-state">이 날짜에는 할 일이 없어요.<br/>새 할 일을 추가해 보세요.</p>}
        {visible.map(todo=><div className={`swipe-item ${todo.kind==='routine'?'has-skip':''}`} key={todo.id}><div className="swipe-actions" aria-hidden="true"><button className="edit-action" tabIndex={-1}>수정</button>{todo.kind==='routine'&&<button className="skip-action" tabIndex={-1}>건너뜀</button>}<button className="delete-action" tabIndex={-1}>삭제</button></div><article className={`item-card ${todo.completedAt?'is-done':''}`} aria-label={todo.title}><div className="item-icon" aria-hidden="true">{todo.emoji}</div><div className="item-body"><div className="item-title-row"><strong className="item-title">{todo.title}</strong><span className={`item-type-tag ${todo.kind==='routine'?'routine':'todo'}`}>{todo.kind==='routine'?'ROUTINE':'TODO'}</span></div>{todo.memo&&<p className="item-memo">{todo.memo}</p>}<div className="item-meta">{todo.kind==='routine'?<span className="streak-badge">🔥 {todo.streak||0}일 연속</span>:<><span className={`priority-mark ${todo.priority}`}>{todo.priority==='high'?'중요':todo.priority==='low'?'낮음':'보통'}</span><span>{todo.time||'시간 없음'}</span></>}</div></div><button className={`item-check ${todo.completedAt?'is-done':''}`} onClick={()=>void toggle(todo)} aria-label={`${todo.title} ${todo.completedAt?'완료 취소':'완료'}`}>✓</button><button className="drag-handle" aria-label={`${todo.title} 순서 변경`}>⠿</button></article></div>)}
      </div></section><div className="bottom-space"/>
    </main>
    {open&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="sheet-handle"/><div className="sheet-header"><div><p className="section-kicker">NEW ITEM</p><h2 id="modal-title">새 할 일</h2></div><button className="icon-button" onClick={()=>setOpen(false)} aria-label="닫기">×</button></div><form onSubmit={e=>void add(e)}><label className="field-label" htmlFor="title">무엇을 할까요?</label><input ref={titleRef} id="title" name="title" placeholder="내용을 입력하세요" required maxLength={100}/><div className="field-grid"><label><span className="field-label">이모지</span><input name="emoji" defaultValue="✅" maxLength={4}/></label><label><span className="field-label">시간</span><input name="time" type="time"/></label></div><label><span className="field-label">날짜</span><input name="date" type="date" defaultValue={selected}/></label><label><span className="field-label">중요도</span><select name="priority"><option value="normal">보통</option><option value="high">중요</option><option value="low">낮음</option></select></label><label className="field-label" htmlFor="memo">메모 <span>선택</span></label><textarea id="memo" name="memo" rows={3} placeholder="잊지 말아야 할 내용을 적어두세요"/><button className="primary-button" disabled={saving}>{saving?'저장 중…':'할 일 추가'}</button></form></section></div>}
  </>;
}
