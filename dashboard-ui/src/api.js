const CRM = import.meta.env.VITE_CRM_API ?? 'http://localhost:3000';

function isoDay(d) { return d.toISOString().slice(0, 10); }

export async function getUsers() {
  const r = await fetch(`${CRM}/users`);
  return r.json();
}

export async function getSummary(userId, period) {
  const r = await fetch(`${CRM}/activities/${userId}/summary?period=${period}`);
  return r.json();
}

export async function getActivities(userId, dateFrom, dateTo) {
  const r = await fetch(`${CRM}/activities/${userId}?date_from=${dateFrom}&date_to=${dateTo}`);
  return r.json();
}

export async function getTeamDashboard(dateFrom, dateTo, teamId) {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  if (teamId) params.set('team_id', teamId);
  const r = await fetch(`${CRM}/dashboard/team?${params}`);
  return r.json();
}

export function todayRange() {
  const now = new Date();
  return { from: isoDay(now) + 'T00:00:00', to: isoDay(now) + 'T23:59:59' };
}

export function weekRange() {
  const now  = new Date();
  const mon  = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); mon.setHours(0,0,0,0);
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return { from: mon.toISOString(), to: sun.toISOString() };
}
