import js from "@eslint/js";
import tseslint from "typescript-eslint";
import playwright from "eslint-plugin-playwright";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["node_modules/", "playwright-report/", "test-results/", "playwright/", "eslint.config.mts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Правила с проверкой типов: главное — пропущенный await (no-floating-promises)
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    ...playwright.configs["flat/recommended"],
    files: ["tests/**/*.ts", "pages/**/*.ts", "components/**/*.ts", "fixtures/**/*.ts"],
    rules: {
      ...playwright.configs["flat/recommended"].rules,
      // Проверки вынесены в Page Object (product.expectDetailsShown() и т.п.) — expect в самом тесте не обязателен
      "playwright/expect-expect": "off",
      // test.skip(!hasTestAccount(), …) — тесты со входом пропускаются без .env; безусловный skip запрещён
      "playwright/no-skipped-test": ["warn", { allowConditional: true }],
      // Условия намеренные: «открывать линейки, пока не откроем и фильм, и сериал», возврат состояния
      // «если активен детский профиль», проверка сохранённой сессии в setup
      "playwright/no-conditional-in-test": "off",
    },
  },
  // Последним: отключает правила оформления, которые конфликтуют с Prettier
  prettier,
);
