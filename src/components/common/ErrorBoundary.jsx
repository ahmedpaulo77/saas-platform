import React, { useContext } from "react";
import { LanguageContext } from "../../i18n/LanguageContext.js";

/**
 * ErrorBoundary — بيمسك أي exception بيطلع من الرندر أو من effect قبل ما
 * الشاشة تبيضى بالكامل. قبل كده أي throw واحد كان بيبوّض التطبيق كله
 * (والـ Suspense fallback في App.js بيغطي تحميل Lazy بس، مش أخطاء الرندر).
 *
 * ملاحظة مهمة: ErrorBoundary ما بي-catchingش أخطاء event handlers ولا
 * أخطاء async/await — دي محتاجة try/catch في مكانها (أو toast).
 */

const COPY = {
  ar: {
    title: "عطل مؤقت",
    hint: "تعذر عرض هذه الصفحة. بياناتك محفوظة، يرجى إعادة المحاولة.",
    retry: "إعادة المحاولة",
    reload: "تحديث الصفحة",
  },
  en: {
    title: "Temporary issue",
    hint: "This page couldn't be displayed. Your data is safe — please try again.",
    retry: "Try again",
    reload: "Reload page",
  },
};

class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleRetry = this.handleRetry.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // بيساعد في التشخيص — أخطاء Firestore بتوصل هنا أحيانًا
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleRetry() {
    this.setState({ error: null });
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const c = COPY[this.props.lang] || COPY.ar;

    return (
      <div className="eb-screen">
        <div className="eb-card">
          <div className="eb-icon">⚠️</div>
          <h2 className="eb-title">{c.title}</h2>
          <p className="eb-hint">{c.hint}</p>
          <pre className="eb-msg">{String(error?.message || error)}</pre>
          <div className="eb-actions">
            <button type="button" className="eb-btn eb-btn-primary" onClick={this.handleRetry}>
              {c.retry}
            </button>
            <button type="button" className="eb-btn" onClick={this.handleReload}>
              {c.reload}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * غلاف دالة عشان يقرا اللغة من الـ context ويبعتها كـ prop
 * (الـ class نفسه مش بيقدر ينادي hook).
 * بنستخدم useContext مباشرة بدل useLanguage() عشان ما نرميش لو
 * الـ boundary اتحط بره الـ provider.
 */
export default function ErrorBoundary({ children }) {
  const ctx = useContext(LanguageContext);
  const lang = ctx?.lang || "ar";
  return (
    <Boundary lang={lang}>
      {children}
    </Boundary>
  );
}
