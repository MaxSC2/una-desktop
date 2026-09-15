// Prototype A1–A3: сценарий без backend. Только data-state
// idle/speaking/working/happy (happy = слой 1.5s) и data-zone center/right.

const body = document.body;
const presenceLine = document.getElementById('presenceLine');
const stripMessages = document.getElementById('stripMessages');
const pocket = document.getElementById('pocket');
const pocketStep = document.getElementById('pocketStep');
const pocketSteps = document.getElementById('pocketSteps');
const pocketProgress = document.getElementById('pocketProgress');
const pocketLog = document.getElementById('pocketLog');
const logToggle = document.getElementById('logToggle');
const pocketStop = document.getElementById('pocketStop');
const stopBtn = document.getElementById('stopBtn');
const voiceBars = document.getElementById('voiceBars');
const stateLabel = document.getElementById('stateLabel');
const clockEl = document.getElementById('clock');
const dockInput = document.getElementById('dockInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');

let timers = [];
function later(ms, fn) { const t = setTimeout(fn, ms); timers.push(t); }
function clearTimers() { timers.forEach(clearTimeout); timers = []; }

function setClock() {
  const d = new Date();
  clockEl.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
setClock(); setInterval(setClock, 20000);

function say(text) {
  presenceLine.style.animation = 'none';
  void presenceLine.offsetWidth;
  presenceLine.style.animation = '';
  presenceLine.textContent = text;
}

function addMsg(cls, text) {
  const p = document.createElement('p');
  p.className = 'msg ' + cls;
  p.textContent = text;
  stripMessages.appendChild(p);
  while (stripMessages.children.length > 4) stripMessages.removeChild(stripMessages.firstChild);
  return p;
}

const STEPS = ['list_files /tmp', 'execute_command rm …', 'verify /tmp', 'memory_save итог'];
const LOGS = [
  'list_files → 42 файла, мусор 1.1 ГБ',
  'execute_command → rm старых кэшей…',
  'verify → /tmp чист, всё на месте',
  'memory_save → итог записан'
];

function renderPocket(current) {
  pocketSteps.innerHTML = '';
  STEPS.forEach((s, i) => {
    const li = document.createElement('li');
    li.textContent = (i < current ? '✓ ' : i === current ? '◌ ' : '· ') + s;
    li.className = i < current ? 'done' : i === current ? 'current' : '';
    pocketSteps.appendChild(li);
  });
  pocketStep.textContent = 'шаг ' + Math.min(current + 1, 4) + '/4';
  pocketProgress.style.width = (current / 4 * 100) + '%';
  pocketLog.textContent = LOGS.slice(0, current).join('\n');
}

// A1 — IDLE: CENTER, BREATHE, минимальный glow, pocket закрыт
function showIdle() {
  clearTimers();
  body.dataset.state = 'idle';
  body.dataset.zone = 'center';
  stateLabel.textContent = 'ACTIVE';
  voiceBars.hidden = true;
  pocket.hidden = true;
  stopBtn.hidden = true;
  say('Я рядом. Чем займёмся?');
  stripMessages.innerHTML = '';
  addMsg('msg-user', 'вы: привет');
  addMsg('msg-yuna', 'юна: Привет! Я рядом.');
}

// A2 — SPEAKING: та же сцена, GLOW ярче, стрим реплики
function showSpeaking() {
  clearTimers();
  body.dataset.state = 'speaking';
  body.dataset.zone = 'center';
  stateLabel.textContent = 'ACTIVE';
  voiceBars.hidden = false;
  pocket.hidden = true;
  stopBtn.hidden = false;
  say('Отвечаю…');
  stripMessages.innerHTML = '';
  addMsg('msg-user', 'вы: найди отчёт за вчера');
  addMsg('msg-think', 'Рассуждение ▾ · ищу в /docs и /tmp…');
  const stream = addMsg('msg-yuna msg-stream-cursor', '');
  const full = 'Нашла три файла по твоему запросу. Вот первый: отчёт_вчера.md — 12 КБ.';
  let i = 0;
  const tick = setInterval(() => {
    i += 2;
    stream.textContent = full.slice(0, i);
    if (i >= full.length) {
      clearInterval(tick);
      stream.classList.remove('msg-stream-cursor');
      stream.textContent = 'юна: ' + full;
      say('Вот что нашла.');
    }
  }, 60);
  timers.push(tick);
}

// A3 — WORKING: SHIFT CENTER→RIGHT, APPEAR pocket, strip замирает
function showWorking() {
  clearTimers();
  body.dataset.state = 'working';
  body.dataset.zone = 'right';
  stateLabel.textContent = 'BUSY';
  voiceBars.hidden = true;
  pocket.hidden = false;
  pocketLog.hidden = true;
  stopBtn.hidden = false;
  say('Делаю: чистка /tmp');
  let step = 0;
  renderPocket(step);
  const tick = setInterval(() => {
    step += 1;
    if (step > 4) { clearInterval(tick); showDone(); return; }
    renderPocket(step);
  }, 1600);
  timers.push(tick);
}

function showDone() {
  body.dataset.state = 'happy';
  say('Готово.');
  addMsg('msg-yuna', 'юна: Готово — /tmp почищен, 1.1 ГБ освобождено.');
  later(1500, () => { body.dataset.zone = 'center'; showIdleKeep(); });
}

function showIdleKeep() {
  clearTimers();
  body.dataset.state = 'idle';
  body.dataset.zone = 'center';
  stateLabel.textContent = 'ACTIVE';
  voiceBars.hidden = true;
  pocket.hidden = true;
  stopBtn.hidden = true;
  say('Я рядом. Чем займёмся?');
}

function stopAll() {
  clearTimers();
  addMsg('msg-yuna', 'юна: Остановлено. Скажи, как продолжить.');
  showIdleKeep();
}

document.querySelectorAll('[data-demo]').forEach(btn => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.demo;
    if (k === 'idle') showIdle();
    if (k === 'speaking') showSpeaking();
    if (k === 'working') showWorking();
    if (k === 'done') showDone();
  });
});

sendBtn.addEventListener('click', () => {
  const v = dockInput.value.trim();
  if (!v) return;
  dockInput.value = '';
  addMsg('msg-user', 'вы: ' + v);
  showSpeaking();
});
dockInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendBtn.click();
  if (e.key === 'Escape') stopAll();
});
stopBtn.addEventListener('click', stopAll);
pocketStop.addEventListener('click', stopAll);
logToggle.addEventListener('click', () => {
  pocketLog.hidden = !pocketLog.hidden;
  logToggle.textContent = pocketLog.hidden ? 'лог ▾' : 'лог ▴';
});
micBtn.addEventListener('click', () => {
  micBtn.textContent = micBtn.textContent === '🎙' ? '🔴' : '🎙';
  later(2000, () => { micBtn.textContent = '🎙'; });
});
document.querySelectorAll('.dock-tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.dock-tab').forEach(x => x.classList.remove('is-active'));
    t.classList.add('is-active');
  });
});

showIdle();
