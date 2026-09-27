import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.js';

// Firebase/Auth/i18n كلها side-effects تقيلة — نعمل mock خفيف
// حتى يختبر التست الـ routing الأساسي من غير ما يضرب في الشبكة.
vi.mock('./context/AuthContext.js', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    currentUser: null,
    userRole: null,
    userCompanyId: null,
    userIndustry: 'general',
    loading: false,
  }),
}));

vi.mock('./context/NotificationsContext.js', () => ({
  NotificationsProvider: ({ children }) => children,
  useNotifications: () => ({ unreadCount: 0 }),
}));

vi.mock('./i18n/LanguageContext.js', () => ({
  LanguageContext: { Provider: ({ children }) => children },
  LanguageProvider: ({ children }) => children,
  useLanguage: () => ({ t: (k) => k, lang: 'ar', dir: 'rtl' }),
}));

vi.mock('./firebase/config.js', () => ({
  auth: {},
  db: {},
  storage: null,
  messaging: null,
}));

describe('App shell', () => {
  it('renders without crashing on a public route', () => {
    window.history.pushState({}, '', '/login');
    const { container } = render(<App />);
    // التطبيق يرسم شجرة DOM حقيقية من غير ما يضرب في Firebase/Auth
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
