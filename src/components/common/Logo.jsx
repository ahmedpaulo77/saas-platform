// src/components/common/Logo.jsx — لوجو أعمالي الموحد
// علامة مجردة (3 أعمدة نمو صاعدة) على خلفية جراديان البراند.
// مكون واحد يُستخدم في كل الصفحات عشان اللوجو يبقى متسق في حتة واحدة.
export default function Logo({ size = 40, radius, style }) {
  const r = radius ?? Math.round(size * 0.25);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="AamalyPro logo"
      style={{ borderRadius: r, display: "block", flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id="aamaly-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#aamaly-logo-g)" />
      <rect x="13" y="35" width="10" height="16" rx="5" fill="#fff" opacity="0.6" />
      <rect x="27" y="27" width="10" height="24" rx="5" fill="#fff" opacity="0.85" />
      <rect x="41" y="18" width="10" height="33" rx="5" fill="#fff" />
    </svg>
  );
}
