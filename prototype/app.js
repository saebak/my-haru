const STORAGE_KEY = "my-daily-todo-mockup-v2";
const LEGACY_STORAGE_KEY = "my-daily-todo-mockup-v1";
const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
const weekdayValues = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function atNoon(value) { const date = new Date(value); date.setHours(12, 0, 0, 0); return date; }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function parseDate(key) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day, 12); }
function shiftDate(date, amount) { const shifted = atNoon(date); shifted.setDate(shifted.getDate() + amount); return shifted; }
function formatDate(date) { return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdayNames[date.getDay()]}요일`; }

const currentDate = atNoon(new Date());
const relativeKey = (amount) => dateKey(shiftDate(currentDate, amount));
const seedRecords = (days) => Object.fromEntries(Array.from({ length: days }, (_, index) => [relativeKey(-index), "done"]));

function buildInitialState() {
  const today = dateKey(currentDate);
  return {
    tasks: [
      { id: 1, title: "주간 업무 계획 정리하기", memo: "이번 주 우선순위 3개 정리", emoji: "🗂️", time: "09:30", priority: "high", date: today, created: 1, records: { [today]: "done" } },
      { id: 2, title: "디자인 시안 피드백 보내기", memo: "확인한 내용만 간단히 전달", emoji: "💬", time: "11:00", priority: "normal", date: today, created: 2, records: { [today]: "done" } },
      { id: 3, title: "점심 후 20분 산책", memo: "가까운 공원 한 바퀴", emoji: "🚶", time: "13:10", priority: "low", date: today, created: 3, records: {} },
      { id: 4, title: "앱인토스 문서 읽기", memo: "알림 API 부분 확인", emoji: "📖", time: "16:00", priority: "high", date: today, created: 4, records: {} },
      { id: 5, title: "장보기 목록 확인", memo: "우유와 과일 잊지 않기", emoji: "🛒", time: "19:30", priority: "normal", date: today, created: 5, records: {} },
      { id: 6, title: "주간 회고 메모", memo: "이번 주에 배운 것 세 가지", emoji: "📝", time: "20:00", priority: "normal", date: relativeKey(1), created: 6, records: {} }
    ],
    habits: [
      { id: 101, title: "물 2L 마시기", memo: "오전과 오후에 나눠 마시기", emoji: "💧", priority: "normal", repeat: true, weekdays: [], startDate: relativeKey(-30), repeatUntil: null, records: seedRecords(8), exceptions: [], overrides: {} },
      { id: 102, title: "영어 단어 10개", memo: "어제 틀린 단어부터 복습", emoji: "Aa", priority: "normal", repeat: true, weekdays: ["mon", "wed", "fri"], startDate: relativeKey(-30), repeatUntil: null, records: { [relativeKey(-1)]: "done", [relativeKey(-3)]: "done", [relativeKey(-5)]: "done" }, exceptions: [], overrides: {} }
    ],
    orders: {}
  };
}

function normalizeItem(item, type) {
  const today = dateKey(currentDate);
  const date = item.date || today;
  return {
    ...item,
    date,
    startDate: item.startDate || date,
    repeat: type === "habit" ? item.repeat !== false : Boolean(item.repeat),
    weekdays: Array.isArray(item.weekdays) ? item.weekdays : [],
    repeatUntil: item.repeatUntil || null,
    records: item.records && typeof item.records === "object" ? item.records : (item.done ? { [date]: "done" } : {}),
    exceptions: Array.isArray(item.exceptions) ? item.exceptions : [],
    overrides: item.overrides && typeof item.overrides === "object" ? item.overrides : {}
  };
}

function normalizeState(value) {
  if (!value?.tasks || !value?.habits) return buildInitialState();
  return {
    tasks: value.tasks.filter((item) => item.day !== "upcoming").map((item) => normalizeItem(item, "todo")),
    habits: value.habits.map((item) => normalizeItem(item, "habit")),
    orders: value.orders && typeof value.orders === "object" ? value.orders : {}
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeState(JSON.parse(saved));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    return legacy ? normalizeState(JSON.parse(legacy)) : buildInitialState();
  } catch { return buildInitialState(); }
}

let state = loadState();
let selectedDate = new Date(currentDate);
let visibleStart = startOfWeek(currentDate);
let calendarCursor = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12);
let calendarSelected = new Date(currentDate);
let editingItem = null;
let pendingDeletion = null;
let undoSnapshot = null;
let toastTimer = null;
let gesture = null;
let dateGesture = null;
let suppressDateClick = false;
let activeModal = null;
let modalReturnFocus = null;

const dailyList = document.querySelector("#daily-list");
const modal = document.querySelector("#task-modal");
const settingsModal = document.querySelector("#settings-modal");
const deleteScopeModal = document.querySelector("#delete-scope-modal");
const taskForm = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const repeatEnabled = document.querySelector("#repeat-enabled");
const repeatOptions = document.querySelector("#repeat-options");
const typeInputs = document.querySelectorAll('[name="type"]');
const emojiInput = document.querySelector("#task-emoji");
const emojiPreview = document.querySelector("#emoji-preview");
const emojiPicker = document.querySelector("#emoji-picker");
const emojiTrigger = document.querySelector("#emoji-trigger");
const timeField = document.querySelector("#time-field");
const dateField = document.querySelector("#date-field");
const quickFields = document.querySelector("#quick-fields");
const editScope = document.querySelector("#edit-scope");
const calendarView = document.querySelector("#calendar-view");
const calendarGrid = document.querySelector("#calendar-grid");
const weekStrip = document.querySelector("#week-strip");

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function priorityLabel(priority) { return ({ high: "중요", normal: "보통", low: "낮음" })[priority] || "보통"; }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function itemList(type) { return type === "habit" ? state.habits : state.tasks; }
function isRepeating(item, type) { return type === "habit" || Boolean(item.repeat); }

function occursOn(item, type, key) {
  if (item.exceptions?.includes(key)) return false;
  if (!isRepeating(item, type)) return item.date === key;
  if (key < (item.startDate || item.date) || (item.repeatUntil && key > item.repeatUntil)) return false;
  return !item.weekdays?.length || item.weekdays.includes(weekdayValues[parseDate(key).getDay()]);
}

function effectiveItem(item, key) { return { ...item, ...(item.overrides?.[key] || {}) }; }
function statusFor(item, key) { return item.records?.[key] || "pending"; }

function itemsForDate(type, key) {
  const items = itemList(type).filter((item) => occursOn(item, type, key)).map((item) => effectiveItem(item, key));
  const order = state.orders[`${type}:${key}`] || [];
  const positions = new Map(order.map((id, index) => [id, index]));
  return items.sort((a, b) => {
    if (positions.has(a.id) || positions.has(b.id)) return (positions.get(a.id) ?? 9999) - (positions.get(b.id) ?? 9999);
    if (type === "todo") return (a.time || "99:99").localeCompare(b.time || "99:99") || (a.created || 0) - (b.created || 0);
    return (a.created || a.id) - (b.created || b.id);
  });
}

function habitStreak(item, key) {
  let cursor = parseDate(key);
  let count = 0;
  for (let checked = 0; checked < 365; checked += 1) {
    const cursorKey = dateKey(cursor);
    if (occursOn(item, "habit", cursorKey)) {
      if (statusFor(item, cursorKey) !== "done") break;
      count += 1;
    }
    cursor = shiftDate(cursor, -1);
  }
  return count;
}

function itemMarkup(item, type, key) {
  const isHabit = type === "habit";
  const status = statusFor(item, key);
  const done = status === "done";
  const skipped = status === "skipped";
  const meta = isHabit
    ? `<span class="streak-badge">🔥 ${habitStreak(item, key)}일 연속</span>${skipped ? '<span class="status-label">건너뜀</span>' : ""}`
    : `<span class="priority-mark ${item.priority || "normal"}">${priorityLabel(item.priority)}</span><span>${item.time || "시간 없음"}</span>`;
  return `<div class="swipe-item ${isHabit ? "has-skip" : ""}" data-id="${item.id}" data-type="${type}" data-order-key="${type}:${item.id}">
    <div class="swipe-actions" aria-hidden="true"><button class="edit-action" type="button" data-action="edit" tabindex="-1">수정</button>${isHabit ? `<button class="skip-action" type="button" data-action="skip" tabindex="-1">${skipped ? "건너뜀 취소" : "건너뜀"}</button>` : ""}<button class="delete-action" type="button" data-action="delete" tabindex="-1">삭제</button></div>
    <article class="item-card ${done ? "is-done" : ""} ${skipped ? "is-skipped" : ""}" aria-label="${escapeHtml(item.title)}">
      <div class="item-icon" aria-hidden="true">${escapeHtml(item.emoji || (isHabit ? "🌱" : "✓"))}</div>
      <div class="item-body"><div class="item-title-row"><strong class="item-title">${escapeHtml(item.title)}</strong><span class="item-type-tag ${isHabit ? "routine" : "todo"}">${isHabit ? "ROUTINE" : "TODO"}</span></div>${item.memo ? `<p class="item-memo">${escapeHtml(item.memo)}</p>` : ""}<div class="item-meta">${meta}</div></div>
      <button class="item-check ${done ? "is-done" : ""}" type="button" data-action="toggle" aria-label="${escapeHtml(item.title)} ${done ? "완료 취소" : "완료"}">✓</button>
      <button class="drag-handle" type="button" data-action="drag" aria-label="${escapeHtml(item.title)} 순서 변경. Alt와 방향키로 이동">⠿</button>
    </article>
  </div>`;
}

function combinedItemsForDate(key) {
  const entries = [
    ...itemsForDate("todo", key).map((item) => ({ item, type: "todo" })),
    ...itemsForDate("habit", key).map((item) => ({ item, type: "habit" }))
  ];
  const order = state.orders[`all:${key}`] || [];
  if (!order.length) return entries;
  const positions = new Map(order.map((value, index) => [value, index]));
  return entries.sort((a, b) => (positions.get(`${a.type}:${a.item.id}`) ?? 9999) - (positions.get(`${b.type}:${b.item.id}`) ?? 9999));
}

function renderDailyList(key) {
  const entries = combinedItemsForDate(key);
  dailyList.innerHTML = entries.length
    ? entries.map(({ item, type }) => itemMarkup(item, type, key)).join("")
    : `<div class="empty-state"><strong>이날의 항목이 없어요</strong><p>NEW TASK 버튼으로 할 일이나 습관을 추가해 보세요.</p></div>`;
}

function updateProgress(key) {
  const entries = combinedItemsForDate(key);
  const activeEntries = entries.filter(({ item }) => statusFor(item, key) !== "skipped");
  const done = activeEntries.filter(({ item }) => statusFor(item, key) === "done").length;
  const percent = activeEntries.length ? Math.round(done / activeEntries.length * 100) : 0;
  const date = parseDate(key);
  document.querySelector("#progress-title").textContent = "전체 진행률";
  document.querySelector("#done-count").textContent = done;
  document.querySelector("#total-count").textContent = activeEntries.length;
  document.querySelector("#progress-percent").textContent = `${percent}%`;
  document.querySelector("#progress-fill").style.width = `${percent}%`;
  document.querySelector("#progress-track").setAttribute("aria-valuenow", percent);
  document.querySelector("#progress-track").setAttribute("aria-label", `${date.getMonth() + 1}월 ${date.getDate()}일 전체 진행률`);
}

function render() {
  const key = dateKey(selectedDate);
  const isToday = key === dateKey(currentDate);
  const shortDate = `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`;
  document.querySelector("#daily-heading").textContent = isToday ? "오늘의 목록" : `${shortDate} 목록`;
  renderDailyList(key); updateProgress(key); renderWeek();
  if (!calendarView.hidden) renderCalendar();
  saveState();
}

function showToast(message, canUndo = false) {
  const toast = document.querySelector("#toast");
  document.querySelector("#toast-message").textContent = message;
  document.querySelector("#undo-button").hidden = !canUndo;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; undoSnapshot = null; }, 3500);
}

function currentTime() { const now = new Date(); return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`; }

