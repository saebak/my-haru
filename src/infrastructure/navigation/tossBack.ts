import { useEffect, useRef } from 'react';

const GUARD_KEY = 'myDailyTodoBack';

/** 현재 열려 있는 화면들의 뒤로가기 처리기. 마지막에 열린 화면이 먼저 처리한다. */
const handlers: Array<{ current: () => void }> = [];
let listening = false;

function isGuard(state: unknown) {
  return Boolean(state && typeof state === 'object' && (state as Record<string, unknown>)[GUARD_KEY]);
}

/** 방문 기록 맨 위에 보호 칸이 없을 때만 한 칸 쌓는다. 여러 화면이 열려도 칸은 하나만 유지한다. */
function arm() {
  if (!isGuard(window.history.state)) window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, '');
}

async function exitMiniApp() {
  try {
    const { Screen } = await import('@apps-in-toss/web-framework');
    await Screen.close();
  } catch {
    // 토스 밖(일반 브라우저·테스트)에서는 종료할 수 없으므로 그대로 둔다.
  }
}

function onPopState(event: PopStateEvent) {
  if (isGuard(event.state)) return;
  const top = handlers[handlers.length - 1];
  if (top) {
    top.current();
    // 메모장처럼 한 단계만 물러나 화면이 남을 수 있으므로 다시 한 칸 쌓는다. 화면이 닫혀 남은 칸은 다음 뒤로가기에서 정리된다.
    arm();
    return;
  }
  // 화면을 버튼·Esc로 닫아 보호 칸만 남은 상태에서 첫 화면 뒤로가기를 누른 경우다. 미니앱을 종료한다(UX-004).
  void exitMiniApp();
}

/**
 * 토스 내비게이션 바·시스템 뒤로가기를 앱 안 화면 닫기로 연결한다(UX-003, UX-004).
 *
 * 실기기에서 `backEvent`만 구독했을 때 토스 상단 바 뒤로가기를 누르면 캘린더가 닫히지 않고 미니앱이 종료됐다.
 * 상단 바가 웹뷰 방문 기록을 따른다는 가정으로(공식 문서: WebView는 웹 라우터 규칙을 따름, 상단 바 동작은 명시되지 않음)
 * 캘린더·메모장·시트가 열려 있으면 방문 기록에 보호 칸을 하나 두고, 뒤로가기로 그 칸이 빠지면(popstate)
 * 마지막에 열린 화면을 닫는다. 코드에서 기록을 되돌리지 않으므로 화면 전환이 빨라도 뒤로가기를 잃지 않는다.
 * 안드로이드 시스템 뒤로가기(`backEvent`)는 화면이 열려 있을 때만 구독해 같은 기록을 되돌리게 한다.
 */
export function useTossBack(onBack: (() => void) | null) {
  const handler = useRef(onBack);
  handler.current = onBack;
  const active = onBack !== null;

  useEffect(() => {
    if (!active) return;
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    const entry = { current: () => handler.current?.() };
    handlers.push(entry);
    arm();

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void import('@apps-in-toss/web-framework').then(({ graniteEvent }) => {
      if (cancelled) return;
      try {
        unsubscribe = graniteEvent.addEventListener('backEvent', { onEvent: () => window.history.back(), onError: () => undefined });
      } catch {
        // 토스 브리지가 없는 환경에서는 방문 기록만 사용한다.
      }
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      unsubscribe?.();
      handlers.splice(handlers.indexOf(entry), 1);
    };
  }, [active]);
}
