import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'my-daily-todo',
  brand: {
    primaryColor: '#86B93F',
  },
  permissions: [],
  // 화면 안 뒤로가기 버튼을 두지 않으므로(UX-003) 토스 내비게이션 바의 뒤로가기를 명시적으로 켠다.
  // 시트·캘린더·메모장이 열려 있으면 backEvent로 닫고, 첫 화면에서는 미니앱이 종료된다(UX-004).
  navigationBar: {
    withBackButton: true,
  },
  webBundleDir: 'dist',
});
