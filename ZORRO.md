1# ZorroBPM · integration guide

Единый справочник по ЗорроBPM-стеку, развёрнутому на этом Mac Studio. Для: разработчиков процессов (BPMN), авторов фронтов (REST), и воркеров (RabbitMQ).

> Для введения с нуля — см. [START.md](./START.md) (гайд для аналитика).
> API reference (эндпоинты и схемы) — см. [zorrobpm-server/API.md](./zorrobpm-server/API.md).
> Примеры процессов с тестами — см. [zorrobpm-examples/](./zorrobpm-examples/).

---

## Содержание
- [Текущий стек](#текущий-стек)
- [Endpoints и сеть](#endpoints-и-сеть)
- [Учётные данные](#учётные-данные)
- [Архитектура (сетевая)](#архитектура-сетевая)
- [Быстрая проверка что всё работает](#быстрая-проверка-что-всё-работает)
- [Паттерн 1: Деплой BPMN-процесса](#паттерн-1-деплой-bpmn-процесса)
- [Паттерн 2: Фронтенд поверх REST API](#паттерн-2-фронтенд-поверх-rest-api)
- [Паттерн 3: Worker через RabbitMQ](#паттерн-3-worker-через-rabbitmq)
- [Живые очереди и воркеры](#живые-очереди-и-воркеры)
- [Основы BPMN элементов](#основы-bpmn-элементов)
- [Troubleshooting](#troubleshooting)
- [Известные ограничения](#известные-ограничения)

---

## Текущий стек

Четыре контейнера в `docker compose project = zorrobpm` (поднято из `_Zorro/zorrobpm-server/`):

| Container | Image | Роль |
|---|---|---|
| `zorrobpm-api-1` | `zorrodev/zorrobpm-rest` | REST API + движок (Spring Boot, порт 80 внутри) |
| `zorrobpm-ui-1` | `zorrodev/zorrobpm-ui` | Админ-панель (Nginx SPA) |
| `zorrobpm-db-1` | `postgres:18` | Хранит definitions, instances, tasks, variables |
| `zorrobpm-rabbitmq-1` | `rabbitmq:4.0.7-management` | Очереди для serviceTasks и engine-events |

Запущено как обычный `docker compose` (не swarm) — управляется из:
```bash
cd /Users/telecom/Dev/_Zorro/zorrobpm-server
docker compose -p zorrobpm --env-file .env up -d        # старт/апдейт
docker compose -p zorrobpm logs -f api                  # логи
docker compose -p zorrobpm restart                      # рестарт всего
docker compose -p zorrobpm down                         # стоп, данные целы
docker compose -p zorrobpm down -v                      # стоп + стереть всё
```

---

## Endpoints и сеть

### Публичные (через Traefik)

| Назначение | URL | Что там |
|---|---|---|
| REST API | `https://bpm.zorro.kt/` | весь REST — `/process-definitions`, `/process-instances`, `/service-tasks`, `/user-tasks`, `/incidents` |
| Swagger UI | `https://bpm.zorro.kt/swagger-ui/index.html` | интерактивная документация эндпоинтов |
| OpenAPI JSON | `https://bpm.zorro.kt/v3/api-docs` | сырой OpenAPI-3 spec для кодогенерации клиентов |
| Админка (UI) | `https://admin-bpm.zorro.kt/` | мониторинг процессов, очереди задач, deployments |

### Внутренние (только внутри Docker-сетей)

| Сервис | Network | Адрес изнутри | Порт |
|---|---|---|---|
| RabbitMQ AMQP | `zorrobpm_default` | `rabbitmq:5672` | 5672 |
| RabbitMQ Management | `zorrobpm_default` | `rabbitmq:15672` | 15672 |
| PostgreSQL | `zorrobpm_default` | `db:5432` | 5432 |
| API | `zorrobpm_default`, `dokploy-network` | `api:80` | 80 |

### Прямые порты хоста (для DB-клиентов и ручного дебага)

| Сервис | Хост | Порт | Доступ |
|---|---|---|---|
| PostgreSQL | `localhost` / `192.168.68.59` | `5435` | DBeaver / psql |
| REST API (raw) | `localhost` | `9092` | обход Traefik |
| UI (raw) | `localhost` | `9091` | обход Traefik |

RabbitMQ и её management UI наружу **не опубликованы** — только внутри docker-сети. Если нужно снаружи — добавьте `ports: "5672:5672"` в compose (для AMQP) или `"15672:15672"` (для UI).

---

## Учётные данные

Всё в dev-режиме, пароли одинаковые везде.

| Что | Логин | Пароль |
|---|---|---|
| REST API | — | без auth |
| Админка | — | без auth |
| PostgreSQL | `demo` | `demo` |
| RabbitMQ | `demo` | `demo` |

Источник: `_Zorro/zorrobpm-server/.env`. Если меняете пароли — меняйте здесь И пересоздавайте контейнеры (`docker compose -p zorrobpm up -d --force-recreate`). Для БД ещё нужен `ALTER USER` в Postgres — иначе после перезапуска старый пароль останется в volume.

---

## Архитектура (сетевая)

```
                            ┌─────────────────────┐
                            │  Traefik (:80/:443) │
                            └──────┬──────────────┘
                                   │ Host-based routing
              ┌────────────────────┴──────────────────────┐
              │                                           │
              ▼                                           ▼
    bpm.zorro.kt                               admin-bpm.zorro.kt
  (docker label)                              (docker label)
              │                                           │
              ▼                                           ▼
    ┌───────────────────┐                       ┌──────────────────┐
    │  zorrobpm-api-1   │                       │ zorrobpm-ui-1    │
    │ (Spring Boot :80) │                       │ (Nginx :80)      │
    └─────┬─────────────┘                       └──────────────────┘
          │                                          ▲
          │ JDBC              ┌───────────────┐      │
          ├──────────────────▶│ zorrobpm-db-1 │      │
          │                   │ (Postgres)    │      │
          │                   └───────────────┘      │ REST calls
          │                                          │
          │ AMQP              ┌──────────────────┐   │
          └──────────────────▶│ zorrobpm-rabbit- │   │
                              │  mq-1 (rabbit)   │   │
                              └────────┬─────────┘   │
                                       │             │
                    zorrobpm_default   │             │
                    network (bridge) ──┴─────────────┤
                                                     │
                                                     │
      Внешние контейнеры воркеров/фронтов ───────────┘
           joinятся в zorrobpm_default (external: true)
           и работают с:    rabbitmq:5672    (queue consumer)
                            api:80            (REST — опц.)
```

---

## Быстрая проверка что всё работает

```bash
# API жив?
curl https://bpm.zorro.kt/actuator/health  # или просто /swagger-ui/index.html

# Список деплойнутых процессов
curl -s 'https://bpm.zorro.kt/process-definitions?pageSize=5' | jq

# Список инстансов
curl -s 'https://bpm.zorro.kt/process-instances?pageSize=5' | jq

# Очереди RabbitMQ (с хоста)
docker exec zorrobpm-rabbitmq-1 rabbitmqctl list_queues name messages consumers
```

---

## Паттерн 1: Деплой BPMN-процесса

Нарисовали процесс в Camunda Modeler / bpmn.io / другом редакторе → получили файл `.bpmn` (это XML). Заливаете его в движок:

```bash
BPMN_XML=$(cat my-process.bpmn | jq -Rs .)  # экранировать как JSON-строку
curl -X POST https://bpm.zorro.kt/process-definitions \
     -H 'Content-Type: application/json' \
     -d "{\"bpmn\": $BPMN_XML}"
# => { "id":"...", "key":"myProcess", "version":1, ... }
```

Или через Swagger UI: открыть https://bpm.zorro.kt/swagger-ui/index.html → `POST /process-definitions` → Try it out.

**Запуск инстанса:**
```bash
curl -X POST https://bpm.zorro.kt/process-instances \
     -H 'Content-Type: application/json' \
     -d '{"processDefinitionKey":"myProcess","variables":[{"name":"orderId","value":"42","type":"LONG"}]}'
# => { "id": "uuid" }
```

### Полный пример (Node.js)

```javascript
import fs from 'node:fs/promises';

const API = 'https://bpm.zorro.kt';
const bpmn = await fs.readFile('my-process.bpmn', 'utf8');

// 1. deploy
let r = await fetch(`${API}/process-definitions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bpmn })
});
const pd = await r.json();
console.log(`deployed: key=${pd.key} v=${pd.version}`);

// 2. start
r = await fetch(`${API}/process-instances`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    processDefinitionKey: pd.key,
    variables: [{ name: 'orderId', value: '42', type: 'LONG' }]
  })
});
console.log(`started instance ${(await r.json()).id}`);
```

---

## Паттерн 2: Фронтенд поверх REST API

Фронт — обычный SPA на любом фреймворке, дергающий `https://bpm.zorro.kt/...`. Пример на голом JS:

```html
<script type="module">
const API = "https://bpm.zorro.kt";

async function listInstances() {
  const r = await fetch(`${API}/process-instances?pageSize=20`);
  return (await r.json()).data;
}

async function startProcess(key, vars) {
  const r = await fetch(`${API}/process-instances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ processDefinitionKey: key, variables: vars })
  });
  return (await r.json()).id;
}

