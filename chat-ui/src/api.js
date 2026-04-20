const CRM = import.meta.env.VITE_CRM_API ?? 'http://localhost:3000';

export async function getUsers() {
  const r = await fetch(`${CRM}/users?role=sales`);
  if (!r.ok) throw new Error('Не удалось загрузить список пользователей');
  return r.json();
}

export async function logActivity(userId, rawText) {
  const r = await fetch(`${CRM}/log-activity`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ user_id: userId, raw_text: rawText }),
  });
  if (!r.ok) throw new Error(`Ошибка записи активности: ${r.status}`);
  return r.json();
}
