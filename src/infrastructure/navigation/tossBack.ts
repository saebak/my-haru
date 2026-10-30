import { useEffect, useRef } from 'react';

/**
 * 토스 내비게이션 바·시스템 뒤로가기를 앱 안 화면 닫기로 연결한다(UX-003, UX-004).
 *
 * 앱인토스 공식 문서상 `graniteEvent`의 `backEvent`를 구독하면 기본 뒤로가기가 막히고 onEvent가 호출된다.
 * 그래서 캘린더·메모장·시트처럼 닫을 화면이 열려 있을 때만 구독하고, 첫 화면에서는 구독하지 않아
 * 뒤로가기가 미니앱 종료로 이어지게 한다. 토스 밖(일반 브라우저·테스트)에서는 조용히 무시한다.
 */
export function useTossBack(onBack: (() => void) | null) {
  const handler = useRef(onBack);
  handler.current = onBack;
  const active = onBack !== null;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void import('@apps-in-toss/web-framework').then(({ graniteEvent }) => {
      if (cancelled) return;
      try {
        unsubscribe = graniteEvent.addEventListener('backEvent', {
          onEvent: () => handler.current?.(),
          onError: () => undefined,
        });
      } catch {
        // 토스 브리지가 없는 환경에서는 Escape 키와 화면 안 버튼으로만 닫는다.
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [active]);
}
