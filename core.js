// الجلسة والصلاحيات والبيانات المشتركة والإشعارات والتنقل
(function () {
  const { esc, icon } = UI;

  // ========== الجلسة والصلاحيات (من أدوار ERPNext نفسها) ==========
  const Session = {
    user: null, full_name: "", roles: [], employee: null,
    load() { try { Object.assign(this, JSON.parse(localStorage.getItem("hr_session")) || {}); } catch (e) {} return !!this.user; },
    save() { const { user, full_name, roles, employee } = this; try { localStorage.setItem("hr_session", JSON.stringify({ user, full_name, roles, employee })); } catch (e) {} },
    clear() { this.user = null; this.employee = null; this.roles = []; API.logout(); try { localStorage.removeItem("hr_session"); } catch (e) {} },
    has(r) { return this.roles.includes(r); },
    // System Manager: بيشوف كل حاجة ومعاها الإعدادات
    get isAdmin() { return this.has("System Manager"); },
    get isHR() { return this.isAdmin; },
    // HR Manager: بيشوف ويوافق على الناس اللي هو مديرهم المباشر بس
    get isManager() { return this.has("HR Manager"); },
    get canApprove() { return this.isAdmin || this.isManager; },
    get isLeaveApprover() { return this.canApprove; },
    get isShiftApprover() { return this.canApprove; },
    get canReward() { return this.isAdmin || this.isManager; },
  };
  window.Session = Session;

  // ========== بيانات مشتركة ==========
  const cache = {};
  const once = async (k, fn) => (k in cache ? cache[k] : (cache[k] = await fn()));
  const Data = {
    clear(k) {
      if (!k) Object.keys(cache).forEach((x) => delete cache[x]);
      else if (k.endsWith("*")) Object.keys(cache).filter((x) => x.startsWith(k.slice(0, -1))).forEach((x) => delete cache[x]);
      else delete cache[k];
    },
    shiftTypes: () => once("shiftTypes", async () => Object.fromEntries((await API.list("Shift Type", { fields: ["*"], order_by: "name asc" })).map((s) => [s.name, s]))),
    locations: () => once("locations", () => API.list("Shift Location", { fields: ["*"], order_by: "name asc" }).catch(() => [])),
    leaveTypes: () => once("leaveTypes", () => API.list("Leave Type", { fields: ["name", "is_lwp"], order_by: "name asc" }).catch(() => [])),
    overtimeTypes: () => once("otTypes", async () => Object.fromEntries((await API.list("Overtime Type", { fields: ["*"] }).catch(() => [])).map((o) => [o.name, o]))),
    components: () => once("components", async () => Object.fromEntries((await API.list("Salary Component", { fields: ["name", "type", "amount"] }).catch(() => [])).map((c) => [c.name, c]))),
    employees: () => once("employees", () => API.list("Employee", { fields: ["*"], filters: [["status", "=", "Active"]], order_by: "employee_name asc" })),
    async employee(name) { return (await this.employees()).find((e) => e.name === name); },
    // الموظفين اللي المستخدم مسؤول عنهم
    // System Manager: كل الموظفين. HR Manager: اللي هو مديرهم المباشر بس. غير كده: مفيش.
    async team() {
      if (!Session.canApprove) return [];
      const all = await this.employees().catch(() => []);
      if (Session.isAdmin) return all;
      const me = Session.employee && Session.employee.name;
      return me ? all.filter((e) => e.reports_to === me) : [];
    },
    // قراءة بيانات الفريق: المدير ممكن ميكونش عنده صلاحية قراءة على ERPNext لبيانات فريقه،
    // فبنقرأ بمفتاح الأدمن ونفلتر على فريقه بس
    api() { return Session.canApprove ? API.admin : API; },
    // هل الـ Workflow بتاع البصمة متجهز؟
    workflowReady: () => once("wf", async () => (await API.admin.list("Workflow", { fields: ["name"], filters: [["document_type", "=", "Employee Checkin"], ["is_active", "=", 1]], limit: 1 }).catch(() => [])).length > 0),
    // الفروع المسموحة للموظف (من جدول الفروع في ملفه)
    async branches(employee) {
      const doc = await API.get("Employee", employee).catch(() => null);
      return doc && Array.isArray(doc.custom_branches) ? doc.custom_branches.map((r) => r.shift_location).filter(Boolean) : [];
    },
    // تعيينات الشيفت الفعّالة في فترة
    async assignments(from, to, employee) {
      return once(`assignments:${from}:${to}:${employee || ""}`, async () => {
        const f = [["docstatus", "=", 1], ["status", "=", "Active"], ["start_date", "<=", to]];
        if (employee) f.push(["employee", "=", employee]);
        const rows = await API.list("Shift Assignment", { fields: ["name", "employee", "employee_name", "shift_type", "shift_location", "start_date", "end_date"], filters: f, order_by: "start_date desc" }).catch(() => []);
        return rows.filter((a) => !a.end_date || a.end_date >= from);
      });
    },
    // الشيفتات المعيّنة لموظف في يوم معيّن: [{shift, location}]
    shiftsOn(emp, date, assignments, types) {
      const mine = assignments.filter((a) => a.employee === emp.name && a.start_date <= date && (!a.end_date || a.end_date >= date));
      if (mine.length) return mine.map((a) => ({ shift: types[a.shift_type], location: a.shift_location, assignment: a.name })).filter((x) => x.shift);
      return emp.default_shift && types[emp.default_shift] ? [{ shift: types[emp.default_shift], location: null }] : [];
    },
    async adminUsers() {
      return once("adminUsers", async () => (await API.admin.list("User", { fields: ["name"], filters: [["enabled", "=", 1], ["Has Role", "role", "=", "System Manager"], ["name", "not in", ["Administrator", "Guest"]]] }).catch(() => [])).map((u) => u.name));
    },
    hrUsers() { return this.adminUsers(); },
    async managerUser(emp) {
      if (!emp.reports_to) return null;
      const m = await this.employee(emp.reports_to);
      return m && m.user_id;
    },
    async baseSalary(employee, onDate) {
      const r = await API.list("Salary Structure Assignment", { fields: ["base", "from_date"], filters: [["employee", "=", employee], ["docstatus", "=", 1], ["from_date", "<=", onDate]], order_by: "from_date desc", limit: 1 }).catch(() => []);
      return r[0] ? Number(r[0].base) || 0 : 0;
    },
  };
  window.Data = Data;

  // ========== الإشعارات (Notification Log الأصلي، وبتظهر كمان في جرس ERPNext) ==========
  const Notify = {
    async send(users, subject, doctype, docname) {
      const list = [...new Set([].concat(users || []).filter((u) => u && u !== Session.user))];
      const failures = await Promise.all(list.map(async (u) => {
        try {
          await API.admin.insert("Notification Log", { for_user: u, from_user: Session.user, subject, type: "Alert", document_type: doctype || null, document_name: docname || null });
          return null;
        } catch (e) {
          console.warn(e);
          return `تعذّر إرسال الإشعار إلى ${u}: ${e.message}`;
        }
      }));
      return failures.filter(Boolean);
    },
    async unread() {
      try { return (await API.list("Notification Log", { fields: ["name"], filters: [["for_user", "=", Session.user], ["read", "=", 0]], limit: 99 })).length; } catch (e) { return 0; }
    },
    async markRead(name) {
      await API.admin.update("Notification Log", name, { read: 1 });
    },
    async badge() {
      const n = await this.unread();
      document.querySelectorAll("[data-bell] .dot").forEach((d) => { d.textContent = n > 9 ? "9+" : n; d.hidden = !n; });
    },
    route(dt) {
      return { "Employee Checkin": Session.canApprove ? "#/inbox" : "#/mine", "Attendance Request": "#/inbox", "Shift Request": "#/inbox", "Leave Application": Session.canApprove ? "#/inbox" : "#/mine", ToDo: "#/tasks", "Additional Salary": "#/rewards" }[dt] || "#/home";
    },
    async open() {
      const s = UI.sheet({ title: "الإشعارات", body: loadingHTML, footer: `<button class="btn ghost" data-all>تعليم الكل كمقروء</button>` });
      let rows;
      try {
        rows = await API.admin.list("Notification Log", { fields: ["name", "subject", "creation", "read", "document_type"], filters: [["for_user", "=", Session.user]], order_by: "creation desc", limit: 40 });
      } catch (e) {
        s.body.innerHTML = `<div class="note bad">${esc(e.message || e)}</div>`;
        return;
      }
      s.body.innerHTML = rows.length ? `<div class="group">${rows.map((r) => `<button class="row-item notif ${Number(r.read) ? "" : "unread"}" data-n="${esc(r.name)}" data-dt="${esc(r.document_type || "")}"><span class="ndot"></span><span class="ri-main"><span class="ri-t">${esc(String(r.subject || "").replace(/<[^>]+>/g, ""))}</span><span class="ri-s">${UI.ago(r.creation)}</span></span></button>`).join("")}</div>` : `<div class="empty">مفيش إشعارات</div>`;
      s.body.querySelectorAll(".notif").forEach((b) => b.onclick = async () => {
        b.disabled = true;
        try {
          await this.markRead(b.dataset.n);
          b.classList.remove("unread");
          await this.badge();
          const route = this.route(b.dataset.dt);
          s.close();
          if (location.hash !== route) location.hash = route;
        } catch (e) {
          b.disabled = false;
          toast(`تعذّر تعليم الإشعار كمقروء: ${e.message}`, "bad");
        }
      });
      s.el.querySelector("[data-all]").onclick = async (e) => {
        const button = e.currentTarget;
        const unreadRows = rows.filter((r) => !Number(r.read));
        if (!unreadRows.length) return;
        button.disabled = true;
        const outcomes = await Promise.all(unreadRows.map(async (row) => {
          try {
            await this.markRead(row.name);
            return { row, error: null };
          } catch (error) {
            return { row, error };
          }
        }));
        const failed = outcomes.filter((outcome) => outcome.error);
        outcomes.filter((outcome) => !outcome.error).forEach(({ row }) => {
          const item = [...s.body.querySelectorAll(".notif")].find((notification) => notification.dataset.n === row.name);
          if (item) item.classList.remove("unread");
          row.read = 1;
        });
        await this.badge();
        button.disabled = false;
        if (failed.length) toast(`تعذّر تعليم ${UI.num(failed.length)} إشعار كمقروء: ${failed[0].error.message}`, "bad");
      };
    },
  };
  window.Notify = Notify;

  // ========== الهيكل: شريط علوي + شريط تنقل تحت ==========
  const TABS = () => [
    ["home", "home", "الرئيسية"],
    Session.canApprove ? ["inbox", "inbox", "الطلبات"] : ["mine", "cal", "طلباتي"],
    ["punch", "finger", "البصمة"],
    ["tasks", "tasks", "المهام"],
    ["more", "more", "المزيد"],
  ];

  function shell() {
    document.getElementById("app").innerHTML = `
      <header class="appbar">
        <a class="brand" href="#/home"><img class="mark" src="logo.png" alt="">${esc(CONFIG.APP_NAME)}</a>
        ${API.isDemo() ? '<span class="pill warn">تجريبي</span>' : ""}
        <span class="sp"></span>
        <button class="ibtn" data-bell aria-label="الإشعارات">${icon("bell")}<span class="dot" hidden>0</span></button>
      </header>
      <main id="view" class="view"></main>
      <nav class="tabbar" aria-label="التنقل">${TABS().map(([k, ic, t]) => `<a href="#/${k}" data-tab="${k}" class="${k === "punch" ? "fab" : ""}"><span class="ti">${icon(ic)}</span><span class="tl">${t}</span></a>`).join("")}</nav>`;
    document.querySelector("[data-bell]").onclick = () => Notify.open();
    Notify.badge();
  }

  window.loadingHTML = '<div class="loading"><span class="spin"></span></div>';
  window.pageHead = (title, sub = "", action = "") => `<div class="phead">${["", "home", "inbox", "mine", "punch", "tasks", "more"].includes(location.hash.replace(/^#\/?/, "")) ? "" : `<button class="ibtn back" onclick="history.length>1?history.back():(location.hash='#/home')" aria-label="رجوع">${icon("arrow")}</button>`}<div class="pt"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${action}</div>`;
  window.deny = (view, title) => { view.innerHTML = `${pageHead(title)}<div class="empty">الصفحة دي محتاجة صلاحية مش عندك على ERPNext.</div>`; };

  let timer;
  async function route() {
    const root = document.getElementById("view"); if (!root) return;
    if (window.Face) Face.stop();
    const name = location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
    document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === name || (name === "mine" && a.dataset.tab === "inbox")));
    const view = document.createElement("div");
    view.innerHTML = loadingHTML;
    root.replaceChildren(view);
    window.scrollTo(0, 0);
    try { await (Views[name] || Views.home)(view); }
    catch (e) {
      console.error(e);
      view.innerHTML = `${pageHead("حصلت مشكلة")}<div class="note bad">${esc(e.message || e)}</div><button class="btn primary block" onclick="App.route()">جرّب تاني</button>`;
    }
  }

  // بنتأكد في كل دخول وكل فتحة للصفحة إن الحساب مربوط بموظف Active، وبنجيب أدواره من جديد من ERPNext.
  // بيرجع رسالة لو فيه مشكلة، أو null لو تمام.
  async function verify() {
    let user, emps;
    try {
      [user, emps] = await Promise.all([
        API.admin.get("User", Session.user),
        API.admin.list("Employee", { fields: ["*"], filters: [["user_id", "=", Session.user]], limit: 2 }),
      ]);
    } catch (e) {
      if (e.status === 404) return "الحساب ده مش موجود على ERPNext.";
      if (e.status === 0 && Session.employee) return null; // من غير نت: نكمّل بآخر بيانات متسجلة
      throw e;
    }
    if (user.enabled === 0) return "الحساب ده متوقف على ERPNext.";
    const roles = (user.roles || []).map((r) => r.role);
    const emp = emps[0] || null;
    const isSM = roles.includes("System Manager");
    if (!emp && !isSM) return "حسابك مش مربوط بموظف على ERPNext، فمش هتقدر تدخل. اطلب من الموارد البشرية يحطوا إيميلك في خانة User ID في ملفك.";
    if (emp && emp.status !== "Active" && !isSM) return "ملفك كموظف مش Active على ERPNext، فمش هتقدر تدخل.";
    if (emps.length > 1) console.warn("أكتر من موظف مربوطين بنفس الحساب", emps.map((e) => e.name));
    Object.assign(Session, { roles, employee: emp, full_name: emp ? emp.employee_name : user.full_name || Session.user });
    Session.save();
    return null;
  }

  async function start() {
    const root = document.getElementById("app");
    if (!Session.load()) { Views.login(root); return; }
    root.innerHTML = loadingHTML;
    let problem = null;
    try { problem = await verify(); }
    catch (e) { problem = e.message; }
    if (problem) { Session.clear(); Data.clear(); Views.login(root, problem); return; }
    shell(); route();
    clearInterval(timer); timer = setInterval(() => Notify.badge(), (CONFIG.NOTIFY_POLL_SECONDS || 60) * 1000);
  }
  window.App = { start, route, verify };
  window.addEventListener("hashchange", () => Session.user && route());
  window.addEventListener("hr-auth-expired", () => { if (!Session.user) return; Session.clear(); Data.clear(); UI.toast("الجلسة انتهت، ادخل تاني", "bad"); start(); });
  document.addEventListener("DOMContentLoaded", start);
})();
