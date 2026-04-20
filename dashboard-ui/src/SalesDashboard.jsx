import { useState, useEffect } from 'react';
import { getSummary, getActivities, todayRange, weekRange } from './api';

const TYPE_LABEL = { call: 'Звонок', meeting: 'Встреча', proposal: 'КП', deal: 'Сделка', unknown: 'Другое' };
const TYPE_COLOR = { call: '#3b82f6', meeting: '#8b5cf6', proposal: '#f59e0b', deal: '#10b981', unknown: '#6b7280' };

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: '#111118', border: '1px solid #27272a', borderRadius: 10, padding: '16px 20px', flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? '#f9fafb' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function PlanBar({ pct }) {
  const color = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ background: '#111118', border: '1px solid #27272a', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: '#9ca3af' }}>Выполнение плана</span>
        <span style={{ fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: '#27272a', borderRadius: 99, height: 8 }}>
        <div style={{ background: color, borderRadius: 99, height: 8, width: `${Math.min(pct, 100)}%`, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function ActivityRow({ act }) {
  const color = TYPE_COLOR[act.type] ?? '#6b7280';
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #1f1f2e', alignItems: 'flex-start' }}>
      <div style={{ background: color + '22', color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', marginTop: 2 }}>
        {TYPE_LABEL[act.type] ?? act.type}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#e5e7eb' }}>
          {act.client ?? '—'}{act.duration_min ? ` · ${act.duration_min} мин` : ''}
        </div>
        {act.result && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{act.result}</div>}
      </div>
      <div style={{ fontSize: 11, color: '#4b5563', whiteSpace: 'nowrap' }}>
        {act.date ? new Date(act.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}
      </div>
    </div>
  );
}

export default function SalesDashboard({ user }) {
  const [period, setPeriod]     = useState('day');
  const [summary, setSummary]   = useState(null);
  const [activities, setActs]   = useState([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const range = period === 'day' ? todayRange() : weekRange();
    Promise.all([
      getSummary(user.id, period),
      getActivities(user.id, range.from, range.to),
    ]).then(([s, a]) => {
      setSummary(s);
      setActs(a.items ?? []);
    }).finally(() => setLoading(false));
  }, [user, period]);

  if (!user) return <div style={{ color: '#6b7280', padding: 32 }}>Выберите продажника</div>;

  return (
    <div>
      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
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
        {loading && <span style={{ color: '#6b7280', fontSize: 12, alignSelf: 'center' }}>обновление...</span>}
      </div>

      {/* Stat cards */}
      {summary && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <StatCard label="Звонки"    value={summary.calls}        color="#3b82f6" />
            <StatCard label="Встречи"   value={summary.meetings}     color="#8b5cf6" />
            <StatCard label="КП"        value={summary.proposals}    color="#f59e0b" />
            <StatCard label="Сделки"    value={summary.deal_updates} color="#10b981" />
          </div>
          <PlanBar pct={summary.plan_pct} />
          {summary.open_tasks > 0 && (
            <div style={{ background: '#1c1208', border: '1px solid #78350f', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fcd34d' }}>
              ⚡ Открытых задач: {summary.open_tasks}
            </div>
          )}
        </>
      )}

      {/* Activity list */}
      <div style={{ background: '#111118', border: '1px solid #27272a', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
          Активности{activities.length ? ` (${activities.length})` : ''}
        </div>
        {activities.length === 0
          ? <div style={{ color: '#4b5563', fontSize: 13, padding: '12px 0' }}>Нет активностей за выбранный период</div>
          : activities.slice(0, 20).map(a => <ActivityRow key={a.id} act={a} />)
        }
      </div>
    </div>
  );
}
