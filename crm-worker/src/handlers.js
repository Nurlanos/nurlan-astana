const CRM = process.env.MOCK_CRM_URL ?? 'http://localhost:3000';

async function crmPost(path, body) {
  const res = await fetch(`${CRM}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CRM ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function crmPut(path, body) {
  const res = await fetch(`${CRM}${path}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`CRM ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function v(variables, name) {
  if (!variables) return null;
  // variables может быть объектом {name: value} или массивом [{name, value}]
  if (Array.isArray(variables)) {
    return variables.find(x => x.name === name)?.value ?? null;
  }
  return variables[name] ?? null;
}

function buildActivityBody(vars, type) {
  return {
    user_id:      v(vars, 'user_id'),
    type,
    client:       v(vars, 'client'),
    date:         v(vars, 'activity_date') ?? new Date().toISOString(),
    duration_min: v(vars, 'duration_min') ? Number(v(vars, 'duration_min')) : null,
    result:       v(vars, 'result'),
    next_step:    v(vars, 'next_step'),
    deal_stage:   v(vars, 'deal_stage'),
  };
}

function buildConfirmation(vars, activityId) {
  const typeLabel = { call: 'Звонок', meeting: 'Встреча', proposal: 'КП', deal: 'Сделка', unknown: 'Активность' };
  const type = v(vars, 'activity_type') ?? 'unknown';
  const lines = [`✓ ${typeLabel[type] ?? 'Активность'} зафиксирован(а) [${activityId ?? '—'}]`];
  if (v(vars, 'client'))        lines.push(`Клиент: ${v(vars, 'client')}`);
  if (v(vars, 'activity_date')) lines.push(`Дата: ${v(vars, 'activity_date').replace('T', ' ').slice(0, 16)}`);
  if (v(vars, 'duration_min'))  lines.push(`Длительность: ${v(vars, 'duration_min')} мин`);
  if (v(vars, 'result'))        lines.push(`Итог: ${v(vars, 'result')}`);
  if (v(vars, 'next_step'))     lines.push(`Следующий шаг: ${v(vars, 'next_step')}`);
  return lines.join('\n');
}

// ─── handlers ────────────────────────────────────────────────────────────────

export async function handleRecordCall(vars) {
  const data = await crmPost('/activities', buildActivityBody(vars, 'call'));
  return [{ name: 'activity_id', value: data.id, type: 'STRING' }];
}

export async function handleRecordMeeting(vars) {
  const data = await crmPost('/activities', buildActivityBody(vars, 'meeting'));
  return [{ name: 'activity_id', value: data.id, type: 'STRING' }];
}

export async function handleRecordProposal(vars) {
  const data = await crmPost('/activities', buildActivityBody(vars, 'proposal'));
  return [{ name: 'activity_id', value: data.id, type: 'STRING' }];
}

export async function handleUpdateDeal(vars) {
  const dealId = v(vars, 'deal_id') ?? 'deal_001';
  const data = await crmPut(`/deals/${dealId}/stage`, {
    stage:   v(vars, 'deal_stage') ?? 'qualification',
    reason:  v(vars, 'result'),
    user_id: v(vars, 'user_id'),
  });
  return [{ name: 'activity_id', value: data.deal_id, type: 'STRING' }];
}

export async function handleCreateFollowup(vars) {
  const data = await crmPost('/tasks', {
    user_id:     v(vars, 'user_id'),
    activity_id: v(vars, 'activity_id'),
    due_date:    null,
    description: v(vars, 'next_step') ?? 'Follow-up',
  });
  return [{ name: 'task_id', value: data.id, type: 'STRING' }];
}

export async function handleConfirmChat(vars) {
  const activityId = v(vars, 'activity_id');
  const text = buildConfirmation(vars, activityId);
  return [{ name: 'confirmation_text', value: text, type: 'STRING' }];
}
