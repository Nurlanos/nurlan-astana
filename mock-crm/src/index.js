import express from 'express';
import { randomUUID } from 'node:crypto';
import { createSeedData } from './seed.js';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const db = createSeedData();

// ─── helpers ────────────────────────────────────────────────────────────────

function planPct(userId, dateFrom, dateTo) {
  const user = db.users.find(u => u.id === userId);
  if (!user?.plan) return 0;

  const from = dateFrom ? new Date(dateFrom) : startOfDay(new Date());
  const to   = dateTo   ? new Date(dateTo)   : endOfDay(new Date());

  const acts = db.activities.filter(a => {
    const d = new Date(a.date);
    return a.user_id === userId && d >= from && d <= to;
  });

  const days = Math.max(1, Math.ceil((to - from) / 86400000));
  const calls     = acts.filter(a => a.type === 'call').length;
  const meetings  = acts.filter(a => a.type === 'meeting').length;
  const proposals = acts.filter(a => a.type === 'proposal').length;

  const callTarget     = user.plan.calls_per_day * days;
  const meetingTarget  = Math.ceil(user.plan.meetings_per_week * days / 7);
  const proposalTarget = Math.ceil(user.plan.proposals_per_week * days / 7);

  const total     = callTarget + meetingTarget + proposalTarget;
  const achieved  = Math.min(calls, callTarget) + Math.min(meetings, meetingTarget) + Math.min(proposals, proposalTarget);
  return total > 0 ? Math.round((achieved / total) * 100) : 0;
}

function statusColor(pct, total) {
  if (total === 0) return 'red';
  if (pct >= 80)  return 'green';
  if (pct >= 40)  return 'yellow';
  return 'red';
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// ─── POST /activities ────────────────────────────────────────────────────────

app.post('/activities', (req, res) => {
  const { user_id, type, client, date, duration_min, result, next_step, deal_stage } = req.body;
  if (!user_id || !type) return res.status(400).json({ error: 'user_id and type are required' });

  const activity = {
    id:           `act_${randomUUID().slice(0, 8)}`,
    user_id,
    type,
    client:       client ?? null,
    date:         date ?? new Date().toISOString(),
    duration_min: duration_min ?? null,
    result:       result ?? null,
    next_step:    next_step ?? null,
    deal_stage:   deal_stage ?? null,
    created_at:   new Date().toISOString(),
  };

  db.activities.push(activity);
  res.status(201).json({ id: activity.id, status: 'created' });
});

// ─── GET /activities/:userId ─────────────────────────────────────────────────

app.get('/activities/:userId', (req, res) => {
  const { userId } = req.params;
  const { date_from, date_to, type } = req.query;

  let items = db.activities.filter(a => a.user_id === userId);
  if (date_from) items = items.filter(a => new Date(a.date) >= new Date(date_from));
  if (date_to)   items = items.filter(a => new Date(a.date) <= new Date(date_to));
  if (type)      items = items.filter(a => a.type === type);

  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ total: items.length, items });
});

// ─── GET /activities/:userId/summary ─────────────────────────────────────────

app.get('/activities/:userId/summary', (req, res) => {
  const { userId } = req.params;
  const { period = 'day' } = req.query;

  const now  = new Date();
  const from = period === 'week'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1)
    : startOfDay(now);
  const to   = endOfDay(now);

  const acts = db.activities.filter(a => {
    const d = new Date(a.date);
    return a.user_id === userId && d >= from && d <= to;
  });

  const pct       = planPct(userId, from.toISOString(), to.toISOString());
  const openTasks = db.tasks.filter(t => t.user_id === userId && t.status === 'open').length;

  res.json({
    calls:        acts.filter(a => a.type === 'call').length,
    meetings:     acts.filter(a => a.type === 'meeting').length,
    proposals:    acts.filter(a => a.type === 'proposal').length,
    deal_updates: acts.filter(a => a.type === 'deal').length,
    plan_pct:     pct,
    open_tasks:   openTasks,
  });
});

// ─── GET /dashboard/team ─────────────────────────────────────────────────────

