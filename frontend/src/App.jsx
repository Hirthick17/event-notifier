import { useState, useEffect, useRef } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Calendar, BookOpen, CheckCircle, Clock, Plus, Trash2, RefreshCw, AlertCircle } from "lucide-react";

// ─── API ──────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:3001";
const API = `${API_BASE}/events`;
const api = {
  getEvents: () => fetch(API).then((r) => r.json()),
  addEvent: (event) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) }).then((r) => r.json()),
  deleteEvent: (id) => fetch(`${API}/${id}`, { method: "DELETE" }).then((r) => r.json()),
  toggleNotify: (id) => fetch(`${API}/${id}/notify`, { method: "PATCH" }).then((r) => r.json()),
  syncMoodle: () => fetch(`${API_BASE}/moodle/assignments`).then((r) => r.json()),
};
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = {
  work:    { label: "Assignment",    color: "#6366f1" }, // Indigo
  health:  { label: "Health",  color: "#10B981" }, // Emerald
  social:  { label: "Club",  color: "#f43f5e" }, // Rose
  finance: { label: "Finance", color: "#8B5CF6" }, // Violet
  other:   { label: "Other",   color: "#64748b" }, // Slate
};

const BLANK_FORM = { title: "", date: "", time: "", category: "work", notify: true, note: "" };

