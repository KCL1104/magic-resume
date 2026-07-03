/**
 * Content generation language — deliberately decoupled from the UI locale
 * (useLocale). A user editing the app in English can still generate a resume in
 * Japanese. Slice A ships zh + en in the picker; the map is intentionally wider
 * so new options are a one-line UI change.
 */
export type GenerationLanguage =
  | "zh"
  | "zh-TW"
  | "zh-CN"
  | "en"
  | "ja"
  | "ko"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "it";

/** English display name fed into the AI prompt ("Write all content in X"). */
export const LANGUAGE_PROMPT_NAME: Record<string, string> = {
  zh: "Chinese",
  "zh-TW": "Traditional Chinese",
  "zh-CN": "Simplified Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
};

/** Native label shown in the language <Select>. */
export const LANGUAGE_LABEL: Record<string, string> = {
  zh: "中文",
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
};

/** Options offered in the generation language picker. */
export const GENERATION_LANGUAGE_OPTIONS: GenerationLanguage[] = [
  "zh-TW",
  "zh-CN",
  "en",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt",
  "it",
];

/** Resolve a language code (or free-form string) to the English prompt name. */
export const resolveLanguageName = (language?: string): string => {
  if (!language) return "English";
  return LANGUAGE_PROMPT_NAME[language] ?? language;
};