function openDialog(dialog, focusTarget) {
  modalReturnFocus = document.activeElement;
  activeModal = dialog;
  dialog.hidden = false;
  document.querySelector(".app-shell").setAttribute("inert", "");
  setTimeout(() => (focusTarget || dialog.querySelector("button, input, select, textarea"))?.focus(), 30);
}

function closeDialog(dialog) {
  if (!dialog || dialog.hidden) return;
  dialog.hidden = true;
  if (activeModal === dialog) activeModal = null;
  if (!activeModal) document.querySelector(".app-shell").removeAttribute("inert");
  const target = modalReturnFocus; modalReturnFocus = null;
  setTimeout(() => target?.focus(), 0);
}

function openForm(type = "todo", sourceItem = null) {
  const key = dateKey(selectedDate);
  const item = sourceItem ? effectiveItem(sourceItem, key) : null;
  editingItem = sourceItem ? { type, id: sourceItem.id } : null;
  taskForm.reset();
  typeInputs.forEach((input) => { input.checked = input.value === type; input.disabled = Boolean(sourceItem); });
  titleInput.value = item?.title || "";
  emojiInput.value = item?.emoji || "";
  emojiPreview.textContent = emojiInput.value || (type === "habit" ? "🌱" : "✓");
  emojiPicker.hidden = true; emojiPicker.classList.remove("is-open"); emojiTrigger.setAttribute("aria-expanded", "false");
  document.querySelector("#task-time").value = item?.time || currentTime();
  document.querySelector("#task-date").value = item?.date || key;
  document.querySelector("#task-priority").value = item?.priority || "normal";
  document.querySelector("#task-memo").value = item?.memo || "";
  repeatEnabled.checked = sourceItem ? Boolean(sourceItem.repeat) : type === "habit";
  document.querySelectorAll('[name="weekdays"]').forEach((input) => { input.checked = sourceItem?.weekdays?.includes(input.value) || false; });
  document.querySelector("#repeat-until").value = sourceItem?.repeatUntil || "";
  repeatOptions.hidden = !repeatEnabled.checked;
  editScope.hidden = !(sourceItem && isRepeating(sourceItem, type));
  updateFormCopy(type, Boolean(sourceItem));
  openDialog(modal, titleInput);
}

