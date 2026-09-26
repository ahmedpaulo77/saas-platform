import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from './translations';

const LanguageContext = createContext(null);

export { LanguageContext };

const STORAGE_KEY = 'saas-pro-lang';

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? `{${key}}`));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });

  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang, dir]);

  const value = useMemo(() => {
    const dict = translations[lang] || translations.ar;

    // في التطوير: لو مفتاح ناقص، اطبعه في الكونسول. قبل كده كان
        // النص سيرجع للمفتاح نفسه
    const warnMissing = import.meta.env?.DEV;
    const seenMissing = new Set();

    const t = (key, vars) => {
      const text = dict[key];
      if (text == null) {
        if (warnMissing && !seenMissing.has(key)) {
          seenMissing.add(key);
          console.warn(
            `[i18n] missing key "${key}" for lang="${lang}" — ` +
            (lang === 'ar' ? 'النص سيرجع للمفتاح نفسه' : 'the raw key will be shown to the user')
          );
        }
        return key;
      }
      return interpolate(String(text), vars);
    };

    const toggleLang = () => setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
    const setLang = (next) => setLangState(next === 'en' ? 'en' : 'ar');

    return { lang, dir, locale, t, toggleLang, setLang, isRTL: lang === 'ar' };
  }, [lang, dir, locale]); // ✅ تمت إضافة dir و locale

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}