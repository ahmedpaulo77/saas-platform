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
export default toast;
