import { useId, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import { ko } from 'date-fns/locale/ko';
import 'react-datepicker/dist/react-datepicker.css';

// Date objects are only a UI adapter. Persist calendar components, never UTC-convert them.
function pickerDate(value: string, time: boolean): Date | null {
  if (!value) return null;
  if (time) {
    const [hours, minutes] = value.split(':').map(Number);
    return new Date(2000, 0, 1, hours, minutes);
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function SchedulePicker({ name, label, value, onChange, time = false, optional = false, min }: {
  name: string; label: string; value: string; onChange: (value: string) => void;
  time?: boolean; optional?: boolean; min?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = pickerDate(value, time);
  function choose(date: Date | null) {
    const pad = (n: number) => String(n).padStart(2, '0');
    onChange(date ? time ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '');
    setOpen(false);
    trigger.current?.focus();
  }
  return <div className="schedule-field">
    <span className="field-label" id={`${id}-label`}>{label}{optional && <em> 선택</em>}</span>
    <input type="hidden" name={name} value={value} />
    <button ref={trigger} className="schedule-trigger" type="button" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>
      <span id={`${id}-value`}>{selected ? time ? value : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(selected) : time ? '시간 없음' : '종료일 없음'}</span><span aria-hidden="true">{time ? '◷' : '▦'}</span>
    </button>
    {open && <div id={`${id}-panel`} className={`schedule-panel ${time ? 'time-panel' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
      <DatePicker selected={selected} onChange={choose} inline locale={ko} calendarStartDay={1} minDate={min ? pickerDate(min, false)! : undefined}
        showTimeSelect={time} showTimeSelectOnly={time} timeIntervals={15} timeFormat="HH:mm" timeCaption="시간 선택" dateFormatCalendar="yyyy년 M월" previousMonthAriaLabel="이전 달" nextMonthAriaLabel="다음 달" previousMonthButtonLabel="이전 달" nextMonthButtonLabel="다음 달" />
      {time && <label className="precise-time">분 단위로 입력<input type="time" aria-label="정확한 시간" value={value} onChange={(event) => onChange(event.target.value)} /></label>}
      <div className="picker-actions">{optional && <button type="button" onClick={() => choose(null)}>{time ? '시간 없이' : '종료일 없이'}</button>}<button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>선택 완료</button></div>
    </div>}
  </div>;
}
