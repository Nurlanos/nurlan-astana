#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API = process.env.ZORROBPM_API ?? 'https://bpm.zorro.kt';
const file = process.argv[2] ?? 'sales-activity.bpmn';
const bpmn = readFileSync(resolve(file), 'utf8');

console.log(`Deploying ${file} → ${API} ...`);

const res = await fetch(`${API}/process-definitions`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ bpmn }),
});

const body = await res.json();

if (!res.ok) {
  console.error('Deploy failed:', res.status, JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log('✓ Deployed:');
console.log(`  id:      ${body.id}`);
console.log(`  key:     ${body.key}`);
console.log(`  version: ${body.version}`);