function updateFormCopy(type, isEditing = Boolean(editingItem)) {
  document.querySelector("#modal-title").textContent = isEditing ? "항목 수정" : "새 항목";
  document.querySelector("#submit-item").textContent = `${type === "habit" ? "습관" : "할 일"} ${isEditing ? "수정" : "추가"}`;
  timeField.hidden = type === "habit"; dateField.hidden = type === "habit";
  quickFields.classList.toggle("is-habit", type === "habit");
  if (!editingItem && type === "habit") { repeatEnabled.checked = true; repeatOptions.hidden = false; }
  if (!emojiInput.value) emojiPreview.textContent = type === "habit" ? "🌱" : "✓";
}

function closeForm() { closeEmojiPicker(); closeDialog(modal); editingItem = null; typeInputs.forEach((input) => { input.disabled = false; }); }
function findSourceItem(type, id) { return itemList(type).find((item) => item.id === id); }
function previousDateKey(key) { return dateKey(shiftDate(parseDate(key), -1)); }

function removeItem(type, id) {
  if (type === "habit") state.habits = state.habits.filter((item) => item.id !== id);
  else state.tasks = state.tasks.filter((item) => item.id !== id);
}

function closeAllActionRows(except = null) {
  document.querySelectorAll(".swipe-item.is-open").forEach((item) => {
    if (item === except) return;
    setActionRowState(item, false);
  });
}

