# TRD: AI Sales Activity Logger
**Продукт:** AI-агент для записи активности продажника  
**Компания:** Казахтелеком  
**Формат:** Хакатон MVP  
**Версия:** 1.0  
**Дата:** 2026-04-20  
**Статус:** Draft  

---

## Содержание

1. [Обзор системы](#1-обзор-системы)
2. [Компоненты и ответственность](#2-компоненты-и-ответственность)
3. [Стек технологий](#3-стек-технологий)
4. [Сетевая топология и деплой](#4-сетевая-топология-и-деплой)
5. [BPMN-процесс (ZorroBPM)](#5-bpmn-процесс-zorrobpm)
6. [NLP Worker (Claude API)](#6-nlp-worker-claude-api)
7. [Mock CRM Service](#7-mock-crm-service)
8. [CRM Workers](#8-crm-workers)
9. [Чат-бот (фронтенд)](#9-чат-бот-фронтенд)
10. [Дашборд (фронтенд)](#10-дашборд-фронтенд)
11. [Схемы данных](#11-схемы-данных)
12. [Интеграционные контракты](#12-интеграционные-контракты)
13. [Нефункциональные требования](#13-нефункциональные-требования)
14. [Конфигурация и секреты](#14-конфигурация-и-секреты)
15. [Критерии готовности](#15-критерии-готовности)

---

## 1. Обзор системы

### Назначение

Система снижает время ввода активностей продажника с 30–40 мин/день до < 1 мин/событие за счёт NLP-парсинга свободного текста и автоматической записи через оркестратор ZorroBPM.

### Happy Path (сквозной поток)

```
[Продажник] пишет текст в чат-боте
      ↓
[Chat UI] → POST /process-instances → ZorroBPM
      ↓
[ZorroBPM] стартует процесс sales-activity-logger
      ↓
[serviceTask: sales.nlp_parse] → RabbitMQ → NLP Worker
      ↓
[NLP Worker] → Claude API → структурированные сущности → complete task
      ↓
[ZorroBPM] exclusiveGateway → ветка по типу активности
      ↓
[serviceTask: sales.record_*] → RabbitMQ → CRM Worker
      ↓
[CRM Worker] → POST /activities (Mock CRM) → complete task
      ↓ (опционально)
[serviceTask: sales.create_followup] → POST /tasks (Mock CRM)
      ↓
[serviceTask: sales.confirm_chat] → переменная confirmation → ZorroBPM end
      ↓
[Chat UI] polling → instance COMPLETED → показать подтверждение
```

---

## 2. Компоненты и ответственность

| Компонент | Тип | Домен | Ответственность |
|---|---|---|---|
| `sales-activity.bpmn` | BPMN-процесс | ZorroBPM | Оркестрация всего потока |
| `nlp-worker` | Docker-сервис | zorrobpm_default | NLP-парсинг через Claude API |
| `crm-worker` | Docker-сервис | zorrobpm_default | Запись активностей в Mock CRM |
| `mock-crm` | Docker-сервис | dokploy-network | Синтетическое CRM-хранилище |
| `chat-ui` | SPA (Vite/React) | dokploy-network | Ввод текста, запуск процесса, подтверждение |
| `dashboard-ui` | SPA (Vite/React) | dokploy-network | Дашборд для 2 ролей |

---

## 3. Стек технологий

| Слой | Решение | Версия |
|---|---|---|
| Оркестратор | ZorroBPM (Camunda-совместимый) | — |
| Очереди | RabbitMQ | 4.0.7 |
| LLM | Claude API, модель `claude-sonnet-4-6` | — |
| Workers | Node.js | 20 LTS |
| Mock CRM | Node.js + Express | 4.x |
| Фронтенд | React + Vite | React 18, Vite 5 |
| БД воркеров | Нет (stateless) | — |
| БД Mock CRM | In-memory (JS Map) | — |
| Прокси / TLS | Traefik (уже развёрнут на стенде) | — |
| Контейнеризация | Docker Compose | — |

---

## 4. Сетевая топология и деплой

### Сети Docker

| Сеть | Назначение |
|---|---|
| `zorrobpm_default` | Внутренняя: RabbitMQ, ZorroBPM API, воркеры |
| `dokploy-network` | Внешняя: Traefik, фронты, Mock CRM |

### Домены (wildcard `*.zorro.kt` уже покрыт TLS)

| Сервис | URL |
|---|---|
| ZorroBPM REST API | `https://bpm.zorro.kt/` |
| ZorroBPM Admin UI | `https://admin-bpm.zorro.kt/` |
| Mock CRM | `https://crm.zorro.kt/` |
| Chat-bot UI | `https://chat.zorro.kt/` |
| Dashboard UI | `https://dashboard.zorro.kt/` |

### docker-compose для новых сервисов

```yaml
# docker-compose.yaml — общий шаблон для воркеров + фронтов
services:

  nlp-worker:
    build: ./nlp-worker
    environment:
      RABBITMQ_URL: amqp://demo:demo@rabbitmq:5672/
      ZORROBPM_API: http://api
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    networks: [zorrobpm_default]
    restart: unless-stopped

  crm-worker:
    build: ./crm-worker
    environment:
      RABBITMQ_URL: amqp://demo:demo@rabbitmq:5672/
      ZORROBPM_API: http://api
      MOCK_CRM_URL: https://crm.zorro.kt
    networks: [zorrobpm_default, dokploy-network]
    restart: unless-stopped

  mock-crm:
    build: ./mock-crm
    networks: [dokploy-network]
    labels:
      - traefik.enable=true
      - traefik.http.routers.mock-crm.rule=Host(`crm.zorro.kt`)
      - traefik.http.routers.mock-crm.entrypoints=websecure
      - traefik.http.services.mock-crm.loadbalancer.server.port=3000

  chat-ui:
    build: ./chat-ui
    networks: [dokploy-network]
    labels:
      - traefik.enable=true
      - traefik.http.routers.chat-ui.rule=Host(`chat.zorro.kt`)
      - traefik.http.routers.chat-ui.entrypoints=websecure
      - traefik.http.services.chat-ui.loadbalancer.server.port=80

  dashboard-ui:
    build: ./dashboard-ui
    networks: [dokploy-network]
    labels:
      - traefik.enable=true
      - traefik.http.routers.dashboard-ui.rule=Host(`dashboard.zorro.kt`)
      - traefik.http.routers.dashboard-ui.entrypoints=websecure
      - traefik.http.services.dashboard-ui.loadbalancer.server.port=80

networks:
  zorrobpm_default:
    external: true
  dokploy-network:
    external: true
```

---

## 5. BPMN-процесс (ZorroBPM)

### Файл: `sales-activity.bpmn`

Process key: `sales-activity-logger`

### Элементы процесса

| ID | Тип | Название | Job Type / Условие |
|---|---|---|---|
| `start` | startEvent | Новая активность | — |
| `task_nlp` | serviceTask | NLP Parse | `sales.nlp_parse` |
| `gw_type` | exclusiveGateway | Тип активности? | — |
| `task_call` | serviceTask | Записать звонок | `sales.record_call` |
| `task_meeting` | serviceTask | Записать встречу | `sales.record_meeting` |
| `task_proposal` | serviceTask | Записать КП | `sales.record_proposal` |
| `task_deal` | serviceTask | Обновить сделку | `sales.update_deal` |
| `gw_followup` | exclusiveGateway | Нужен follow-up? | — |
| `task_followup` | serviceTask | Создать задачу | `sales.create_followup` |
| `task_confirm` | serviceTask | Подтвердить в чате | `sales.confirm_chat` |
| `end` | endEvent | Завершено | — |

### Условия на sequenceFlow от `gw_type`

```
activity_type == "call"     → task_call
activity_type == "meeting"  → task_meeting
activity_type == "proposal" → task_proposal
activity_type == "deal"     → task_deal
```

Условие на `gw_followup`:
```
next_step != null && next_step != "" → task_followup
иначе → task_confirm
```

### Входные переменные процесса

| Имя | Тип | Описание |
|---|---|---|
| `raw_text` | STRING | Исходный текст от продажника |
| `user_id` | STRING | ID продажника |

### Переменные, устанавливаемые в процессе (NLP Worker)

| Имя | Тип | Описание |
|---|---|---|
| `activity_type` | STRING | call / meeting / proposal / deal |
| `client` | STRING | Название клиента или компании |
| `activity_date` | STRING | ISO 8601 дата/время |
| `duration_min` | LONG | Длительность в минутах (для call/meeting) |
| `result` | STRING | Итог активности |
| `next_step` | STRING | Следующий шаг (если есть) |
| `deal_stage` | STRING | Новый этап сделки (для типа deal) |
| `activity_id` | STRING | ID записи из Mock CRM (после сохранения) |
| `confirmation_text` | STRING | Текст подтверждения для чата |

### Деплой процесса

```bash
BPMN_XML=$(cat sales-activity.bpmn | jq -Rs .)
curl -X POST https://bpm.zorro.kt/process-definitions \
  -H 'Content-Type: application/json' \
  -d "{\"bpmn\": $BPMN_XML}"
```

---

## 6. NLP Worker (Claude API)

### Очередь

`zorrobpm.jobs.sales.nlp_parse`

### Алгоритм

1. Получить сообщение из очереди (JSON)
2. Извлечь `variables.raw_text` и `variables.user_id`
3. Вызвать Claude API с system-промптом и `raw_text`
4. Распарсить JSON-ответ в структурированные сущности
5. Завершить service task: `POST /service-tasks/{taskId}/complete` с переменными

### System-промпт

```
Ты — ассистент по обработке активностей продажников.
Твоя задача: извлечь структурированные данные из текста на русском или казахском языке.

Верни ТОЛЬКО валидный JSON в точно таком формате:
{
  "activity_type": "call" | "meeting" | "proposal" | "deal",
  "client": "<название компании или имя клиента, null если не указан>",
  "activity_date": "<ISO 8601, например 2026-04-20T14:30:00, null если не указана>",
  "duration_min": <число минут или null>,
  "result": "<итог активности или null>",
  "next_step": "<следующий шаг или null>",
  "deal_stage": "<этап сделки или null, только для типа deal>"
}

Правила:
- activity_type обязателен, определяй по смыслу текста
- Относительные даты ("сегодня", "вчера", "завтра") разреши относительно текущей даты
- Если поле не упомянуто — верни null, не придумывай
- Не добавляй пояснений, только JSON
```

### Параметры вызова Claude API

```javascript
{
  model: "claude-sonnet-4-6",
  max_tokens: 512,
  messages: [
    { role: "user", content: rawText }
  ],
  system: SYSTEM_PROMPT
}
```

### Обработка ошибок

| Ситуация | Действие |
|---|---|
| Claude вернул невалидный JSON | Retry 1 раз с тем же запросом, затем complete task с `parse_error=true` |
| `activity_type` не определён | complete task с `activity_type="unknown"`, процесс идёт на default-ветку |
| Таймаут Claude API (> 10 сек) | Nack сообщения, RabbitMQ повторит через 30 сек (max 3 retry) |
| Любое исключение | ch.nack(msg, false, true) — вернуть в очередь |

### Структура сообщения из RabbitMQ

```json
{
  "taskId": "uuid",
  "processInstanceId": "uuid",
  "job": "sales.nlp_parse",
  "variables": {
    "raw_text": "позвонил Нурлану из Казмунайгаз, 20 минут, договорились о встрече в пятницу",
    "user_id": "usr_001"
  }
}
```

---

## 7. Mock CRM Service

### Технология

Node.js + Express, in-memory хранилище, синтетические данные при старте.

### Порт

3000 (внутри контейнера)

### Синтетические данные при инициализации

- 6 продажников (users): `usr_001` … `usr_006`, роль `sales`
- 2 менеджера (users): `mgr_001`, `mgr_002`, роль `manager`
- 50 активностей за последние 7 дней, равномерно по продажникам и типам
- 10 открытых follow-up задач
- 5 сделок в разных этапах воронки

### API эндпоинты

#### `POST /activities`

Создать активность.

**Тело запроса:**
```json
{
  "user_id": "usr_001",
  "type": "call",
  "client": "Казмунайгаз",
  "date": "2026-04-20T14:30:00",
  "duration_min": 20,
  "result": "договорились о встрече",
  "next_step": "встреча в пятницу"
}
```

**Ответ 201:**
```json
{
  "id": "act_001",
  "status": "created"
}
```

---

#### `GET /activities/{userId}`

Список активностей за период.

**Query params:** `date_from` (ISO), `date_to` (ISO), `type` (опц.)

**Ответ 200:**
```json
{
  "total": 12,
  "items": [
    {
      "id": "act_001",
      "type": "call",
      "client": "Казмунайгаз",
      "date": "2026-04-20T14:30:00",
      "duration_min": 20,
      "result": "договорились о встрече"
    }
  ]
}
```

---

#### `GET /activities/{userId}/summary`

Личная сводка продажника.

**Query params:** `period` = `day` | `week`

**Ответ 200:**
```json
{
  "calls": 3,
  "meetings": 1,
  "proposals": 2,
  "deal_updates": 0,
  "plan_pct": 75,
  "open_tasks": 2
}
```

---

#### `GET /dashboard/team`

Командная сводка для менеджера.

**Query params:** `date_from`, `date_to`, `team_id` (опц.)

**Ответ 200:**
```json
{
  "members": [
    {
      "user_id": "usr_001",
      "name": "Айгерим Сейткали",
      "calls": 5,
      "meetings": 2,
      "proposals": 1,
      "deal_updates": 1,
      "total": 9,
      "plan_pct": 90,
      "status": "green"
    }
  ]
}
```

`status`: `green` (plan_pct ≥ 80), `yellow` (plan_pct 40–79), `red` (plan_pct < 40 или total == 0)

---

#### `POST /tasks`

Создать follow-up задачу.

**Тело:**
```json
{
  "user_id": "usr_001",
  "activity_id": "act_001",
  "due_date": "2026-04-25",
  "description": "Провести встречу с Казмунайгаз"
}
```

**Ответ 201:**
```json
{
  "id": "task_042",
  "status": "open"
}
```

---

#### `PUT /deals/{dealId}/stage`

Обновить этап сделки.

**Тело:**
```json
{
  "stage": "negotiation",
  "reason": "клиент запросил КП",
  "user_id": "usr_001"
}
```

**Ответ 200:**
```json
{
  "deal_id": "deal_005",
  "stage": "negotiation",
  "updated_at": "2026-04-20T15:00:00"
}
```

---

#### `POST /notifications`

Отправить уведомление менеджеру.

**Тело:**
```json
{
  "manager_id": "mgr_001",
  "message": "Продажник usr_003 не внёс активностей за сегодня",
  "type": "alert"
}
```

**Ответ 200:**
```json
{
  "notification_id": "notif_007",
  "sent": true
}
```

---

#### `GET /users/{userId}`

Профиль пользователя.

**Ответ 200:**
```json
{
  "id": "usr_001",
  "name": "Айгерим Сейткали",
  "role": "sales",
  "team_id": "team_01",
  "plan": {
    "calls_per_day": 5,
    "meetings_per_week": 3,
    "proposals_per_week": 2
  }
}
```

---

## 8. CRM Workers

Один сервис (`crm-worker`) с отдельными handler-функциями на каждый job type.

### Очереди и обработчики

| Очередь | Handler | Действие |
|---|---|---|
| `zorrobpm.jobs.sales.record_call` | `handleRecordCall` | POST /activities (type=call) |
| `zorrobpm.jobs.sales.record_meeting` | `handleRecordMeeting` | POST /activities (type=meeting) |
| `zorrobpm.jobs.sales.record_proposal` | `handleRecordProposal` | POST /activities (type=proposal) |
| `zorrobpm.jobs.sales.update_deal` | `handleUpdateDeal` | PUT /deals/{dealId}/stage |
| `zorrobpm.jobs.sales.create_followup` | `handleCreateFollowup` | POST /tasks |
| `zorrobpm.jobs.sales.confirm_chat` | `handleConfirmChat` | Формирует `confirmation_text`, complete task |

### `handleConfirmChat`

Генерирует текст подтверждения из переменных процесса без вызова внешних сервисов:

```javascript
function buildConfirmation(vars) {
  const typeLabel = { call: 'Звонок', meeting: 'Встреча', proposal: 'КП', deal: 'Сделка' };
  return [
    `✓ ${typeLabel[vars.activity_type]} зафиксирован`,
    vars.client     ? `Клиент: ${vars.client}` : null,
    vars.activity_date ? `Дата: ${formatDate(vars.activity_date)}` : null,
    vars.duration_min  ? `Длительность: ${vars.duration_min} мин` : null,
    vars.result        ? `Итог: ${vars.result}` : null,
    vars.next_step     ? `Следующий шаг: ${vars.next_step}` : null,
  ].filter(Boolean).join('\n');
}
```

---

## 9. Чат-бот (фронтенд)

### Технология

React + Vite, без авторизации, user_id выбирается из выпадающего списка (данные из `GET /users`).

### Экраны

**Главный экран:**
- Выпадающий список: выбрать продажника (данные из `GET /users`)
- Текстовое поле + кнопка "Отправить"
- Блок истории: последние 5 подтверждений текущей сессии

### Алгоритм отправки

```
1. POST https://bpm.zorro.kt/process-instances
   body: {
     processDefinitionKey: "sales-activity-logger",
     variables: [
       { name: "raw_text", value: inputText, type: "STRING" },
       { name: "user_id",  value: selectedUserId, type: "STRING" }
     ]
   }
   → получить instanceId

2. Polling каждые 1500 мс:
   GET https://bpm.zorro.kt/process-instances/{instanceId}
   Пока status != "COMPLETED" && status != "FAILED"
   Таймаут: 30 сек

3. При COMPLETED:
   - Показать confirmation_text из variables процесса
   - Добавить в историю сессии

4. При FAILED или таймауте:
   - Показать сообщение об ошибке
```

### Получение `confirmation_text` из instance

```javascript
const instance = await fetch(`${BPM_API}/process-instances/${instanceId}`).then(r => r.json());
const confirmVar = instance.variables?.find(v => v.name === 'confirmation_text');
const text = confirmVar?.value ?? 'Активность записана';
```

---

## 10. Дашборд (фронтенд)

### Технология

React + Vite, два режима: Sales (продажник) и Manager (менеджер), переключатель роли сверху.

### Режим: Продажник

**Данные:** `GET /activities/{userId}/summary?period=day` и `?period=week`

**UI-блоки:**
- 4 карточки-счётчика: Звонки / Встречи / КП / Обновления сделок (за день)
- Прогресс-бар % выполнения плана
- Таблица последних 10 активностей (`GET /activities/{userId}?date_from=...`)
- Список открытых задач (`GET /activities/{userId}?type=task`)

### Режим: Менеджер

**Данные:** `GET /dashboard/team?date_from=...&date_to=...`

**UI-блоки:**
- Фильтры: дата (сегодня / неделя / произвольный диапазон), тип активности
- Таблица команды: имя, звонки, встречи, КП, итого, % плана, статус (цвет)
- Алерт-панель: продажники со статусом `red` (нет активностей за день)

### Цветовая индикация статуса

| `plan_pct` | Цвет | Смысл |
|---|---|---|
| ≥ 80 | Зелёный | Норма |
| 40–79 | Жёлтый | Риск |
| < 40 | Красный | Отставание |
| 0 активностей | Красный | Не работал |

### Auto-refresh

Дашборд автоматически обновляет данные каждые 30 секунд.

---

## 11. Схемы данных

### Activity

```typescript
interface Activity {
  id: string;              // "act_001"
  user_id: string;         // "usr_001"
  type: 'call' | 'meeting' | 'proposal' | 'deal';
  client: string | null;
  date: string;            // ISO 8601
  duration_min: number | null;
  result: string | null;
  next_step: string | null;
  deal_stage: string | null;
  created_at: string;      // ISO 8601
}
```

### User

```typescript
interface User {
  id: string;
  name: string;
  role: 'sales' | 'manager';
  team_id: string;
  plan: {
    calls_per_day: number;
    meetings_per_week: number;
    proposals_per_week: number;
  };
}
```

### Task

```typescript
interface Task {
  id: string;
  user_id: string;
  activity_id: string;
  due_date: string;        // ISO 8601 date
  description: string;
  status: 'open' | 'done';
  created_at: string;
}
```

### NLPResult (внутренний тип воркера)

```typescript
interface NLPResult {
  activity_type: 'call' | 'meeting' | 'proposal' | 'deal' | 'unknown';
  client: string | null;
  activity_date: string | null;
  duration_min: number | null;
  result: string | null;
  next_step: string | null;
  deal_stage: string | null;
}
```

---

## 12. Интеграционные контракты

### ZorroBPM: запуск процесса

```
POST https://bpm.zorro.kt/process-instances
Content-Type: application/json

{
  "processDefinitionKey": "sales-activity-logger",
  "variables": [
    { "name": "raw_text", "value": "...", "type": "STRING" },
    { "name": "user_id",  "value": "usr_001", "type": "STRING" }
  ]
}
```

### ZorroBPM: завершение service task

```
POST https://bpm.zorro.kt/service-tasks/{taskId}/complete
Content-Type: application/json

{
  "variables": [
    { "name": "activity_type", "value": "call", "type": "STRING" },
    { "name": "client",        "value": "Казмунайгаз", "type": "STRING" },
    { "name": "activity_date", "value": "2026-04-20T14:30:00", "type": "STRING" },
    { "name": "duration_min",  "value": "20", "type": "LONG" },
    { "name": "result",        "value": "договорились о встрече", "type": "STRING" },
    { "name": "next_step",     "value": "встреча в пятницу", "type": "STRING" }
  ]
}
```

### RabbitMQ: сообщение job

```json
{
  "taskId": "uuid",
  "processInstanceId": "uuid",
  "processDefinitionId": "uuid",
  "job": "sales.nlp_parse",
  "variables": {
    "raw_text": "...",
    "user_id": "usr_001"
  }
}
```

---

## 13. Нефункциональные требования

| Требование | Метрика | Целевое значение |
|---|---|---|
| Время отклика (E2E) | текст → подтверждение | ≤ 5 секунд |
| Точность NLP | корректно распознанные сущности | ≥ 85% |
| Доступность | рабочие часы 09:00–18:00 Алматы | 99% |
| Язык ввода | русский (приоритет), казахский | MVP: только русский |
| Безопасность | изоляция данных | роль проверяется на уровне user_id |
| Таймаут Claude API | ожидание ответа | ≤ 10 сек, retry × 1 |
| Retry воркеров | при сбое | 3 попытки с backoff 30 сек |
| Auto-refresh дашборда | обновление данных | каждые 30 сек |

---

## 14. Конфигурация и секреты

### Переменные окружения

| Сервис | Переменная | Пример значения |
|---|---|---|
| `nlp-worker` | `RABBITMQ_URL` | `amqp://demo:demo@rabbitmq:5672/` |
| `nlp-worker` | `ZORROBPM_API` | `http://api` |
| `nlp-worker` | `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `crm-worker` | `RABBITMQ_URL` | `amqp://demo:demo@rabbitmq:5672/` |
| `crm-worker` | `ZORROBPM_API` | `http://api` |
| `crm-worker` | `MOCK_CRM_URL` | `https://crm.zorro.kt` |
| `mock-crm` | `PORT` | `3000` |
| `chat-ui` | `VITE_BPM_API` | `https://bpm.zorro.kt` |
| `dashboard-ui` | `VITE_CRM_API` | `https://crm.zorro.kt` |

`ANTHROPIC_API_KEY` — единственный настоящий секрет. Передаётся через `.env`-файл, не коммитится.

---

## 15. Критерии готовности

### Definition of Done (MVP)

- [ ] BPMN-процесс `sales-activity-logger` задеплоен и проходит по всем 4 веткам
- [ ] NLP Worker корректно извлекает `activity_type` в ≥ 85% тестовых примеров
- [ ] Mock CRM отвечает по всем 8 эндпоинтам с синтетическими данными
- [ ] CRM Workers успешно сохраняют все 4 типа активностей
- [ ] Chat UI: текст → запуск процесса → подтверждение ≤ 5 сек
- [ ] Dashboard: дашборд продажника отображает личную сводку
- [ ] Dashboard: дашборд менеджера отображает командную таблицу с цветами
- [ ] Сквозной демо-сценарий: ввод → NLP → CRM → дашборд — без ошибок

### Тестовые фразы для проверки NLP (русский)

| Текст | Ожидаемый `activity_type` |
|---|---|
| "Позвонил Нурлану из Казмунайгаз, 20 минут, договорились о встрече" | call |
| "Провёл встречу с командой Тенгизшевройл, 1.5 часа, обсудили условия" | meeting |
| "Отправил КП в Самрук-Энерго по продукту Корпоратив 500" | proposal |
| "Перевёл сделку с АО Казпочта на этап переговоров" | deal |
| "Созвонились с Айгерим, она заинтересована, жду обратного звонка" | call |
