// src/components/common/LanguageToggle.js
import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

export default function LanguageToggle({ variant = 'fab' }) {
  const { lang, toggleLang, t } = useLanguage();
  const next = lang === 'ar' ? 'EN' : 'عربي';

  if (variant === 'inline') {
    return (
      <button
        type="button"
        className="lang-toggle lang-toggle-inline"
        onClick={toggleLang}
        aria-label={t('lang.switch')}
        title={t('lang.switch')}
      >
        <i className="fas fa-globe"></i>
        <span>{next}</span>
      </button>
    );
  }

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        className="lang-toggle lang-toggle-sidebar"
        onClick={toggleLang}
        aria-label={t('lang.switch')}
      >
        <i className="fas fa-globe"></i>
        <span>{t('lang.switch')}</span>
        <strong>{next}</strong>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="lang-toggle lang-toggle-fab"
      onClick={toggleLang}
      aria-label={t('lang.switch')}
      title={t('lang.switch')}
    >
      <i className="fas fa-globe"></i>
      <span>{next}</span>
    </button>
  );
}