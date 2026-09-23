// Simple toast without extra deps
let container = null;
function getContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}
function show(msg, type = 'info', duration = 3000) {
  const c = getContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
}
export const toast = {
  success: (m, d) => show(m, 'success', d),
  error: (m, d) => show(m, 'error', d),
  warning: (m, d) => show(m, 'warning', d),
  info: (m, d) => show(m, 'info', d),
};

// ✅ تحويل alert/confirm القديمة لـ toast تلقائياً (بدون تعديل 100 ملف)
if (typeof window !== 'undefined') {
  const origAlert = window.alert.bind(window);
  window.alert = (msg) => {
    const text = String(msg || '');
    // رسائل النجاح فيها ✅، الفشل فيها ❌
    if (text.includes('✅') || text.includes('تم') || text.includes('success')) {
      show(text.replace(/^[✅❌⚠ℹ ]+/, '').trim() || text, 'success');
    } else if (text.includes('❌') || text.includes('خطأ') || text.includes('فشل') || text.includes('error')) {
      show(text.replace(/^[✅❌⚠ℹ ]+/, '').trim() || text, 'error', 4000);
    } else {
      show(text, 'info', 3500);
    }
    // احتفظ بالـ console للـ debugging
    console.log('[alert→toast]', text);
    return undefined;
  };
  // confirm: نعرض toast تحذيري ونرجع true (للتطوير) — الصفحات المهمة لسه بتستخدم window.confirm مباشرة
  window._origConfirm = window.confirm.bind(window);
}

export function confirmToast(message, onConfirm) {
  const c = getContainer();
  const el = document.createElement('div');
  el.className = 'toast toast-warning';
  el.style.cssText = 'flex-direction:column;align-items:stretch;gap:10px;min-width:320px;';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;font-weight:700;"><span>⚠</span><span>${message}</span></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button data-act="cancel" style="padding:6px 14px;border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;font-family:Cairo;cursor:pointer;">إلغاء</button>
      <button data-act="ok" style="padding:6px 14px;border-radius:8px;border:none;background:#ef4444;color:white;font-family:Cairo;cursor:pointer;font-weight:700;">تأكيد</button>
    </div>`;
  c.appendChild(el);
  return new Promise((resolve) => {
    el.querySelector('[data-act="cancel"]').onclick = () => { el.remove(); resolve(false); };
    el.querySelector('[data-act="ok"]').onclick = () => { el.remove(); resolve(true); if (onConfirm) onConfirm(); };
    setTimeout(() => { if (document.body.contains(el)) { el.remove(); resolve(false); } }, 10000);
  });
}
export default toast;
