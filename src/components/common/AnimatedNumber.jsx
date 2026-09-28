// AnimatedNumber — عدّاد متحرك (يعد من صفر للقيمة عند الظهور لأول مرة).
// يُستخدم في: كروت الداش بورد، إحصائيات صفحة الهبوط، وضع العرض.
// - value: الرقم الهدف
// - format: دالة تنسيق اختيارية (افتراضيًا num الصحيح حسب لغة التطبيق)
// - decimals/suffix/prefix: لأرقام الهبوط مثل 99.9% و 500+
// - يحترم prefers-reduced-motion (يعرض الرقم فورًا بدون حركة)
import React, { useEffect, useRef, useState } from "react";
import { num } from "../../utils/fmt.js";

export default function AnimatedNumber({
  value,
  locale,
  format = null,
  decimals = 0,
  suffix = "",
  prefix = "",
  duration = 1000,
}) {
  const target = parseFloat(value) || 0;
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);
  const raf = useRef(null);

  // ابدأ العد عند الظهور في الشاشة (مهم لأقسام الهبوط تحت الفولد)
  useEffect(() => {
    const el = ref.current;
    if (!el) { setStarted(true); return; }
    if (typeof IntersectionObserver === "undefined") { setStarted(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    let reduce = false;
    try {
      reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
    } catch { /* ignore */ }
    if (reduce || duration <= 0) { setDisplay(target); return; }
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [started, target, duration]);

  const fmt = format
    || ((v) => num(decimals > 0 ? parseFloat(v.toFixed(decimals)) : Math.round(v), locale));
  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}{fmt(display)}{suffix}
    </span>
  );
}
