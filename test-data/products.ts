/**
 * Продукты из тестовых данных (кейсы в Notion: TC-1.4.1, TC-1.5.x, TC-1.7.x).
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
    url: "/ru/watch/dostat-nozhi",
    title: "Достать ножи",
  },
} as const;

/** Поиск контента (TC-1.7.1.1) */
export const CONTENT_SEARCH = {
  query: "Достать ножи",
  productUrl: "/ru/watch/dostat-nozhi",
} as const;
