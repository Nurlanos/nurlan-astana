import amqp from 'amqplib';
import {
  handleRecordCall,
  handleRecordMeeting,
  handleRecordProposal,
  handleUpdateDeal,
  handleCreateFollowup,
  handleConfirmChat,
} from './handlers.js';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://demo:demo@localhost:5672/';
const ZORROBPM_API = process.env.ZORROBPM_API ?? 'http://localhost:9092';

const ROUTES = {
  'zorrobpm.jobs.sales.record_call':     handleRecordCall,
  'zorrobpm.jobs.sales.record_meeting':  handleRecordMeeting,
  'zorrobpm.jobs.sales.record_proposal': handleRecordProposal,
  'zorrobpm.jobs.sales.update_deal':     handleUpdateDeal,
  'zorrobpm.jobs.sales.create_followup': handleCreateFollowup,
  'zorrobpm.jobs.sales.confirm_chat':    handleConfirmChat,
};

async function completeTask(taskId, variables) {
  const res = await fetch(`${ZORROBPM_API}/service-tasks/${taskId}/complete`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ variables }),
  });
  if (!res.ok) throw new Error(`complete ${taskId} → ${res.status}: ${await res.text()}`);
}

async function processMessage(queue, msg, ch) {
  let job;
  try {
    job = JSON.parse(msg.content.toString());
  } catch {
    console.error(`[crm] bad JSON on ${queue}`);
    ch.ack(msg);
    return;
  }

  const taskId = job.serviceTaskId ?? job.taskId;
  const { variables } = job;
  console.log(`[crm] ${queue.split('.').pop()} taskId=${taskId}`);

  const handler = ROUTES[queue];
  try {
    const resultVars = await handler(variables);
    await completeTask(taskId, resultVars);
    console.log(`[crm] ✓ ${queue.split('.').pop()} done`);
    ch.ack(msg);
  } catch (err) {
    console.error(`[crm] ✗ ${queue.split('.').pop()} error: ${err.message}`);
    // requeue once, then drop to avoid infinite loop
    const requeued = msg.fields.redelivered === false;
    ch.nack(msg, false, requeued);
  }
}

async function connect() {
  let conn;
  while (true) {
    try {
      conn = await amqp.connect(RABBITMQ_URL);
      break;
    } catch (err) {
      console.error(`[crm] RabbitMQ not ready, retry in 5s: ${err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  conn.on('error', err => { console.error('[crm] connection error:', err.message); process.exit(1); });
  conn.on('close', ()  => { console.error('[crm] connection closed, restarting'); process.exit(1); });

  const ch = await conn.createChannel();
  ch.prefetch(1);

  for (const queue of Object.keys(ROUTES)) {
    await ch.assertQueue(queue, { durable: true });
    ch.consume(queue, msg => msg && processMessage(queue, msg, ch));
    console.log(`[crm] subscribed: ${queue}`);
  }
}

connect();