function setActionRowState(wrapper, open) {
  wrapper.classList.toggle("is-open", open);
  wrapper.querySelector(".swipe-actions")?.setAttribute("aria-hidden", String(!open));
  wrapper.querySelectorAll(".swipe-actions button").forEach((button) => { button.tabIndex = open ? 0 : -1; });
}

function openDeleteScope(type, item) {
  pendingDeletion = { type, id: item.id };
  closeAllActionRows();
  openDialog(deleteScopeModal, deleteScopeModal.querySelector('[data-delete-scope="today"]'));
}

function deleteRepeatedItem(type, item, scope) {
  const key = dateKey(selectedDate);
  if (scope === "today") item.exceptions = [...new Set([...(item.exceptions || []), key])];
  else if (scope === "future") {
    if (key <= (item.startDate || item.date)) removeItem(type, item.id);
    else item.repeatUntil = previousDateKey(key);
  } else removeItem(type, item.id);
}

function handleListClick(event) {
  const button = event.target.closest("button");
  const wrapper = event.target.closest(".swipe-item");
  if (!button || !wrapper) return;
  const type = wrapper.dataset.type;
  const item = findSourceItem(type, Number(wrapper.dataset.id));
  if (!item) return;
  const key = dateKey(selectedDate);
  if (button.dataset.action === "toggle") {
    if (statusFor(item, key) === "done") delete item.records[key]; else item.records[key] = "done";
    render(); showToast(statusFor(item, key) === "done" ? "완료했어요." : "완료를 취소했어요.");
  } else if (button.dataset.action === "skip") {
    if (statusFor(item, key) === "skipped") delete item.records[key]; else item.records[key] = "skipped";
    render(); showToast(statusFor(item, key) === "skipped" ? "오늘은 건너뛰었어요." : "건너뜀을 취소했어요.");
  } else if (button.dataset.action === "edit") openForm(type, item);
  else if (button.dataset.action === "delete") {
    if (isRepeating(item, type)) openDeleteScope(type, item);
    else { undoSnapshot = structuredClone(state); removeItem(type, item.id); render(); showToast("항목을 삭제했어요.", true); }
  }
}

