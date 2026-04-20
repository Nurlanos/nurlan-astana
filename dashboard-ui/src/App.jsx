import { useState, useEffect } from 'react';
import { getUsers } from './api';
import SalesDashboard from './SalesDashboard';
import ManagerDashboard from './ManagerDashboard';

export default function App() {
  const [role, setRole]       = useState('sales');
  const [users, setUsers]     = useState([]);
  const [userId, setUserId]   = useState('');

  useEffect(() => {
    getUsers().then(list => {
      setUsers(list);
      const first = list.find(u => u.role === 'sales');
      if (first) setUserId(first.id);
    }).catch(() => {});
  }, []);

  const salesUsers   = users.filter(u => u.role === 'sales');
  const selectedUser = users.find(u => u.id === userId) ?? null;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a10', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif' }}>

      {/* Top nav */}
      <div style={{ background: '#111118', borderBottom: '1px solid #27272a', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 24, height: 52 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#f9fafb', letterSpacing: '-0.02em' }}>
          Sales Dashboard
        </span>
        <span style={{ color: '#374151', fontSize: 12 }}>|</span>
        <span style={{ fontSize: 12, color: '#4b5563' }}>Казахтелеком</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {[
            { key: 'sales',   label: 'Продажник' },
            { key: 'manager', label: 'Менеджер' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setRole(key)} style={{
              background: role === key ? '#2563eb' : 'transparent',
              border: '1px solid ' + (role === key ? '#2563eb' : '#3f3f46'),
              color: role === key ? '#fff' : '#9ca3af',
              borderRadius: 7, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Sales: user selector */}
        {role === 'sales' && (
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 12, color: '#9ca3af' }}>Продажник:</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              style={{
                background: '#1c1c26', border: '1px solid #3f3f46', color: '#e5e7eb',
                borderRadius: 8, padding: '7px 12px', fontSize: 14,
              }}
            >
              {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        {role === 'sales'
          ? <SalesDashboard user={selectedUser} />
          : <ManagerDashboard />
        }
      </div>
    </div>
  );
}
