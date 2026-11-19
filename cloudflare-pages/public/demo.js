const now = Date.now();
const minutesAgo = (minutes) => now - minutes * 60_000;
const conversations = [
  ['Мария Волкова', 'msedge-pilot-1', [
    ['incoming', 'Здравствуйте! Ищу монтажёра для серии роликов о студии. Можно обсудить детали?', 1670],
    ['outgoing', 'Здравствуйте, Мария! Да, конечно. Сколько роликов запланировано и где они будут опубликованы?', 1660],
    ['incoming', 'Планируем пять вертикальных роликов. Съёмку уже закончили, могу прислать исходники.', 70],
    ['outgoing', 'Хорошо. Пришлите исходники и пару примеров по стилю. После просмотра смогу назвать сроки.', 56],
    ['incoming', 'Отлично, примеры тоже соберу. Первый ролик нужен к пятнице — успеем?', 19],
    ['outgoing', 'Да, если получу материалы сегодня, первый вариант отправлю в четверг.', 11],
    ['incoming', 'Подходит! Пришлю материалы сегодня вечером.', 4],
  ]],
  ['Дмитрий Соколов', 'msedge-pilot-1', [
    ['incoming', 'Добрый день! Сколько стоит монтаж одного короткого ролика?', 50],
    ['outgoing', 'Добрый день! Цена зависит от длительности и количества исходников.', 25],
  ]],
  ['Студия «Кадр»', 'chrome-studio', [
    ['outgoing', 'Подскажите, пожалуйста, какой формат сдачи вам удобнее?', 105],
    ['incoming', 'Для нас подойдёт MP4 в двух версиях.', 73],
  ]],
  ['Алина', 'msedge-pilot-1', [
    ['incoming', 'Спасибо, посмотрела первый вариант!', 215],
    ['outgoing', 'Отлично, тогда подготовлю финальный экспорт.', 180],
  ]],
  ['Илья Новиков', 'chrome-studio', [
    ['incoming', 'Есть свободное время на следующей неделе?', 1580],
  ]],
  ['Артём', 'msedge-pilot-1', [
    ['incoming', 'Хорошо, договорились. Спасибо!', 3080],
  ]],
];

export const demoThreads = conversations.map(([title, profile, entries], index) => {
  const dialog = { title, profile, id: `demo-${index}` };
  const messages = entries.map(([direction, body, minutes], position) => ({
    id: `${dialog.id}-${position}`, body, direction, sentAt: minutesAgo(minutes),
  }));
  const last = messages.at(-1);
  return { dialog, messages, before: null, summary: { ...dialog, preview: last.body, direction: last.direction, sentAt: last.sentAt } };
});
