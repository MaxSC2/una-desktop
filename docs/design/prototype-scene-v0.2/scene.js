// Scene v0.2: композиция R1–R6. Состояния только для проверки композиции.
// Код A1–A3 не переносился. Demo-слоя нет: 1/2/3, текст в input, Esc.

const body = document.body;
const utterance = document.getElementById('utterance');
const field = document.getElementById('field');

// Внимание к вводу: поведение вместо бейджей (LISTENING без статуса).
function setAtt(v) {
  if (v) body.dataset.att = v;
  else delete body.dataset.att;
}
const task = document.getElementById('task');
const taskStep = document.getElementById('taskStep');
const taskSteps = document.getElementById('taskSteps');
const taskFill = document.getElementById('taskFill');
const taskLog = document.getElementById('taskLog');
const logToggle = document.getElementById('logToggle');
const taskStop = document.getElementById('taskStop');
const stopBtn = document.getElementById('stopBtn');
const voiceBars = document.getElementById('voiceBars');
const clockEl = document.getElementById('clock');
const dockInput = document.getElementById('dockInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');

let timers = [];
function later(ms, fn) { const t = setTimeout(fn, ms); timers.push(t); }
function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
  finalizeStreams();
}

// Стриминг меняет существующую реплику: если переход состояния оборвал
// интервал, курсор не должен висеть вечно — снимаем его с готовой ячейки.
// Дублей при этом не создаётся: ряд уже один, текст остаётся как есть.
function finalizeStreams() {
  field.querySelectorAll('.field-text.field-cursor').forEach((el) => {
    el.classList.remove('field-cursor');
  });
}

