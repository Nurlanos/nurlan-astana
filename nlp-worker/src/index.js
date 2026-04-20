import amqp from 'amqplib';
import { parseActivity } from './nlp.js';

const RABBITMQ_URL  = process.env.RABBITMQ_URL  ?? 'amqp://demo:demo@localhost:5672/';
const ZORROBPM_API  = process.env.ZORROBPM_API  ?? 'http://localhost:9092';
const QUEUE         = 'zorrobpm.jobs.sales.nlp_parse';
const RETRY_DELAY   = 30_000;
const MAX_RETRIES   = 3;

async function completeTask(taskId, variables) {
  const res = await fetch(`${ZORROBPM_API}/service-tasks/${taskId}/complete`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`complete task ${taskId} failed: ${res.status} ${text}`);
  }
}

function buildVariables(parsed) {
  const vars = [
    { name: 'activity_type',  value: parsed.activity_type ?? 'unknown',    type: 'STRING' },
    { name: 'parse_error',    value: 'false',                               type: 'STRING' },
  ];

  if (parsed.client)        vars.push({ name: 'client',        value: parsed.client,                    type: 'STRING' });
  if (parsed.activity_date) vars.push({ name: 'activity_date', value: parsed.activity_date,             type: 'STRING' });
  if (parsed.duration_min)  vars.push({ name: 'duration_min',  value: String(parsed.duration_min),      type: 'LONG'   });
  if (parsed.result)        vars.push({ name: 'result',        value: parsed.result,                    type: 'STRING' });
  if (parsed.next_step)     vars.push({ name: 'next_step',     value: parsed.next_step,                 type: 'STRING' });
  if (parsed.deal_stage)    vars.push({ name: 'deal_stage',    value: parsed.deal_stage,                type: 'STRING' });

  return vars;
}

async function handleJob(job, ch, msg) {
  const { taskId, variables } = job;
  const rawText = variables?.raw_text ?? variables?.rawText ?? '';

  console.log(`[nlp] taskId=${taskId} text="${rawText.slice(0, 80)}"`);

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const parsed = await parseActivity(rawText);
      console.log(`[nlp] parsed:`, JSON.stringify(parsed));
      await completeTask(taskId, buildVariables(parsed));
      ch.ack(msg);
      return;
    } catch (err) {
      attempt++;
      console.error(`[nlp] attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }
    }
  }

  // все попытки исчерпаны — complete с флагом ошибки, чтобы процесс не завис
  try {
    await completeTask(taskId, [
      { name: 'activity_type', value: 'unknown', type: 'STRING' },
      { name: 'parse_error',   value: 'true',    type: 'STRING' },
    ]);
  } catch (_) { /* ignore */ }
  ch.ack(msg);
}

async function connect() {
  let conn;
  while (true) {
    try {
      conn = await amqp.connect(RABBITMQ_URL);
      break;
    } catch (err) {
      console.error(`[nlp] RabbitMQ not ready, retry in 5s: ${err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  conn.on('error', err => { console.error('[nlp] connection error:', err.message); process.exit(1); });
  conn.on('close', ()  => { console.error('[nlp] connection closed, restarting'); process.exit(1); });

  const ch = await conn.createChannel();
  ch.prefetch(1);
  await ch.assertQueue(QUEUE, { durable: true });

  console.log(`[nlp] waiting for jobs on ${QUEUE}`);

  ch.consume(QUEUE, async (msg) => {
    if (!msg) return;
    let job;
    try {
      job = JSON.parse(msg.content.toString());
    } catch (err) {
      console.error('[nlp] bad message JSON:', err.message);
      ch.ack(msg);
      return;
    }
    await handleJob(job, ch, msg);
  });
}

connect();
