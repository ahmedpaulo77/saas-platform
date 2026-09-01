// src/components/common/PasswordStrengthMeter.js
// مقياس قوة كلمة المرور مع متطلبات واضحة
import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

/**
 * Returns an object describing password strength.
 * score: 0-4
 * checks: { length, uppercase, lowercase, number, symbol }
 */
export function getPasswordStrength(password) {
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number:    /[0-9]/.test(password),
    symbol:    /[^A-Za-z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { score, checks };
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#6366f1'];
const LABELS_KEY = ['pf.weak2', 'pf.weak', 'pf.mid', 'pf.strong', 'pf.vstrong'];

export default function PasswordStrengthMeter({ password }) {
  const { t } = useLanguage();
  if (!password) return null;

  const { score, checks } = getPasswordStrength(password);
  const color = COLORS[Math.min(score, 4)];
  const labelKey = LABELS_KEY[Math.min(score, 4)];

  const requirements = [
    { key: 'length',    labelAr: '8 أحرف على الأقل',          labelEn: 'At least 8 characters' },
    { key: 'uppercase', labelAr: 'حرف كبير (A-Z)',             labelEn: 'Uppercase letter (A-Z)' },
    { key: 'lowercase', labelAr: 'حرف صغير (a-z)',             labelEn: 'Lowercase letter (a-z)' },
    { key: 'number',    labelAr: 'رقم (0-9)',                   labelEn: 'Number (0-9)' },
    { key: 'symbol',    labelAr: 'رمز خاص (!@#$...)',           labelEn: 'Special symbol (!@#$...)' },
  ];

  // detect language direction from html element
  const isRtl = document.documentElement.dir === 'rtl';

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      {/* Strength bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, display: 'flex', gap: 3 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                background: i <= score ? color : 'var(--gray-200, #e2e8f0)',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 60, textAlign: isRtl ? 'right' : 'left' }}>
          {t(labelKey)}
        </span>
      </div>

      {/* Requirements checklist */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
        padding: '8px 10px',
        background: 'var(--gray-50, #f8fafc)',
        borderRadius: 8,
        border: '1px solid var(--gray-200, #e2e8f0)',
      }}>
        {requirements.map(req => (
          <div
            key={req.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              color: checks[req.key] ? '#10b981' : '#94a3b8',
              transition: 'color 0.2s',
            }}
          >
            <i
              className={`fas fa-${checks[req.key] ? 'check-circle' : 'circle'}`}
              style={{ fontSize: 10 }}
            />
            <span style={{ fontWeight: checks[req.key] ? 600 : 400 }}>
              {isRtl ? req.labelAr : req.labelEn}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
