// src/components/common/AutocompleteInput.js
// مكون Autocomplete — يكتب بإيده ويطلع suggestions (اسم أو رقم)
import React, { useState, useRef, useEffect } from 'react';

/**
 * Props:
 *  - items:        [{ id, label, sublabel? }]   — قايمة الخيارات الكاملة
 *  - value:        string                        — الـ id المختار حالياً
 *  - onChange:     (id) => void                  — لما المستخدم يختار
 *  - placeholder:  string
 *  - required:     bool
 */
export default function AutocompleteInput({ items = [], value, onChange, placeholder, required }) {
  const selectedItem = items.find(i => i.id === value);

  // النص اللي بيكتبه المستخدم
  const [inputText, setInputText] = useState(selectedItem?.label || '');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // لو القيمة اتغيرت من بره (مثلاً reset الفورم) — حدّث النص
  useEffect(() => {
    const item = items.find(i => i.id === value);
    setInputText(item?.label || '');
  }, [value, items]);

  // إغلاق القايمة لو المستخدم دوس بره
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        // لو مكملش اختيار — رجّع النص لآخر قيمة مختارة أو امسحه
        const current = items.find(i => i.id === value);
        setInputText(current?.label || '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, items]);

  // فلترة الـ items بناءً على النص المكتوب
  const filtered = inputText.trim()
    ? items.filter(i =>
        i.label.toLowerCase().includes(inputText.toLowerCase()) ||
        (i.sublabel && i.sublabel.toLowerCase().includes(inputText.toLowerCase()))
      )
    : items;

  function handleInput(e) {
    const text = e.target.value;
    setInputText(text);
    setOpen(true);
    // لو مسح التكست — امسح الاختيار
    if (!text.trim()) onChange('');
  }

  function handleSelect(item) {
    setInputText(item.label);
    onChange(item.id);
    setOpen(false);
  }

  function handleFocus() {
    setOpen(true);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={inputText}
        onChange={handleInput}
        onFocus={handleFocus}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        style={{ width: '100%' }}
      />

      {open && filtered.length > 0 && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: 'white',
          border: '2px solid #6366f1',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          maxHeight: 220,
          overflowY: 'auto',
          margin: 0,
          padding: 0,
          listStyle: 'none',
          boxShadow: '0 8px 24px rgba(99,102,241,0.15)',
        }}>
          {filtered.map(item => (
            <li
              key={item.id}
              onMouseDown={() => handleSelect(item)}   // mouseDown قبل blur
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                background: item.id === value ? '#eef2ff' : 'white',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#eef2ff'}
              onMouseLeave={e => e.currentTarget.style.background = item.id === value ? '#eef2ff' : 'white'}
            >
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                {item.label}
              </span>
              {item.sublabel && (
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {item.sublabel}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && filtered.length === 0 && inputText.trim() && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: 'white',
          border: '2px solid #e2e8f0',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: '12px 14px',
          fontSize: 13,
          color: '#94a3b8',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        }}>
          ❌ لا توجد نتائج
        </div>
      )}
    </div>
  );
}
