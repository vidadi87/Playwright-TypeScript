/** Негативные данные формы входа по почте (TC-2.4.1, TC-2.4.2) */
export const INVALID_EMAILS = [
  { value: "user@", reason: "нет домена" },
  { value: "user.mail.com", reason: "нет символа @" },
] as const;

export const AUTH_MESSAGES = {
  invalidEmail: "Некорректный формат почты",
  emptyEmail: "Введите номер телефона или почту",
} as const;
