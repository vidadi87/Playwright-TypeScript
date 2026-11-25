import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE_FILE } from "./test-data/auth";
import { KZ_ONLY, REGION } from "./test-data/region";

/* Секреты тестового Gmail (TEST_EMAIL, GMAIL_APP_PASSWORD) — из .env, см. .env.example.
   В CI те же переменные задаются секретами окружения */
if (existsSync(".env")) process.loadEnvFile(".env");

/**
 * See https://playwright.dev/docs/test-configuration.
 */
/* Брендированный Chrome: в Chromium из комплекта Playwright нет кодеков H.264/AAC.
   Автовоспроизведение видео без жеста пользователя */
const CHROME = {
  ...devices["Desktop Chrome"],
  channel: "chrome",
  launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
};

export default defineConfig({
  testDir: "./tests",

  /* За пределами Казахстана (REGION=intl) проверки только для Казахстана не запускаются */
  grepInvert: REGION === "intl" ? new RegExp(KZ_ONLY) : undefined,

  /* Тесты независимы друг от друга: у каждого свой чистый контекст браузера */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /* Сайт боевой и под нагрузкой бывает медленным: 1 повтор локально, 2 в CI */
  retries: process.env.CI ? 2 : 1,
  /* Не больше 2 параллельных браузеров: при большем числе сайт тормозит и тесты падают по таймаутам */
  workers: process.env.CI ? 1 : 2,

  /* Общий таймаут теста: видео-тесты длиннее дефолтных 30 сек */
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* list - вывод в консоль, html - отчет без автооткрытия */
  /* В CI ещё github: ошибки упавших тестов попадают в аннотации прогона, их видно без скачивания отчёта */
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    /* Стенд задается через переменную окружения, dev - по умолчанию */
    baseURL: process.env.BASE_URL ?? "https://unicoplay.com/",

    /* Фиксируем локаль и таймзону, чтобы дефолтный язык сайта не зависел от машины/CI */
    locale: "kk-KZ",
    timezoneId: "Asia/Almaty",

    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    /* Артефакты для разбора падений. В CI выключены: отчёт публичного репозитория может скачать
       любой пользователь GitHub, а на скриншотах, видео и трейсах входа и страницы «Аккаунт» — адрес почты */
    trace: process.env.CI ? "off" : "retain-on-failure",
    screenshot: process.env.CI ? "off" : "only-on-failure",
    video: process.env.CI ? "off" : "retain-on-failure",
  },

  projects: [
    /* Вход в тестовый аккаунт для разделов 3–4 (сессия переиспользуется, пока действует) */
    { name: "setup", testMatch: /auth\.setup\.ts/, use: CHROME },
    /* Гость и форма входа. Зависимость от setup — чтобы запросы кода из 2.x не пересекались по времени
       со входом в setup (один ящик — один ожидаемый код) */
    {
      name: "chromium",
      testMatch: /(1-guest|2-auth)\.spec\.ts/,
      dependencies: ["setup"],
      use: CHROME,
    },
    /* Авторизованный пользователь (разделы 3–4) с сохранённой сессией */
    {
      name: "chromium-authorized",
      testMatch: /(3|4)-.*\.spec\.ts/,
      testIgnore: /-account-changes\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...CHROME, storageState: AUTH_STATE_FILE },
    },
    /* Язык, аватар, «Буду смотреть» и оценки меняются в профиле на сервере: параллельно идущие тесты
       увидели бы чужие изменения. Поэтому эти тесты идут по одному, после остальных тестов
       авторизованного пользователя */
    {
      name: "chromium-account-changes",
      testMatch: /-account-changes\.spec\.ts/,
      dependencies: ["chromium-authorized"],
      fullyParallel: false,
      workers: 1,
      use: { ...CHROME, storageState: AUTH_STATE_FILE },
    },
  ],
});
