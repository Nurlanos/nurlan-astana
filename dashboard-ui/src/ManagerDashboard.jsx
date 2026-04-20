import { useState, useEffect } from 'react';
import { getTeamDashboard, todayRange, weekRange } from './api';

function statusStyle(s) {
  if (s === 'green')  return { color: '#22c55e', bg: '#052e16' };
  if (s === 'yellow') return { color: '#f59e0b', bg: '#1c1208' };
  return                     { color: '#ef4444', bg: '#2d1515' };
}

function StatusDot({ status }) {
  const { color } = statusStyle(status);
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />;
}

function MiniBar({ pct }) {
  const { color } = statusStyle(pct >= 80 ? 'green' : pct >= 40 ? 'yellow' : 'red');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ background: '#27272a', borderRadius: 99, height: 6, width: 60, flexShrink: 0 }}>
        <div style={{ background: color, borderRadius: 99, height: 6, width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

export default function ManagerDashboard() {
  const [period, setPeriod]   = useState('day');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState('all');

  useEffect(() => {
    setLoading(true);
    const range = period === 'day' ? todayRange() : weekRange();
    getTeamDashboard(range.from, range.to)
      .then(d => setMembers(d.members ?? []))
      .finally(() => setLoading(false));
  }, [period]);

  // auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => {
      const range = period === 'day' ? todayRange() : weekRange();
      getTeamDashboard(range.from, range.to).then(d => setMembers(d.members ?? []));
    }, 30_000);
    return () => clearInterval(id);
  }, [period]);

  const alerts = members.filter(m => m.status === 'red');
  const visible = filter === 'all' ? members : members.filter(m => m.status === filter);

  const totals = members.reduce((acc, m) => ({
    calls:     acc.calls     + m.calls,
    meetings:  acc.meetings  + m.meetings,
    proposals: acc.proposals + m.proposals,
    deals:     acc.deals     + m.deal_updates,
  }), { calls: 0, meetings: 0, proposals: 0, deals: 0 });

  return (
    <div>
      {/* Period + filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['day', 'week'].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            background: period === p ? '#2563eb' : '#1c1c26',
            border: '1px solid ' + (period === p ? '#2563eb' : '#3f3f46'),
            color: period === p ? '#fff' : '#9ca3af',
            borderRadius: 7, padding: '6px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
          }}>
            {p === 'day' ? 'Сегодня' : 'Неделя'}
          </button>
        ))}
        <div style={{ width: 1, background: '#27272a', margin: '0 4px' }} />
        {['all', 'green', 'yellow', 'red'].map(f => {
          const labels = { all: 'Все', green: 'Норма', yellow: 'Риск', red: 'Нет активности' };
          const colors = { all: '#6b7280', green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' };
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? colors[f] + '22' : '#1c1c26',
              border: '1px solid ' + (filter === f ? colors[f] : '#3f3f46'),
              color: filter === f ? colors[f] : '#9ca3af',
              borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}>
              {labels[f]}
            </button>
          );
        })}
        {loading && <span style={{ color: '#6b7280', fontSize: 12, alignSelf: 'center' }}>обновление...</span>}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 600, marginBottom: 6 }}>
            ⚠ Нет активностей сегодня: {alerts.length} чел.
          </div>
          {alerts.map(m => (
            <div key={m.user_id} style={{ fontSize: 12, color: '#f87171' }}>· {m.name}</div>
          ))}
        </div>
      )}

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Звонки',  val: totals.calls,     color: '#3b82f6' },
          { label: 'Встречи', val: totals.meetings,   color: '#8b5cf6' },
          { label: 'КП',      val: totals.proposals,  color: '#f59e0b' },
          { label: 'Сделки',  val: totals.deals,      color: '#10b981' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: '#111118', border: '1px solid #27272a', borderRadius: 8, padding: '10px 16px', flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Team table */}
      <div style={{ background: '#111118', border: '1px solid #27272a', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 60px 60px 60px 90px', gap: 8, padding: '10px 16px', borderBottom: '1px solid #27272a', fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <div>Продажник</div>
          <div style={{ textAlign: 'center' }}>Звонки</div>
          <div style={{ textAlign: 'center' }}>Встречи</div>
          <div style={{ textAlign: 'center' }}>КП</div>
          <div style={{ textAlign: 'center' }}>Сделки</div>
          <div>План</div>
        </div>
        {/* Rows */}
        {visible.map(m => {
          const { bg } = statusStyle(m.status);
          return (
            <div key={m.user_id} style={{
              display: 'grid', gridTemplateColumns: '2fr 60px 60px 60px 60px 90px',
              gap: 8, padding: '11px 16px', borderBottom: '1px solid #1f1f2e',
              background: m.status === 'red' ? bg + '55' : 'transparent',
              alignItems: 'center',
            }}>
              <div style={{ fontSize: 13, color: '#e5e7eb' }}>
                <StatusDot status={m.status} />{m.name}
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, color: m.calls  ? '#93c5fd' : '#374151' }}>{m.calls}</div>
              <div style={{ textAlign: 'center', fontSize: 13, color: m.meetings  ? '#c4b5fd' : '#374151' }}>{m.meetings}</div>
              <div style={{ textAlign: 'center', fontSize: 13, color: m.proposals ? '#fcd34d' : '#374151' }}>{m.proposals}</div>
              <div style={{ textAlign: 'center', fontSize: 13, color: m.deal_updates ? '#6ee7b7' : '#374151' }}>{m.deal_updates}</div>
              <MiniBar pct={m.plan_pct} />
            </div>
          );
        })}
        {visible.length === 0 && (
          <div style={{ padding: '20px 16px', color: '#4b5563', fontSize: 13 }}>Нет данных</div>
        )}
      </div>
    </div>
  );
}