function setClock() {
  const d = new Date();
  clockEl.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
setClock(); setInterval(setClock, 20000);

function say(text) {
  utterance.style.animation = 'none';
  void utterance.offsetWidth;
  utterance.style.animation = '';
  utterance.textContent = text;
}

// Поле: фиксированный коридор, максимум 5 рядов. Новая реплика — всегда
// последний ряд (предсказуемое место). Старые поднимаются и гаснут.
// Один ряд = одна сторона (USER слева / YUNA справа), дублей нет.
const FIELD_MAX_ROWS = 5;

function fieldRows() {
  return Array.from(field.querySelectorAll('.field-row'));
}

// Возраст рядов от конца: последний — активный, предпоследний — old,
// остальные — older. Вызывается после каждого добавления/удаления.
function ageRows() {
  const rows = fieldRows();
  rows.forEach((r, i) => {
    const fromEnd = rows.length - 1 - i;
    r.classList.toggle('is-active', fromEnd === 0);
    r.classList.toggle('is-old', fromEnd === 1);
    r.classList.toggle('is-older', fromEnd >= 2);
  });
  while (field.querySelectorAll('.field-row').length > FIELD_MAX_ROWS) {
    field.querySelector('.field-row').remove();
  }
  const rest = fieldRows();
  rest.forEach((r, i) => {
    const fromEnd = rest.length - 1 - i;
    r.classList.toggle('is-active', fromEnd === 0);
    r.classList.toggle('is-old', fromEnd === 1);
    r.classList.toggle('is-older', fromEnd >= 2);
  });
}
// Якорь: одно предсказуемое место пустого поля. Отдельный ряд-индикатор
// не создаём — индикатор «Отвечаю…» живёт внутри будущей реплики (п.9).
function ensureLane() {
  if (!document.getElementById('fieldHint') && field.querySelectorAll('.field-row').length === 0) {
    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.id = 'fieldHint';
    hint.textContent = 'твои слова появятся здесь';
    field.appendChild(hint);
  }
}

function appendRow(who, node) {
  const hint = document.getElementById('fieldHint');
  if (hint) hint.remove();
  const row = document.createElement('div');
  row.className = 'field-row';
  const cell = document.createElement('p');
  cell.className = 'field-cell ' + (who === 'user' ? 'field-user' : 'field-yuna');
  if (typeof node === 'string') cell.textContent = node;
  else cell.appendChild(node);
  row.appendChild(cell);
  field.appendChild(row);
  ageRows();
  return cell;
}

// USER-реплика: текст сразу, дублей нет (возвращает ячейку, переиспользовать не надо).
function addUser(text) {
  return appendRow('user', text);
}

// YUNA-реплика со стримингом: индикатор «Отвечаю…» живёт внутри ячейки
// и заменяется первым символом — дубля реплики не возникает.
function addYunaStream(full, done) {
  const text = document.createElement('span');
  text.className = 'field-text field-cursor';
  appendRow('yuna', text);
  const typing = document.createElement('span');
  typing.className = 'field-typing';
  typing.textContent = 'Отвечаю…';
  text.appendChild(typing);
  let i = 0;
  const tick = setInterval(() => {
    i += 2;
    // Первый символ заменяет индикатор внутри той же ячейки — дубля нет.
    text.textContent = full.slice(0, i);
    if (i >= full.length) {
      clearInterval(tick);
      text.classList.remove('field-cursor');
      if (done) done();
    }
  }, 60);
  timers.push(tick);
}

// Готовая YUNA-реплика без стриминга (стоп, системные итоги).
function addYuna(text) {
  const textEl = document.createElement('span');
  textEl.className = 'field-text';
  textEl.textContent = text;
  return appendRow('yuna', textEl);
}

// Совместимость: addLine оставлен как тонкий мост (дублей не создаёт).
function addLine(who, text) {
  if (who === 'user') return addUser(text);
  return addYuna(text);
}

const STEPS = ['list_files /tmp', 'execute_command rm', 'verify /tmp', 'memory_save'];
const LOGS = ['list_files → 42 файла, мусор 1.1 ГБ', 'execute_command → чистка…', 'verify → /tmp чист', 'memory_save → итог записан'];

function renderTask(current) {
  taskSteps.innerHTML = '';
  STEPS.forEach((s, i) => {
    const li = document.createElement('li');
    li.textContent = (i < current ? '✓ ' : i === current ? '◌ ' : '· ') + s;
    li.className = i < current ? 'done' : i === current ? 'current' : '';
    taskSteps.appendChild(li);
  });
  taskStep.textContent = 'шаг ' + Math.min(current + 1, 4) + '/4';
  taskFill.style.width = (current / 4 * 100) + '%';
  taskLog.textContent = LOGS.slice(0, current).join('\n');
}

function showIdle() {
  clearTimers();
  body.dataset.state = 'idle';
  body.dataset.zone = 'center';
  voiceBars.hidden = true;
  task.hidden = true;
  stopBtn.hidden = true;
  say('Я рядом. Чем займёмся?');
  clearField();
  addUser('привет');
  addYuna('Привет! Я рядом.');
}

function clearField() {
  field.querySelectorAll('.field-row').forEach((r) => r.remove());
  ensureLane();
}

function showSpeaking() {
  clearTimers();
  body.dataset.state = 'speaking';
  body.dataset.zone = 'center';
  voiceBars.hidden = false;
  task.hidden = true;
  stopBtn.hidden = false;
  say('Отвечаю…');
  clearField();
  addUser('найди отчёт за вчера');
  addYunaStream('Нашла три файла. Первый: отчёт_вчера.md — 12 КБ.', () => {
    say('Вот что нашла.');
  });
}

function showWorking() {
  clearTimers();
  body.dataset.state = 'working';
  body.dataset.zone = 'right';
  voiceBars.hidden = true;
  task.hidden = false;
  taskLog.hidden = true;
  stopBtn.hidden = false;
  say('Делаю: чистка /tmp');
  let step = 0;
  renderTask(step);
  const tick = setInterval(() => {
    step += 1;
    if (step > 4) { clearInterval(tick); showDone(); return; }
    renderTask(step);
  }, 1600);
  timers.push(tick);
}

function showDone() {
  body.dataset.state = 'happy';
  say('Готово.');
  addYuna('Готово — /tmp почищен, 1.1 ГБ освобождено.');
  later(1500, () => { body.dataset.zone = 'center'; showIdleKeep(); });
}

function showIdleKeep() {
  clearTimers();
  body.dataset.state = 'idle';
  body.dataset.zone = 'center';
  voiceBars.hidden = true;
  task.hidden = true;
  stopBtn.hidden = true;
  say('Я рядом. Чем займёмся?');
}

function stopAll() {
  clearTimers();
  addYuna('Остановлено. Скажи, как продолжить.');
  showIdleKeep();
}

document.addEventListener('keydown', (e) => {
  if (e.target === dockInput) return;
  if (e.key === '1') showIdle();
  if (e.key === '2') showSpeaking();
  if (e.key === '3') showWorking();
});
sendBtn.addEventListener('click', () => {
  const v = dockInput.value.trim();
  if (!v) return;
  dockInput.value = '';
  addUser(v);
  showSpeakingKeep();
});
function showSpeakingKeep() {
  clearTimers();
  body.dataset.state = 'speaking';
  body.dataset.zone = 'center';
  voiceBars.hidden = false;
  task.hidden = true;
  stopBtn.hidden = false;
  say('Отвечаю…');
  // Стриминг меняет существующую реплику: ряд создан один раз в addYunaStream.
  addYunaStream('Поняла. Сейчас сделаю.');
}
dockInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendBtn.click();
  if (e.key === 'Escape') stopAll();
});
dockInput.addEventListener('focus', () => setAtt('input'));
dockInput.addEventListener('blur', () => setAtt(null));
stopBtn.addEventListener('click', stopAll);
taskStop.addEventListener('click', stopAll);
logToggle.addEventListener('click', () => {
  taskLog.hidden = !taskLog.hidden;
  logToggle.textContent = taskLog.hidden ? 'лог' : 'скрыть';
});
micBtn.addEventListener('click', () => {
  micBtn.textContent = micBtn.textContent === '🎙' ? '🔴' : '🎙';
  later(2000, () => { micBtn.textContent = '🎙'; });
});
document.querySelectorAll('.dock-tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.dock-tab').forEach((x) => x.classList.remove('is-active'));
    t.classList.add('is-active');
  });
});

showIdle();
