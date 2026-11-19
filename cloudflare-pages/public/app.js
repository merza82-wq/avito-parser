import { demoThreads } from './demo.js';

const byId = (id) => document.getElementById(id);
const app = byId('app');
const list = byId('dialogs');
const search = byId('search');
const profile = byId('profile');
const scroll = byId('thread-scroll');
const content = byId('thread-content');
const telegram = window.Telegram?.WebApp;
const demo = new URLSearchParams(location.search).get('demo') === '1' && !telegram?.initData;
const desktop = matchMedia('(min-width: 760px)');
const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
const dayFormat = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Europe/Moscow' });
const timeFormat = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
const state = { dialogs: [], selected: null, messages: [], before: null, version: 0, loadingOlder: false };
let refreshing = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function connection(label, status = '') {
  byId('connection').textContent = label;
  byId('connection').dataset.state = status;
}

function avatar(node, dialog) {
  node.textContent = dialog.title.split(/\s+/u).slice(0, 2).map((word) => [...word][0]).join('').toUpperCase();
  node.dataset.tone = String([...dialog.id].reduce((sum, letter) => sum + letter.codePointAt(0), 0) % 4);
}

const today = () => dayFormat.format(Date.now());
const compactDate = (time) => today() === dayFormat.format(time) ? timeFormat.format(time) : dateFormat.format(time);
const profileName = (value) => value.replace(/^msedge-/i, 'Edge · ').replace(/^chrome-/i, 'Chrome · ');

