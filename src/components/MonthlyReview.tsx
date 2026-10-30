import type { MonthStats } from '../domain/stats';
import type { Tag } from '../domain/tags';

function deltaText(delta: number | null) {
  if (delta === null) return null;
  if (delta === 0) return '지난달과 같아요';
  return `지난달보다 ${Math.abs(delta)}%p ${delta > 0 ? '올랐어요' : '내렸어요'}`;
}

/** 진행 막대는 장식이고, 같은 값을 숫자로도 보여 화면 낭독기와 색 구분이 어려운 사용자도 읽을 수 있게 한다. */
function Bar({ percent }: { percent: number | null }) {
  return <span className="review-bar" aria-hidden="true"><i style={{ width: `${percent ?? 0}%` }} /></span>;
}

/**
 * 캘린더 하단의 월간 돌아보기(STAT-001~STAT-004). 보고 있는 달의 오늘까지 기록으로
 * 달성률·전월 대비, 태그별 달성률, 루틴별 완료 횟수와 최장 연속을 보여 준다.
 */
export function MonthlyReview({ stats, monthName, isCurrentMonth, tagsById }: {
  stats: MonthStats;
  monthName: string;
  isCurrentMonth: boolean;
  tagsById: ReadonlyMap<string, Tag>;
}) {
  const title = isCurrentMonth ? '이번 달 돌아보기' : `${monthName} 돌아보기`;
  if (!stats.countedDays || !stats.total) {
    return <section className="monthly-review" aria-labelledby="monthly-review-title">
      <div className="section-heading-row"><div><p className="section-kicker">MONTHLY REVIEW</p><h2 id="monthly-review-title">{title}</h2></div></div>
      <div className="calendar-empty"><strong>{stats.countedDays ? '아직 기록이 없어요' : '아직 시작하지 않은 달이에요'}</strong><span>{stats.countedDays ? '할 일을 완료하면 이곳에 이달의 달성률이 쌓여요.' : '날짜가 지나면 이달의 달성률을 보여 드릴게요.'}</span></div>
    </section>;
  }
  const delta = deltaText(stats.delta);
  return <section className="monthly-review" aria-labelledby="monthly-review-title">
    <div className="section-heading-row"><div><p className="section-kicker">MONTHLY REVIEW</p><h2 id="monthly-review-title">{title}</h2></div></div>

    <div className="review-summary">
      <div className="review-rate">
        <div className="review-rate-main"><span className="review-label">완료율</span><strong>{stats.percent}<small>%</small></strong></div>
        <span className="review-total" aria-label={`전체 ${stats.total}개 중 ${stats.completed}개 완료`}>{stats.completed} / {stats.total}개</span>
      </div>
      <Bar percent={stats.percent} />
      {delta && <ul className="review-facts">
        <li className={stats.delta! > 0 ? 'is-up' : stats.delta! < 0 ? 'is-down' : ''}><b aria-hidden="true">{stats.delta! > 0 ? '▲' : stats.delta! < 0 ? '▼' : '='}</b>{delta}</li>
      </ul>}
    </div>

    {stats.byTag.length > 0 && <div className="review-block">
      <h3>태그별 달성률</h3>
      <ul className="review-tags">
        {stats.byTag.map((row) => {
          const tag = row.tagId ? tagsById.get(row.tagId) : null;
          return <li key={row.tagId ?? 'none'} className={tag ? `tag-${tag.color}` : 'is-untagged'}>
            <span className={tag ? 'tag-pill' : 'review-untagged'}>{tag?.name ?? '기타'}</span>
            <Bar percent={row.percent} />
            <span className="review-count"><b>{row.percent}%</b> {row.completed}/{row.total}</span>
          </li>;
        })}
      </ul>
    </div>}

    {stats.routines.length > 0 && <div className="review-block">
      <h3>루틴 기록</h3>
      <ul className="review-routines">
        {stats.routines.map((routine) => <li key={routine.seriesId}>
          <span className="review-routine-icon" aria-hidden="true">{routine.emoji || '💡'}</span>
          <span className="review-routine-name"><strong>{routine.title}</strong><small>{routine.bestStreak > 1 ? `최장 ${routine.bestStreak}일 연속` : '연속 기록을 만들어 보세요'}</small></span>
          <span className="review-count"><b>{routine.completed}</b>/{routine.total}회</span>
        </li>)}
      </ul>
    </div>}
  </section>;
}
