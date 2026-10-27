// بيانات تجريبية بتشتغل في المتصفح بدل ERPNext (لما الوضع التجريبي يكون شغال)
(function () {
  const KEY = "hr_mock_db_v1";
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDT = (d) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const uid = () => Math.random().toString(36).slice(2, 12);

  function rng(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function seed() {
    const db = {};
    const add = (dt, doc) => {
      (db[dt] = db[dt] || []);
      const d = { name: doc.name || uid(), creation: doc.creation || fmtDT(new Date()), modified: fmtDT(new Date()), docstatus: 0, ...doc };
      db[dt].push(d);
      return d;
    };
    db.__users = {
      "admin@demo.com": { full_name: "أحمد سمير", roles: ["System Manager", "HR Manager", "Employee"] },
      "mona@demo.com": { full_name: "منى عادل", roles: ["Employee", "Leave Approver"] },
      "karim@demo.com": { full_name: "كريم حسن", roles: ["Employee"] },
      "sara@demo.com": { full_name: "سارة محمود", roles: ["Employee"] },
      "youssef@demo.com": { full_name: "يوسف علي", roles: ["Employee"] },
      "nour@demo.com": { full_name: "نور الهدى", roles: ["Employee"] },
      "omar@demo.com": { full_name: "عمر خالد", roles: ["Employee"] },
    };

    db["HR Attendance Policy"] = [{
      name: "HR Attendance Policy", checkin_grace_minutes: 15, early_leave_grace_minutes: 10, default_monthly_grace: 100,
      late_multiplier: 2, overtime_after_minutes: 30, overtime_multiplier: 1.5, missed_punch_deduction: 50,
      working_days_per_month: 26, weekly_off_days: "Friday", require_face: 1, face_threshold: 0.5,
    }];

    add("Shift Type", { name: "الشيفت الصباحي", start_time: "09:00:00", end_time: "17:00:00" });
    add("Shift Type", { name: "الشيفت المسائي", start_time: "14:00:00", end_time: "22:00:00" });
    add("Shift Location", { name: "فرع المعادي", location_name: "فرع المعادي", latitude: 29.9602, longitude: 31.2569, checkin_radius: 150 });
    add("Shift Location", { name: "فرع مدينة نصر", location_name: "فرع مدينة نصر", latitude: 30.0561, longitude: 31.3301, checkin_radius: 150 });

    ["Casual Leave", "Sick Leave", "Annual Leave", "Leave Without Pay"].forEach((n) => add("Leave Type", { name: n, leave_type_name: n }));
    ["ظرف عائلي", "مرض", "سفر", "مناسبة اجتماعية", "أخرى"].forEach((n) => add("HR Leave Reason", { name: n, reason_name: n }));

    const emps = [
      ["EMP-0001", "أحمد سمير", "admin@demo.com", "المدير العام", 20000, "الشيفت الصباحي", "فرع المعادي", "", 0, 1, null],
      ["EMP-0002", "منى عادل", "mona@demo.com", "مديرة الفرع", 12000, "الشيفت الصباحي", "فرع المعادي", "فرع مدينة نصر", 0, 1, "EMP-0001"],
      ["EMP-0003", "كريم حسن", "karim@demo.com", "محاسب", 8000, "الشيفت الصباحي", "فرع المعادي", "", 1, 0, "EMP-0002"],
      ["EMP-0004", "سارة محمود", "sara@demo.com", "خدمة عملاء", 6500, "الشيفت الصباحي", "فرع مدينة نصر", "", 0, 0, "EMP-0002"],
      ["EMP-0005", "يوسف علي", "youssef@demo.com", "مندوب مبيعات", 7000, "الشيفت الصباحي", "فرع المعادي", "فرع مدينة نصر", 0, 0, "EMP-0002"],
      ["EMP-0006", "نور الهدى", "nour@demo.com", "سكرتارية", 6000, "الشيفت الصباحي", "فرع مدينة نصر", "", 0, 0, "EMP-0002"],
      ["EMP-0007", "عمر خالد", "omar@demo.com", "أمن", 5500, "الشيفت المسائي", "فرع المعادي", "", 0, 0, "EMP-0002"],
    ];
    emps.forEach(([name, full, user, des, sal, shift, l1, l2, noot, canr, rep]) => add("Employee", {
      name, employee_name: full, first_name: full, user_id: user, designation: des, status: "Active", company: "شركة تجريبية",
      custom_monthly_salary: sal, default_shift: shift, custom_location_1: l1, custom_location_2: l2,
      custom_no_overtime: noot, custom_can_reward: canr, reports_to: rep,
      leave_approver: rep ? emps.find((e) => e[0] === rep)[2] : null, image: null, custom_monthly_grace_minutes: name === "EMP-0004" ? 60 : null,
    }));

    // بصمات الشهر الحالي
    const now = new Date();
    const r = rng(now.getFullYear() * 100 + now.getMonth() + 7);
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 5) continue; // الجمعة
      const isToday = fmtDate(d) === fmtDate(now);
      emps.forEach(([name, , , , , shift], idx) => {
        if (name === "EMP-0005" && d.getDate() === 3) return; // إجازة
        const roll = r();
        if (roll < 0.06) return; // غياب
        const st = shift === "الشيفت المسائي" ? 14 : 9;
        const lateMin = roll < 0.25 ? Math.floor(r() * 45) : Math.floor(r() * 12) - 8;
        const inT = new Date(d.getFullYear(), d.getMonth(), d.getDate(), st, 0, 0);
        inT.setMinutes(inT.getMinutes() + lateMin + (idx === 3 ? 10 : 0));
        if (isToday) {
          if (idx === 2 || idx === 5) return; // غايبين النهارده لحد دلوقتي
          if (inT > now) return;
        }
        add("Employee Checkin", { employee: name, employee_name: emps[idx][1], log_type: "IN", time: fmtDT(inT), shift, creation: fmtDT(inT) });
        if (isToday) return;
        if (r() < 0.05) return; // نسيان بصمة انصراف
        const outT = new Date(d.getFullYear(), d.getMonth(), d.getDate(), st + 8, 0, 0);
        const extra = r() < 0.3 ? Math.floor(r() * 120) : Math.floor(r() * 20) - 12;
        outT.setMinutes(outT.getMinutes() + extra);
        add("Employee Checkin", { employee: name, employee_name: emps[idx][1], log_type: "OUT", time: fmtDT(outT), shift, creation: fmtDT(outT) });
      });
    }

    const y = now.getFullYear(), m = pad(now.getMonth() + 1);
    add("Leave Application", { employee: "EMP-0005", employee_name: "يوسف علي", leave_type: "Casual Leave", from_date: `${y}-${m}-03`, to_date: `${y}-${m}-03`, total_leave_days: 1, status: "Approved", docstatus: 1, custom_reason: "ظرف عائلي", custom_deduct_days: 1, leave_approver: "mona@demo.com", description: "", posting_date: `${y}-${m}-01` });
    const fut = new Date(now); fut.setDate(fut.getDate() + 3);
    add("Leave Application", { employee: "EMP-0004", employee_name: "سارة محمود", leave_type: "Annual Leave", from_date: fmtDate(fut), to_date: fmtDate(fut), total_leave_days: 1, status: "Open", custom_reason: "سفر", leave_approver: "mona@demo.com", description: "سفر للبلد", posting_date: fmtDate(now) });

    const lt = new Date(now); lt.setHours(9, 37, 0, 0);
    add("HR Attendance Request", { employee: "EMP-0003", employee_name: "كريم حسن", request_type: "Late Check-in", log_type: "IN", request_time: fmtDT(lt), shift: "الشيفت الصباحي", minutes: 37, status: "Pending", approver: "mona@demo.com", latitude: 29.9602, longitude: 31.2569 });

    add("HR Reward Deduction", { employee: "EMP-0004", employee_name: "سارة محمود", entry_type: "Reward", calc_type: "Fixed", value: 500, amount: 500, date: `${y}-${m}-05`, reason: "تقييم ممتاز من العملاء", created_by_user: "admin@demo.com" });
    add("HR Reward Deduction", { employee: "EMP-0007", employee_name: "عمر خالد", entry_type: "Deduction", calc_type: "Percent", value: 2, amount: 110, date: `${y}-${m}-08`, reason: "ترك مكان الخدمة", created_by_user: "mona@demo.com" });

    add("ToDo", { allocated_to: "sara@demo.com", description: "مراجعة شكاوى العملاء الأسبوع ده", status: "Open", date: fmtDate(fut), assigned_by: "mona@demo.com", priority: "Medium" });
    add("ToDo", { allocated_to: "admin@demo.com", description: "اعتماد جدول الشيفتات للشهر الجاي", status: "Open", date: fmtDate(fut), assigned_by: "admin@demo.com", priority: "High" });
    add("ToDo", { allocated_to: "karim@demo.com", description: "تسليم كشف المصروفات", status: "Closed", date: fmtDate(now), assigned_by: "mona@demo.com", priority: "Medium" });

    add("Notification Log", { for_user: "mona@demo.com", subject: "كريم حسن طالب يبصم حضور متأخر 37 دقيقة", document_type: "HR Attendance Request", document_name: "", read: 0, type: "Alert" });
    add("Notification Log", { for_user: "sara@demo.com", subject: "عندك مهمة جديدة: مراجعة شكاوى العملاء", document_type: "ToDo", document_name: "", read: 0, type: "Alert" });
    return db;
  }

  let db;
  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!db) { db = seed(); save(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  function cmp(a, op, b) {
    const isNum = typeof a === "number" || (typeof b === "number");
    const A = isNum ? Number(a) : a ?? "";
    const B = isNum ? Number(b) : b ?? "";
    switch ((op || "=").toLowerCase()) {
      case "=": return A == B || (b === "" && (a === null || a === undefined));
      case "!=": return A != B;
      case ">": return A > B;
      case "<": return A < B;
      case ">=": return A >= B;
      case "<=": return A <= B;
      case "in": return (Array.isArray(b) ? b : String(b).split(",")).includes(a);
      case "not in": return !(Array.isArray(b) ? b : String(b).split(",")).includes(a);
      case "like": return String(a ?? "").toLowerCase().includes(String(b).replace(/%/g, "").toLowerCase());
      case "between": return A >= b[0] && A <= (String(b[1]).length === 10 ? b[1] + " 23:59:59" : b[1]);
      case "is": return b === "set" ? !!a : !a;
      default: return true;
    }
  }
  function normFilters(f) {
    if (!f) return [];
    if (!Array.isArray(f)) return Object.entries(f).map(([k, v]) => Array.isArray(v) ? [k, v[0], v[1]] : [k, "=", v]);
    return f.map((x) => (x.length === 4 ? x.slice(1) : x));
  }
  const match = (doc, filters) => normFilters(filters).every(([k, op, v]) => cmp(doc[k], op, v));
  const pick = (doc, fields) => {
    if (!fields || fields.includes("*")) return { ...doc };
    const o = {};
    fields.forEach((f) => { const k = f.split(" as ")[0].trim(); o[k] = doc[k]; });
    return o;
  };
  const notFound = (dt, n) => { const e = new ApiError(`${dt} ${n} مش موجود`, 404); throw e; };
  const delay = () => new Promise((r) => setTimeout(r, 60));

  window.MockAPI = {
    reset() { db = seed(); save(); },
    async list(doctype, { fields = ["name"], filters, or_filters, order_by, limit = 0 } = {}) {
      load(); await delay();
      let rows = (db[doctype] || []).filter((d) => match(d, filters));
      if (or_filters && normFilters(or_filters).length) rows = rows.filter((d) => normFilters(or_filters).some((f) => match(d, [f])));
      const ob = (order_by || "creation desc").split(",")[0].trim().split(/\s+/);
      const key = ob[0].replace(/`/g, "").split(".").pop(), dir = (ob[1] || "asc").toLowerCase() === "desc" ? -1 : 1;
      rows.sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
      if (limit) rows = rows.slice(0, limit);
      return rows.map((d) => pick(d, fields));
    },
    async get(doctype, name) {
      load(); await delay();
      if (doctype === "DocType" || doctype === "Custom Field") return { name };
      if (doctype === "User") { const u = db.__users[name]; if (!u) notFound(doctype, name); return { name, ...u, roles: u.roles.map((role) => ({ role })) }; }
      const d = (db[doctype] || []).find((x) => x.name === name);
      if (!d) notFound(doctype, name);
      return { ...d };
    },
    async exists(doctype, name) { try { await this.get(doctype, name); return true; } catch (e) { return false; } },
    async insert(doctype, doc) {
      load(); await delay();
      if (doctype === "DocType" || doctype === "Custom Field") return doc;
      const name = doc.name || (doctype === "HR Leave Reason" ? doc.reason_name : doctype === "Shift Location" ? doc.location_name : `${doctype.split(" ").map((w) => w[0]).join("")}-${uid()}`);
      if ((db[doctype] || []).some((x) => x.name === name)) throw new ApiError(`${name} موجود بالفعل`, 409);
      const d = { docstatus: 0, ...doc, name, creation: fmtDT(new Date()), modified: fmtDT(new Date()), owner: window.Session?.user };
      if (doctype === "Leave Application") {
        const a = new Date(d.from_date), b = new Date(d.to_date);
        d.total_leave_days = Math.round((b - a) / 864e5) + 1;
        d.status = d.status || "Open";
        const e = (db.Employee || []).find((x) => x.name === d.employee); if (e) d.employee_name = e.employee_name;
      }
      if (doctype === "Employee Checkin") { const e = (db.Employee || []).find((x) => x.name === d.employee); if (e) d.employee_name = e.employee_name; }
      (db[doctype] = db[doctype] || []).push(d); save();
      return { ...d };
    },
    async update(doctype, name, patch) {
      load(); await delay();
      const d = (db[doctype] || []).find((x) => x.name === name);
      if (!d) notFound(doctype, name);
      Object.assign(d, patch, { modified: fmtDT(new Date()) }); save();
      return { ...d };
    },
    async remove(doctype, name) {
      load(); await delay();
      db[doctype] = (db[doctype] || []).filter((x) => x.name !== name); save();
      return true;
    },
    async call(method, args) { await delay(); return null; },
    async submit(doctype, name) { return this.update(doctype, name, { docstatus: 1 }); },
    async upload(file, { doctype, docname } = {}) {
      load();
      const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const f = { name: uid(), file_name: file.name || "image.jpg", file_url: dataUrl, attached_to_doctype: doctype, attached_to_name: docname, creation: fmtDT(new Date()) };
      (db.File = db.File || []).push(f); save();
      return f;
    },
    async attachments(doctype, docname) {
      return this.list("File", { fields: ["name", "file_url", "file_name"], filters: [["attached_to_doctype", "=", doctype], ["attached_to_name", "=", docname]] });
    },
    async fileBlobUrl(url) { return url; },
    async verifyLogin(usr, pwd) { load(); await delay(); return !!db.__users[usr] && pwd === "demo"; },
    async userRoles(user) { load(); return (db.__users[user] || {}).roles || []; },
  };
})();
