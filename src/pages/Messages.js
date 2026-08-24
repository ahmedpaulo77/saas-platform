// src/pages/Messages.js - نظام إرسال واستقبال الرسائل مع إشعارات وفلتر
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, query, where, doc, updateDoc, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function Messages() {
  const { t } = useLanguage();
  const { currentUser, userRole, userCompanyId } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState({
    to: "all",
    text: "",
  });
  const [activeTab, setActiveTab] = useState("inbox");
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [readFilter, setReadFilter] = useState("all"); // all | unread | read

  // ✅ طلب إذن الإشعارات
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ✅ جلب المستخدمين (للعرض في قائمة الإرسال)
  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const q = getScopedQuery("users", userRole, userCompanyId, currentUser?.uid);
      const snap = await getDocs(q);
      const usersList = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.id !== currentUser?.uid);
      setUsers(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }, [isAdmin, userRole, userCompanyId, currentUser?.uid]);

  // ✅ جلب الرسائل والإشعارات
  const fetchMessages = useCallback(() => {
    if (!currentUser) return;

    // جلب الرسائل الواردة
    const incomingQuery = query(
      collection(db, "messages"),
      where("companyId", "==", userCompanyId),
      where("to", "in", [currentUser.uid, "all"]),
      orderBy("createdAt", "desc")
    );

    // جلب الرسائل المرسلة
    const sentQuery = query(
      collection(db, "messages"),
      where("companyId", "==", userCompanyId),
      where("from", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    // ✅ استماع للرسائل غير المقروءة للإشعارات
    const unreadQuery = query(
      collection(db, "messages"),
      where("companyId", "==", userCompanyId),
      where("to", "in", [currentUser.uid, "all"]),
      where("read", "==", false),
      orderBy("createdAt", "desc")
    );

    const unsubscribeIncoming = onSnapshot(incomingQuery, (snap) => {
      const incoming = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(prev => {
        const existing = prev.filter(m => m._type !== "incoming");
        return [...existing, ...incoming.map(m => ({ ...m, _type: "incoming" }))];
      });
      setLoading(false);
    }, (error) => {
      console.error("Error fetching incoming messages:", error);
      setLoading(false);
    });

    const unsubscribeSent = onSnapshot(sentQuery, (snap) => {
      const sent = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(prev => {
        const existing = prev.filter(m => m._type !== "sent");
        return [...existing, ...sent.map(m => ({ ...m, _type: "sent" }))];
      });
      setLoading(false);
    }, (error) => {
      console.error("Error fetching sent messages:", error);
      setLoading(false);
    });

    // ✅ إشعارات للرسائل الجديدة
    const unsubscribeUnread = onSnapshot(unreadQuery, (snap) => {
      const newMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const count = newMessages.length;
      setUnreadCount(count);

      // ✅ تغيير عنوان التبويب
      if (count > 0) {
        document.title = `📩 (${count}) ${t("messages.title")} - SaaS PRO`;
      } else {
        document.title = 'SaaS PRO';
      }

      // ✅ إشعار للرسالة الأحدث (إذا كانت جديدة)
      if (count > 0) {
        const latest = newMessages[0];
        const prevCount = unreadCount;
        
        // ✅ Toast notification داخل التطبيق
        setToast({
          title: `📩 ${t("messages.new")} ${t("messages.from")} ${latest.fromEmail}`,
          body: latest.text.length > 60 ? latest.text.substring(0, 60) + '...' : latest.text,
          type: 'info',
          id: latest.id,
        });

        // ✅ Desktop notification
        if ("Notification" in window && Notification.permission === "granted" && count > prevCount) {
          new Notification(`📩 ${t("messages.new")} ${t("messages.from")} ${latest.fromEmail}`, {
            body: latest.text.length > 60 ? latest.text.substring(0, 60) + '...' : latest.text,
            icon: '/logo192.png',
          });
        }
      }
    }, (error) => {
      console.error("Error fetching unread messages:", error);
    });

    return () => {
      unsubscribeIncoming();
      unsubscribeSent();
      unsubscribeUnread();
    };
  }, [currentUser, userCompanyId, t, unreadCount]);

  useEffect(() => {
    fetchUsers();
    const unsub = fetchMessages();
    return () => {
      if (unsub) unsub();
    };
  }, [fetchUsers, fetchMessages]);

  // ✅ إرسال رسالة
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.text.trim()) {
      alert(t("messages.placeholder"));
      return;
    }

    setSending(true);
    try {
      const to = newMessage.to;
      const toEmail = to === "all" 
        ? null 
        : users.find(u => u.id === to)?.email || null;

      await addDoc(collection(db, "messages"), {
        text: newMessage.text.trim(),
        from: currentUser.uid,
        fromEmail: currentUser.email,
        to: to,
        toEmail: toEmail,
        companyId: userCompanyId,
        read: false,
        createdAt: new Date().toISOString(),
      });

      setNewMessage({ to: "all", text: "" });
      alert(t("messages.sendSuccess"));
    } catch (error) {
      console.error("Error sending message:", error);
      alert(t("messages.sendError"));
    } finally {
      setSending(false);
    }
  };

  // ✅ تحديث حالة القراءة
  const markAsRead = async (messageId) => {
    try {
      await updateDoc(doc(db, "messages", messageId), { read: true });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  // ✅ تصفية الرسائل حسب التبويب وحالة القراءة
  const filteredMessages = messages.filter(msg => {
    if (activeTab === "inbox") {
      const isIncoming = msg._type === "incoming" && (msg.to === "all" || msg.to === currentUser?.uid);
      if (!isIncoming) return false;
      
      // ✅ فلتر حسب حالة القراءة
      if (readFilter === 'unread') return !msg.read;
      if (readFilter === 'read') return msg.read;
      return true;
    }
    if (activeTab === "sent") {
      return msg._type === "sent";
    }
    return true;
  });

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-envelope" style={{ color: "#6366f1", marginLeft: 10 }}></i>
              {t("messages.title")}
              {unreadCount > 0 && (
                <span style={{
                  background: "#ef4444",
                  color: "white",
                  borderRadius: 50,
                  padding: "2px 10px",
                  fontSize: 14,
                  marginRight: 10,
                }}>
                  {unreadCount} {t("messages.unread")}
                </span>
              )}
            </h1>
            <p className="subtitle">{t("messages.subtitle")}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setActiveTab("new")}
              className="btn-primary"
            >
              <i className="fas fa-plus"></i> {t("messages.new")}
            </button>
          )}
        </div>

        {/* ✅ تبويبات */}
        <div style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: 12,
        }}>
          {[
            { key: "inbox", label: `📥 ${t("messages.inbox")} (${unreadCount})` },
            { key: "sent", label: `📤 ${t("messages.sent")}` },
            ...(isAdmin ? [{ key: "new", label: `✏️ ${t("messages.new")}` }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={activeTab === tab.key ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ✅ أزرار فلتر حالة القراءة (تظهر فقط في تبويب الوارد) */}
        {activeTab === "inbox" && (
          <div style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
          }}>
            <button
              onClick={() => setReadFilter('all')}
              className={readFilter === 'all' ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            >
              📋 الكل
            </button>
            <button
              onClick={() => setReadFilter('unread')}
              className={readFilter === 'unread' ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            >
              🔵 غير مقروء
            </button>
            <button
              onClick={() => setReadFilter('read')}
              className={readFilter === 'read' ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            >
              ✅ مقروءة
            </button>
          </div>
        )}

        {/* ✅ نموذج إرسال رسالة جديدة */}
        {activeTab === "new" && isAdmin && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>
              <i className="fas fa-pen" style={{ color: "#6366f1" }}></i>
              {t("messages.new")}
            </h3>
            <form onSubmit={sendMessage}>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>{t("messages.to")}:</label>
                <select
                  value={newMessage.to}
                  onChange={(e) => setNewMessage({ ...newMessage, to: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "2px solid #e2e8f0",
                    borderRadius: 10,
                    fontSize: 14,
                  }}
                >
                  <option value="all">📢 {t("messages.all")}</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      👤 {u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>{t("messages.text")}:</label>
                <textarea
                  value={newMessage.text}
                  onChange={(e) => setNewMessage({ ...newMessage, text: e.target.value })}
                  rows={4}
                  placeholder={t("messages.placeholder")}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "2px solid #e2e8f0",
                    borderRadius: 10,
                    fontSize: 14,
                    resize: "vertical",
                    minHeight: 100,
                  }}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={sending}
              >
                {sending ? (
                  <><i className="fas fa-spinner fa-spin"></i> {t("common.sending")}</>
                ) : (
                  <><i className="fas fa-paper-plane"></i> {t("messages.send")}</>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ✅ عرض الرسائل */}
        {filteredMessages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fas fa-envelope" style={{ color: "#94a3b8" }}></i>
            </div>
            <h3>{t("messages.empty")}</h3>
            <p>
              {activeTab === "inbox" 
                ? t("messages.emptyInbox")
                : activeTab === "sent" 
                ? t("messages.emptySent")
                : ""}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredMessages.map((msg) => {
              const isIncoming = msg._type === "incoming";
              const isUnread = isIncoming && !msg.read;

              return (
                <div
                  key={msg.id}
                  className="card"
                  style={{
                    padding: "16px 20px",
                    borderRight: isUnread ? "4px solid #6366f1" : "4px solid transparent",
                    background: isUnread ? "#f8fafc" : "white",
                    cursor: isUnread ? "pointer" : "default",
                    opacity: msg.read && readFilter !== 'all' ? 0.7 : 1,
                  }}
                  onClick={() => {
                    if (isUnread) markAsRead(msg.id);
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 8,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                        marginBottom: 6,
                      }}>
                        <span style={{
                          fontWeight: 700,
                          color: isIncoming ? "#6366f1" : "#10b981",
                        }}>
                          {isIncoming ? `${t("messages.from")}:` : `${t("messages.to")}:`}
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {isIncoming 
                            ? msg.fromEmail || t("common.unspecified")
                            : msg.to === "all" 
                              ? t("messages.all")
                              : msg.toEmail || t("common.unspecified")}
                        </span>
                        {isUnread && (
                          <span className="badge badge-active" style={{ fontSize: 10 }}>
                            ● {t("messages.unread")}
                          </span>
                        )}
                        {msg.to === "all" && isIncoming && (
                          <span className="badge badge-info" style={{ fontSize: 10 }}>
                            {t("messages.forAll")}
                          </span>
                        )}
                        {msg.read && isIncoming && (
                          <span style={{ fontSize: 10, color: "#94a3b8" }}>
                            ✅ {t("messages.read")}
                          </span>
                        )}
                      </div>
                      <p style={{
                        margin: "8px 0",
                        color: "#334155",
                        fontSize: 15,
                        lineHeight: 1.6,
                      }}>
                        {msg.text}
                      </p>
                      <div style={{
                        display: "flex",
                        gap: 16,
                        fontSize: 12,
                        color: "#94a3b8",
                      }}>
                        <span>
                          <i className="fas fa-clock" style={{ marginLeft: 4 }}></i>
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                        {isIncoming && msg.read && (
                          <span style={{ color: "#10b981" }}>
                            <i className="fas fa-check-double"></i> {t("messages.read")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ✅ Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 9999,
            background: '#e0e7ff',
            borderRight: '4px solid #6366f1',
            borderRadius: 12,
            padding: '16px 20px',
            maxWidth: 400,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            animation: 'slideUp 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <i className="fas fa-bell" style={{ color: '#6366f1', fontSize: 20, marginTop: 2 }}></i>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{toast.title}</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{toast.body}</div>
            </div>
            <button
              onClick={() => setToast(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}