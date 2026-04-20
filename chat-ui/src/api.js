const BPM = import.meta.env.VITE_BPM_API ?? 'https://bpm.zorro.kt';
const CRM = import.meta.env.VITE_CRM_API ?? 'http://localhost:3000';

export async function getUsers() {
  const r = await fetch(`${CRM}/users?role=sales`);
  if (!r.ok) throw new Error('Не удалось загрузить список пользователей');
  return r.json();
}

export async function startProcess(userId, rawText) {
  const r = await fetch(`${BPM}/process-instances`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      processDefinitionKey: 'sales-activity-logger',
      variables: [
        { name: 'user_id',  value: userId,  type: 'STRING' },
        { name: 'raw_text', value: rawText, type: 'STRING' },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Ошибка запуска процесса: ${r.status}`);
  const data = await r.json();
  return data.id;
}

export async function pollInstance(instanceId, { signal } = {}) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Отменено');
    await new Promise(res => setTimeout(res, 1500));
    const r = await fetch(`${BPM}/process-instances/${instanceId}`, { signal });
    if (!r.ok) continue;
    const data = await r.json();
    if (data.status === 'COMPLETED' || data.completedAt) return data;
    if (data.status === 'FAILED') throw new Error('Процесс завершился с ошибкой');
  }
  throw new Error('Таймаут: процесс не завершился за 30 секунд');
}

export function extractConfirmation(instance) {
  const vars = instance.variables ?? [];
  if (Array.isArray(vars)) {
    return vars.find(v => v.name === 'confirmation_text')?.value ?? null;
  }
  return vars.confirmation_text ?? null;
}
