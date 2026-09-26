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
  // ⚠️|textContent مش innerHTML — msg بيوصل من أسماء منتجات/عملاء/رسائل خطأ
  // Firestore، وinnerHTML هنا كان باب XSS مخزَّن على أصل التطبيق.
  const icon = document.createElement('span');
  icon.textContent = icons[type] || '';
  const text = document.createElement('span');
  text.textContent = String(msg ?? '');
  el.appendChild(icon);
  el.appendChild(text);
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
  // ⚠️ لازم نشيك على الفشل *قبل* النجاح. زي "لم يتم الحذف" و"تم رفض العملية":
  // دي رسائل فشل بتيجي فيها كلمة "تم" فلو نشيكانا على "تم" الأول كانت هتبان ✓ خضرا.
  const RE_FAILURE = /[❌✕⚠]|خطأ|فشل|تعذّر|تعذر|لم\s*يتم|ما\s*تم|رفض|غير\s*مسموح|error|failed|fail|went\s*wrong|wrong/i;
  const RE_SUCCESS = /[✅✓]|تم|success|done/i;
  const STRIP_EMOJI = /^[✅❌✕⚠ℹ\s،,.:!]+/;

  window.alert = (msg) => {
    const text = String(msg ?? '');
    const body = text.replace(STRIP_EMOJI, '').trim() || text;
    if (RE_FAILURE.test(text)) {
      show(body, 'error', 4000);
    } else if (RE_SUCCESS.test(text)) {
      show(body, 'success');
    } else {
      show(text, 'info', 3500);
    }
    // احتفظ بالـ console للـ debugging
    console.log('[alert→toast]', text);
    return undefined;
  };
  // الصفحات لسه بتستخدم window.confirm مباشرة — بنحفظ الأصل عشان confirmToast
  // ونفسنا نقدر نرجعله لو احتجنا.
  window._origConfirm = window.confirm.bind(window);
}

export function confirmToast(message, onConfirm) {
  const c = getContainer();
  const el = document.createElement('div');
  el.className = 'toast toast-warning';
  el.style.cssText = 'flex-direction:column;align-items:stretch;gap:10px;min-width:320px;';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:700;';
  const headIcon = document.createElement('span');
  headIcon.textContent = '⚠';
  const headText = document.createElement('span');
  headText.textContent = String(message ?? '');
  head.appendChild(headIcon);
  head.appendChild(headText);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

  const btn = (label, css) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = css;
    return b;
  };
  const cancelBtn = btn('إلغاء', 'padding:6px 14px;border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;font-family:Cairo;cursor:pointer;');
  const okBtn = btn('تأكيد', 'padding:6px 14px;border-radius:8px;border:none;background:#ef4444;color:white;font-family:Cairo;cursor:pointer;font-weight:700;');

  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);
  el.appendChild(head);
  el.appendChild(actions);
  c.appendChild(el);

  return new Promise((resolve) => {
    cancelBtn.onclick = () => { el.remove(); resolve(false); };
    okBtn.onclick = () => { el.remove(); resolve(true); if (onConfirm) onConfirm(); };
    setTimeout(() => { if (document.body.contains(el)) { el.remove(); resolve(false); } }, 10000);
  });
}
export default toast;