const fmtDate = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const fmtTime = (time) => {
  const [h, m] = time.split(':');
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const isUpcoming = (date, time) => new Date(`${date}T${time}`) >= new Date();

const getUrgency = (date, time) => {
  const msUntil = new Date(`${date}T${time}`) - new Date();
  const hoursUntil = msUntil / (1000 * 60 * 60);
  if (hoursUntil < 0) return "past";
  if (hoursUntil <= 24) return "critical"; // Less than 24h
  if (hoursUntil <= 72) return "warning"; // Less than 3 days
  return "normal";
};

export default function App() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(BLANK_FORM);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("assignments"); // 'assignments' or 'events'
  const titleRef = useRef();
  const notifiedEvents = useRef(new Set());

  useEffect(() => { api.getEvents().then(setEvents); }, []);
  useEffect(() => { if (adding) titleRef.current?.focus(); }, [adding]);

  // Deadline Notification System
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const checkDeadlines = () => {
      const now = new Date();
      events.forEach(e => {
        if (!e.notify) return;
        
        const eventDate = new Date(`${e.date}T${e.time}`);
        const msUntil = eventDate - now;
        const minutesUntil = Math.ceil(msUntil / (1000 * 60));

        // Notify if within 60 minutes and haven't notified yet
        if (minutesUntil > 0 && minutesUntil <= 60 && !notifiedEvents.current.has(e.id)) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`Upcoming: ${e.title}`, {
              body: `Starts in ${minutesUntil} minutes (${fmtTime(e.time)})`,
            });
          }
          // Also show in-app toast for visibility
          showToast(`${e.title} starts in ${minutesUntil} mins!`, "info");
          notifiedEvents.current.add(e.id);
        }
      });
    };

    checkDeadlines(); // Check immediately on update
    const intervalId = setInterval(checkDeadlines, 10000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [events]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAdd = async () => {
    if (!form.title.trim() || !form.date || !form.time) return showToast("Fill in title, date & time", "error");
    await api.addEvent(form);
    setEvents(await api.getEvents());
    setForm(BLANK_FORM);
    setAdding(false);
    showToast(`"${form.title}" added`);
  };

  const handleDelete = async (id, title) => {
    await api.deleteEvent(id);
    setEvents(events.filter((e) => e.id !== id));
    showToast(`"${title}" removed`, "info");
  };

  const handleToggle = async (id) => {
    await api.toggleNotify(id);
    setEvents(events.map((e) => (e.id === id ? { ...e, notify: !e.notify } : e)));
  };

  const handleSyncMoodle = async () => {
    setSyncing(true);
    showToast("Syncing with Moodle...", "info");
    try {
      const data = await api.syncMoodle();
      if (data && data.assignments) {
        let addedCount = 0;
        for (const a of data.assignments) {
          const d = new Date(a.deadline);
          const date = d.toISOString().split("T")[0];
          const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          
          const exists = events.some(e => e.title === a.title && e.date === date);
          if (!exists) {
            await api.addEvent({
              title: a.title,
              date: date,
              time: time,
              category: "work",
              notify: true,
              note: a.subject || a.instructions
            });
            addedCount++;
          }
        }
        if (addedCount > 0) {
          showToast(`Success! Synced ${addedCount} new assignments.`);
          setEvents(await api.getEvents());
        } else {
          showToast("Moodle is up to date. No new assignments.", "info");
        }
      } else {
        showToast("Didn't receive valid data from Moodle.", "error");
      }
    } catch (err) {
      console.error("Moodle Sync Error:", err);
      showToast("Failed to sync Moodle", "error");
    } finally {
      setSyncing(false);
    }
  };

  // Data processing for views
  const allUpcoming = events.filter(e => isUpcoming(e.date, e.time));
  const assignments = events.filter(e => e.category === 'work');
  const campusEvents = events.filter(e => e.category !== 'work');
  
  const upcomingAssignments = assignments.filter(e => isUpcoming(e.date, e.time));
  const completedCount = assignments.filter(e => !isUpcoming(e.date, e.time)).length;
  const totalAssignments = assignments.length;
  const completionRate = totalAssignments > 0 ? Math.round((completedCount / totalAssignments) * 100) : 0;

  const chartData = [
    { name: 'Completed', value: completedCount, color: '#10B981' },
    { name: 'Pending', value: upcomingAssignments.length, color: '#334155' }
  ];

  const renderCardList = (list) => {
    const filtered = list.filter(e => filter === "all" || e.category === filter);
    
    if (filtered.length === 0) {
      return (
        <div style={styles.emptyState}>
          <Calendar size={48} color="#475569" style={{ marginBottom: '1rem' }} />
          <h3 style={styles.emptyTitle}>Nothing scheduled</h3>
          <p style={styles.emptyText}>You're all caught up! Enjoy your free time or add a new event.</p>
        </div>
      );
    }

    return (
      <AnimatePresence>
        {filtered.sort((a,b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`)).map((e) => {
          const cat = CATEGORIES[e.category] || CATEGORIES.other;
          const urgency = getUrgency(e.date, e.time);
          const isPast = urgency === "past";
          
          let urgencyStyle = {};
          if (urgency === "critical") urgencyStyle = { borderColor: '#ef4444', boxShadow: '0 0 15px rgba(239, 68, 68, 0.15)' };
          else if (urgency === "warning") urgencyStyle = { borderColor: '#f59e0b' };

          return (
            <motion.div 
              key={e.id} 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: isPast ? 0.6 : 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              style={{ ...styles.card, ...urgencyStyle }}
            >
              <div style={{ ...styles.cardLeftStrip, background: cat.color }} />
              
              <div style={styles.cardHeader}>
                <div style={styles.cardInfo}>
                  <div style={styles.cardTitleRow}>
                    <h3 style={{ ...styles.cardTitle, textDecoration: isPast ? 'line-through' : 'none' }}>{e.title}</h3>
                    {urgency === "critical" && (
                      <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} style={styles.pulseDot} />
                    )}
                  </div>
                  <div style={styles.cardMetaRow}>
                    <span style={{ ...styles.catBadge, color: cat.color, background: `${cat.color}20` }}>
                      {cat.label}
                    </span>
                    <span style={styles.dateTime}>
                      <Calendar size={12} style={{ marginRight: '4px' }}/> {fmtDate(e.date)}
                    </span>
                    <span style={styles.dateTime}>
                      <Clock size={12} style={{ marginRight: '4px' }}/> {fmtTime(e.time)}
                    </span>
                  </div>
                </div>

                <div style={styles.cardActions}>
                  <button title={e.notify ? "Notifications On" : "Notifications Off"} 
                          style={{ ...styles.iconBtn, color: e.notify ? '#6366f1' : '#64748b', background: e.notify ? '#6366f120' : '#1e293b' }} 
                          onClick={() => handleToggle(e.id)}>
                    <Bell size={16} />
                  </button>
                  <button style={{ ...styles.iconBtn, color: '#ef4444', background: '#ef444420' }} onClick={() => handleDelete(e.id, e.title)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              {e.note && (
                <div style={styles.cardNote}>
                  <BookOpen size={14} style={{ flexShrink: 0, marginTop: '2px' }}/>
                  <span style={styles.noteText} dangerouslySetInnerHTML={{ __html: e.note }} />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    );
  };

  return (
    <div style={styles.container}>
      {/* Background elements */}
      <div style={styles.bgGradient1} />
      <div style={styles.bgGradient2} />

      <main style={styles.layout}>
        {/* Left Sidebar / Dashboard */}
        <aside style={styles.sidebar}>
          <div style={styles.logoSection}>
            <div style={styles.logoIcon}>L</div>
            <div>
              <h1 style={styles.appName}>Lumina</h1>
              <p style={styles.appDesc}>LMS Notifier</p>
            </div>
          </div>

          <div style={styles.dashboardCard}>
            <h2 style={styles.dashTitle}>Deadline Overview</h2>
            <div style={styles.chartContainer}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={chartData} innerRadius={55} outerRadius={70} paddingAngle={5} dataKey="value" stroke="none">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.chartCenter}>
                <span style={styles.chartPct}>{completionRate}%</span>
                <span style={styles.chartLabel}>Completed</span>
              </div>
            </div>

            <div style={styles.dashStatsGrid}>
              <div style={styles.dashStatBox}>
                <span style={styles.dashStatVal}>{upcomingAssignments.length}</span>
                <span style={styles.dashStatLabel}>Pending</span>
              </div>
              <div style={styles.dashStatBox}>
                <span style={styles.dashStatVal}>{campusEvents.filter(e => isUpcoming(e.date, e.time)).length}</span>
                <span style={styles.dashStatLabel}>Events</span>
              </div>
            </div>
          </div>

          <button 
            style={{ ...styles.actionBtn, opacity: syncing ? 0.7 : 1 }} 
            onClick={handleSyncMoodle} 
            disabled={syncing}
          >
            <RefreshCw size={16} className={syncing ? "spin" : ""} style={{ marginRight: '8px' }}/>
            {syncing ? "Syncing LMS Data..." : "Sync Moodle Assignments"}
          </button>
          
          <button style={{ ...styles.actionBtn, background: '#3b82f6', borderColor: '#3b82f6', color: '#fff', marginTop: '1rem' }} onClick={() => setAdding(true)}>
            <Plus size={16} style={{ marginRight: '8px' }}/>
            Create Manual Event
          </button>
        </aside>

        {/* Right Main Content */}
        <section style={styles.mainContent}>
          <div style={styles.topNav}>
            <div style={styles.tabs}>
              <button 
                style={{ ...styles.tabBtn, ...(activeTab === 'assignments' ? styles.tabActive : {}) }}
                onClick={() => setActiveTab('assignments')}
              >
                Assignments
                {upcomingAssignments.length > 0 && <span style={styles.badge}>{upcomingAssignments.length}</span>}
              </button>
              <button 
                style={{ ...styles.tabBtn, ...(activeTab === 'events' ? styles.tabActive : {}) }}
                onClick={() => setActiveTab('events')}
              >
                Campus Events
              </button>
            </div>
            
            <div style={styles.filterGroup}>
              {["all", ...Object.keys(CATEGORIES)].map((cat) => (
                <button key={cat} style={{ ...styles.filterPill, ...(filter === cat ? styles.filterPillActive : {}) }} onClick={() => setFilter(cat)}>
                  {cat === "all" ? "All" : CATEGORIES[cat].label}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.feed}>
            {activeTab === 'assignments' ? renderCardList(assignments) : renderCardList(campusEvents)}
          </div>
        </section>
      </main>

      {/* Add Event Modal */}
      <AnimatePresence>
        {adding && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={styles.overlay} 
            onClick={(ev) => ev.target === ev.currentTarget && setAdding(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              style={styles.modal}
            >
              <h2 style={styles.modalTitle}>Create New Entry</h2>
              
              <div style={styles.inputGroup}>
                <label style={styles.label}>Title</label>
                <input ref={titleRef} style={styles.input} placeholder="e.g. Physics Lab Report" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
              </div>

              <div style={styles.row}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Date</label>
                  <input style={styles.input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Time</label>
                  <input style={styles.input} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Category</label>
                <div style={styles.catGrid}>
                  {Object.entries(CATEGORIES).map(([key, val]) => (
                    <button key={key} style={{ ...styles.catChip, border: `1px solid ${form.category === key ? val.color : '#334155'}`, color: form.category === key ? val.color : "#94a3b8", background: form.category === key ? `${val.color}15` : 'transparent' }}
                      onClick={() => setForm({ ...form, category: key })}>{val.label}</button>
                  ))}
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Notes / Description</label>
                <input style={styles.input} placeholder="Location, links, or context..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>

              <div style={styles.modalFooter}>
                <label style={styles.checkboxWrapper}>
                  <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} style={{ accentColor: '#6366f1', width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Send Notifications</span>
                </label>
                
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button style={styles.cancelBtn} onClick={() => setAdding(false)}>Cancel</button>
                  <button style={styles.saveBtn} onClick={handleAdd}>Save</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }} 
            animate={{ opacity: 1, y: 0, x: '-50%' }} 
            exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
            style={{ ...styles.toast, borderLeft: `4px solid ${toast.type === "error" ? "#ef4444" : toast.type === "info" ? "#3b82f6" : "#10b981"}` }}
          >
            {toast.type === "error" ? <AlertCircle size={18} color="#ef4444" /> : <CheckCircle size={18} color={toast.type === "info" ? "#3b82f6" : "#10b981"} />}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        a { color: #6366f1; text-decoration: none; }
        a:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", backgroundColor: "#020617", color: "#f8fafc", fontFamily: "'Inter', sans-serif", position: "relative", overflow: "hidden" },
  
  // Lumina Aesthetics (Glassmorphism + Dark Mode)
  bgGradient1: { position: "absolute", top: "-10%", left: "-10%", width: "50vw", height: "50vw", background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, rgba(2,6,23,0) 70%)", zIndex: 0, pointerEvents: "none" },
  bgGradient2: { position: "absolute", bottom: "-20%", right: "-10%", width: "60vw", height: "60vw", background: "radial-gradient(circle, rgba(16,185,129,0.05) 0%, rgba(2,6,23,0) 70%)", zIndex: 0, pointerEvents: "none" },
  
  layout: { display: "flex", maxWidth: "1200px", margin: "0 auto", padding: "2rem", gap: "2rem", minHeight: "100vh", position: "relative", zIndex: 1, flexDirection: "row", flexWrap: "wrap" },
  
  sidebar: { width: "300px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "1.5rem" },
  mainContent: { flex: 1, minWidth: "400px", display: "flex", flexDirection: "column" },

  logoSection: { display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" },
  logoIcon: { width: "42px", height: "42px", borderRadius: "12px", background: "linear-gradient(135deg, #6366f1, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: "700", color: "#fff", boxShadow: "0 4px 15px rgba(99,102,241,0.3)" },
  appName: { fontSize: "1.25rem", fontWeight: "700", margin: 0, letterSpacing: "-0.5px" },
  appDesc: { fontSize: "0.85rem", color: "#94a3b8", margin: 0 },

  dashboardCard: { background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(12px)", border: "1px solid rgba(51, 65, 85, 0.5)", borderRadius: "16px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" },
  dashTitle: { fontSize: "0.95rem", fontWeight: "600", margin: 0, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: "0.5px" },
  chartContainer: { position: "relative", height: "160px", display: "flex", alignItems: "center", justifyContent: "center" },
  chartCenter: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center" },
  chartPct: { fontSize: "1.75rem", fontWeight: "700", color: "#fff", lineHeight: 1 },
  chartLabel: { fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px" },
  dashStatsGrid: { display: "flex", gap: "1rem" },
  dashStatBox: { flex: 1, background: "rgba(30, 41, 59, 0.5)", borderRadius: "10px", padding: "0.75rem", display: "flex", flexDirection: "column", alignItems: "center", border: "1px solid rgba(51, 65, 85, 0.4)" },
  dashStatVal: { fontSize: "1.25rem", fontWeight: "600", color: "#f8fafc" },
  dashStatLabel: { fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px" },

  actionBtn: { width: "100%", padding: "0.85rem", borderRadius: "10px", background: "rgba(30, 41, 59, 0.6)", border: "1px solid rgba(71, 85, 105, 0.6)", color: "#e2e8f0", fontSize: "0.9rem", fontWeight: "500", fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", backdropFilter: "blur(4px)" },

  // Tabs & Navigation
  topNav: { display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" },
  tabs: { display: "flex", gap: "1.5rem", borderBottom: "1px solid rgba(51, 65, 85, 0.5)", paddingBottom: "1rem" },
  tabBtn: { background: "none", border: "none", color: "#64748b", fontSize: "1.1rem", fontWeight: "600", cursor: "pointer", padding: "0 0 0.5rem 0", position: "relative", display: "flex", alignItems: "center", gap: "0.5rem", transition: "color 0.2s" },
  tabActive: { color: "#f8fafc", boxShadow: "inset 0 -2px 0 #6366f1" },
  badge: { background: "#6366f1", color: "#fff", fontSize: "0.7rem", padding: "0.1rem 0.5rem", borderRadius: "20px", fontWeight: "700" },

  filterGroup: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  filterPill: { background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(51, 65, 85, 0.6)", color: "#94a3b8", padding: "0.4rem 0.8rem", borderRadius: "20px", fontSize: "0.75rem", fontWeight: "500", cursor: "pointer", transition: "all 0.2s" },
  filterPillActive: { background: "rgba(99, 102, 241, 0.15)", border: "1px solid #6366f1", color: "#6366f1" },

  // Feed & Cards
  feed: { display: "flex", flexDirection: "column", gap: "1rem", overflowY: "auto", paddingRight: "0.5rem", paddingBottom: "4rem" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4rem 2rem", background: "rgba(15, 23, 42, 0.4)", borderRadius: "16px", border: "1px dashed rgba(51, 65, 85, 0.5)", textAlign: "center" },
  emptyTitle: { margin: "0 0 0.5rem", fontSize: "1.1rem", color: "#cbd5e1" },
  emptyText: { margin: 0, fontSize: "0.9rem", color: "#64748b", maxWidth: "250px" },

  card: { background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(12px)", border: "1px solid rgba(51, 65, 85, 0.5)", borderRadius: "14px", overflow: "hidden", position: "relative", transition: "border-color 0.3s" },
  cardLeftStrip: { position: "absolute", left: 0, top: 0, bottom: 0, width: "4px" },
  cardHeader: { padding: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" },
  cardTitleRow: { display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" },
  pulseDot: { width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px #ef4444" },
  cardTitle: { fontSize: "1rem", fontWeight: "600", color: "#f8fafc", margin: 0, lineHeight: 1.3 },
  cardMetaRow: { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" },
  catBadge: { fontSize: "0.7rem", fontWeight: "600", padding: "0.15rem 0.5rem", borderRadius: "6px", textTransform: "uppercase", letterSpacing: "0.5px" },
  dateTime: { fontSize: "0.8rem", color: "#94a3b8", display: "flex", alignItems: "center" },
  cardActions: { display: "flex", gap: "0.5rem", flexShrink: 0 },
  iconBtn: { padding: "0.4rem", borderRadius: "8px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "filter 0.2s" },
  
  cardNote: { background: "rgba(2, 6, 23, 0.3)", borderTop: "1px solid rgba(51, 65, 85, 0.3)", padding: "1rem 1.25rem", fontSize: "0.85rem", color: "#cbd5e1", display: "flex", gap: "0.6rem", alignItems: "flex-start" },
  noteText: { lineHeight: 1.5, wordBreak: "break-word", '& p': { margin: 0 } },

  // Modals
  overlay: { position: "fixed", inset: 0, background: "rgba(2, 6, 23, 0.8)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" },
  modal: { background: "rgba(15, 23, 42, 0.95)", border: "1px solid rgba(51, 65, 85, 0.8)", borderRadius: "20px", padding: "2rem", width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "1.25rem", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)" },
  modalTitle: { fontSize: "1.25rem", fontWeight: "600", color: "#fff", margin: "0 0 0.5rem 0" },
  row: { display: "flex", gap: "1rem" },
  inputGroup: { display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 },
  label: { fontSize: "0.75rem", fontWeight: "500", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" },
  input: { background: "rgba(2, 6, 23, 0.5)", border: "1px solid rgba(51, 65, 85, 0.8)", color: "#f8fafc", borderRadius: "10px", padding: "0.75rem 1rem", fontSize: "0.95rem", fontFamily: "inherit", outline: "none" },
  catGrid: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  catChip: { padding: "0.5rem 0.8rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: "500", cursor: "pointer", transition: "all 0.2s" },
  modalFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", borderTop: "1px solid rgba(51, 65, 85, 0.5)", paddingTop: "1.5rem" },
  checkboxWrapper: { display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" },
  cancelBtn: { padding: "0.75rem 1.25rem", borderRadius: "10px", background: "transparent", border: "1px solid #475569", color: "#cbd5e1", fontSize: "0.9rem", fontWeight: "500", cursor: "pointer" },
  saveBtn: { padding: "0.75rem 1.5rem", borderRadius: "10px", background: "#6366f1", border: "none", color: "#fff", fontSize: "0.9rem", fontWeight: "600", cursor: "pointer", boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)" },

  // Toast
  toast: { position: "fixed", bottom: "2rem", left: "50%", background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(10px)", padding: "1rem 1.25rem", borderRadius: "12px", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)", display: "flex", alignItems: "center", gap: "0.75rem", zIndex: 200, color: "#f8fafc", fontSize: "0.9rem", fontWeight: "500", borderRight: "1px solid rgba(51, 65, 85, 0.5)", borderTop: "1px solid rgba(51, 65, 85, 0.5)", borderBottom: "1px solid rgba(51, 65, 85, 0.5)" }
};