dailyList.addEventListener("click", handleListClick);

function startGesture(event) {
  const card = event.target.closest(".item-card");
  if (!card) return;
  const wrapper = card.closest(".swipe-item");
  const dragHandle = event.target.closest('[data-action="drag"]');
  if (event.target.closest("button") && !dragHandle) return;
  gesture = { card, wrapper, list: wrapper.parentElement, startX: event.clientX, startY: event.clientY, dx: 0, mode: dragHandle ? "reorder" : "swipe" };
  card.setPointerCapture(event.pointerId);
}

function moveGesture(event) {
  if (!gesture) return;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  gesture.dx = dx;
  if (gesture.mode === "swipe") {
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    event.preventDefault();
    const width = gesture.wrapper.classList.contains("has-skip") ? 168 : 112;
    gesture.card.style.transform = `translateX(${Math.max(-width, Math.min(0, dx))}px)`;
  } else if (Math.abs(dy) > 8) {
    event.preventDefault(); gesture.wrapper.classList.add("is-dragging");
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".swipe-item");
    if (!target || target === gesture.wrapper || target.parentElement !== gesture.list) return;
    const rect = target.getBoundingClientRect();
    gesture.list.insertBefore(gesture.wrapper, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
  }
}

function persistOrder(listElement) {
  state.orders[`all:${dateKey(selectedDate)}`] = [...listElement.querySelectorAll(".swipe-item")].map((item) => item.dataset.orderKey);
  saveState();
}

function endGesture(event) {
  if (!gesture) return;
  if (gesture.card.hasPointerCapture(event.pointerId)) gesture.card.releasePointerCapture(event.pointerId);
  if (gesture.mode === "swipe" && Math.abs(gesture.dx) > 8) {
    const open = gesture.dx < -42;
    closeAllActionRows(open ? gesture.wrapper : null);
    setActionRowState(gesture.wrapper, open);
    gesture.card.style.transform = "";
  }
  if (gesture.mode === "reorder") { gesture.wrapper.classList.remove("is-dragging"); persistOrder(gesture.list); }
  gesture = null;
}

[dailyList].forEach((list) => {
  list.addEventListener("pointerdown", startGesture); list.addEventListener("pointermove", moveGesture);
  list.addEventListener("pointerup", endGesture); list.addEventListener("pointercancel", endGesture);
  list.addEventListener("keydown", (event) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const wrapper = event.target.closest(".swipe-item"); if (!wrapper) return;
    event.preventDefault();
    const sibling = event.key === "ArrowUp" ? wrapper.previousElementSibling : wrapper.nextElementSibling;
    if (!sibling) return;
    if (event.key === "ArrowUp") list.insertBefore(wrapper, sibling); else list.insertBefore(sibling, wrapper);
    persistOrder(list); wrapper.querySelector(".drag-handle")?.focus(); showToast("순서를 변경했어요.");
  });
});

