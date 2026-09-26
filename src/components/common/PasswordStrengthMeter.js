// src/components/common/PasswordStrengthMeter.js
// مقياس قوة كلمة المرور مع متطلبات واضحة
import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

/**
 * 🔴 سياسة كلمة المرور — المصدر الوحيد.
 *
 * المشكلة: الـ meter كان بيعرض 5 متطلبات (8 أحرف + كبير + صغير + رقم +
 * رمز)، لكن كل النماذج (Signup / Profile / Users / ManageUsers) كانت
 * بتتأكد من "6 أحرف + حرف كبير + رمز" بس. يعني المستخدم كان بيشوف
 * "باسوردك ناقص 2 شرط" والنموذج **بيقبله** →usters-alignment.
 *
 * الحل: كل النماذج تستدعي نفس الدالة دي.
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

/**
 * Returns an object describing password strength.
 * score: 0-4
 * checks: { length, uppercase, lowercase, number, symbol }
 */
export function getPasswordStrength(password) {
  const p = password || '';
  const checks = {
    length:    p.length >= PASSWORD_POLICY.minLength,
    uppercase: /[A-Z]/.test(p),
    lowercase: /[a-z]/.test(p),
    number:    /[0-9]/.test(p),
    symbol:    /[^A-Za-z0-9]/.test(p),
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { score, checks };
}

/**
 * ✅ فحوصات كلمة المرور — استخدمها في كل النماذج.
 * @param {string} password
 * @param {{password?: string, confirm?: string}} [opts] لو فيه تأكيد، مرره في confirm
 * @returns {{ ok: boolean, missing: string[] }} missing = رموز المتطلبات الناقصة
 */
export function validatePassword(password, opts = {}) {
  const p = password || '';
  const { checks } = getPasswordStrength(p);
  const missing = [];
  if (!checks.length) missing.push('length');
  if (PASSWORD_POLICY.requireUppercase && !checks.uppercase) missing.push('uppercase');
  if (PASSWORD_POLICY.requireLowercase && !checks.lowercase) missing.push('lowercase');
  if (PASSWORD_POLICY.requireNumber && !checks.number) missing.push('number');
  if (PASSWORD_POLICY.requireSymbol && !checks.symbol) missing.push('symbol');
  if (opts.confirm !== undefined && p !== opts.confirm) missing.push('match');
  return { ok: missing.length === 0, missing };
}

/** رموز المتطلبات الناقصة → نص عربي (للاستخدام في alert) */
export const PASSWORD_MISSING_LABEL_AR = {
  length: '8 أحرف على الأقل',
  uppercase: 'حرف كبير (A-Z)',
  lowercase: 'حرف صغير (a-z)',
  number: 'رقم (0-9)',
  symbol: 'رمز خاص (!@#$)',
  match: 'تطابق كلمتي السر',
};

const COLORS = ['#ef4444', '#f97316', '#f59b0b', '#10b981', '#6366f1'];
const LABELS_KEY = ['pf.weak2', 'pf.weak', 'pf.mid', 'pf.strong', 'pf.vstrong'];

export default function PasswordStrengthMeter({ password }) {
  const { t } = useLanguage();
  if (!password) return null;

  const { score, checks } = getPasswordStrength(password);
  const color = COLORS[Math.min(score, 4)];
  const labelKey = LABELS_KEY[Math.min(score, 4)];

  // المتطلبات مرتبطة بـ PASSWORD_POLICY — المصدر واحد مع النماذج
  const requirements = [
      { key: 'length',    labelAr: `${PASSWORD_POLICY.minLength} أحرف على الأقل`,        labelEn: `At least ${PASSWORD_POLICY.minLength} characters` },
      { key: 'uppercase', labelAr: 'حرف كبير (A-Z)',             labelEn: 'Uppercase letter (A-Z)' },
      { key: 'lowercase', labelAr: 'حرف صغير (a-z)',             labelEn: 'Lowercase letter (a-z)' },
      { key: 'number',    labelAr: 'رقم (0-9)',                   labelEn: 'Number (0-9)' },
      { key: 'symbol',    labelAr: 'رمز خاص (!@#$)',              labelEn: 'Special symbol (!@#$)' },
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
