import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslations from "./en.json";
import esTranslations from "./es.json";

const resources = {
  en: { translation: enTranslations },
  es: { translation: esTranslations },
};

// Detect language from browser/system settings, defaulting to Spanish
const getInitialLanguage = (): string => {
  const browserLang = navigator.language || navigator.languages?.[0] || "es";
  const langCode = browserLang.split("-")[0].toLowerCase();
  return langCode === "en" ? "en" : "es";
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: "es",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

export default i18n;
