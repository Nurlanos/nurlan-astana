const USE_MOCK = process.env.ANTHROPIC_API_KEY ? false : true;

// ─── mock ────────────────────────────────────────────────────────────────────

const DEAL_WORDS     = /сделк|этап\s+воронк|перевёл.*этап|закрыл\s+сделк|выиграл|проиграл/i;
const CALL_WORDS     = /позвон|созвон|набрал|перезвон|звонок|звонил|телефон/i;
const MEETING_WORDS  = /встреч|переговор|совещани|встретил|провёл встреч|онлайн|zoom|teams/i;
const PROPOSAL_WORDS = /(?<![а-яё])кп(?![а-яё])|коммерческ|предложени|оффер|отправил письм|выслал/i;

const DURATION_RE = /(\d+(?:[.,]\d+)?)\s*(минут|мин|час|ч\b)/i;
const CLIENT_RE   = /(?:из|с|в|клиент[у]?|компани[ия])\s+([А-ЯA-Z«"'][\wА-Яа-яёA-Za-z\s\-«»"']+?)(?:\s+(?:по|на|для|об)\s|\s*[,.]|$)/i;

const STAGE_MAP = {
  квалиф: 'qualification', предложени: 'proposal',
  переговор: 'negotiation', закрыт: 'closed_won',
  проигр: 'closed_lost',   выигр: 'closed_won',
};

function mockParse(text) {
  let activity_type = 'unknown';
  if      (DEAL_WORDS.test(text))     activity_type = 'deal';
  else if (CALL_WORDS.test(text))     activity_type = 'call';
  else if (MEETING_WORDS.test(text))  activity_type = 'meeting';
  else if (PROPOSAL_WORDS.test(text)) activity_type = 'proposal';

  let duration_min = null;
  const dm = text.match(DURATION_RE);
  if (dm) {
    const n = parseFloat(dm[1].replace(',', '.'));
    duration_min = dm[2].startsWith('ч') ? Math.round(n * 60) : Math.round(n);
  }

  let client = null;
  const cm = text.match(CLIENT_RE);
  if (cm) client = cm[1].trim();

  // simple next_step extraction
  let next_step = null;
  if (/договорил|встреч[а-я]|перезвон|отправ|выслать|согласов/i.test(text)) {
    const ns = text.match(/договорил[ись]?\s+([^,.]+)/i)
            || text.match(/следующ[а-я]+\s+шаг[а-я]*[:\s]+([^,.]+)/i);
    if (ns) next_step = ns[1].trim();
  }

  let deal_stage = null;
  if (activity_type === 'deal') {
    for (const [kw, stage] of Object.entries(STAGE_MAP)) {
      if (new RegExp(kw, 'i').test(text)) { deal_stage = stage; break; }
    }
  }

  // try to extract result (last clause after last comma)
  const parts = text.split(/,\s*/);
  const result = parts.length > 1 ? parts[parts.length - 1].trim() : null;

  return { activity_type, client, activity_date: null, duration_min, result, next_step, deal_stage };
}

// ─── real Claude ─────────────────────────────────────────────────────────────

async function claudeParse(rawText) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { SYSTEM_PROMPT } = await import('./prompt.js');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rawText }],
  });

  const content = response.content[0]?.text ?? '';
  const json = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(json);
}

// ─── export ───────────────────────────────────────────────────────────────────

export async function parseActivity(rawText) {
  if (USE_MOCK) {
    console.log('[nlp] mock mode (no ANTHROPIC_API_KEY)');
    return mockParse(rawText);
  }
  try {
    return await claudeParse(rawText);
  } catch (err) {
    if (err.message?.includes('credit balance') || err.message?.includes('529') || err.status === 529) {
      console.warn('[nlp] Claude API unavailable, falling back to regex parser');
      return mockParse(rawText);
    }
    throw err;
  }
}