app.get('/dashboard/team', (req, res) => {
  const { date_from, date_to, team_id } = req.query;

  const from = date_from ? new Date(date_from) : startOfDay(new Date());
  const to   = date_to   ? new Date(date_to)   : endOfDay(new Date());

  let salesUsers = db.users.filter(u => u.role === 'sales');
  if (team_id) salesUsers = salesUsers.filter(u => u.team_id === team_id);

  const members = salesUsers.map(user => {
    const acts = db.activities.filter(a => {
      const d = new Date(a.date);
      return a.user_id === user.id && d >= from && d <= to;
    });

    const calls     = acts.filter(a => a.type === 'call').length;
    const meetings  = acts.filter(a => a.type === 'meeting').length;
    const proposals = acts.filter(a => a.type === 'proposal').length;
    const deals     = acts.filter(a => a.type === 'deal').length;
    const total     = acts.length;
    const pct       = planPct(user.id, from.toISOString(), to.toISOString());

    return {
      user_id:      user.id,
      name:         user.name,
      calls,
      meetings,
      proposals,
      deal_updates: deals,
      total,
      plan_pct:     pct,
      status:       statusColor(pct, total),
    };
  });

  res.json({ members });
});

// ─── POST /tasks ─────────────────────────────────────────────────────────────

app.post('/tasks', (req, res) => {
  const { user_id, activity_id, due_date, description } = req.body;
  if (!user_id || !description) return res.status(400).json({ error: 'user_id and description are required' });

  const task = {
    id:          `task_${randomUUID().slice(0, 8)}`,
    user_id,
    activity_id: activity_id ?? null,
    due_date:    due_date ?? null,
    description,
    status:      'open',
    created_at:  new Date().toISOString(),
  };

  db.tasks.push(task);
  res.status(201).json({ id: task.id, status: 'open' });
});

// ─── PUT /deals/:dealId/stage ─────────────────────────────────────────────────

app.put('/deals/:dealId/stage', (req, res) => {
  const { dealId } = req.params;
  const { stage, reason, user_id } = req.body;
  if (!stage) return res.status(400).json({ error: 'stage is required' });

  let deal = db.deals.find(d => d.id === dealId);
  if (!deal) {
    deal = { id: dealId, client: 'Unknown', stage, user_id: user_id ?? null, updated_at: new Date().toISOString() };
    db.deals.push(deal);
  } else {
    deal.stage      = stage;
    deal.updated_at = new Date().toISOString();
  }

  if (user_id) {
    const activity = {
      id:           `act_${randomUUID().slice(0, 8)}`,
      user_id,
      type:         'deal',
      client:       deal.client,
      date:         new Date().toISOString(),
      duration_min: null,
      result:       reason ?? `Этап изменён на ${stage}`,
      next_step:    null,
      deal_stage:   stage,
      created_at:   new Date().toISOString(),
    };
    db.activities.push(activity);
  }

  res.json({ deal_id: deal.id, stage: deal.stage, updated_at: deal.updated_at });
});

// ─── POST /notifications ──────────────────────────────────────────────────────

app.post('/notifications', (req, res) => {
  const { manager_id, message, type = 'info' } = req.body;
  if (!manager_id || !message) return res.status(400).json({ error: 'manager_id and message are required' });

  const notif = {
    notification_id: `notif_${randomUUID().slice(0, 8)}`,
    manager_id,
    message,
    type,
    created_at: new Date().toISOString(),
  };

  db.notifications.push(notif);
  res.json({ notification_id: notif.notification_id, sent: true });
});

// ─── GET /users/:userId ───────────────────────────────────────────────────────

app.get('/users/:userId', (req, res) => {
  const user = db.users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ─── GET /users ───────────────────────────────────────────────────────────────

app.get('/users', (req, res) => {
  const { role } = req.query;
  const users = role ? db.users.filter(u => u.role === role) : db.users;
  res.json(users);
});

// ─── healthcheck ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    counts: {
      users:         db.users.length,
      activities:    db.activities.length,
      deals:         db.deals.length,
      tasks:         db.tasks.length,
      notifications: db.notifications.length,
    },
  });
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`mock-crm listening on :${PORT}`));