async function myUserTasks(assignee) {
  const r = await fetch(`${API}/user-tasks?completed=false&assignee=${assignee}`);
  return (await r.json()).data;
}

async function completeTask(taskId, result) {
  await fetch(`${API}/user-tasks/${taskId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variables: [{ name: "result", value: result, type: "STRING" }] })
  });
}
</script>
```

**Куда задеплоить фронт:** если внутри Zorro-стенда — обычным docker-compose в `dokploy-network` с Traefik-метками. Конвенция именования: **имя папки проекта = subdomain**. Каждый фронт доступен на двух доменах:

| Сеть | URL |
|---|---|
| LAN (Wi-Fi/Ethernet) | `https://{foldername}.zorro.kt` |
| Публично (интернет) | `https://{foldername}.telecom.quest` |

`*.zorro.kt` — wildcard-сертификат + DNS через PowerDNS wildcard.  
`*.telecom.quest` — Cloudflare tunnel (cloudflared), TLS на стороне Cloudflare.

**Важно:** два роутера обязательны — HTTP отдельно от HTTPS. Cloudflare шлёт plain HTTP на порт 80, поэтому роутер с `tls: true` его не поймает и запрос уйдёт в catch-all `zorro-site`.

```yaml
# docker-compose.yaml вашего фронта
services:
  myapp-frontend:
    image: myregistry/myapp-frontend:latest
    networks: [dokploy-network]
    deploy:
      labels:
        - traefik.enable=true
        # HTTP (для Cloudflare-туннеля и редиректов)
        - traefik.http.routers.myapp-http.rule=Host(`myapp.zorro.kt`) || Host(`myapp.telecom.quest`)
        - traefik.http.routers.myapp-http.entrypoints=web
        # HTTPS (для прямого LAN-доступа)
        - traefik.http.routers.myapp-https.rule=Host(`myapp.zorro.kt`) || Host(`myapp.telecom.quest`)
        - traefik.http.routers.myapp-https.entrypoints=websecure
        - traefik.http.routers.myapp-https.tls=true
        - traefik.http.services.myapp.loadbalancer.server.port=80

networks:
  dokploy-network:
    external: true
```

**CORS:** ZorroBPM API **шлёт wildcard-CORS** — любой origin получает `Access-Control-Allow-Origin: <свой origin>` + `Allow-Credentials: true` + все нужные методы. Фронты с любого домена (в том числе `localhost:5173`, `*.zorro.kt`, `*.telecom.quest`) могут ходить напрямую в `bpm.zorro.kt` без прокси и без middleware. Для dev это удобно; **для prod** — сузьте до allow-list через Traefik middleware или настройки движка.

---

## Паттерн 3: Worker через RabbitMQ

BPMN `serviceTask` с `<zeebe:taskDefinition type="myJobType" />` в `<extensionElements>` → движок публикует сообщение в очередь `zorrobpm.jobs.myJobType`. Ваш воркер консьюмит, делает работу, дергает `POST /service-tasks/{id}/complete`.

### Схема сообщения в очереди

Типовое сообщение (pushed as JSON bytes):
```json
{
  "taskId": "uuid",
  "processInstanceId": "uuid",
  "processDefinitionId": "uuid",
  "job": "myJobType",
  "variables": { "orderId": "42", "customer": "Anna" }
}
```
(Точная схема — см. `docker exec zorrobpm-rabbitmq-1 rabbitmqctl list_queues name messages`, либо посмотрите реальные сообщения через management UI.)

### Как задать job-type в BPMN

Процессы рисуются в Camunda Modeler под **Camunda Cloud / Zeebe 8**, поэтому используется Zeebe-namespace `xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"`:

```xml
<bpmn:serviceTask id="Task_1" name="Send SMS">
  <bpmn:extensionElements>
    <zeebe:taskDefinition type="send_sms_code" retries="3" />
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

Значение `type` → имя очереди `zorrobpm.jobs.<type>`. См. `zorrobpm-examples/src/main/resources/examples/call-activity/childProcess.bpmn` как канонический пример.

### Node.js-воркер (amqplib)

```javascript
import amqp from 'amqplib';

const RABBIT = 'amqp://demo:demo@rabbitmq:5672/';
const API = 'http://api';               // внутри сети
const QUEUE = 'zorrobpm.jobs.my_custom_job';

const conn = await amqp.connect(RABBIT);
const ch = await conn.createChannel();
await ch.assertQueue(QUEUE, { durable: true });

ch.consume(QUEUE, async (msg) => {
  const job = JSON.parse(msg.content.toString());

  const result = await doWork(job.variables);

  await fetch(`${API}/service-tasks/${job.taskId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      variables: [{ name: 'result', value: String(result), type: 'STRING' }]
    })
  });
  ch.ack(msg);
});
```

### docker-compose для вашего воркера

Ключевой момент: **joinитесь в `zorrobpm_default`** — там живёт rabbitmq с алиасом `rabbitmq`.

```yaml
services:
  my-worker:
    image: myregistry/my-worker:latest
    environment:
      RABBITMQ_URL: amqp://demo:demo@rabbitmq:5672/
      ZORROBPM_API: http://api            # через zorrobpm_default
      # или: https://bpm.zorro.kt         # через Traefik/интернет
    networks:
      - zorrobpm_default
      # если ещё нужна dokploy-network для Traefik-маршрутов своего UI:
      - dokploy-network

networks:
  zorrobpm_default:
    external: true
  dokploy-network:
    external: true
```

### Пользовательские задачи (userTask)

Для `userTask` нет отдельной очереди — их опрашивает фронт/бот:
```bash
# все неназначенные task'и группы
curl 'https://bpm.zorro.kt/user-tasks?completed=false&candidateGroup=managers'

# выполнить
curl -X POST https://bpm.zorro.kt/user-tasks/$TASK_ID/complete \
  -H 'Content-Type: application/json' \
  -d '{"variables":[{"name":"action","value":"approve","type":"STRING"}]}'
```

---

## Живые очереди и воркеры

На момент **2026-04-14** в rabbitmq крутятся эти очереди (`docker exec zorrobpm-rabbitmq-1 rabbitmqctl list_queues`):

| Очередь | Consumers | Примечание |
|---|---|---|
| `zorrobpm.engine.runtime-events` | 0* | engine-события (instance started/completed, task created) — читает движок или подписчики метрик. *должно быть >=1 (сам engine); если 0 — проверьте что `api` перезагрузился корректно* |
| `zorrobpm.engine.definition-events` | — | lifecycle определений |
| `zorrobpm.jobs.send_sms_code` | 1 | SMS-коды в активациях |
| `zorrobpm.jobs.bind_msisdn_iccid` | 1 | привязка SIM |
| `zorrobpm.jobs.validate_order` | 1 | валидация заказа |
| `zorrobpm.jobs.cancel_order_osm` | 1 | отмена в OSM |
| `zorrobpm.jobs.check_iccid_osm` | 1 | проверка ICCID |
| `zorrobpm.jobs.social.createDialog` | 1 | создание диалога в SMM |
| `zorrobpm.jobs.social.escalateToManager` | 1 | эскалация |
| `zorrobpm.jobs.social.searchCRM` | 1 | поиск клиента в CRM |
| `zorrobpm.jobs.social.createTicket` | 1 | создание тикета |
| `zorrobpm.jobs.social.sendDM` | 1 | отправка DM |
| `zorrobpm.jobs.social.extractData` | 1 | извлечение данных |
| `zorrobpm.jobs.social.addToExistingTicket` | 1 | добавить в тикет |
| `zorrobpm.jobs.domain.autoApprove` | 0 | автоодобрение — **воркер не запущен, очередь копит сообщения** |
| `zorrobpm.jobs.notification.sendActivation` | 0 | уведомления — **воркер не запущен** |
| `zorrobpm.jobs.employee.validateAndBuild` | 0 | — **воркер не запущен** |
| `jira.report.task` | 1 | jira-отчёты |

> Соберёте свежий снимок: `docker exec zorrobpm-rabbitmq-1 rabbitmqctl list_queues name messages consumers`. Если `consumers=0` и `messages>0` — воркер упал или не деплоился, сообщения копятся.

---

## Основы BPMN элементов

| Элемент | Что это | Как отрабатывает |
|---|---|---|
| `startEvent` | точка входа | создаётся при `POST /process-instances` |
| `endEvent` | точка выхода | помечает `completedAt` у instance |
| `serviceTask` | авто-задача | пушит в очередь `zorrobpm.jobs.<job>`, ждёт `/service-tasks/{id}/complete` |
| `userTask` | задача человеку | создаётся в `/user-tasks`, завершается вручную через API |
| `callActivity` | вызов под-процесса | стартует новый instance другого `processDefinition`, ждёт его завершения |
| `exclusiveGateway` | XOR-развилка | один исходящий поток по первому true-условию |
| `parallelGateway` | AND-развилка | параллельные ветки, join ждёт все |
| `sequenceFlow` | стрелка | может иметь `conditionExpression` (FEEL/EL) для ветвления |

Переменные инстанса: создаются при `start`, обновляются при `complete`, читаются в условиях и задачах. Типы: `STRING`, `UUID`, `LONG`, `BOOLEAN` (см. API.md).

---

## Troubleshooting

**API отвечает 502 Bad Gateway через Traefik.** Контейнер `zorrobpm-api-1` ещё стартует (Spring Boot 40+ секунд) или упал. `docker logs zorrobpm-api-1 | tail -50`.

**Очередь копится, consumers=0.** Воркер не запущен или упал. Проверьте в своём проекте `docker compose ps`. Сообщения durable — не потеряются, как только поднимете.

**`runtime-events` copит сообщения.** Engine должен быть consumer'ом. Рестарт API обычно решает:
```bash
docker compose -p zorrobpm restart api
```

**CORS-ошибки во фронте.** API без CORS-заголовков. Варианты:
- добавить Traefik middleware с `accessControlAllowOrigin=*` (dev-only!)
- проксировать API-вызовы через свой backend
- поднять фронт на том же origin что и API

**При `docker compose up` у контейнеров `platform linux/amd64` warning.** ZorroBPM-образы собраны под amd64; на M-серии (arm64) крутятся под Rosetta. Работает, но медленнее. Производительность критична → пересобирайте multiarch локально.

**PG-клиент (DBeaver) не коннектится к `localhost:5435`.** Проверьте `docker ps | grep zorrobpm-db` — порт 5435 должен быть опубликован. Если стек не запущен — `docker compose -p zorrobpm up -d`. Логин: `demo`/`demo`, база: `zorrobpm-db`.

**BPMN деплой падает с `Error parsing BPMN`.** Вероятно XML повреждён при транспорте (не заэкранирован). Используйте `jq -Rs .` для подготовки JSON-поля или ставьте через Swagger UI формой.

---

## Известные ограничения

- **Нет `parentProcessInstanceId` в ProcessInstance.** Нельзя спросить «все дети инстанса X». Поле `parentActivityId` — это UUID `activityInstance` вызывающего `callActivity`, не `processInstance`. Обходной путь в тестах: находить по самой новой записи с `parentActivityId != null`. См. `CallActivityE2ETest.java`.

- **Нет CORS.** См. Troubleshooting.

- **Нет аутентификации.** Любой в LAN может дёргать API. Для прода — ставьте Traefik-middleware BasicAuth или форвард через свой proxy с JWT.

- **Amd64-only образы.** См. Troubleshooting.

- **Один `admin` в UI.** Нет мульти-тенантности/проектов на уровне UI.

- **Persistent данные только в volumes.** Для бэкапа: `pg_dump` Postgres и `rabbitmqctl export_definitions` для очередей.

---

## Примеры

В `_Zorro/zorrobpm-examples/` — готовый Maven-проект с:
- 4 BPMN-файла (callActivity, approval route)
- Unit-тесты на встроенном движке (H2)
- E2E-тесты против реального API через `ZorroWebAPI.java`

**Запуск E2E против нашего локального стека:**
```bash
cd /Users/telecom/Dev/_Zorro/zorrobpm-examples
docker compose up -d
./test.sh https://bpm.zorro.kt
```

`ZorroWebAPI.java` — минималистичный Java-клиент без зависимостей (HttpClient + Jackson), можно скопировать как старт для своего проекта.

---

## Ссылки

- [START.md](./START.md) — гайд для аналитика (рисование BPMN с нуля)
- [zorrobpm-server/API.md](./zorrobpm-server/API.md) — полный API reference
- [zorrobpm-server/README.md](./zorrobpm-server/README.md) — деплой стека
- [zorrobpm-examples/README.md](./zorrobpm-examples/README.md) — примеры процессов
- Swagger живой: https://bpm.zorro.kt/swagger-ui/index.html
- Админка: https://admin-bpm.zorro.kt/