function startOfWeek(date) { const start = atNoon(date); start.setDate(start.getDate() - start.getDay()); return start; }

function renderWeek() {
  weekStrip.innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(visibleStart, index);
    const key = dateKey(date);
    const selected = key === dateKey(selectedDate);
    const today = key === dateKey(currentDate);
    const count = itemsForDate("todo", key).length + itemsForDate("habit", key).length;
    return `<button class="day-button ${selected ? "is-selected" : ""} ${today ? "is-today" : ""}" type="button" data-date="${key}" aria-label="${formatDate(date)}${count ? `, ${count}개 항목` : ""}"><span>${weekdayNames[date.getDay()]}</span><strong>${date.getDate()}</strong>${count ? "<i></i>" : ""}</button>`;
  }).join("");
  document.querySelector("#today-label").textContent = formatDate(selectedDate);
  document.querySelector("#go-today").hidden = dateKey(selectedDate) === dateKey(currentDate);
}

weekStrip.addEventListener("click", (event) => {
  const button = event.target.closest(".day-button");
  if (!button || suppressDateClick) return;
  selectedDate = parseDate(button.dataset.date); render();
});

weekStrip.addEventListener("pointerdown", (event) => {
  const button = event.target.closest(".day-button");
  dateGesture = { startX: event.clientX, dx: 0, date: button?.dataset.date || null };
  weekStrip.setPointerCapture(event.pointerId);
});
weekStrip.addEventListener("pointermove", (event) => {
  if (!dateGesture) return;
  dateGesture.dx = event.clientX - dateGesture.startX;
  if (Math.abs(dateGesture.dx) < 6) return;
  event.preventDefault(); weekStrip.style.transform = `translateX(${Math.max(-46, Math.min(46, dateGesture.dx * .28))}px)`;
});

function finishDateSwipe(event) {
  if (!dateGesture) return;
  if (weekStrip.hasPointerCapture(event.pointerId)) weekStrip.releasePointerCapture(event.pointerId);
  weekStrip.style.transform = "translateX(0)";
  const distance = Math.abs(dateGesture.dx);
  if (distance > 42) {
    suppressDateClick = true;
    visibleStart = shiftDate(visibleStart, dateGesture.dx < 0 ? 7 : -7);
    selectedDate = shiftDate(selectedDate, dateGesture.dx < 0 ? 7 : -7);
    render(); setTimeout(() => { suppressDateClick = false; }, 0);
  } else if (distance < 8 && event.type === "pointerup" && dateGesture.date) {
    suppressDateClick = true;
    selectedDate = parseDate(dateGesture.date);
    render(); setTimeout(() => { suppressDateClick = false; }, 0);
  }
  dateGesture = null;
}

weekStrip.addEventListener("pointerup", finishDateSwipe);
weekStrip.addEventListener("pointercancel", finishDateSwipe);
document.querySelector("#go-today").addEventListener("click", () => { selectedDate = new Date(currentDate); visibleStart = startOfWeek(currentDate); render(); });

function agendaMarkup(type, item, key) {
  const status = statusFor(item, key);
  const isHabit = type === "habit";
  const detail = isHabit ? `${habitStreak(item, key)}일 연속${status === "skipped" ? " · 건너뜀" : status === "done" ? " · 완료" : ""}` : `${item.time || "시간 없음"} · ${priorityLabel(item.priority)}${status === "done" ? " · 완료" : ""}`;
  return `<div class="agenda-item ${status === "done" ? "is-done" : ""}"><span>${escapeHtml(item.emoji || (isHabit ? "🌱" : "✓"))}</span><div><strong>${escapeHtml(item.title)}</strong><small>${detail}</small></div></div>`;
}

