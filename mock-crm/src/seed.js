import { randomUUID } from 'node:crypto';

export function createSeedData() {
  const users = [
    { id: 'usr_001', name: 'Айгерим Сейткали',  role: 'sales',   team_id: 'team_01', plan: { calls_per_day: 5, meetings_per_week: 3, proposals_per_week: 2 } },
    { id: 'usr_002', name: 'Данияр Ахметов',     role: 'sales',   team_id: 'team_01', plan: { calls_per_day: 5, meetings_per_week: 3, proposals_per_week: 2 } },
    { id: 'usr_003', name: 'Маржан Нурланова',   role: 'sales',   team_id: 'team_01', plan: { calls_per_day: 5, meetings_per_week: 3, proposals_per_week: 2 } },
    { id: 'usr_004', name: 'Серик Байжанов',     role: 'sales',   team_id: 'team_02', plan: { calls_per_day: 5, meetings_per_week: 3, proposals_per_week: 2 } },
    { id: 'usr_005', name: 'Гульнара Касымова',  role: 'sales',   team_id: 'team_02', plan: { calls_per_day: 5, meetings_per_week: 3, proposals_per_week: 2 } },
    { id: 'usr_006', name: 'Нурлан Джаксыбеков', role: 'sales',   team_id: 'team_02', plan: { calls_per_day: 5, meetings_per_week: 3, proposals_per_week: 2 } },
    { id: 'mgr_001', name: 'Асель Турганова',    role: 'manager', team_id: 'team_01', plan: null },
    { id: 'mgr_002', name: 'Болат Сейткалиев',   role: 'manager', team_id: 'team_02', plan: null },
  ];

  const clients = [
    'Казмунайгаз', 'Самрук-Энерго', 'Казпочта', 'Тенгизшевройл',
    'Казатомпром', 'Air Astana', 'Казахтелеком', 'БТА Банк',
    'Народный Банк', 'Forte Bank',
  ];

  const callResults   = ['заинтересован, ждёт КП', 'отказался', 'перезвонит завтра', 'договорились о встрече', 'нет ответа'];
  const meetingResults = ['подписали соглашение', 'запросили детали', 'перенесли на следующую неделю', 'согласовали условия'];
  const proposalResults = ['отправлено на согласование', 'принято', 'требует доработки'];
  const dealStages    = ['qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

  const now = new Date();
  const activities = [];
  const salesUsers = users.filter(u => u.role === 'sales');

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    if (date.getDay() === 0 || date.getDay() === 6) continue; // пропускаем выходные

    for (const user of salesUsers) {
      const callsCount     = Math.floor(Math.random() * 4) + 2;
      const meetingsCount  = dayOffset < 3 ? Math.floor(Math.random() * 2) : 0;
      const proposalCount  = Math.random() > 0.6 ? 1 : 0;

      for (let i = 0; i < callsCount; i++) {
        const h = 9 + Math.floor(Math.random() * 8);
        const m = Math.floor(Math.random() * 60);
        date.setHours(h, m, 0, 0);
        activities.push({
          id:           `act_${randomUUID().slice(0, 8)}`,
          user_id:      user.id,
          type:         'call',
          client:       clients[Math.floor(Math.random() * clients.length)],
          date:         date.toISOString(),
          duration_min: [5, 10, 15, 20, 30][Math.floor(Math.random() * 5)],
          result:       callResults[Math.floor(Math.random() * callResults.length)],
          next_step:    Math.random() > 0.5 ? 'перезвонить через 3 дня' : null,
          deal_stage:   null,
          created_at:   date.toISOString(),
        });
      }

      for (let i = 0; i < meetingsCount; i++) {
        const h = 10 + Math.floor(Math.random() * 6);
        date.setHours(h, 0, 0, 0);
        activities.push({
          id:           `act_${randomUUID().slice(0, 8)}`,
          user_id:      user.id,
          type:         'meeting',
          client:       clients[Math.floor(Math.random() * clients.length)],
          date:         date.toISOString(),
          duration_min: [30, 45, 60, 90][Math.floor(Math.random() * 4)],
          result:       meetingResults[Math.floor(Math.random() * meetingResults.length)],
          next_step:    'отправить протокол',
          deal_stage:   null,
          created_at:   date.toISOString(),
        });
      }

      for (let i = 0; i < proposalCount; i++) {
        date.setHours(11, 0, 0, 0);
        activities.push({
          id:           `act_${randomUUID().slice(0, 8)}`,
          user_id:      user.id,
          type:         'proposal',
          client:       clients[Math.floor(Math.random() * clients.length)],
          date:         date.toISOString(),
          duration_min: null,
          result:       proposalResults[Math.floor(Math.random() * proposalResults.length)],
          next_step:    'ждать ответа',
          deal_stage:   null,
          created_at:   date.toISOString(),
        });
      }
    }
  }

  const deals = [
    { id: 'deal_001', client: 'Казмунайгаз',    stage: 'negotiation', user_id: 'usr_001', updated_at: new Date().toISOString() },
    { id: 'deal_002', client: 'Самрук-Энерго',  stage: 'proposal',    user_id: 'usr_002', updated_at: new Date().toISOString() },
    { id: 'deal_003', client: 'Air Astana',      stage: 'qualification',user_id: 'usr_003', updated_at: new Date().toISOString() },
    { id: 'deal_004', client: 'Казатомпром',     stage: 'closed_won',  user_id: 'usr_004', updated_at: new Date().toISOString() },
    { id: 'deal_005', client: 'Народный Банк',   stage: 'negotiation', user_id: 'usr_005', updated_at: new Date().toISOString() },
  ];

  const tasks = salesUsers.slice(0, 4).map((user, i) => ({
    id:          `task_${String(i + 1).padStart(3, '0')}`,
    user_id:     user.id,
    activity_id: activities.find(a => a.user_id === user.id)?.id ?? null,
    due_date:    new Date(Date.now() + (i + 1) * 86400000).toISOString().slice(0, 10),
    description: ['Перезвонить и уточнить решение', 'Отправить доп. материалы', 'Согласовать встречу', 'Подготовить КП'][i],
    status:      'open',
    created_at:  new Date().toISOString(),
  }));

  const notifications = [];

  return { users, activities, deals, tasks, notifications };
}
