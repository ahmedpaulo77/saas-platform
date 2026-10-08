// src/pages/MyCompany.js - مع دعم الترجمة وكودين
import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config.js';
import { useAuth } from '../context/AuthContext.js';
import { getCompanyInviteCodes, regenerateCompanyInviteCode } from '../utils/companyQuery.js';
import { hashPin, isValidPinFormat } from '../utils/pin.js';
import { DASH_CARDS, normHiddenCards } from '../utils/dashCards.js';
import { getAvailableModules } from '../utils/modules.js';
import Sidebar from '../components/common/Sidebar.js';
import { useLanguage } from '../i18n/LanguageContext.js';

export default function MyCompany() {
  const { t } = useLanguage();
  const { userCompanyId, userRole, currentUser } = useAuth();
  const [company, setCompany] = useState(null);
  const [codes, setCodes] = useState({ adminCode: '', userCode: '' });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState({ admin: false, user: false });
  const [regenerating, setRegenerating] = useState({ admin: false, user: false });
  const [error, setError] = useState('');
  // إعدادات الضريبة (أدمن فقط)
  const [taxRate, setTaxRate] = useState('');
  const [savingTax, setSavingTax] = useState(false);
  // لوجو المحل — يظهر فقط لو الميزة مفعلة من السوبر أدمن
  const [savingLogo, setSavingLogo] = useState(false);
  const logoEnabled = !!(company && company.features && company.features.customLogo);
  // نص سياسة الاستبدال على الريسيت — كل محل يكتب اللي يناسبه (فاضي = إخفاء)
  const [receiptPolicy, setReceiptPolicy] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);
  // الحقول الإلزامية في نقطة البيع (ملابس) — الكاشير والسيلز checkboxes، والباقي إلزامي دايماً
  const [posReq, setPosReq] = useState({ cashier: true, salesRep: false });
  const [savingPosReq, setSavingPosReq] = useState(false);
  // البين كود بتاع الأدمن نفسه (للاستبدال والمرتجع) — يتخزن hash فقط
  const [pinValue, setPinValue] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  // كروت الداشبورد الظاهرة — checkboxes جنب بعض (flex-wrap)
  const [dashHidden, setDashHidden] = useState([]);
  const [savingDash, setSavingDash] = useState(false);

  function fileToLogo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxSize = 300;
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userCompanyId) return;
    setSavingLogo(true);
    setError('');
    try {
      const logoUrl = await fileToLogo(file);
      await updateDoc(doc(db, 'companies', userCompanyId), { logoUrl });
      setCompany((c) => ({ ...c, logoUrl }));
      alert(t('mc.logoSaved'));
    } catch (err) {
      console.error('Error saving logo:', err);
      setError(t('common.errorGeneric'));
    } finally {
      setSavingLogo(false);
    }
  }

  async function handleSavePolicy(e) {
    e.preventDefault();
    if (!userCompanyId) return;
    setSavingPolicy(true);
    setError('');
    try {
      await updateDoc(doc(db, 'companies', userCompanyId), { receiptPolicy: receiptPolicy.trim() });
      setCompany((c) => ({ ...c, receiptPolicy: receiptPolicy.trim() }));
      alert(t('mc.policySaved'));
    } catch (err) {
      console.error('Error saving policy:', err);
      setError(t('common.errorGeneric'));
    } finally {
      setSavingPolicy(false);
    }
  }

  async function handleSavePosReq(e) {
    e.preventDefault();
    if (!userCompanyId) return;
    setSavingPosReq(true);
    setError('');
    try {
      const payload = { cashier: !!posReq.cashier, salesRep: !!posReq.salesRep };
      await updateDoc(doc(db, 'companies', userCompanyId), { posRequirements: payload });
      setCompany((c) => ({ ...c, posRequirements: payload }));
      alert(t('mc.posReqSaved'));
    } catch (err) {
      console.error('Error saving POS requirements:', err);
      setError(t('common.errorGeneric'));
    } finally {
      setSavingPosReq(false);
    }
  }

  async function handleSavePin(e) {
    e.preventDefault();
    if (!userCompanyId || !currentUser?.uid) return;
    const value = pinValue.trim();
    if (!isValidPinFormat(value)) {
      alert(t('pin.invalid'));
      return;
    }
    setSavingPin(true);
    setError('');
    try {
      const pinHash = await hashPin(value, `${userCompanyId}|${currentUser.uid}`);
      await updateDoc(doc(db, 'users', currentUser.uid), { pinHash });
      setPinValue('');
      alert(t('pin.saved'));
    } catch (err) {
      console.error('Error saving PIN:', err);
      setError(t('common.errorGeneric'));
    } finally {
      setSavingPin(false);
    }
  }

  // كروت الداشبورد الخاصة بمجال الشركة — من نفس مصدر العرض (DASH_CARDS)
  const companyDashCards = DASH_CARDS.filter((c) =>
    getAvailableModules(company?.industry || 'general', 'admin').has(c.module)
  );

  function toggleDashCard(key) {
    setDashHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSaveDashCards(e) {
    e.preventDefault();
    if (!userCompanyId) return;
    setSavingDash(true);
    setError('');
    try {
      const payload = normHiddenCards(dashHidden);
      await updateDoc(doc(db, 'companies', userCompanyId), { hiddenDashCards: payload });
      setCompany((c) => ({ ...c, hiddenDashCards: payload }));
      alert(t('mc.dashCardsSaved'));
    } catch (err) {
      console.error('Error saving dashboard cards:', err);
      setError(t('common.errorGeneric'));
    } finally {
      setSavingDash(false);
    }
  }

  async function handleLogoRemove() {
    if (!userCompanyId || !window.confirm(t('common.confirmDelete'))) return;
    setSavingLogo(true);
    try {
      await updateDoc(doc(db, 'companies', userCompanyId), { logoUrl: "" });
      setCompany((c) => ({ ...c, logoUrl: "" }));
      alert(t('mc.logoRemoved'));
    } catch (err) {
      console.error('Error removing logo:', err);
      setError(t('common.errorGeneric'));
    } finally {
      setSavingLogo(false);
    }
  }

  // ✅ التحقق من أن المستخدم Admin عشان يشوف قسم الأكواد
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isClothingCompany = (company?.industry || '') === 'clothing';

  const fetchCompanyAndCodes = useCallback(async () => {
    if (!userCompanyId) return;
    setLoading(true);
    setError('');
    try {
      const companyRef = doc(db, 'companies', userCompanyId);
      const snap = await getDoc(companyRef);
      if (!snap.exists()) {
        setError(t('mc.notFound'));
        setLoading(false);
        return;
      }
      setCompany({ id: snap.id, ...snap.data() });
      setTaxRate(snap.data().taxRate != null ? String(snap.data().taxRate) : '');
      setReceiptPolicy(snap.data().receiptPolicy != null ? String(snap.data().receiptPolicy) : '');
      const pr = snap.data().posRequirements || {};
      setPosReq({
        cashier: pr.cashier !== false,
        salesRep: pr.salesRep === true,
      });
      setDashHidden(normHiddenCards(snap.data().hiddenDashCards));

      // الأكواد في السبل-كولكشن companies/{id}/codes/current
      // (المصدر الرسمي للتحقق هو invite_codes — انظر utils/companyQuery.js)
      if (isAdmin) {
        try {
          const c = await getCompanyInviteCodes(userCompanyId);
          setCodes({ adminCode: c.adminCode, userCode: c.userCode });
        } catch (e) {
          console.error('Error loading invite codes:', e);
          setError(t('mc.fetchErr'));
        }
      }
    } catch (err) {
      console.error('Error fetching company:', err);
      setError(t('mc.fetchErr'));
    } finally {
      setLoading(false);
    }
  }, [userCompanyId, isAdmin, t]);

  useEffect(() => {
    fetchCompanyAndCodes();
  }, [fetchCompanyAndCodes]);

  async function handleRegenerate(type) {
    if (!userCompanyId) return;
    const role = type === 'admin' ? 'admin' : 'user';
    if (!window.confirm(t('mc.regenConfirm'))) return;
    setRegenerating(prev => ({ ...prev, [type]: true }));
    setError('');
    try {
      const newCode = await regenerateCompanyInviteCode(userCompanyId, role);
      setCodes(prev => ({ ...prev, [type === 'admin' ? 'adminCode' : 'userCode']: newCode }));
      alert(t('mc.regenOk'));
    } catch (err) {
      console.error('Error regenerating code:', err);
      setError(t('mc.regenErr'));
    } finally {
      setRegenerating(prev => ({ ...prev, [type]: false }));
    }
  }

  async function handleCopy(type) {
    const code = type === 'admin' ? codes.adminCode : codes.userCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(prev => ({ ...prev, [type]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [type]: false })), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(prev => ({ ...prev, [type]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [type]: false })), 2000);
    }
  }


  async function handleSaveTax(e) {
    e.preventDefault();
    if (!userCompanyId) return;
    const rate = parseFloat(taxRate);
    if (taxRate !== '' && !(rate >= 0 && rate <= 100)) { setError(t('mc.taxInvalid')); return; }
    setSavingTax(true);
    setError('');
    try {
      await updateDoc(doc(db, 'companies', userCompanyId), {
        taxRate: taxRate === '' ? 0 : rate,
        updatedAt: new Date().toISOString(),
      });
      setCompany((c) => ({ ...c, taxRate: taxRate === '' ? 0 : rate }));
      alert(t('mc.taxSaved'));
    } catch (err) {
      console.error('Error saving tax:', err);
      setError(t('mc.taxErr'));
    }
    setSavingTax(false);
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t('mc.myTitle')}</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
              {t('mc.mySubtitle')}
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 20,
            color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, marginBottom: 12 }}></i>
            <p>{t('mc.loading')}</p>
          </div>
        ) : company ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Company Info Card */}
            <div className="card" style={{ padding: '24px 28px' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>
                <i className="fas fa-building" style={{ marginLeft: 8, color: '#6366f1' }}></i>
                {t('mc.myTitle')}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('mc.companyName')}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                    {company.name || '—'}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('common.email')}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', wordBreak: 'break-all' }}>
                    {company.email || '—'}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('mc.status')}</div>
                  <div>
                    <span className="badge" style={{
                      background: `${company.isActive ? '#10b981' : '#ef4444'}22`,
                      color: company.isActive ? '#10b981' : '#ef4444',
                      border: `1px solid ${company.isActive ? '#10b981' : '#ef4444'}44`,
                      borderRadius: 8,
                      padding: '4px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                    }}>
                      {company.isActive ? t('status.active') : t('status.expired')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 🖼️ لوجو المحل — يظهر فقط لو السوبر أدمن فعّل الميزة */}
            {isAdmin && (
              <div className="card" style={{ padding: '24px 28px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#475569' }}>
                  <i className="fas fa-image" style={{ color: '#6366f1', marginLeft: 8 }}></i>
                  {t('mc.logo')}
                </h3>
                {!logoEnabled ? (
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
                    <i className="fas fa-lock" style={{ marginLeft: 6 }}></i>
                    {t('mc.logoLocked')}
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    {company.logoUrl && (
                      <img src={company.logoUrl} alt="logo" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 12, border: '2px solid #e2e8f0', background: 'white' }} />
                    )}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <p style={{ margin: '0 0 10px', color: '#64748b', fontSize: 13 }}>{t('mc.logoHint')}</p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <label className="btn-primary btn-sm" style={{ cursor: savingLogo ? 'wait' : 'pointer', opacity: savingLogo ? 0.6 : 1 }}>
                          <i className="fas fa-upload"></i> {t('common.save')}
                          <input type="file" accept="image/*" onChange={handleLogoChange} disabled={savingLogo} style={{ display: 'none' }} />
                        </label>
                        {company.logoUrl && (
                          <button onClick={handleLogoRemove} className="btn-danger btn-sm" disabled={savingLogo} title={t("common.delete")}>
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 📋 نص سياسة الاستبدال على الريسيت — كل محل يكتب اللي يناسبه */}
            {isAdmin && (
              <div className="card" style={{ padding: '24px 28px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#475569' }}>
                  <i className="fas fa-receipt" style={{ color: '#6366f1', marginLeft: 8 }}></i>
                  {t('mc.policy')}
                </h3>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                  {t('mc.policyHint')}
                </p>
                <form onSubmit={handleSavePolicy} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
                    <textarea
                      rows={3}
                      placeholder={t('mc.policyPh')}
                      value={receiptPolicy}
                      onChange={(e) => setReceiptPolicy(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                  <button type="submit" className="btn-primary btn-sm" disabled={savingPolicy}>
                    {savingPolicy ? <><i className="fas fa-spinner fa-spin"></i> {t('common.saving')}</> : <><i className="fas fa-save"></i> {t('common.save')}</>}
                  </button>
                </form>
              </div>
            )}

            {/* ✅ الحقول الإلزامية في نقطة البيع — أدمن + شركات الملابس فقط */}
            {isAdmin && isClothingCompany && (
              <div className="card" style={{ padding: '24px 28px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#475569' }}>
                  <i className="fas fa-list-check" style={{ color: '#1e3a8a', marginLeft: 8 }}></i>
                  {t('mc.posReqTitle')}
                </h3>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                  {t('mc.posReqHint')}
                </p>
                <form onSubmit={handleSavePosReq} style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!posReq.cashier}
                      onChange={(e) => setPosReq({ ...posReq, cashier: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#1e3a8a' }}
                    />
                    🧑‍💼 {t('mc.reqCashier')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!posReq.salesRep}
                      onChange={(e) => setPosReq({ ...posReq, salesRep: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#1e3a8a' }}
                    />
                    🤝 {t('mc.reqSalesRep')}
                  </label>
                  <button type="submit" className="btn-primary btn-sm" disabled={savingPosReq}>
                    {savingPosReq ? <><i className="fas fa-spinner fa-spin"></i> {t('common.saving')}</> : <><i className="fas fa-save"></i> {t('common.save')}</>}
                  </button>
                </form>
              </div>
            )}

            {/* 📊 كروت الداشبورد الظاهرة — checkboxes جنب بعض — يظهر فقط للأدمن */}
            {isAdmin && (
              <div className="card" style={{ padding: '24px 28px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#475569' }}>
                  <i className="fas fa-th-large" style={{ color: '#1e3a8a', marginLeft: 8 }}></i>
                  {t('mc.dashCardsTitle')}
                </h3>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                  {t('mc.dashCardsHint')}
                </p>
                <form onSubmit={handleSaveDashCards}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                    {companyDashCards.map((c) => {
                      const off = dashHidden.includes(c.key);
                      return (
                        <label
                          key={c.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 13,
                            fontWeight: 700,
                            color: off ? '#94a3b8' : '#1e293b',
                            background: off ? '#f8fafc' : '#f0fdf4',
                            border: off ? '1px solid #e2e8f0' : '1px solid #86efac',
                            borderRadius: 10,
                            padding: '8px 14px',
                            cursor: 'pointer',
                            textDecoration: off ? 'line-through' : 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!off}
                            onChange={() => toggleDashCard(c.key)}
                            style={{ width: 16, height: 16, accentColor: '#059669' }}
                          />
                          {t(c.labelKey)}
                        </label>
                      );
                    })}
                  </div>
                  <button type="submit" className="btn-primary btn-sm" disabled={savingDash}>
                    {savingDash ? <><i className="fas fa-spinner fa-spin"></i> {t('common.saving')}</> : <><i className="fas fa-save"></i> {t('common.save')}</>}
                  </button>
                </form>
              </div>
            )}

            {/* 🔑 البين كود بتاع الأدمن نفسه — يظهر فقط للأدمن */}
            {isAdmin && userCompanyId && currentUser?.uid && (
              <div className="card" style={{ padding: '24px 28px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#475569' }}>
                  <i className="fas fa-key" style={{ color: '#1e3a8a', marginLeft: 8 }}></i>
                  {t('mc.pinTitle')}
                </h3>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                  {t('mc.pinHint')}
                </p>
                <form onSubmit={handleSavePin} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      placeholder={t('pin.newPh')}
                      value={pinValue}
                      onChange={(e) => setPinValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      style={{ textAlign: 'center', fontSize: 18, letterSpacing: 6, fontFamily: 'monospace', direction: 'ltr' }}
                    />
                  </div>
                  <button type="submit" className="btn-primary btn-sm" disabled={savingPin}>
                    {savingPin ? <><i className="fas fa-spinner fa-spin"></i> {t('common.saving')}</> : <><i className="fas fa-save"></i> {t('common.save')}</>}
                  </button>
                </form>
              </div>
            )}

            {/* ✅ دعوة - يظهر فقط للأدمن */}
            {isAdmin && (
              <>
                {/* Tax settings (admin) — نسبة الضريبة على الفواتير + تقرير الضريبة */}
            {isAdmin && (
              <div className="card" style={{ padding: '24px 28px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#475569' }}>
                  <i className="fas fa-percent" style={{ color: '#6366f1', marginLeft: 8 }}></i>
                  {t('mc.taxTitle')}
                </h3>
                <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                  {t('mc.taxDesc')}
                </p>
                <form onSubmit={handleSaveTax} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
                    <label>{t('mc.taxRate')}</label>
                    <input type="number" min="0" max="100" step="0.01" placeholder={t('mc.taxRatePh')} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                  </div>
                  <button type="submit" className="btn-primary btn-sm" disabled={savingTax}>
                    {savingTax ? <><i className="fas fa-spinner fa-spin"></i> {t('common.saving')}</> : <><i className="fas fa-save"></i> {t('common.save')}</>}
                  </button>
                </form>
              </div>
            )}

            {/* Admin Code */}
                <div className="card" style={{
                  padding: '24px 28px',
                  border: '2px solid rgba(245,158,11,0.3)',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.05) 0%, rgba(245,158,11,0.02) 100%)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#475569' }}>
                      <i className="fas fa-crown" style={{ color: '#f59e0b', marginLeft: 8 }}></i>
                      كود المدير (Admin)
                    </h3>
                    <span className="badge" style={{
                      background: '#fef3c7',
                      color: '#d97706',
                      padding: '2px 12px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                    }}>
                      صلاحيات كاملة
                    </span>
                  </div>
                  <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                    استخدم هذا الكود لدعوة مديرين جدد للشركة (يتمتعون بصلاحيات كاملة)
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'rgba(245,158,11,0.1)',
                      border: '2px solid rgba(245,158,11,0.3)',
                      borderRadius: 10,
                      padding: '10px 20px',
                      flex: '0 0 auto',
                    }}>
                      <span style={{
                        fontSize: 24,
                        fontFamily: '"Courier New", Courier, monospace',
                        fontWeight: 700,
                        letterSpacing: 4,
                        color: '#d97706',
                      }}>
                        {codes.adminCode || t('mc.notGenerated')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy('admin')}
                      className="btn-secondary btn-sm"
                      disabled={!codes.adminCode}
                      style={{ padding: '8px 16px' }}
                    >
                      <i className={copied.admin ? 'fas fa-check' : 'fas fa-copy'}></i>
                      {copied.admin ? t('common.copied') : t('co.copyCode')}
                    </button>
                    <button
                      onClick={() => handleRegenerate('admin')}
                      className="btn-primary btn-sm"
                      disabled={regenerating.admin}
                      style={{ padding: '8px 16px' }}
                    >
                      <i className={`fas fa-sync-alt ${regenerating.admin ? 'fa-spin' : ''}`}></i>
                      {regenerating.admin ? t('mc.regening') : t('mc.regen')}
                    </button>
                  </div>
                </div>

                {/* User Code */}
                <div className="card" style={{
                  padding: '24px 28px',
                  border: '2px solid rgba(16,185,129,0.3)',
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.02) 100%)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#475569' }}>
                      <i className="fas fa-user" style={{ color: '#10b981', marginLeft: 8 }}></i>
                      كود الموظف (User)
                    </h3>
                    <span className="badge" style={{
                      background: '#d1fae5',
                      color: '#059669',
                      padding: '2px 12px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                    }}>
                      صلاحيات محدودة
                    </span>
                  </div>
                  <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
                    استخدم هذا الكود لدعوة موظفين جدد (يتمتعون بصلاحيات محدودة - قراءة وإضافة فقط)
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'rgba(16,185,129,0.1)',
                      border: '2px solid rgba(16,185,129,0.3)',
                      borderRadius: 10,
                      padding: '10px 20px',
                      flex: '0 0 auto',
                    }}>
                      <span style={{
                        fontSize: 24,
                        fontFamily: '"Courier New", Courier, monospace',
                        fontWeight: 700,
                        letterSpacing: 4,
                        color: '#059669',
                      }}>
                        {codes.userCode || t('mc.notGenerated')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy('user')}
                      className="btn-secondary btn-sm"
                      disabled={!codes.userCode}
                      style={{ padding: '8px 16px' }}
                    >
                      <i className={copied.user ? 'fas fa-check' : 'fas fa-copy'}></i>
                      {copied.user ? t('common.copied') : t('co.copyCode')}
                    </button>
                    <button
                      onClick={() => handleRegenerate('user')}
                      className="btn-primary btn-sm"
                      disabled={regenerating.user}
                      style={{ padding: '8px 16px' }}
                    >
                      <i className={`fas fa-sync-alt ${regenerating.user ? 'fa-spin' : ''}`}></i>
                      {regenerating.user ? t('mc.regening') : t('mc.regen')}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* إذا كان المستخدم مش Admin يعرض رسالة */}
            {!isAdmin && (
              <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <i className="fas fa-lock" style={{ fontSize: 40, color: '#94a3b8', marginBottom: 12 }}></i>
                <h3 style={{ color: '#64748b' }}>ليس لديك صلاحية لعرض أكواد الدعوة</h3>
                <p style={{ color: '#94a3b8', fontSize: 14 }}>هذه الصفحة متاحة للمديرين فقط</p>
              </div>
            )}

          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <i className="fas fa-building" style={{ fontSize: 40, marginBottom: 12 }}></i>
            <p>{t('mc.notFound')}</p>
          </div>
        )}
      </div>
    </div>
  );
}