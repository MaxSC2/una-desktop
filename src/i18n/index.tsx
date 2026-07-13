import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Language, TranslationKey, translations } from './locales';

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const STORAGE_KEY = 'una.language';
const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLanguage(): Language {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'en' || value === 'kk' || value === 'ru' ? value : 'ru';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    void window.una.onboarding.check().then((result) => {
      const profileLanguage = result.profile?.language;
      if (!localStorage.getItem(STORAGE_KEY) && (profileLanguage === 'ru' || profileLanguage === 'en' || profileLanguage === 'kk')) {
        setLanguageState(profileLanguage);
      }
    }).catch(() => {});
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const setLanguage = (next: Language) => {
      localStorage.setItem(STORAGE_KEY, next);
      setLanguageState(next);
    };

    return {
      language,
      setLanguage,
      t: (key) => translations[language][key] ?? translations.ru[key],
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return value;
}

export type { Language };
export { LANGUAGE_LABELS } from './locales';