function renderCalendar() {
  const year = calendarCursor.getFullYear(); const month = calendarCursor.getMonth();
  document.querySelector("#calendar-month").textContent = `${year}년 ${month + 1}월`;
  const first = new Date(year, month, 1, 12); const start = shiftDate(first, -first.getDay());
  calendarGrid.innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = shiftDate(start, index); const key = dateKey(date);
    const outside = date.getMonth() !== month; const selected = key === dateKey(calendarSelected); const today = key === dateKey(currentDate);
    const count = itemsForDate("todo", key).length + itemsForDate("habit", key).length;
    return `<button class="calendar-day ${outside ? "is-outside" : ""} ${selected ? "is-selected" : ""} ${today ? "is-today" : ""} ${count ? "has-items" : ""}" type="button" data-date="${key}" aria-label="${formatDate(date)}${count ? `, ${count}개 항목` : ""}">${date.getDate()}</button>`;
  }).join("");
  const key = dateKey(calendarSelected); const tasks = itemsForDate("todo", key); const habits = itemsForDate("habit", key); const count = tasks.length + habits.length;
  document.querySelector("#agenda-title").textContent = `${calendarSelected.getMonth() + 1}월 ${calendarSelected.getDate()}일 일정`;
  document.querySelector("#agenda-count").textContent = `${count}개`;
  document.querySelector("#agenda-list").innerHTML = count
    ? [...tasks.map((item) => agendaMarkup("todo", item, key)), ...habits.map((item) => agendaMarkup("habit", item, key))].join("")
    : `<div class="calendar-empty"><strong>일정이 없어요</strong><span>이 날짜를 선택해 새 항목을 추가할 수 있어요.</span></div>`;
}

document.querySelector(".calendar-button").addEventListener("click", () => {
  calendarSelected = new Date(selectedDate); calendarCursor = new Date(calendarSelected.getFullYear(), calendarSelected.getMonth(), 1, 12);
  renderCalendar(); calendarView.hidden = false; document.querySelector("#close-calendar").focus();
});
function closeCalendar() { calendarView.hidden = true; document.querySelector(".calendar-button").focus(); }
document.querySelector("#close-calendar").addEventListener("click", closeCalendar);
document.querySelector("#calendar-today").addEventListener("click", () => { calendarSelected = new Date(currentDate); calendarCursor = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12); renderCalendar(); });
document.querySelector("#prev-month").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendar(); });
document.querySelector("#next-month").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendar(); });
calendarGrid.addEventListener("click", (event) => { const button = event.target.closest(".calendar-day"); if (!button) return; calendarSelected = parseDate(button.dataset.date); calendarCursor = new Date(calendarSelected.getFullYear(), calendarSelected.getMonth(), 1, 12); renderCalendar(); });
document.querySelector("#open-agenda-date").addEventListener("click", () => { selectedDate = new Date(calendarSelected); visibleStart = startOfWeek(selectedDate); closeCalendar(); render(); });

