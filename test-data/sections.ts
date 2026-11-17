/**
 * Разделы меню шапки (TC-1.6.1). Таблица повторяет тестовые данные кейса в Notion.
 * - heading: заголовок страницы раздела (h1); null — у раздела нет h1
 * - cards: селектор карточек контента раздела
 * - emptyText: текст, который допустим вместо карточек (раздел может быть пустым)
 */
export interface Section {
  menu: string;
  url: RegExp;
  heading: RegExp | null;
  cards: string;
  emptyText?: RegExp;
}

const WATCH_CARDS = 'a[href^="/ru/watch/"]';

export const MENU_SECTIONS: Section[] = [
  { menu: "Фильмы", url: /\/ru\/movies$/, heading: /^Фильмы\s+смотреть онлайн$/, cards: WATCH_CARDS },
  { menu: "Сериалы", url: /\/ru\/series$/, heading: /^Сериалы\s+смотреть онлайн$/, cards: WATCH_CARDS },
  { menu: "Детям", url: /\/ru\/animation$/, heading: /^Мультфильмы\s+смотреть онлайн$/, cards: WATCH_CARDS },
  { menu: "ТВ", url: /\/ru\/tvchannels$/, heading: /^ТВ\s*$/, cards: 'a[href^="/ru/tvchannels/"]' },
  { menu: "Кино на ТВ", url: /\/ru\/archive$/, heading: /^Записи\s+с\s+ТВ$/, cards: 'a[href^="/ru/archive/"]' },
  {
    menu: "Спорт",
    url: /\/ru\/sport$/,
    heading: null,
    cards: 'a[href^="/ru/sport/"]',
    emptyText: /Новых трансляций пока нет/,
  },
  { menu: "Новинки", url: /\/ru\/collection\/newreleases$/, heading: /^Новинки\s+смотреть онлайн$/, cards: WATCH_CARDS },
];
