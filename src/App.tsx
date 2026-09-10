function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">MY DAILY TODO</p>
          <h1>오늘을 가볍게 시작해요</h1>
        </div>
        <span className="avatar" aria-hidden="true">
          MD
        </span>
      </header>

      <section className="hero-card signed-in-card" aria-labelledby="phase-title">
        <span className="hero-icon" aria-hidden="true">✓</span>
        <div>
          <p className="section-label">PHASE 1</p>
          <h2 id="phase-title">기기 안에 안전하게 저장해요</h2>
          <p>로그인과 네트워크 없이 할 일을 관리하는 로컬 MVP를 준비하고 있어요.</p>
        </div>
      </section>

      <section className="status-card" aria-labelledby="storage-title">
        <div className="status-heading">
          <div>
            <p className="section-label">LOCAL STORAGE</p>
            <h2 id="storage-title">IndexedDB</h2>
          </div>
          <span className="status-badge status-connected">
            Phase 1
          </span>
        </div>
        <p>Todo와 반복 기록은 이 기기에 저장합니다. 서버 복원과 동기화는 Phase 2에서 추가합니다.</p>
      </section>

      <p className="security-note">
        앱을 삭제하거나 앱 데이터가 초기화되면 자동 복원되지 않으므로 중요한 데이터는 백업 기능으로 보호할 예정입니다.
      </p>
    </main>
  );
}

export default App;
