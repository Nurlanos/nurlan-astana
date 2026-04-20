import { useState, useEffect, useRef } from 'react';
import { getUsers, startProcess, pollInstance, extractConfirmation } from './api';

const EXAMPLES = [
  'Позвонил Нурлану из Казмунайгаз, 20 минут, договорились о встрече в пятницу',
  'Провёл встречу с командой Тенгизшевройл, 1.5 часа, обсудили условия контракта',
  'Отправил КП в Самрук-Энерго по продукту Корпоратив 500',
  'Перевёл сделку с АО Казпочта на этап переговоров',
];

function StatusBadge({ status }) {
  const map = {
    idle:    { color: '#6b7280', label: '' },
    sending: { color: '#f59e0b', label: '⏳ Обрабатывается...' },
    ok:      { color: '#22c55e', label: '✓ Записано' },
    error:   { color: '#ef4444', label: '✗ Ошибка' },
  };
  const { color, label } = map[status] ?? map.idle;
  return label ? <span style={{ color, fontWeight: 600, fontSize: 13 }}>{label}</span> : null;
}

function ConfirmCard({ item }) {
  return (
    <div style={{
      background: item.error ? '#2d1515' : '#0f2d1a',
      border: `1px solid ${item.error ? '#7f1d1d' : '#166534'}`,
      borderRadius: 10, padding: '12px 16px', marginBottom: 10,
    }}>
      <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 6 }}>
        {item.user} · {item.time}
      </div>
      <div style={{ color: '#d1fae5', fontSize: 13, marginBottom: 8, fontStyle: 'italic', opacity: 0.7 }}>
        «{item.text}»
      </div>
      {item.error
        ? <div style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {item.error}</div>
        : <div style={{ color: '#bbf7d0', fontSize: 13, whiteSpace: 'pre-line' }}>{item.confirmation}</div>
      }
    </div>
  );
}

export default function App() {
  const [users, setUsers]     = useState([]);
  const [userId, setUserId]   = useState('');
  const [text, setText]       = useState('');
  const [status, setStatus]   = useState('idle');
  const [history, setHistory] = useState([]);
  const abortRef              = useRef(null);
  const textareaRef           = useRef(null);

  useEffect(() => {
    getUsers()
      .then(list => { setUsers(list); if (list.length) setUserId(list[0].id); })
      .catch(() => {});
  }, []);

  async function handleSend() {
    if (!text.trim() || !userId || status === 'sending') return;
    abortRef.current = new AbortController();
    setStatus('sending');

    const userName = users.find(u => u.id === userId)?.name ?? userId;
    const now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const entry = { id: Date.now(), user: userName, text: text.trim(), time: now };

    try {
      const instanceId   = await startProcess(userId, text.trim());
      const instance     = await pollInstance(instanceId, { signal: abortRef.current.signal });
      const confirmation = extractConfirmation(instance) ?? 'Активность зафиксирована';
      setHistory(h => [{ ...entry, confirmation }, ...h]);
      setStatus('ok');
      setText('');
    } catch (err) {
      setHistory(h => [{ ...entry, error: err.message }, ...h]);
      setStatus('error');
    } finally {
      setTimeout(() => setStatus('idle'), 3000);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a10', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif', padding: '24px 16px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f9fafb' }}>
            Sales Activity Logger
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Казахтелеком · AI-агент записи активностей
          </p>
        </div>

        {/* Input card */}
        <div style={{ background: '#111118', border: '1px solid #27272a', borderRadius: 12, padding: 20, marginBottom: 20 }}>

          {/* User selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Продажник</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              style={{
                width: '100%', background: '#1c1c26', border: '1px solid #3f3f46',
                color: '#e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 14,
              }}
            >
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              {!users.length && <option value="">Загрузка...</option>}
            </select>
          </div>

          {/* Textarea */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>
              Активность <span style={{ color: '#4b5563' }}>(Ctrl+Enter для отправки)</span>
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Например: Позвонил Нурлану из Казмунайгаз, 20 минут, договорились о встрече..."
              rows={4}
              style={{
                width: '100%', background: '#1c1c26', border: '1px solid #3f3f46',
                color: '#e5e7eb', borderRadius: 8, padding: '10px 12px', fontSize: 14,
                resize: 'vertical', boxSizing: 'border-box', outline: 'none',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Send button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={handleSend}
              disabled={!text.trim() || !userId || status === 'sending'}
              style={{
                background: status === 'sending' ? '#374151' : '#2563eb',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '9px 22px', fontSize: 14, fontWeight: 600,
                cursor: status === 'sending' ? 'not-allowed' : 'pointer',
              }}
            >
              {status === 'sending' ? 'Отправка...' : 'Записать'}
            </button>
            <StatusBadge status={status} />
          </div>
        </div>

        {/* Examples */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Примеры:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => { setText(ex); textareaRef.current?.focus(); }}
                style={{
                  background: '#1c1c26', border: '1px solid #3f3f46', color: '#9ca3af',
                  borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                  maxWidth: 260, textAlign: 'left', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                title={ex}
              >
                {ex.slice(0, 40)}…
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
              История сессии ({history.length})
            </div>
            {history.map(item => <ConfirmCard key={item.id} item={item} />)}
          </div>
        )}

      </div>
    </div>
  );
}
