// بيانات تجريبية بنفس مستندات ERPNext و HRMS الأصلية (للتجربة من غير سيرفر)
(function () {
  const KEY = "hr_mock_v3";
  const pad = (n) => String(n).padStart(2, "0");
  const D = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const DT = (d) => `${D(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const uid = () => Math.random().toString(36).slice(2, 9).toUpperCase();
  const rng = (seed) => { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const C = () => CONFIG.COMPONENTS;

  function seed() {
    const db = {};
    let n = 0;
    const add = (dt, doc) => {
      const prefix = { "Employee Checkin": "EMP-CKIN", "Attendance Request": "HR-ARQ", "Shift Request": "HR-SHR", "Shift Assignment": "HR-SHA", "Leave Application": "HR-LAP", "Additional Salary": "HR-ADS", ToDo: "TODO", "Notification Log": "NL", "Salary Structure Assignment": "HR-SSA" }[dt] || dt.slice(0, 3).toUpperCase();
      const d = { name: doc.name || `${prefix}-${pad(++n)}${uid().slice(0, 2)}`, creation: DT(new Date()), modified: DT(new Date()), docstatus: 0, ...doc };
      (db[dt] = db[dt] || []).push(d);
      return d;
    };
    db.__users = {
      "admin@demo.com": ["أحمد سمير", ["System Manager", "HR Manager", "Employee"]],
      "mona@demo.com": ["منى عادل", ["HR Manager", "Employee"]],
      "karim@demo.com": ["كريم حسن", ["Employee"]],
      "sara@demo.com": ["سارة محمود", ["Employee"]],
      "youssef@demo.com": ["يوسف علي", ["Employee"]],
      "nour@demo.com": ["نور الهدى", ["Employee"]],
      "omar@demo.com": ["عمر خالد", ["Employee"]],
    };

    add("Overtime Type", { name: "أوفر عادي", standard_multiplier: 1.5, overtime_salary_component: C().overtime });
    add("Shift Type", { name: "الشيفت الصباحي", start_time: "09:00:00", end_time: "17:00:00", late_entry_grace_period: 15, early_exit_grace_period: 10, enable_late_entry_marking: 1, enable_early_exit_marking: 1, allow_overtime: 1, overtime_type: "أوفر عادي" });
    add("Shift Type", { name: "الشيفت المسائي", start_time: "14:00:00", end_time: "22:00:00", late_entry_grace_period: 15, early_exit_grace_period: 10, enable_late_entry_marking: 1, enable_early_exit_marking: 1, allow_overtime: 1, overtime_type: "أوفر عادي" });
    add("Shift Type", { name: "إداري بدون أوفر", start_time: "09:00:00", end_time: "17:00:00", late_entry_grace_period: 15, early_exit_grace_period: 10, enable_late_entry_marking: 1, enable_early_exit_marking: 1, allow_overtime: 0 });
    add("Shift Location", { name: "فرع المعادي", location_name: "فرع المعادي", latitude: 29.9602, longitude: 31.2569, checkin_radius: 150 });
    add("Shift Location", { name: "فرع مدينة نصر", location_name: "فرع مدينة نصر", latitude: 30.0561, longitude: 31.3301, checkin_radius: 150 });
    [["إجازة عارضة", 0], ["إجازة مرضية", 0], ["إجازة سنوية", 0], ["إجازة بدون مرتب", 1]].forEach(([nm, lwp]) => add("Leave Type", { name: nm, leave_type_name: nm, is_lwp: lwp }));
    [[C().late, "Deduction", 0], [C().missed, "Deduction", 50], [C().overtime, "Earning", 0], [C().reward, "Earning", 0], [C().deduction, "Deduction", 0], ["مرتب أساسي", "Earning", 0]].forEach(([nm, type, amount]) => add("Salary Component", { name: nm, salary_component: nm, type, amount }));
    add("HR Settings", { name: "HR Settings", allow_multiple_shift_assignments: 1 });

    const emps = [
      ["EMP-0001", "أحمد سمير", "admin@demo.com", "المدير العام", 20000, "الشيفت الصباحي", ["فرع المعادي"], null],
      ["EMP-0002", "منى عادل", "mona@demo.com", "مديرة الموارد البشرية", 12000, "الشيفت الصباحي", ["فرع المعادي", "فرع مدينة نصر"], "EMP-0001"],
      ["EMP-0003", "كريم حسن", "karim@demo.com", "محاسب", 8000, "إداري بدون أوفر", ["فرع المعادي"], "EMP-0002"],
      ["EMP-0004", "سارة محمود", "sara@demo.com", "خدمة عملاء", 6500, "الشيفت الصباحي", ["فرع مدينة نصر"], "EMP-0002"],
      ["EMP-0005", "يوسف علي", "youssef@demo.com", "مندوب مبيعات", 7000, "الشيفت الصباحي", ["فرع المعادي", "فرع مدينة نصر"], "EMP-0002"],
      ["EMP-0006", "نور الهدى", "nour@demo.com", "سكرتارية", 6000, "الشيفت الصباحي", ["فرع مدينة نصر"], "EMP-0002"],
      ["EMP-0007", "عمر خالد", "omar@demo.com", "أمن", 5500, "الشيفت المسائي", ["فرع المعادي"], "EMP-0002"],
    ];
    const now = new Date();
    const mStart = D(new Date(now.getFullYear(), now.getMonth(), 1));
    emps.forEach(([name, full, user, des, base, shift, locs, rep]) => {
      const repUser = rep ? emps.find((x) => x[0] === rep)[2] : null;
      add("Employee", { name, employee_name: full, user_id: user, designation: des, status: "Active", company: "شركة تجريبية", default_shift: shift, reports_to: rep, leave_approver: repUser, image: null, department: "الإدارة", custom_branches: locs.map((l) => ({ shift_location: l })) });
      add("Salary Structure Assignment", { employee: name, base, from_date: `${now.getFullYear()}-01-01`, docstatus: 1 });
      add("Shift Assignment", { employee: name, employee_name: full, shift_type: shift, shift_location: null, start_date: mStart, end_date: null, status: "Active", docstatus: 1, company: "شركة تجريبية" });
    });

    const r = rng(now.getFullYear() * 100 + now.getMonth() + 3);
    for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d <= now; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 5) continue;
      const today = D(d) === D(now);
      emps.forEach(([name, full, , , , shift], i) => {
        if (name === "EMP-0005" && d.getDate() === 3) return;
        const roll = r();
        if (roll < 0.05) return;
        const st = shift === "الشيفت المسائي" ? 14 : 9;
        const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), st, 0);
        t.setMinutes((roll < 0.25 ? Math.floor(r() * 40) : Math.floor(r() * 12) - 9) + (i === 3 ? 8 : 0));
        if (today && (i === 2 || i === 5 || t > now)) return;
        add("Employee Checkin", { employee: name, employee_name: full, log_type: "IN", time: DT(t), device_id: "app", workflow_state: "Approved", latitude: 29.96, longitude: 31.25 });
        if (today || r() < 0.05) return;
        const o = new Date(d.getFullYear(), d.getMonth(), d.getDate(), st + 8, 0);
        o.setMinutes(r() < 0.3 ? Math.floor(r() * 110) : Math.floor(r() * 14) - 9);
        add("Employee Checkin", { employee: name, employee_name: full, log_type: "OUT", time: DT(o), device_id: "app", workflow_state: "Approved", latitude: 29.96, longitude: 31.25 });
      });
    }
    const y = now.getFullYear(), m = pad(now.getMonth() + 1);
    add("Leave Application", { employee: "EMP-0005", employee_name: "يوسف علي", leave_type: "إجازة بدون مرتب", from_date: `${y}-${m}-03`, to_date: `${y}-${m}-03`, total_leave_days: 1, status: "Approved", docstatus: 1, leave_approver: "mona@demo.com", description: "ظرف عائلي" });
    const fut = new Date(now); fut.setDate(fut.getDate() + 3);
    add("Leave Application", { employee: "EMP-0004", employee_name: "سارة محمود", leave_type: "إجازة سنوية", from_date: D(fut), to_date: D(fut), total_leave_days: 1, status: "Open", leave_approver: "mona@demo.com", description: "سفر" });

    const lt = new Date(now); lt.setHours(9, 37, 0, 0);
    add("Workflow", { name: "موافقة البصمة", document_type: "Employee Checkin", is_active: 1 });
    const ar = add("Employee Checkin", { employee: "EMP-0003", employee_name: "كريم حسن", log_type: "IN", time: DT(lt), device_id: "app:late:37", workflow_state: "Pending", skip_auto_attendance: 1 });

    add("Additional Salary", { employee: "EMP-0004", employee_name: "سارة محمود", salary_component: C().reward, type: "Earning", amount: 500, payroll_date: `${y}-${m}-05`, docstatus: 1, company: "شركة تجريبية", custom_reason: "" });
    add("Additional Salary", { employee: "EMP-0007", employee_name: "عمر خالد", salary_component: C().deduction, type: "Deduction", amount: 110, payroll_date: `${y}-${m}-08`, docstatus: 1, company: "شركة تجريبية" });

    add("ToDo", { allocated_to: "sara@demo.com", description: "مراجعة شكاوى العملاء الأسبوع ده", status: "Open", date: D(fut), assigned_by: "mona@demo.com", priority: "Medium" });
    add("ToDo", { allocated_to: "karim@demo.com", description: "تسليم كشف المصروفات", status: "Closed", date: D(now), assigned_by: "mona@demo.com", priority: "High" });
    add("Notification Log", { for_user: "mona@demo.com", subject: "كريم حسن: حضور متأخر 37 دقيقة محتاج موافقتك", document_type: "Employee Checkin", document_name: ar.name, read: 0 });
    return db;
  }

  let db;
  const load = () => { if (db) return; try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} if (!db) { db = seed(); save(); } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };

  function cmp(a, op, b) {
    const num = typeof a === "number" || typeof b === "number";
    const A = num ? Number(a) : (a ?? ""), B = num ? Number(b) : (b ?? "");
    switch (String(op).toLowerCase()) {
      case "=": return a == b || ((b === "" || b === null) && (a === null || a === undefined || a === ""));
      case "!=": return a != b;
      case ">": return A > B; case "<": return A < B; case ">=": return A >= B; case "<=": return A <= B;
      case "in": return (Array.isArray(b) ? b : String(b).split(",")).includes(a);
      case "not in": return !(Array.isArray(b) ? b : String(b).split(",")).includes(a);
      case "like": return new RegExp("^" + String(b).split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(String(a ?? ""));
      case "is": return b === "set" ? !!a : !a;
      default: return true;
    }
  }
  const norm = (f) => !f ? [] : Array.isArray(f) ? f : Object.entries(f).map(([k, v]) => [k, "=", v]);
  function match(dt, doc, filters) {
    return norm(filters).every((x) => {
      if (x.length === 4 && x[0] === "Has Role") return ((db.__users[doc.name] || [])[1] || []).some((r) => cmp(r, x[2], x[3]));
      const [k, op, v] = x.length === 4 ? x.slice(1) : x;
      return cmp(doc[k], op, v);
    });
  }
  const pick = (doc, fields) => { if (!fields || fields.includes("*")) return { ...doc }; const o = {}; fields.forEach((f) => (o[f] = doc[f])); return o; };
  const wait = () => new Promise((r) => setTimeout(r, 40));
  const rows = (dt) => {
    if (dt === "User") return Object.entries(db.__users).map(([name, [full_name]]) => ({ name, full_name, enabled: 1 }));
    return db[dt] || [];
  };

  function onSubmit(dt, d) {
    if (dt === "Shift Request" && d.status === "Approved") {
      const e = rows("Employee").find((x) => x.name === d.employee);
      db["Shift Assignment"].push({ name: "HR-SHA-" + uid(), employee: d.employee, employee_name: e && e.employee_name, shift_type: d.shift_type, start_date: d.from_date, end_date: d.to_date, status: "Active", docstatus: 1, shift_request: d.name, creation: DT(new Date()) });
    }
  }

  window.MockAPI = {
    reset() { db = seed(); save(); },
    async list(dt, { fields = ["name"], filters, or_filters, order_by, limit = 0 } = {}) {
      load(); await wait();
      let out = rows(dt).filter((d) => match(dt, d, filters));
      if (or_filters && norm(or_filters).length) out = out.filter((d) => norm(or_filters).some((f) => match(dt, d, [f])));
      const [k, dir] = (order_by || "creation desc").split(",")[0].trim().split(/\s+/);
      const s = (dir || "asc").toLowerCase() === "desc" ? -1 : 1;
      out = [...out].sort((a, b) => (a[k] > b[k] ? s : a[k] < b[k] ? -s : 0));
      if (limit) out = out.slice(0, limit);
      return out.map((d) => pick(d, fields));
    },
    async get(dt, name) {
      load(); await wait();
      if (dt === "User") { const u = db.__users[name]; if (!u) throw new ApiError("مش موجود", 404); return { name, full_name: u[0], roles: u[1].map((role) => ({ role })) }; }
      const d = rows(dt).find((x) => x.name === name);
      if (!d) throw new ApiError(`${dt} ${name} مش موجود`, 404);
      return { ...d };
    },
    async insert(dt, doc) {
      load(); await wait();
      const prefix = { "Employee Checkin": "EMP-CKIN", "Attendance Request": "HR-ARQ", "Shift Request": "HR-SHR", "Shift Assignment": "HR-SHA", "Leave Application": "HR-LAP", "Additional Salary": "HR-ADS", ToDo: "TODO", "Notification Log": "NL" }[dt] || dt.slice(0, 3).toUpperCase();
      const name = doc.name || (["Shift Type", "Shift Location"].includes(dt) ? (doc.location_name || doc.__newname || doc.name) : `${prefix}-${uid()}`);
      if (rows(dt).some((x) => x.name === name)) throw new ApiError(`${name} موجود بالفعل`, 409);
      const d = { docstatus: 0, ...doc, name, creation: DT(new Date()), modified: DT(new Date()), owner: window.Session && Session.user };
      const e = d.employee && rows("Employee").find((x) => x.name === d.employee);
      if (e) d.employee_name = e.employee_name;
      if (dt === "Leave Application") { d.total_leave_days = Math.round((new Date(d.to_date) - new Date(d.from_date)) / 864e5) + 1; d.status = d.status || "Open"; }
      if (dt === "Shift Request") d.status = d.status || "Draft";
      if (dt === "Employee Checkin") d.workflow_state = d.workflow_state || "Approved";
      if (dt === "Shift Assignment") d.status = d.status || "Active";
      if (dt === "Additional Salary") { const c = rows("Salary Component").find((x) => x.name === d.salary_component); d.type = c ? c.type : d.type; }
      (db[dt] = db[dt] || []).push(d);
      if (d.docstatus === 1) onSubmit(dt, d);
      save();
      return { ...d };
    },
    async update(dt, name, patch) {
      load(); await wait();
      const d = rows(dt).find((x) => x.name === name);
      if (!d) throw new ApiError(`${dt} ${name} مش موجود`, 404);
      const wasDraft = d.docstatus === 0;
      Object.assign(d, patch, { modified: DT(new Date()) });
      if (wasDraft && d.docstatus === 1) onSubmit(dt, d);
      save();
      return { ...d };
    },
    async remove(dt, name) { load(); await wait(); db[dt] = rows(dt).filter((x) => x.name !== name); save(); return true; },
    async submit(dt, name) { return this.update(dt, name, { docstatus: 1 }); },
    async cancel(dt, name) { return this.update(dt, name, { docstatus: 2, ...(dt === "Shift Assignment" ? { status: "Inactive" } : {}) }); },
    async insertSubmit(dt, doc) { return this.insert(dt, { ...doc, docstatus: 1 }); },
    async call(method, args) {
      await wait();
      if (method === "frappe.client.cancel") return this.cancel(args.doctype, args.name);
      if (method === "frappe.model.workflow.apply_workflow") {
        const ref = JSON.parse(args.doc);
        const d = rows(ref.doctype).find((x) => x.name === ref.name);
        if (!d || d.workflow_state !== "Pending") throw new ApiError("Not a valid Workflow Action", 417);
        return this.update(ref.doctype, ref.name, { workflow_state: args.action === "Approve" ? "Approved" : "Rejected" });
      }
      return null;
    },
    async upload(file, { doctype, docname } = {}) {
      load();
      const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const f = { name: uid(), file_name: file.name || "image.jpg", file_url: url, attached_to_doctype: doctype, attached_to_name: docname, creation: DT(new Date()) };
      (db.File = db.File || []).push(f); save(); return f;
    },
    async attachments(doctype, docname) { return this.list("File", { fields: ["name", "file_url", "file_name"], filters: [["attached_to_doctype", "=", doctype], ["attached_to_name", "=", docname]] }); },
    async fileBlobUrl(u) { return u; },
    async login(usr, pwd) {
      load(); await wait();
      const u = db.__users[usr];
      if (!u || pwd !== "demo") throw new ApiError("اسم اليوزر أو الباسورد غلط", 401);
      return { user: usr, full_name: u[0], roles: u[1] };
    },
    logout() {},
  };
  window.MockAPI.admin = window.MockAPI;
})();