document.querySelector("#open-settings").addEventListener("click", () => openDialog(settingsModal, document.querySelector("#close-settings")));
document.querySelector("#close-settings").addEventListener("click", () => closeDialog(settingsModal));
settingsModal.addEventListener("click", (event) => { if (event.target === settingsModal) closeDialog(settingsModal); });
document.querySelector("#open-add").addEventListener("click", () => openForm());
document.querySelector("#close-modal").addEventListener("click", closeForm);
modal.addEventListener("click", (event) => { if (event.target === modal) closeForm(); });
document.querySelector("#close-delete-scope").addEventListener("click", () => closeDialog(deleteScopeModal));
deleteScopeModal.addEventListener("click", (event) => {
  if (event.target === deleteScopeModal) closeDialog(deleteScopeModal);
  const choice = event.target.closest("[data-delete-scope]");
  if (!choice || !pendingDeletion) return;
  const item = findSourceItem(pendingDeletion.type, pendingDeletion.id); if (!item) return;
  undoSnapshot = structuredClone(state); deleteRepeatedItem(pendingDeletion.type, item, choice.dataset.deleteScope);
  pendingDeletion = null; closeDialog(deleteScopeModal); render(); showToast("반복 항목을 삭제했어요.", true);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (activeModal === modal) closeForm(); else if (activeModal) closeDialog(activeModal); else if (!calendarView.hidden) closeCalendar();
    return;
  }
  if (event.key !== "Tab" || !activeModal) return;
  const focusable = [...activeModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((item) => !item.closest("[hidden]"));
  if (!focusable.length) return;
  const first = focusable[0]; const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

repeatEnabled.addEventListener("change", () => { repeatOptions.hidden = !repeatEnabled.checked; });
typeInputs.forEach((input) => input.addEventListener("change", () => updateFormCopy(input.value)));

function openEmojiPicker() { emojiPicker.hidden = false; emojiTrigger.setAttribute("aria-expanded", "true"); requestAnimationFrame(() => emojiPicker.classList.add("is-open")); }
function closeEmojiPicker() { emojiPicker.classList.remove("is-open"); emojiTrigger.setAttribute("aria-expanded", "false"); setTimeout(() => { if (!emojiPicker.classList.contains("is-open")) emojiPicker.hidden = true; }, 180); }
emojiTrigger.addEventListener("click", () => { if (emojiPicker.hidden) openEmojiPicker(); else closeEmojiPicker(); });
emojiPicker.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-emoji]"); if (!button) return;
  emojiInput.value = button.dataset.emoji; emojiPreview.textContent = button.dataset.emoji;
  emojiPicker.querySelectorAll("button").forEach((item) => item.classList.toggle("is-selected", item === button)); closeEmojiPicker();
});
document.addEventListener("pointerdown", (event) => { if (!emojiPicker.hidden && !event.target.closest(".emoji-field")) closeEmojiPicker(); if (!event.target.closest(".swipe-item")) closeAllActionRows(); });

function commonFormValues(data, type) {
  return {
    title: data.get("title").trim(), emoji: data.get("emoji").trim() || (type === "habit" ? "🌱" : "✓"),
    time: type === "habit" ? null : (data.get("time") || currentTime()),
    date: type === "habit" ? dateKey(selectedDate) : (data.get("date") || dateKey(selectedDate)),
    priority: data.get("priority"), memo: data.get("memo"), repeat: type === "habit" || data.get("repeat") === "on",
    weekdays: data.getAll("weekdays"), repeatUntil: data.get("repeatUntil") || null
  };
}

function applyEdit(type, item, common, scope) {
  const key = dateKey(selectedDate);
  if (!isRepeating(item, type)) { Object.assign(item, common, { startDate: common.date }); return; }
  if (scope === "all") { Object.assign(item, common); return; }
  if (scope === "today") { item.overrides = { ...(item.overrides || {}), [key]: common }; return; }
  if (key <= (item.startDate || item.date)) { Object.assign(item, common, { startDate: key }); return; }
  const nextItem = structuredClone(item);
  nextItem.id = Date.now(); nextItem.startDate = key; nextItem.date = key; nextItem.created = Date.now();
  nextItem.records = Object.fromEntries(Object.entries(item.records || {}).filter(([recordKey]) => recordKey >= key)); nextItem.overrides = {};
  Object.assign(nextItem, common); item.repeatUntil = previousDateKey(key);
  item.records = Object.fromEntries(Object.entries(item.records || {}).filter(([recordKey]) => recordKey < key)); itemList(type).push(nextItem);
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(taskForm); const type = editingItem?.type || data.get("type"); const common = commonFormValues(data, type);
  if (!common.title) { titleInput.focus(); return; }
  const wasEditing = Boolean(editingItem);
  if (editingItem) { const item = findSourceItem(editingItem.type, editingItem.id); applyEdit(editingItem.type, item, common, data.get("editScope") || "all"); }
  else {
    const item = { ...common, id: Date.now(), created: Date.now(), startDate: common.date, records: {}, exceptions: [], overrides: {} };
    itemList(type).push(item);
    if (type === "todo") selectedDate = parseDate(common.date);
    visibleStart = startOfWeek(selectedDate);
  }
  closeForm(); render(); showToast(wasEditing ? "항목을 수정했어요." : `${type === "habit" ? "습관" : "할 일"}을 추가했어요.`);
});

document.querySelector("#undo-button").addEventListener("click", () => { if (!undoSnapshot) return; state = undoSnapshot; undoSnapshot = null; document.querySelector("#toast").hidden = true; render(); });

renderCalendar();
render();
