/**
 * Продукты из тестовых данных (кейсы в Notion). Все выбраны так, чтобы быть доступными и в Казахстане,
 * и за рубежом (см. test-data/region.ts): часть каталога за пределами Казахстана закрыта.
 * Если продукт уберут с сайта, кейсы и эти данные нужно обновить вместе.
 */
export const PRODUCTS = {
  /** Сериал: серии 1–2 бесплатные (метка «БЕСПЛАТНО»), с 3-й платные */
  freeEpisodeSeries: {
    url: "/ru/watch/chernaya-ikra",
    title: "Черная икра",
    paidEpisodeNumber: 3,
  },
  /** Платный фильм: у гостя в карточке кнопка «Смотреть бесплатно» ведёт на страницу входа */
  paidMovie: {
    url: "/ru/watch/reketir-novye-vremena",
    title: "Рэкетир. Новые времена",
  },
} as const;

/** Поиск контента (TC-1.7.1.1) */
export const CONTENT_SEARCH = {
  query: "Рэкетир. Новые времена",
  productUrl: "/ru/watch/reketir-novye-vremena",
} as const;

/** Продукты для разделов 3–4 (авторизованный пользователь) */
export const AUTHORIZED_PRODUCTS = {
  /** Взрослый профиль: трейлер (TC-3.2.1), поиск (TC-4.3.1) */
  adultTrailer: { url: "/ru/watch/reketir-novye-vremena", title: "Рэкетир. Новые времена" },
  /** Взрослый профиль: «Буду смотреть» и оценка (TC-4.5.x.1, TC-4.6.1) */
  adultFavorite: { url: "/ru/watch/reketir-novye-vremena", title: "Рэкетир. Новые времена" },
  /** Детский профиль: трейлер (TC-3.2.2) — мультфильм 6+ */
  kidsTrailer: { url: "/ru/watch/altyn-adam", title: "Алтын адам" },
  /** Детский профиль: поиск, «Буду смотреть», оценка (TC-4.3.2, TC-4.5.x.2, TC-4.6.2) — мультсериал 0+ */
  kidsFavorite: { url: "/ru/watch/gruzovichok-lyova", title: "Грузовичок Лёва" },
  /** Взрослый профиль: поиск персоны (TC-4.4.1) — первый актёр из карточки */
  personSource: { url: "/ru/watch/chernaya-ikra", title: "Черная икра" },
} as const;
