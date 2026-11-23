/** Сохранённая сессия тестового аккаунта для разделов 3–4 (папка в .gitignore) */
export const AUTH_STATE_FILE = "playwright/.auth/user.json";

/** Негативные данные формы входа по почте (TC-2.3.1, TC-2.3.2) */
export const INVALID_EMAILS = [
  { value: "user@", reason: "нет домена" },
  { value: "user.mail.com", reason: "нет символа @" },
] as const;

export const AUTH_MESSAGES = {
  invalidEmail: "Некорректный формат почты",
  emptyEmail: "Введите номер телефона или почту",
  wrongCode: "Неверный код",
} as const;

/**
 * Письмо с OTP-кодом (TC-2.1.1, TC-2.2.1): тема «Confirmation code», код из 6 цифр в строке
 * «NNNNNN — ваш код. Введите его на Unico Play.» (та же строка на казахском и английском).
 * В текстовой версии письма строки набраны ЗАГЛАВНЫМИ — поэтому флаг i. Код живёт ~2 часа.
 */
export const OTP_EMAIL = {
  from: "mailer@unicoplay.com",
  subject: "Confirmation code",
  codePattern: /(\d{6})\s*—\s*ваш код/i,
} as const;

/** Заведомо неверный код: настоящий с изменённой последней цифрой (TC-2.2.1) */
export function wrongCodeFor(code: string): string {
  return code.slice(0, -1) + String((Number(code.at(-1)) + 1) % 10);
}