async function api(path) {
  if (demo) {
    if (path === '/dialogs') return { dialogs: demoThreads.map(({ summary }) => summary) };
    return demoThreads.find(({ dialog }) => path === `/dialogs/${dialog.id}`);
  }
  const response = await fetch(`/api${path}`, { headers: { Authorization: `Telegram ${telegram.initData}` }, cache: 'no-store' });
  if (!response.ok) {
    const error = new Error('Не удалось загрузить данные.');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function empty(title, info, retry) {
  const node = element('div', 'empty');
  node.append(element('h2', '', title), element('p', '', info));
  if (retry) {
    const button = element('button', 'button', 'Повторить');
    button.type = 'button';
    button.addEventListener('click', retry);
    node.append(button);
  }
  content.replaceChildren(node);
}

function renderList() {
  const query = search.value.trim().toLocaleLowerCase('ru');
  const visible = state.dialogs.filter((dialog) => (!profile.value || dialog.profile === profile.value) &&
    `${dialog.title}\n${dialog.preview ?? ''}`.toLocaleLowerCase('ru').includes(query));
  if (!visible.length) {
    const note = query || profile.value ? 'Диалоги не найдены.' : 'Здесь появятся синхронизированные чаты.';
    list.replaceChildren(element('p', 'note', note));
    return;
  }
  const rows = visible.map((dialog) => {
    const button = element('button', 'dialog');
    button.type = 'button';
    button.setAttribute('aria-current', String(state.selected?.id === dialog.id));
    const initials = element('span', 'avatar');
    initials.setAttribute('aria-hidden', 'true');
    avatar(initials, dialog);
    const main = element('span', 'dialog-main');
    main.append(element('strong', '', dialog.title), element('span', 'dialog-preview',
      `${dialog.direction === 'outgoing' ? 'Вы: ' : ''}${dialog.preview ?? ''}`));
    const time = element('time', 'dialog-side', compactDate(dialog.sentAt));
    time.dateTime = new Date(dialog.sentAt).toISOString();
    button.append(initials, main, time);
    button.addEventListener('click', () => void open(dialog));
    return button;
  });
  list.replaceChildren(...rows);
}

function renderProfiles() {
  const current = profile.value;
  const profiles = [...new Set(state.dialogs.map((dialog) => dialog.profile))].sort();
  profile.replaceChildren(new Option('Все профили', ''), ...profiles.map((value) => new Option(profileName(value), value)));
  if (profiles.includes(current)) profile.value = current;
  byId('profile-filter').hidden = profiles.length < 2;
}

function renderHistory(placement, oldHeight = scroll.scrollHeight) {
  if (!state.messages.length) {
    empty('История пока пуста', 'Здесь появятся сообщения из переписки в Авито.');
    return;
  }
  const nodes = [];
  if (state.before) {
    const older = element('button', 'button older', state.loadingOlder ? 'Загружаю…' : 'Более ранние сообщения');
    older.type = 'button';
    older.disabled = state.loadingOlder;
    older.addEventListener('click', () => void loadOlder(older));
    nodes.push(older);
  }
  let previousDay;
  for (const message of state.messages) {
    const day = dayFormat.format(message.sentAt);
    if (day !== previousDay) {
      const yesterday = dayFormat.format(Date.now() - 86_400_000);
      nodes.push(element('p', 'day', day === today() ? 'Сегодня' : day === yesterday ? 'Вчера' : dateFormat.format(message.sentAt)));
      previousDay = day;
    }
    const row = element('article', 'message');
    row.dataset.direction = message.direction;
    row.setAttribute('aria-label', message.direction === 'outgoing' ? 'Исходящее' : message.direction === 'incoming' ? 'Входящее' : 'Сообщение');
    const bubble = element('div', 'bubble');
    const time = element('time', '', timeFormat.format(message.sentAt));
    time.dateTime = new Date(message.sentAt).toISOString();
    bubble.append(element('p', '', message.body), time);
    row.append(bubble);
    nodes.push(row);
  }
  const top = scroll.scrollTop;
  content.replaceChildren(...nodes);
  scroll.scrollTop = placement === 'bottom' ? scroll.scrollHeight : placement === 'prepend' ? top + scroll.scrollHeight - oldHeight : top;
}

function showList() {
  app.dataset.view = 'list';
  telegram?.BackButton?.hide?.();
}

async function open(dialog) {
  const version = ++state.version;
  state.selected = dialog;
  state.messages = [];
  state.before = null;
  state.loadingOlder = false;
  app.dataset.view = 'thread';
  if (!desktop.matches) telegram?.BackButton?.show?.();
  byId('thread-head').hidden = byId('thread-foot').hidden = false;
  byId('thread-title').textContent = dialog.title;
  byId('thread-profile').textContent = profileName(dialog.profile);
  avatar(byId('thread-avatar'), dialog);
  renderList();
  empty('Загружаю историю', 'Открываю сообщения из Авито.');
  try {
    const page = await api(`/dialogs/${dialog.id}`);
    if (version !== state.version) return;
    state.messages = page.messages;
    state.before = page.before;
    renderHistory('bottom');
  } catch (error) {
    if (version !== state.version) return;
    empty('История недоступна', error.status === 401 ? 'Откройте приложение заново через кнопку «Диалоги» в Telegram.' :
      'Попробуйте загрузить переписку ещё раз.', error.status === 401 ? null : () => void open(dialog));
  }
}

async function loadOlder(button) {
  if (!state.before || state.loadingOlder) return;
  const version = state.version;
  state.loadingOlder = true;
  button.disabled = true;
  button.textContent = 'Загружаю…';
  try {
    const page = await api(`/dialogs/${state.selected.id}?before=${encodeURIComponent(state.before)}`);
    if (version !== state.version) return;
    const height = scroll.scrollHeight;
    const existing = new Set(state.messages.map(({ id }) => id));
    state.messages.unshift(...page.messages.filter(({ id }) => !existing.has(id)));
    state.before = page.before;
    state.loadingOlder = false;
    renderHistory('prepend', height);
  } catch {
    if (version !== state.version) return;
    state.loadingOlder = false;
    button.disabled = false;
    button.textContent = 'Повторить загрузку';
  }
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const result = await api('/dialogs');
    const selected = state.selected;
    const old = state.dialogs.find(({ id }) => id === selected?.id);
    if (JSON.stringify(result.dialogs) !== JSON.stringify(state.dialogs)) {
      state.dialogs = result.dialogs;
      renderProfiles();
      renderList();
    }
    connection(demo ? 'Демо-режим' : 'Подключено', demo ? '' : 'live');
    if (!selected && desktop.matches && state.dialogs.length) {
      await open(state.dialogs[0]);
    } else if (!selected) {
      empty(state.dialogs.length ? 'Выберите переписку' : 'Диалогов пока нет', state.dialogs.length ?
        'История откроется здесь.' : 'Откройте переписку в лаунчере или дождитесь автоматической синхронизации.');
    } else {
      const latest = state.dialogs.find(({ id }) => id === selected.id);
      if ((!old || latest?.lastId !== old.lastId || latest?.direction !== old.direction || !state.messages.length) && !state.loadingOlder) {
        const version = state.version;
        const page = await api(`/dialogs/${selected.id}`);
        if (version !== state.version) return;
        const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
        const merged = new Map([...state.messages, ...page.messages].map((message) => [message.id, message]));
        if (!state.messages.length) state.before = page.before;
        state.messages = [...merged.values()].sort((left, right) => left.sentAt - right.sentAt);
        renderHistory(nearBottom ? 'bottom' : 'keep');
      }
    }
  } catch (error) {
    connection(error.status === 401 ? 'Требуется вход' : 'Нет связи', 'error');
    if (error.status === 401) {
      state.version++;
      state.selected = null;
      state.dialogs = [];
      state.messages = [];
      state.before = null;
      state.loadingOlder = false;
      byId('thread-head').hidden = byId('thread-foot').hidden = true;
      renderProfiles();
      showList();
    }
    if (!state.dialogs.length) {
      list.replaceChildren(element('p', 'note', error.status === 401 ? 'Откройте Mini App заново через Telegram.' : 'Не удалось загрузить список диалогов.'));
      empty(error.status === 401 ? 'Откройте приложение заново' : 'Mini App недоступно',
        error.status === 401 ? 'Войдите через кнопку «Диалоги» в чате с ботом.' : 'Проверьте подключение и повторите попытку.',
        error.status === 401 ? null : () => void refresh());
    }
  } finally {
    refreshing = false;
  }
}

search.addEventListener('input', renderList);
profile.addEventListener('change', renderList);
byId('back').addEventListener('click', showList);
telegram?.BackButton?.onClick?.(showList);
if (telegram?.isVersionAtLeast?.('6.9')) {
  telegram.setHeaderColor?.('#ffffff');
  telegram.setBackgroundColor?.('#ffffff');
}
telegram?.ready?.();
telegram?.expand?.();

if (demo || telegram?.initData) {
  void refresh();
  if (!demo) setInterval(() => { if (!document.hidden) void refresh(); }, 12_000);
} else {
  connection('Вход через Telegram');
  list.replaceChildren(element('p', 'note', 'Откройте «Диалоги» в чате с ботом.'));
  empty('Переписки Авито', 'История доступна после входа через Telegram.');
}
