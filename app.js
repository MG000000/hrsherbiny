// الأساسيات: الجلسة، البيانات المشتركة، التنقل، الإشعارات
(function () {
  const { esc, icon, toast } = UI;
  const S = SCHEMA;

  // ========== الجلسة ==========
  const Session = {
    user: null, full_name: "", roles: [], employee: null,
    load() {
      try { Object.assign(this, JSON.parse(localStorage.getItem("hr_session")) || {}); } catch (e) {}
      return !!this.user;
    },
    save() {
      const { user, full_name, roles, employee } = this;
      try { localStorage.setItem("hr_session", JSON.stringify({ user, full_name, roles, employee })); } catch (e) {}
    },
    clear() { this.user = null; this.employee = null; this.roles = []; try { localStorage.removeItem("hr_session"); } catch (e) {} },
    get isAdmin() { return this.roles.includes("System Manager") || this.roles.includes("HR Manager"); },
    get canReward() { return this.isAdmin || !!Number(this.employee && this.employee.custom_can_reward); },
  };
  window.Session = Session;

  // ========== بيانات مشتركة (بتتحمل مرة وتتخزن) ==========
  const cache = {};
  const Data = {
    clear(key) { if (key) delete cache[key]; else Object.keys(cache).forEach((k) => delete cache[k]); },
    async once(key, fn) { if (!(key in cache)) cache[key] = await fn(); return cache[key]; },
    policy() {
      return this.once("policy", async () => {
        const defaults = {};
        S.doctypes[0].fields.forEach((f) => { if (f.default !== undefined) defaults[f.fieldname] = f.fieldtype === "Data" ? f.default : Number(f.default); });
        try { return { ...defaults, ...(await API.get(S.POLICY, S.POLICY)) }; }
        catch (e) { return defaults; }
      });
    },
    shifts() {
      return this.once("shifts", async () => {
        const rows = await API.list("Shift Type", { fields: ["name", "start_time", "end_time"] }).catch(() => []);
        return Object.fromEntries(rows.map((r) => [r.name, r]));
      });
    },
    locations() { return this.once("locations", () => API.list("Shift Location", { fields: ["*"] }).catch(() => [])); },
    employees() {
      return this.once("employees", () => API.list("Employee", { fields: ["*"], filters: [["status", "=", "Active"]], order_by: "employee_name asc" }));
    },
    reasons() { return this.once("reasons", () => API.list(S.REASON, { fields: ["name"], order_by: "name asc" }).catch(() => [])); },
    leaveTypes() { return this.once("leaveTypes", () => API.list("Leave Type", { fields: ["name"] }).catch(() => [])); },
    async employee(name) { return (await this.employees()).find((e) => e.name === name); },
    // الموظفين اللي المستخدم ده مسؤول عنهم
    async team() {
      const all = await this.employees();
      if (Session.isAdmin) return all;
      const me = Session.employee && Session.employee.name;
      return all.filter((e) => e.name === me || e.reports_to === me || e.leave_approver === Session.user);
    },
    async isManager() {
      if (Session.isAdmin) return true;
      const t = await this.team();
      return t.some((e) => e.name !== (Session.employee && Session.employee.name));
    },
    // مين المدير اللي هيوافق على طلبات الموظف ده
    async approverFor(emp) {
      if (emp.leave_approver) return emp.leave_approver;
      if (emp.reports_to) {
        const m = await this.employee(emp.reports_to);
        if (m && m.user_id) return m.user_id;
      }
      return null;
    },
  };
  window.Data = Data;

  // ========== الإشعارات ==========
  const Notify = {
    async send(forUser, subject, doctype, docname) {
      if (!forUser) return;
      try {
        await API.insert("Notification Log", { for_user: forUser, from_user: Session.user, subject, type: "Alert", document_type: doctype || null, document_name: docname || null });
      } catch (e) { console.warn("notification failed", e); }
    },
    async unread() {
      if (!Session.user) return 0;
      try {
        const rows = await API.list("Notification Log", { fields: ["name"], filters: [["for_user", "=", Session.user], ["read", "=", 0]], limit: 99 });
        return rows.length;
      } catch (e) { return 0; }
    },
    async refreshBadge() {
      const n = await this.unread();
      const dot = document.querySelector("#bell .dot");
      if (dot) { dot.textContent = n > 9 ? "9+" : n; dot.classList.toggle("hidden", !n); }
    },
    route(doctype) {
      return { "HR Attendance Request": "#/requests", "Leave Application": "#/leave", ToDo: "#/tasks", [S.REWARD]: "#/rewards" }[doctype] || "#/home";
    },
    async openDrawer() {
      const ov = document.createElement("div"); ov.className = "overlay"; ov.style.justifyContent = "flex-start"; ov.style.padding = "0";
      ov.innerHTML = `<div class="drawer"><div class="dh"><strong>الإشعارات</strong><div class="row"><button class="btn ghost sm" data-all>تعليم الكل كمقروء</button><button class="icon-btn" data-close>${icon("x")}</button></div></div><div class="db"><div class="loading"><span class="spin"></span></div></div></div>`;
      document.body.appendChild(ov);
      const close = () => ov.remove();
      ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) close(); });
      const rows = await API.list("Notification Log", { fields: ["name", "subject", "creation", "read", "document_type", "document_name"], filters: [["for_user", "=", Session.user]], order_by: "creation desc", limit: 40 }).catch(() => []);
      const db = ov.querySelector(".db");
      db.innerHTML = rows.length ? rows.map((r) => `<div class="notif ${Number(r.read) ? "read" : "unread"}" data-n="${esc(r.name)}" data-dt="${esc(r.document_type || "")}"><span class="ndot"></span><div><div class="ns">${esc(String(r.subject || "").replace(/<[^>]+>/g, ""))}</div><div class="nt">${UI.ago(r.creation)}</div></div></div>`).join("") : '<div class="empty">مفيش إشعارات</div>';
      db.querySelectorAll(".notif").forEach((el) => el.onclick = async () => {
        API.update("Notification Log", el.dataset.n, { read: 1 }).catch(() => {});
        close(); location.hash = this.route(el.dataset.dt); this.refreshBadge();
      });
      ov.querySelector("[data-all]").onclick = async () => {
        await Promise.all(rows.filter((r) => !Number(r.read)).map((r) => API.update("Notification Log", r.name, { read: 1 }).catch(() => {})));
        db.querySelectorAll(".notif").forEach((el) => { el.classList.remove("unread"); el.classList.add("read"); });
        this.refreshBadge();
      };
    },
  };
  window.Notify = Notify;

  // ========== الهيكل والتنقل ==========
  const root = () => document.getElementById("app");

  function shell() {
    const demo = API.isDemo();
    root().innerHTML = `
      <header class="topbar no-print"><div class="topbar-in">
        <a class="brand" href="#/home"><span class="brand-mark">${icon("finger")}</span><span>${esc(CONFIG.APP_NAME)}</span></a>
        ${demo ? '<span class="demo-badge">وضع تجريبي</span>' : ""}
        <span class="spacer"></span>
        <button class="icon-btn" id="bell" aria-label="الإشعارات">${icon("bell")}<span class="dot hidden">0</span></button>
        <button class="user-chip" id="me"><span class="nm">${esc(Session.full_name || Session.user)}</span><span class="avatar">${esc(UI.initials(Session.full_name || Session.user))}</span></button>
      </div></header>
      <main id="view"></main>`;
    document.getElementById("bell").onclick = () => Notify.openDrawer();
    document.getElementById("me").onclick = async () => {
      const m = UI.modal({
        title: Session.full_name || Session.user,
        body: `<div class="kv"><span class="k">الإيميل</span><span class="v">${esc(Session.user)}</span>
          <span class="k">الموظف</span><span class="v">${esc(Session.employee ? Session.employee.name : "مش مربوط بموظف")}</span>
          <span class="k">الصلاحيات</span><span class="v">${esc(Session.roles.filter((r) => !["All", "Guest", "Desk User"].includes(r)).join("، ") || "—")}</span>
          <span class="k">السيرفر</span><span class="v">${esc(API.isDemo() ? "بيانات تجريبية" : CONFIG.ERP_URL)}</span></div>`,
        footer: `<button class="btn bad" data-out>${icon("logout")} خروج</button>`,
      });
      m.el.querySelector("[data-out]").onclick = () => { Session.clear(); Data.clear(); m.close(); location.hash = ""; start(); };
    };
    Notify.refreshBadge();
  }

  window.pageHead = (title, sub = "", extra = "") => `<div class="page-head"><a class="back" href="#/home" aria-label="رجوع">${icon("arrow")}</a><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div><span class="spacer"></span>${extra}</div>`;
  window.loadingHTML = '<div class="loading"><span class="spin"></span> بيحمّل...</div>';

  let pollTimer = null;
  async function route() {
    const view = document.getElementById("view");
    if (!view) return;
    Face && Face.stop();
    const name = (location.hash.replace(/^#\/?/, "").split("?")[0] || "home");
    const fn = (window.Views || {})[name] || Views.home;
    view.innerHTML = loadingHTML;
    window.scrollTo(0, 0);
    try { await fn(view); }
    catch (e) {
      console.error(e);
      view.innerHTML = `${pageHead("حصلت مشكلة")}<div class="card"><p>${esc(e.message || e)}</p><button class="btn primary" onclick="location.reload()">جرّب تاني</button></div>`;
    }
  }

  function start() {
    if (!Session.load()) { Views.login(root()); return; }
    shell();
    route();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => Notify.refreshBadge(), (CONFIG.NOTIFY_POLL_SECONDS || 60) * 1000);
  }
  window.App = { start, route, shell };

  window.addEventListener("hashchange", () => { if (Session.user) route(); });
  document.addEventListener("DOMContentLoaded", start);
})();
