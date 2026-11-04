import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",

  /* Тесты независимы друг от друга: у каждого свой чистый контекст браузера */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  /* Общий таймаут теста: видео-тесты длиннее дефолтных 30 сек */
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* list - вывод в консоль, html - отчет без автооткрытия */
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    /* Стенд задается через переменную окружения, dev - по умолчанию */
    baseURL: process.env.BASE_URL ?? "https://unicoplay.com/",

    /* Фиксируем локаль и таймзону, чтобы дефолтный язык сайта не зависел от машины/CI */
    locale: "kk-KZ",
    timezoneId: "Asia/Almaty",

    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    /* Артефакты для разбора падений */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      /* Брендированный Chrome: в Chromium из комплекта Playwright нет кодеков H.264/AAC */
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        launchOptions: {
          /* Разрешаем автовоспроизведение видео без жеста пользователя */
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      },
    },

    /* Остальные браузеры подключим позже */
    // { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    // { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});