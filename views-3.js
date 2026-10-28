// التقرير والترحيل للمرتب، المزيد، الشيفتات، تعيين الشيفتات، الفروع، الموظفين
(function () {
  const { esc, icon, toast } = UI;
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(t ?? v)}</option>`;
  const pad = (n) => String(n).padStart(2, "0");
  const dshort = (d) => UI.dateAr(d, { day: "numeric", month: "short" });

  // ================= تقرير البصمة =================
  Views.report = async function (view) {
    const now = new Date();
    const st = { ym: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`, emp: "" };
    const me = Session.employee;
    // الأدمن: كل الموظفين. المدير: نفسه وفريقه المباشر. غير كده: نفسه بس
    let team = await Data.team();
    if (team.length && me && !team.some((e) => e.name === me.name)) team = [(await Data.employee(me.name).catch(() => null)) || me, ...team];
    const many = team.length > 0;
    if (!many && !me) { view.innerHTML = `${pageHead("تقرير البصمة")}<div class="empty">حسابك مش مربوط بموظف.</div>`; return; }
    view.innerHTML = `${pageHead("تقرير البصمة", "", many ? `<button class="ibtn no-print" id="csv" aria-label="تنزيل Excel">${icon("download")}</button>` : "")}
      <div class="two no-print" style="margin-bottom:12px"><input class="input" type="month" id="ym" value="${st.ym}">${many ? `<select class="input" id="em"><option value="">${Session.isAdmin ? "كل الموظفين" : "أنا وفريقي"}</option>${team.map((e) => opt(e.name, e.employee_name)).join("")}</select>` : "<span></span>"}</div>
      <div id="out">${loadingHTML}</div>`;
    let results = [], ctx = {};
    const run = async () => {
      const out = view.querySelector("#out"); out.innerHTML = loadingHTML;
      const [y, m] = st.ym.split("-").map(Number);
      const from = `${st.ym}-01`, to = `${st.ym}-${pad(new Date(y, m, 0).getDate())}`;
      const emps = many ? (st.emp ? team.filter((e) => e.name === st.emp) : team) : [(await Data.employee(me.name).catch(() => null)) || me];
      const ef = st.emp ? [["employee", "=", st.emp]] : Session.isAdmin ? [] : [["employee", "in", emps.map((e) => e.name)]];
      const A = many ? Data.api() : API;
      const [types, asg, cks, leaves, ltypes, comps, ots, extras] = await Promise.all([
        Data.shiftTypes(), Data.assignments(from, to),
        A.list("Employee Checkin", { fields: ["*"], filters: [["time", ">=", from + " 00:00:00"], ["time", "<=", to + " 23:59:59"], ...ef], order_by: "time asc" }),
        A.list("Leave Application", { fields: ["employee", "leave_type", "from_date", "to_date", "status"], filters: [["docstatus", "=", 1], ["status", "=", "Approved"], ["from_date", "<=", to], ["to_date", ">=", from], ...ef] }).catch(() => []),
        Data.leaveTypes(), Data.components(), Data.overtimeTypes(),
        A.list("Additional Salary", { fields: ["employee", "salary_component", "amount", "payroll_date", "docstatus", "type"], filters: [["payroll_date", ">=", from], ["payroll_date", "<=", to], ["docstatus", "!=", 2], ...ef] }).catch(() => []),
      ]);
      const C = CONFIG.COMPONENTS;
      const lwp = new Set(ltypes.filter((t) => Number(t.is_lwp)).map((t) => t.name));
      const missedAmount = Number((comps[C.missed] || {}).amount) || 0;
      const otMult = (s) => (s && s.overtime_type && ots[s.overtime_type] ? Number(ots[s.overtime_type].standard_multiplier) : 0) || CONFIG.OVERTIME_MULTIPLIER_FALLBACK;
      const bases = await Promise.all(emps.map((e) => Data.baseSalary(e.name, to)));
      results = emps.map((emp, i) => Calc.monthly({
        emp, shiftFor: (d) => (Data.shiftsOn(emp, d, asg, types)[0] || {}).shift, checkins: cks.filter(validCheckin), leaves, lwpTypes: lwp,
        extras: extras.filter((x) => ![C.late, C.missed, C.overtime].includes(x.salary_component)), base: bases[i], missedAmount, otMultiplierFor: otMult, year: y, month: m, today: new Date(),
      }));
      ctx = { y, m, to, emps, types, asg, ots, comps, extras };
      const sum = (k) => results.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      const extra = (r, type) => r.extras.filter((x) => (x.type || (comps[x.salary_component] || {}).type) === type).reduce((s, x) => s + Number(x.amount || 0), 0);
      const posted = extras.filter((x) => [C.late, C.missed, C.overtime].includes(x.salary_component));
      out.innerHTML = `
        <div class="today-strip" style="margin:0 0 12px"><div class="late"><b>${UI.money(sum("lateDeduct"))}</b><span>خصم تأخير</span></div><div class="in"><b>${UI.money(sum("otPay"))}</b><span>أوفر تايم</span></div><div class="out"><b>${UI.num(sum("missed"))}</b><span>نسيان بصمة</span></div><div><b>${UI.num(sum("absent"))}</b><span>أيام غياب</span></div></div>
        ${Session.isAdmin ? `<div class="no-print" style="margin-bottom:12px"><button class="btn primary block" id="post">${icon("coins")} إرسال للمرتب (Additional Salary)</button>${posted.length ? `<p class="hint" style="text-align:center;margin:6px 0 0">اتبعت قبل كده ${UI.num(posted.length)} بند للشهر ده</p>` : ""}</div>` : ""}
        ${results.length ? `<div class="table-wrap"><table><thead><tr><th>الموظف</th><th class="n">حضور</th><th class="n">غياب</th><th class="n">بدون مرتب</th><th class="n">تأخير + مبكر</th><th class="n">دقائق الخصم</th><th class="n">خصم التأخير</th><th class="n">نسيان بصمة</th><th class="n">أوفر تايم</th><th class="n">قيمته</th><th class="n">مكافآت</th><th class="n">خصومات</th></tr></thead><tbody>
          ${results.map((r, i) => `<tr data-i="${i}" style="cursor:pointer"><td><b>${esc(r.employee_name)}</b>${r.pending ? ' <span class="tag warn">مستني</span>' : ""}</td><td class="n">${UI.num(r.present)}</td><td class="n ${r.absent ? "neg" : ""}">${UI.num(r.absent)}</td><td class="n">${r.lwp ? UI.num(r.lwp) : "—"}</td><td class="n">${UI.mins(r.lateTotal)}</td><td class="n">${r.lateDeductMin ? `${UI.num(r.excess)} × ${UI.num(r.mult)}` : "—"}</td><td class="n ${r.lateDeduct ? "neg" : ""}">${r.lateDeduct ? UI.money(r.lateDeduct) : "—"}</td><td class="n ${r.missed ? "neg" : ""}">${r.missed ? `${UI.num(r.missed)} (${UI.money(r.missedDeduct)})` : "—"}</td><td class="n">${r.otMin ? UI.mins(r.otMin) : "—"}</td><td class="n ${r.otPay ? "pos" : ""}">${r.otPay ? UI.money(r.otPay) : "—"}</td><td class="n pos">${extra(r, "Earning") ? UI.money(extra(r, "Earning")) : "—"}</td><td class="n neg">${extra(r, "Deduction") ? UI.money(extra(r, "Deduction")) : "—"}</td></tr>`).join("")}
          </tbody></table></div><p class="hint" style="margin:8px 4px">دوس على أي موظف عشان تشوف أيامه. الإجازة بدون مرتب ERPNext بيخصمها لوحده في الـ Payroll.</p>` : '<div class="empty">مفيش موظفين</div>'}`;
      out.querySelectorAll("tr[data-i]").forEach((tr) => tr.onclick = () => details(results[tr.dataset.i]));
      const pb = out.querySelector("#post"); if (pb) pb.onclick = () => postPayroll(results, ctx, run);
    };
    view.querySelector("#ym").onchange = (e) => { st.ym = e.target.value; run(); };
    const em = view.querySelector("#em"); if (em) em.onchange = (e) => { st.emp = e.target.value; run(); };
    const csv = view.querySelector("#csv");
    if (csv) csv.onclick = () => {
      const head = ["الموظف", "الأساسي", "سعر الدقيقة", "حضور", "غياب", "إجازة", "بدون مرتب", "تأخير", "انصراف مبكر", "السماح", "الزيادة", "المعامل", "خصم التأخير", "نسيان بصمة", "خصم النسيان", "أوفر تايم (د)", "قيمة الأوفر"];
      const rows = results.map((r) => [r.employee_name, r.base, Calc.r2(r.minuteRate), r.present, r.absent, r.leave, r.lwp, r.lateMin, r.earlyMin, r.grace, r.excess, r.mult, r.lateDeduct, r.missed, r.missedDeduct, r.otMin, r.otPay]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
      a.download = `تقرير-البصمة-${st.ym}.csv`; a.click();
    };
    await run();
  };

  function details(r) {
    const S = { present: ["حاضر", "ok"], absent: ["غايب", "bad"], leave: ["إجازة", "info"], off: ["إجازة أسبوعية", "mute"], today: ["النهارده", "mute"] };
    UI.sheet({
      title: r.employee_name, wide: true, footer: false,
      body: `<dl class="kv">
        <dt>المرتب الأساسي</dt><dd>${r.base ? UI.money(r.base) : "مفيش Salary Structure Assignment"}</dd>
        <dt>سعر الدقيقة</dt><dd>${UI.money(r.minuteRate)}</dd>
        <dt>التأخير والمبكر</dt><dd>${UI.num(r.lateMin)} + ${UI.num(r.earlyMin)} = ${UI.num(r.lateTotal)} دقيقة</dd>
        <dt>بعد السماح الشهري</dt><dd>(${UI.num(r.lateTotal)} − ${UI.num(r.grace)}) × ${UI.num(r.mult)} = ${UI.num(r.lateDeductMin)} دقيقة ← ${UI.money(r.lateDeduct)}</dd>
        <dt>الأوفر تايم</dt><dd>${UI.mins(r.otMin)} ← ${UI.money(r.otPay)}</dd>
        <dt>نسيان البصمة</dt><dd>${UI.num(r.missed)} مرة ← ${UI.money(r.missedDeduct)}</dd></dl>
        <h2 class="sec">الأيام</h2>
        <div class="group">${r.days.map((d) => { const [t, k] = S[d.status] || [d.status, "mute"]; return `<div class="row-item"><span class="ri-main"><span class="ri-t">${UI.dateAr(d.date, { weekday: "short", day: "numeric", month: "short" })}</span><span class="ri-s">${d.status === "present" ? `${UI.hm(d.in)} ← ${UI.hm(d.out)}${d.late ? `، تأخير ${UI.mins(d.late)}` : ""}${d.early ? `، مبكر ${UI.mins(d.early)}` : ""}${d.ot ? `، أوفر ${UI.mins(d.ot)}` : ""}` : d.leaveType ? esc(d.leaveType) : esc(d.shift || "")}</span></span><span class="ri-end"><span class="tag ${k}">${t}</span>${d.missed ? ' <span class="tag bad">نسيان</span>' : ""}${d.pending ? ' <span class="tag warn">مستني</span>' : ""}</span></div>`; }).join("")}</div>`,
    });
  }

  async function postPayroll(results, ctx, done) {
    const C = CONFIG.COMPONENTS;
    const missing = [C.late, C.missed, C.overtime].filter((c) => !ctx.comps[c]);
    const lines = [];
    results.forEach((r) => {
      const emp = ctx.emps.find((e) => e.name === r.employee);
      const shift = (Data.shiftsOn(emp, ctx.to, ctx.asg, ctx.types)[0] || {}).shift;
      const otComp = (shift && shift.overtime_type && ctx.ots[shift.overtime_type] && ctx.ots[shift.overtime_type].overtime_salary_component) || C.overtime;
      [[C.late, r.lateDeduct], [C.missed, r.missedDeduct], [otComp, r.otPay]].forEach(([comp, amount]) => {
        if (amount > 0) lines.push({ emp, comp, amount, exists: ctx.extras.some((x) => x.employee === emp.name && x.salary_component === comp) });
      });
    });
    const todo = lines.filter((l) => !l.exists);
    const s = UI.sheet({
      title: "إرسال للمرتب",
      body: `${missing.length ? `<div class="note bad">لازم تعمل مكونات المرتب دي الأول في ERPNext (Salary Component): ${missing.map(esc).join("، ")}</div>` : ""}
        <p style="margin-top:0">هيتعمل <b>${UI.num(todo.length)}</b> Additional Salary بتاريخ ${dshort(ctx.to)}، وهيدخلوا مرتب الشهر ده.${lines.length - todo.length ? ` وفيه ${UI.num(lines.length - todo.length)} بند اتبعت قبل كده هيتساب زي ما هو.` : ""}</p>
        ${todo.length ? `<div class="group">${todo.map((l) => `<div class="row-item"><span class="ri-main"><span class="ri-t">${esc(l.emp.employee_name)}</span><span class="ri-s">${esc(l.comp)}</span></span><span class="ri-end ri-big">${UI.money(l.amount)}</span></div>`).join("")}</div>` : '<div class="empty">مفيش حاجة جديدة تتبعت</div>'}`,
      footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="go" ${!todo.length || missing.length ? "disabled" : ""}>إرسال</button>`,
    });
    s.el.querySelector("#go").onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      let ok = 0;
      for (const l of todo) {
        try { await API.insert("Additional Salary", { employee: l.emp.name, company: l.emp.company, salary_component: l.comp, amount: l.amount, payroll_date: ctx.to, overwrite_salary_structure_amount: 1, docstatus: 1 }); ok++; }
        catch (x) { toast(`${l.emp.employee_name}: ${x.message}`, "bad"); }
      }
      toast(`اتبعت ${UI.num(ok)} بند للمرتب`, "ok"); s.close(); done();
    };
  }

  // ================= المزيد =================
  Views.more = async function (view) {
    const row = (href, ic, cls, t, s) => `<a class="row-item" href="${href}"><span class="ri-ic ${cls}">${icon(ic)}</span><span class="ri-main"><span class="ri-t">${t}</span>${s ? `<span class="ri-s">${s}</span>` : ""}</span><span class="chev">${icon("chev")}</span></a>`;
    const AR = { "System Manager": "مدير النظام", "HR Manager": "مدير الموارد البشرية", "HR User": "موارد بشرية", "Leave Approver": "بيوافق على الإجازات", "Shift Approver": "بيوافق على الشيفتات", Employee: "موظف" };
    const roles = Session.roles.filter((r) => AR[r]).map((r) => AR[r]);
    const team = await Data.team().catch(() => []);
    view.innerHTML = `${pageHead("المزيد")}
      <div class="group"><div class="row-item"><span class="avatar">${esc(UI.initials(Session.full_name))}</span><span class="ri-main"><span class="ri-t">${esc(Session.full_name)}</span><span class="ri-s" dir="ltr" style="text-align:end">${esc(Session.user)}</span><span class="ri-s">${esc(roles.join("، ") || "—")}</span></span></div></div>
      <h2 class="sec">الحضور</h2>
      <div class="group">
        ${team.length ? row("#/board", "users", "in", "الحضور والانصراف النهارده", Session.isAdmin ? "" : "فريقك المباشر") : ""}
        ${row("#/report", "report", "late", "تقرير البصمة")}
        ${Session.employee ? row("#/mine", "cal", "", "طلباتي والإجازات") : ""}
        ${row("#/rewards", "gift", "in", team.length ? "المكافآت والخصومات" : "مكافآتي وخصوماتي")}
      </div>
      ${Session.isAdmin ? `<h2 class="sec">الإعدادات</h2><div class="group">
        ${row("#/shifts", "clock", "", "الشيفتات", "المواعيد والسماح والأوفر تايم")}
        ${row("#/assign", "swap", "", "تعيين الشيفتات", "مين شغال في أنهي شيفت وأنهي فرع")}
        ${row("#/locations", "building", "", "الفروع", "مكان كل فرع على الخريطة")}
        ${row("#/employees", "user", "", "الموظفين", "الفروع والشيفت والمدير المباشر")}
        ${row("#/setup", "gear", "brand-ic", "تجهيز ERPNext", "Workflow البصمة وجدول الفروع")}
      </div>` : ""}
      <h2 class="sec">الحساب</h2>
      <div class="group"><button class="row-item" id="out"><span class="ri-ic out">${icon("logout")}</span><span class="ri-main"><span class="ri-t">خروج</span></span></button></div>`;
    view.querySelector("#out").onclick = () => { Session.clear(); Data.clear(); location.hash = ""; App.start(); };
  };

  // ================= الشيفتات (Shift Type) =================
  Views.shifts = async function (view) {
    if (!Session.isAdmin) return deny(view, "الشيفتات");
    Data.clear("shiftTypes");
    const [types, ots] = await Promise.all([Data.shiftTypes(), Data.overtimeTypes()]);
    view.innerHTML = `${pageHead("الشيفتات", "Shift Type", `<button class="ibtn" id="new" aria-label="شيفت جديد">${icon("plus")}</button>`)}
      ${Object.keys(types).length ? `<div class="group">${Object.values(types).map((s) => `<button class="row-item" data-n="${esc(s.name)}"><span class="ri-ic">${icon("clock")}</span><span class="ri-main"><span class="ri-t">${esc(s.name)}</span><span class="ri-s">سماح التأخير ${UI.num(s.late_entry_grace_period || 0)} د، سماح المبكر ${UI.num(s.early_exit_grace_period || 0)} د، ${Number(s.allow_overtime) ? "بأوفر تايم" : "من غير أوفر تايم"}</span></span><span class="ri-end ri-big">${s.start_time.slice(0, 5)}<br>${s.end_time.slice(0, 5)}</span></button>`).join("")}</div>` : '<div class="empty">مفيش شيفتات. دوس + عشان تعمل أول شيفت.</div>'}
      <p class="hint" style="margin:10px 4px">الموظف اللي مش عايز تحسبله أوفر تايم، عيّنه على شيفت متقفل فيه الأوفر تايم.</p>`;
    const edit = (s) => {
      const isNew = !s; s = s || { start_time: "09:00:00", end_time: "17:00:00", late_entry_grace_period: 15, early_exit_grace_period: 10, allow_overtime: 0 };
      const sh = UI.sheet({
        title: isNew ? "شيفت جديد" : s.name,
        body: `${isNew ? `<div class="field"><label for="nm">اسم الشيفت</label><input class="input" id="nm" placeholder="مثلًا: الشيفت الصباحي"></div>` : ""}
          <div class="two"><div class="field"><label for="st">البداية</label><input class="input" id="st" type="time" value="${s.start_time.slice(0, 5)}"></div><div class="field"><label for="en">النهاية</label><input class="input" id="en" type="time" value="${s.end_time.slice(0, 5)}"></div></div>
          <div class="two"><div class="field"><label for="lg">سماح التأخير (دقيقة)</label><input class="input" id="lg" type="number" min="0" value="${esc(s.late_entry_grace_period || 0)}"></div><div class="field"><label for="eg">سماح الانصراف المبكر</label><input class="input" id="eg" type="number" min="0" value="${esc(s.early_exit_grace_period || 0)}"></div></div>
          <span class="hint">بعد السماح البصمة بتروح طلب للمدير.</span>
          <label class="check"><input type="checkbox" id="ao" ${Number(s.allow_overtime) ? "checked" : ""}> يتحسب أوفر تايم في الشيفت ده</label>
          ${Object.keys(ots).length ? `<div class="field"><label for="ot">نوع الأوفر تايم (Overtime Type)</label><select class="input" id="ot"><option value="">—</option>${Object.values(ots).map((o) => opt(o.name, `${o.name} (× ${o.standard_multiplier})`, s.overtime_type)).join("")}</select></div>` : `<span class="hint">مفيش Overtime Type على السيستم، فالمعامل هيبقى ${UI.num(CONFIG.OVERTIME_MULTIPLIER_FALLBACK)} من ملف الإعدادات.</span>`}`,
        footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="sv">حفظ</button>`,
      });
      sh.el.querySelector("#sv").onclick = async (e) => {
        const b = e.currentTarget; b.disabled = true;
        const v = (id) => sh.el.querySelector(id) && sh.el.querySelector(id).value;
        const lg = Number(v("#lg")) || 0, eg = Number(v("#eg")) || 0;
        const doc = { start_time: v("#st") + ":00", end_time: v("#en") + ":00", late_entry_grace_period: lg, early_exit_grace_period: eg, enable_late_entry_marking: lg ? 1 : 0, enable_early_exit_marking: eg ? 1 : 0, allow_overtime: sh.el.querySelector("#ao").checked ? 1 : 0 };
        if (sh.el.querySelector("#ot")) doc.overtime_type = v("#ot") || null;
        try {
          if (isNew) { const nm = v("#nm").trim(); if (!nm) throw new Error("اكتب اسم الشيفت"); await API.insert("Shift Type", { name: nm, ...doc }); }
          else await API.update("Shift Type", s.name, doc);
          Data.clear("shiftTypes"); toast("اتحفظ", "ok"); sh.close(); App.route();
        } catch (x) { toast(x.message, "bad"); b.disabled = false; }
      };
    };
    view.querySelector("#new").onclick = () => edit(null);
    view.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => edit(types[b.dataset.n]));
  };

  // ================= تعيين الشيفتات (Shift Assignment) =================
  Views.assign = async function (view) {
    if (!Session.isAdmin) return deny(view, "تعيين الشيفتات");
    const d = UI.today();
    const [emps, types, locs, asg, hasTable] = await Promise.all([Data.employees(), Data.shiftTypes(), Data.locations(), Data.assignments(d, "9999-12-31"), API.get("Custom Field", "Employee-custom_branches").then(() => true).catch(() => API.isDemo())]);
    // فروع كل موظف من جدول الفروع في ملفه
    const branchMap = {};
    if (hasTable) await Promise.all(emps.map(async (e) => { const f = await API.get("Employee", e.name).catch(() => null); branchMap[e.name] = f && Array.isArray(f.custom_branches) ? f.custom_branches.map((r) => r.shift_location) : []; }));
    const lname = (n) => { const l = locs.find((x) => x.name === n); return l ? l.location_name || l.name : n; };
    let q = "";
    const draw = () => {
      const list = emps.filter((e) => !q || e.employee_name.includes(q));
      view.innerHTML = `${pageHead("تعيين الشيفتات", "Shift Assignment", `<button class="ibtn" id="new" aria-label="تعيين جديد">${icon("plus")}</button>`)}
        <div class="field"><input class="input" id="q" placeholder="ابحث عن موظف" value="${esc(q)}"></div>
        <div class="group">${list.map((e) => {
          const mine = asg.filter((a) => a.employee === e.name);
          return `<div class="req"><div class="row-item"><span class="avatar">${esc(UI.initials(e.employee_name))}</span><span class="ri-main"><span class="ri-t">${esc(e.employee_name)}</span><span class="ri-s">${mine.length ? "" : e.default_shift ? `الافتراضي: ${esc(e.default_shift)}، ` : "مالوش شيفت، "}${(branchMap[e.name] || []).length ? "الفروع: " + branchMap[e.name].map((n) => esc(lname(n))).join("، ") : "من غير فروع (يبصم من أي مكان)"}</span></span><button class="btn ghost sm" data-add="${esc(e.name)}">${icon("plus")} تعيين</button></div>
            ${mine.map((a) => `<div class="row-item" style="padding-inline-start:66px"><span class="ri-main"><span class="ri-t">${esc(a.shift_type)}</span><span class="ri-s">${a.shift_location ? esc(a.shift_location) + "، " : ""}من ${dshort(a.start_date)}${a.end_date ? ` لحد ${dshort(a.end_date)}` : " ومستمر"}</span></span><button class="btn bad sm" data-stop="${esc(a.name)}">إيقاف</button></div>`).join("")}</div>`;
        }).join("")}</div>
        <p class="hint" style="margin:10px 4px">الموظف اللي شغال في فرعين، اعمله تعيينين بنفس الشيفت وكل واحد بفرع. لازم تعلّم على Allow Multiple Shift Assignments for Same Date في HR Settings.</p>`;
      view.querySelector("#new").onclick = () => form([]);
      view.querySelectorAll("[data-add]").forEach((b) => b.onclick = () => form([b.dataset.add]));
      view.querySelectorAll("[data-stop]").forEach((b) => b.onclick = async () => {
        if (!(await UI.confirmBox("إيقاف التعيين", "التعيين ده هيتلغي (Cancel) والموظف هيرجع لشيفته الافتراضي.", "إيقاف", "bad"))) return;
        try { await API.cancel("Shift Assignment", b.dataset.stop); toast("اتوقف", "ok"); App.route(); } catch (x) { toast(x.message, "bad"); }
      });
      const qi = view.querySelector("#q"); qi.oninput = () => { q = qi.value.trim(); clearTimeout(qi.t); qi.t = setTimeout(() => { draw(); const n = view.querySelector("#q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
    };
    const form = (pre) => {
      const s = UI.sheet({
        title: "تعيين شيفت",
        body: `<div class="field"><label for="sh">الشيفت</label><select class="input" id="sh">${Object.keys(types).map((n) => opt(n)).join("")}</select></div>
          <div class="field"><label>الفروع اللي يقدر يبصم منها</label>${hasTable ? `<div class="pick-list" id="lc">${locs.map((l) => `<label><input type="checkbox" value="${esc(l.name)}" ${pre.length === 1 && (branchMap[pre[0]] || []).includes(l.name) ? "checked" : ""}> ${esc(l.location_name || l.name)}</label>`).join("")}</div><span class="hint">اختار فرع أو أكتر. لو مختارتش حاجة، فروعه الحالية هتفضل زي ما هي.</span>` : '<div class="note warn">جدول الفروع لسه مش متجهز. جهّزه من المزيد ← تجهيز ERPNext.</div>'}</div>
          <div class="two"><div class="field"><label for="sd">من</label><input class="input" id="sd" type="date" value="${d}"></div><div class="field"><label for="ed">لحد (اختياري)</label><input class="input" id="ed" type="date"></div></div>
          <div class="field"><label>الموظفين</label><div class="pick-list" id="em">${emps.map((e) => `<label><input type="checkbox" value="${esc(e.name)}" ${pre.includes(e.name) ? "checked" : ""}> ${esc(e.employee_name)}</label>`).join("")}</div></div>`,
        footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="sv">تعيين</button>`,
      });
      s.el.querySelector("#sv").onclick = async (e) => {
        const ids = [...s.el.querySelectorAll("#em input:checked")].map((i) => i.value);
        const branches = [...s.el.querySelectorAll("#lc input:checked")].map((i) => i.value);
        if (!ids.length) return toast("اختار موظف واحد على الأقل", "bad");
        const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span>';
        const v = (id) => s.el.querySelector(id).value;
        let ok = 0;
        for (const id of ids) {
          const emp = emps.find((x) => x.name === id);
          try {
            await API.insertSubmit("Shift Assignment", { employee: id, company: emp.company, shift_type: v("#sh"), shift_location: branches.length === 1 ? branches[0] : null, start_date: v("#sd"), end_date: v("#ed") || null, status: "Active" });
            // الفروع بتتحفظ في جدول الفروع في ملف الموظف (Shift Assignment بياخد فرع واحد بس)
            if (branches.length) await API.update("Employee", id, { custom_branches: branches.map((b) => ({ shift_location: b })) });
            ok++;
          }
          catch (x) { toast(`${emp.employee_name}: ${x.message}`, "bad"); }
        }
        toast(`اتعيّن ${UI.num(ok)} موظف`, "ok"); s.close(); App.route();
      };
    };
    draw();
  };

  // ================= الفروع (Shift Location) =================
  Views.locations = async function (view) {
    if (!Session.isAdmin) return deny(view, "الفروع");
    Data.clear("locations");
    const locs = await Data.locations();
    view.innerHTML = `${pageHead("الفروع", "Shift Location")}
      <div class="form">
        <div class="field"><label for="ln">اسم الفرع</label><input class="input" id="ln"></div>
        <div class="two"><div class="field"><label for="la">Latitude</label><input class="input" id="la" type="number" step="any" dir="ltr"></div><div class="field"><label for="lo">Longitude</label><input class="input" id="lo" type="number" step="any" dir="ltr"></div></div>
        <div class="field"><label for="lr">المسافة المسموحة (متر)</label><input class="input" id="lr" type="number" value="100"></div>
        <div class="btns"><button class="btn ghost" id="here">${icon("pin")} موقعي دلوقتي</button><button class="btn primary" id="add">إضافة الفرع</button></div>
        <p class="hint" style="margin:10px 0 0">افتح الصفحة دي وانت جوه الفرع ودوس "موقعي دلوقتي".</p>
      </div>
      <h2 class="sec">الفروع</h2>
      ${locs.length ? `<div class="group">${locs.map((l) => `<a class="row-item" target="_blank" rel="noopener" href="https://maps.google.com/?q=${l.latitude},${l.longitude}"><span class="ri-ic">${icon("building")}</span><span class="ri-main"><span class="ri-t">${esc(l.location_name || l.name)}</span><span class="ri-s">مسموح ${UI.num(l.checkin_radius || 100)} متر، افتح على الخريطة</span></span><span class="chev">${icon("chev")}</span></a>`).join("")}</div>` : '<div class="empty">مفيش فروع لسه</div>'}`;
    view.querySelector("#here").onclick = () => navigator.geolocation.getCurrentPosition((p) => { view.querySelector("#la").value = p.coords.latitude.toFixed(6); view.querySelector("#lo").value = p.coords.longitude.toFixed(6); }, () => toast("مش قادر أحدد موقعك", "bad"), { enableHighAccuracy: true, timeout: 15000 });
    view.querySelector("#add").onclick = async () => {
      const n = view.querySelector("#ln").value.trim(), la = Number(view.querySelector("#la").value), lo = Number(view.querySelector("#lo").value);
      if (!n || !la || !lo) return toast("اكتب اسم الفرع ومكانه", "bad");
      try { await API.insert("Shift Location", { name: n, location_name: n, latitude: la, longitude: lo, checkin_radius: Number(view.querySelector("#lr").value) || 100 }); Data.clear("locations"); toast("اتضاف", "ok"); App.route(); }
      catch (x) { toast(x.message, "bad"); }
    };
  };

  // ================= الموظفين =================
  Views.employees = async function (view) {
    if (!Session.isAdmin) return deny(view, "الموظفين");
    Data.clear("employees");
    const [emps, types, faceFiles] = await Promise.all([Data.employees(), Data.shiftTypes(), Face.enrollmentFiles()]);
    const faceOf = (n) => faceFiles.filter((f) => f.attached_to_name === n);
    const users = emps.filter((e) => e.user_id);
    view.innerHTML = `${pageHead("الموظفين", `${UI.num(emps.length)} موظف`)}
      <div class="group">${emps.map((e) => `<button class="row-item" data-n="${esc(e.name)}"><span class="avatar">${esc(UI.initials(e.employee_name))}</span><span class="ri-main"><span class="ri-t">${esc(e.employee_name)}</span><span class="ri-s">${esc(e.default_shift || "مالوش شيفت افتراضي")}، ${e.user_id ? "عنده حساب" : "مالوش حساب"}، ${faceOf(e.name).length ? "بصمة الوش متسجلة" : "لسه ما سجّلش بصمة الوش"}</span></span><span class="chev">${icon("chev")}</span></button>`).join("")}</div>`;
    const locs = await Data.locations();
    view.querySelectorAll("[data-n]").forEach((b) => b.onclick = async () => {
      const e = emps.find((x) => x.name === b.dataset.n);
      const full = await API.get("Employee", e.name).catch(() => e);
      const hasTable = Array.isArray(full.custom_branches);
      const mine = new Set(hasTable ? full.custom_branches.map((r) => r.shift_location) : []);
      const s = UI.sheet({
        title: e.employee_name,
        body: `${!e.user_id ? '<div class="note warn">مالوش حساب على ERPNext (User ID)، فمش هيقدر يدخل يبصم.</div>' : ""}<div class="group" style="margin-bottom:14px"><div class="row-item"><span class="ri-ic" id="fimg">${icon("face")}</span><span class="ri-main"><span class="ri-t">بصمة الوش</span><span class="ri-s">${faceOf(e.name).length ? "متسجلة " + UI.ago(faceOf(e.name)[0].creation) : "هيسجّلها أول مرة يبصم"}</span></span>${faceOf(e.name).length ? '<button class="btn bad sm" id="freset" type="button">مسح</button>' : ""}</div></div>
          <div class="field"><label for="ds">الشيفت الافتراضي</label><select class="input" id="ds"><option value="">—</option>${Object.keys(types).map((n) => opt(n, n, e.default_shift)).join("")}</select><span class="hint">بيتستخدم لو مالوش Shift Assignment.</span></div>
          <div class="field"><label for="rt">المدير المباشر</label><select class="input" id="rt"><option value="">—</option>${emps.filter((x) => x.name !== e.name).map((x) => opt(x.name, x.employee_name, e.reports_to)).join("")}</select></div>
          <span class="hint" style="display:block;margin:-6px 0 14px">هو اللي هيوافق على بصماته المتأخرة وإجازاته، ولازم يكون معاه دور HR Manager.</span>
          <div class="field"><label>الفروع اللي يقدر يبصم منها</label>${hasTable ? (locs.length ? `<div class="pick-list" id="br">${locs.map((l) => `<label><input type="checkbox" value="${esc(l.name)}" ${mine.has(l.name) ? "checked" : ""}> ${esc(l.location_name || l.name)}</label>`).join("")}</div><span class="hint">لو مختارتش ولا فرع، هيبصم من أي مكان.</span>` : '<div class="note">مفيش فروع لسه. ضيفها من المزيد ← الفروع.</div>') : '<div class="note warn">جدول الفروع لسه مش متضاف في ملف الموظف. جهزه من المزيد ← تجهيز ERPNext.</div>'}</div>
          <span class="hint">المرتب الأساسي بيتعدّل من Salary Structure Assignment على ERPNext.</span>`,
        footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="sv">حفظ</button>`,
      });
      if (faceOf(e.name).length) Face.enrollmentPhoto(e.name).then((u) => { if (!u) return; const el = s.el.querySelector("#fimg"); el.innerHTML = `<img src="${esc(u)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`; el.style.overflow = "hidden"; el.onclick = () => UI.viewImage(u); }).catch(() => {});
      const fr = s.el.querySelector("#freset");
      if (fr) fr.onclick = async () => {
        if (!(await UI.confirmBox("مسح بصمة الوش", `بصمة وش ${e.employee_name} هتتمسح، وأول مرة يبصم بعد كده هيسجّل بصمة جديدة.`, "مسح", "bad"))) return;
        try { await Face.resetEnrollment(e.name); toast("اتمسحت", "ok"); s.close(); App.route(); } catch (x) { toast(x.message, "bad"); }
      };
      s.el.querySelector("#sv").onclick = async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true;
        const v = (id) => s.el.querySelector(id).value || null;
        const mgr = emps.find((x) => x.name === v("#rt"));
        const patch = { default_shift: v("#ds"), reports_to: v("#rt"), leave_approver: (mgr && mgr.user_id) || null };
        if (hasTable) patch.custom_branches = [...s.el.querySelectorAll("#br input:checked")].map((i) => ({ shift_location: i.value }));
        try { await API.update("Employee", e.name, patch); Data.clear("employees"); toast("اتحفظ", "ok"); s.close(); App.route(); }
        catch (x) { toast(x.message, "bad"); btn.disabled = false; }
      };
    });
  };
  // ================= تجهيز ERPNext (مدير النظام بس) =================
  const WF_NAME = "موافقة البصمة";
  const MGR_COND = 'frappe.session.user == frappe.db.get_value("Employee", frappe.db.get_value("Employee", doc.employee, "reports_to"), "user_id")';
  const V1 = {
    doctypes: ["HR Attendance Policy", "HR Leave Reason", "HR Attendance Request", "HR Reward Deduction"],
    fields: ["Employee-custom_hr_section", "Employee-custom_monthly_salary", "Employee-custom_monthly_grace_minutes", "Employee-custom_no_overtime", "Employee-custom_can_reward", "Employee-custom_hr_col", "Leave Application-custom_reason", "Leave Application-custom_deduct_days"],
  };
  const exists = (dt, name) => API.get(dt, name).then(() => true).catch((e) => (e.status === 404 ? false : Promise.reject(e)));

  async function setupWorkflow(log) {
    for (const [name, style] of [["Pending", "Warning"], ["Approved", "Success"], ["Rejected", "Danger"]]) {
      if (!(await exists("Workflow State", name))) { await API.insert("Workflow State", { workflow_state_name: name, style }); log(`اتعملت حالة ${name}`); }
    }
    for (const name of ["Approve", "Reject", "Review"]) {
      if (!(await exists("Workflow Action Master", name))) { await API.insert("Workflow Action Master", { workflow_action_name: name }); log(`اتعمل إجراء ${name}`); }
    }
    const wf = await API.list("Workflow", { fields: ["name", "is_active"], filters: [["document_type", "=", "Employee Checkin"]] });
    if (wf.length) { log(`الـ Workflow موجود بالفعل: ${wf[0].name}${Number(wf[0].is_active) ? "" : " (بس مش مفعّل، فعّله من ERPNext)"}`); return; }
    const t = (state, action, next, role, condition) => ({ state, action, next_state: next, allowed: role, allow_self_approval: 1, ...(condition ? { condition } : {}) });
    await API.insert("Workflow", {
      workflow_name: WF_NAME, document_type: "Employee Checkin", is_active: 1, send_email_alert: 0, workflow_state_field: "workflow_state",
      // أول حالة Approved: البصمة العادية بتتسجل مقبولة على طول
      states: [
        { state: "Approved", doc_status: "0", allow_edit: "System Manager" },
        { state: "Pending", doc_status: "0", allow_edit: "Employee" },
        { state: "Rejected", doc_status: "0", allow_edit: "System Manager" },
      ],
      transitions: [
        t("Approved", "Review", "Pending", "Employee"),                 // الموظف بيبعت البصمة المتأخرة للموافقة
        t("Pending", "Approve", "Approved", "HR Manager", MGR_COND),     // المدير المباشر بس
        t("Pending", "Reject", "Rejected", "HR Manager", MGR_COND),
        t("Pending", "Approve", "Approved", "System Manager"),           // مدير النظام يقدر يوافق على أي حد
        t("Pending", "Reject", "Rejected", "System Manager"),
      ],
    });
    Data.clear("wf");
    log(`اتعمل Workflow "${WF_NAME}" على Employee Checkin`);
  }

  async function setupBranches(log) {
    if (!(await exists("DocType", "Employee Branch"))) {
      await API.insert("DocType", {
        name: "Employee Branch", module: "Custom", custom: 1, istable: 1, editable_grid: 1,
        fields: [{ fieldname: "shift_location", label: "الفرع", fieldtype: "Link", options: "Shift Location", reqd: 1, in_list_view: 1 }],
      });
      log("اتعمل جدول Employee Branch");
    } else log("جدول Employee Branch موجود بالفعل");
    if (!(await exists("Custom Field", "Employee-custom_branches"))) {
      await API.insert("Custom Field", { dt: "Employee", fieldname: "custom_branches", label: "الفروع", fieldtype: "Table MultiSelect", options: "Employee Branch", insert_after: "default_shift", description: "الفروع اللي الموظف يقدر يبصم منها" });
      log("اتضافت خانة الفروع في ملف الموظف");
    } else log("خانة الفروع موجودة بالفعل في ملف الموظف");
    // نقل الخانتين القديمتين للجدول، وبعدين مسحهم
    const old = [];
    for (const f of ["custom_location_1", "custom_location_2"]) if (await exists("Custom Field", `Employee-${f}`)) old.push(f);
    if (!old.length) return;
    const emps = await API.list("Employee", { fields: ["name", ...old] });
    let moved = 0;
    for (const e of emps) {
      const vals = old.map((f) => e[f]).filter(Boolean);
      if (!vals.length) continue;
      const full = await API.get("Employee", e.name);
      const cur = (full.custom_branches || []).map((r) => r.shift_location);
      const merged = [...new Set([...cur, ...vals])];
      await API.update("Employee", e.name, { custom_branches: merged.map((x) => ({ shift_location: x })) });
      moved++;
    }
    log(`اتنقلت فروع ${UI.num(moved)} موظف للجدول`);
    for (const f of old) { await API.remove("Custom Field", `Employee-${f}`); log(`اتمسحت الخانة القديمة ${f}`); }
  }

  async function findV1() {
    const out = [];
    for (const d of V1.doctypes) if (await exists("DocType", d).catch(() => false)) out.push(["DocType", d]);
    for (const f of V1.fields) if (await exists("Custom Field", f).catch(() => false)) out.push(["Custom Field", f]);
    return out;
  }

  // ===== باقي خطوات التجهيز =====
  const COMP_TYPES = () => { const C = CONFIG.COMPONENTS; return [[C.late, "Deduction", "LATE"], [C.missed, "Deduction", "MISS"], [C.overtime, "Earning", "OTM"], [C.reward, "Earning", "RWD"], [C.deduction, "Deduction", "ADMD"]]; };
  async function setupComponents(log, missedAmount) {
    for (const [name, type, abbr] of COMP_TYPES()) {
      if (await exists("Salary Component", name)) {
        if (name === CONFIG.COMPONENTS.missed && missedAmount > 0) {
          const c = await API.get("Salary Component", name);
          if (!Number(c.amount)) { await API.update("Salary Component", name, { amount: missedAmount }); log(`اتحط مبلغ خصم نسيان البصمة ${missedAmount}`); }
        }
        continue;
      }
      const doc = { salary_component: name, type, depends_on_payment_days: 0, description: "بيتعمل من واجهة الحضور" };
      if (name === CONFIG.COMPONENTS.missed) doc.amount = missedAmount || 0;
      let ok = false;
      for (const ab of [abbr, abbr + "1", abbr + "2", abbr + Math.floor(Math.random() * 900 + 100)]) {
        try { await API.insert("Salary Component", { ...doc, salary_component_abbr: ab }); ok = true; break; }
        catch (e) { if (!/abbr|Abbreviation|duplicate|exists/i.test(e.message)) throw e; }
      }
      if (ok) log(`اتعمل مكون المرتب "${name}" (${type === "Earning" ? "إضافة" : "خصم"})`);
    }
    Data.clear("components");
  }
  async function setupHRSettings(log) {
    const h = await API.get("HR Settings", "HR Settings");
    if (Number(h.allow_multiple_shift_assignments)) return;
    await API.update("HR Settings", "HR Settings", { allow_multiple_shift_assignments: 1 });
    log("اتفعّل Allow Multiple Shift Assignments for Same Date في HR Settings");
  }
  async function setupLWP(log) {
    const t = await API.list("Leave Type", { fields: ["name"], filters: [["is_lwp", "=", 1]], limit: 1 });
    if (t.length) return;
    await API.insert("Leave Type", { leave_type_name: "إجازة بدون مرتب", is_lwp: 1, allow_negative: 1, include_holiday: 0 });
    Data.clear("leaveTypes");
    log('اتعمل نوع إجازة "إجازة بدون مرتب"');
  }

  // ===== موظفين للتجربة =====
  // كلهم إيميلاتهم على @hudoori.test عشان نعرفهم ونمسحهم بسهولة
  const TEST_DOMAIN = "hudoori.test", TEST_PASS = "Hudoori#2026Test";
  const TEST_PEOPLE = [
    ["أحمد", "مدير تجريبي", "Male", true, 12000],
    ["سارة", "تجريبية", "Female", false, 7000],
    ["محمد", "تجريبي", "Male", false, 6500],
    ["نورا", "تجريبية", "Female", false, 6000],
    ["كريم", "تجريبي", "Male", false, 5500],
  ];
  const testEmail = (i) => `test${i + 1}@${TEST_DOMAIN}`;
  const firstOfMonth = () => UI.today().slice(0, 8) + "01";

  async function createTestEmployees(log) {
    const company = (await API.list("Company", { fields: ["name"], limit: 1 }))[0];
    if (!company) throw new Error("مفيش Company على ERPNext. اعمل شركة الأول.");
    let shift = (await API.list("Shift Type", { fields: ["name"], order_by: "creation asc", limit: 1 }))[0];
    if (!shift) {
      shift = await API.insert("Shift Type", { name: "شيفت تجريبي", start_time: "09:00:00", end_time: "17:00:00", late_entry_grace_period: 15, early_exit_grace_period: 10, enable_late_entry_marking: 1, enable_early_exit_marking: 1 });
      log('اتعمل "شيفت تجريبي" من 9 لـ 5');
      Data.clear("shiftTypes");
    }
    const locs = (await API.list("Shift Location", { fields: ["name"] }).catch(() => [])).map((l) => l.name);
    const hasBranches = await exists("Custom Field", "Employee-custom_branches").catch(() => false);
    const ss = (await API.list("Salary Structure", { fields: ["name"], filters: [["docstatus", "=", 1], ["company", "=", company.name], ["is_active", "=", "Yes"]], limit: 1 }).catch(() => []))[0];
    if (!ss) log("مفيش Salary Structure معتمد للشركة، فالموظفين التجريبيين مش هيبقى ليهم مرتب أساسي (الخصومات هتطلع صفر).", true);
    let manager = null, created = 0;
    for (let i = 0; i < TEST_PEOPLE.length; i++) {
      const [first, last, gender, isMgr, base] = TEST_PEOPLE[i];
      const email = testEmail(i);
      if (!(await exists("User", email))) {
        await API.insert("User", { email, first_name: first, last_name: last, enabled: 1, user_type: "System User", send_welcome_email: 0, new_password: TEST_PASS, roles: [{ role: "Employee" }, ...(isMgr ? [{ role: "HR Manager" }] : [])] });
        log(`اتعمل حساب ${email}${isMgr ? " (HR Manager)" : ""}`);
      }
      let emp = (await API.list("Employee", { fields: ["name", "employee_name"], filters: [["user_id", "=", email]], limit: 1 }))[0];
      if (!emp) {
        const doc = {
          first_name: first, last_name: last, gender, date_of_birth: "1995-01-01", date_of_joining: `${new Date().getFullYear()}-01-01`,
          company: company.name, status: "Active", user_id: email, default_shift: shift.name,
          reports_to: isMgr ? null : manager && manager.name, leave_approver: isMgr ? null : testEmail(0),
        };
        if (hasBranches && locs.length) doc.custom_branches = locs.map((l) => ({ shift_location: l }));
        emp = await API.insert("Employee", doc);
        created++;
        log(`اتعمل الموظف ${emp.employee_name || first + " " + last}${isMgr ? "، وهو المدير المباشر للباقيين" : ""}`);
      }
      if (isMgr) manager = emp;
      if (ss) {
        const has = await API.list("Salary Structure Assignment", { fields: ["name"], filters: [["employee", "=", emp.name], ["docstatus", "=", 1]], limit: 1 }).catch(() => []);
        if (!has.length) {
          try { await API.insertSubmit("Salary Structure Assignment", { employee: emp.name, salary_structure: ss.name, company: company.name, from_date: firstOfMonth(), base }); log(`  مرتب أساسي ${UI.num(base)}`); }
          catch (e) { log(`  مرتب ${emp.name}: ${e.message}`, true); }
        }
      }
    }
    Data.clear();
    log(created ? `اتعمل ${UI.num(created)} موظف تجريبي` : "الموظفين التجريبيين موجودين بالفعل");
  }

  async function deleteTestEmployees(log) {
    const emps = await API.list("Employee", { fields: ["name", "employee_name", "user_id"], filters: [["user_id", "like", `%@${TEST_DOMAIN}`]] });
    const users = TEST_PEOPLE.map((_, i) => testEmail(i));
    const ids = emps.map((e) => e.name);
    const wipe = async (dt, filters, submitted) => {
      const rows = await API.list(dt, { fields: ["name", "docstatus"], filters }).catch(() => []);
      for (const r of rows) {
        try { if (submitted && Number(r.docstatus) === 1) await API.cancel(dt, r.name); await API.remove(dt, r.name); }
        catch (e) { log(`${dt} ${r.name}: ${e.message}`, true); }
      }
      return rows.length;
    };
    if (ids.length) {
      for (const [dt, sub] of [["Employee Checkin", false], ["Attendance", true], ["Shift Assignment", true], ["Leave Application", true], ["Additional Salary", true], ["Salary Structure Assignment", true], ["Salary Slip", true]]) {
        const n = await wipe(dt, [["employee", "in", ids]], sub);
        if (n) log(`اتمسح ${UI.num(n)} ${dt}`);
      }
      await wipe("Comment", [["reference_doctype", "=", "Employee"], ["reference_name", "in", ids]]);
    }
    await wipe("ToDo", [["allocated_to", "in", users]]);
    await wipe("Notification Log", [["for_user", "in", users]]);
    for (const e of emps) { try { await API.remove("Employee", e.name); log(`اتمسح الموظف ${e.employee_name}`); } catch (x) { log(`${e.employee_name}: ${x.message}`, true); } }
    for (const u of users) { if (await exists("User", u).catch(() => false)) { try { await API.remove("User", u); log(`اتمسح الحساب ${u}`); } catch (x) { log(`${u}: ${x.message}`, true); } } }
    Data.clear();
  }

  // حالة كل حاجة: [مفتاح، تمام؟، العنوان، الشرح، تتصلح لوحدها؟]
  async function checks() {
    const C = CONFIG.COMPONENTS;
    const [wf, br, comps, hr, lwp, locs, emps, ssa, v1] = await Promise.all([
      Data.workflowReady(),
      exists("Custom Field", "Employee-custom_branches").catch(() => false),
      Promise.all(COMP_TYPES().map(([n]) => exists("Salary Component", n).catch(() => false))),
      API.get("HR Settings", "HR Settings").then((h) => !!Number(h.allow_multiple_shift_assignments)).catch(() => false),
      API.list("Leave Type", { fields: ["name"], filters: [["is_lwp", "=", 1]], limit: 1 }).then((r) => r.length > 0).catch(() => false),
      API.list("Shift Location", { fields: ["name"] }).catch(() => []),
      API.list("Employee", { fields: ["name", "employee_name", "user_id", "reports_to", "default_shift"], filters: [["status", "=", "Active"]] }).catch(() => []),
      API.list("Salary Structure Assignment", { fields: ["employee"], filters: [["docstatus", "=", 1]] }).catch(() => []),
      findV1(),
    ]);
    const missedComp = await API.get("Salary Component", C.missed).catch(() => null);
    const managers = [...new Set(emps.map((e) => e.reports_to).filter(Boolean))].map((n) => emps.find((e) => e.name === n)).filter(Boolean);
    const mgrUsers = await Promise.all(managers.map((m) => (m.user_id ? API.get("User", m.user_id).then((u) => ({ m, roles: (u.roles || []).map((r) => r.role) })).catch(() => ({ m, roles: [] })) : { m, roles: [] })));
    const noRole = mgrUsers.filter((x) => !x.roles.includes("HR Manager") && !x.roles.includes("System Manager")).map((x) => x.m.employee_name);
    const ssaSet = new Set(ssa.map((x) => x.employee));
    const list = (arr) => arr.slice(0, 6).map(esc).join("، ") + (arr.length > 6 ? ` و${UI.num(arr.length - 6)} كمان` : "");
    const noUser = emps.filter((e) => !e.user_id).map((e) => e.employee_name);
    const noSal = emps.filter((e) => !ssaSet.has(e.name)).map((e) => e.employee_name);
    const noShift = emps.filter((e) => !e.default_shift).map((e) => e.employee_name);
    const missingComps = COMP_TYPES().filter((_, i) => !comps[i]).map(([n]) => n);
    return {
      v1,
      items: [
        ["wf", wf, "Workflow البصمة", wf ? "البصمة المتأخرة بتقف عند المدير المباشر." : "هيتعمل Workflow على Employee Checkin.", true],
        ["br", br, "جدول الفروع في ملف الموظف", br ? "تقدر تحدد أكتر من فرع لكل موظف." : "هيتعمل، والفروع القديمة هتتنقل ليه.", true],
        ["comp", !missingComps.length && !!(missedComp && Number(missedComp.amount)), "مكونات المرتب", missingComps.length ? `هيتعمل: ${list(missingComps)}` : !(missedComp && Number(missedComp.amount)) ? "مبلغ خصم نسيان البصمة لسه صفر." : "موجودين.", true],
        ["hr", hr, "HR Settings", hr ? "Allow Multiple Shift Assignments متفعّل." : "هيتفعّل Allow Multiple Shift Assignments عشان البصمة في شيفت تاني.", true],
        ["lwp", lwp, "إجازة بدون مرتب", lwp ? "فيه نوع إجازة بيتخصم من المرتب." : 'هيتعمل نوع "إجازة بدون مرتب".', true],
        ["loc", locs.length > 0, "الفروع", locs.length ? `${UI.num(locs.length)} فرع.` : "مفيش فروع. ضيفها من المزيد ← الفروع وانت واقف في كل فرع.", false],
        ["usr", !noUser.length, "حسابات الموظفين", noUser.length ? `مالهمش User ID ومش هيقدروا يدخلوا: ${list(noUser)}` : "كل الموظفين ليهم حسابات.", false],
        ["mgr", !noRole.length, "المديرين المباشرين", noRole.length ? `محتاجين دور HR Manager عشان يوافقوا على فريقهم: ${list(noRole)}` : managers.length ? "كلهم معاهم HR Manager." : "مفيش حد متحدد له مدير مباشر (Reports To).", false],
        ["sft", !noShift.length, "الشيفت الافتراضي", noShift.length ? `مالهمش شيفت افتراضي: ${list(noShift)}` : "كل الموظفين ليهم شيفت.", false],
        ["sal", !noSal.length, "المرتب الأساسي", noSal.length ? `مالهمش Salary Structure Assignment، فالخصومات هتطلع صفر: ${list(noSal)}` : "كل الموظفين ليهم مرتب.", false],
      ],
    };
  }

  Views.setup = async function (view) {
    if (!Session.isAdmin) return deny(view, "تجهيز ERPNext");
    if (API.isDemo()) { view.innerHTML = `${pageHead("تجهيز ERPNext")}<div class="note">انت في الوضع التجريبي، والبيانات التجريبية متجهزة بالفعل. اقفل الوضع التجريبي من شاشة الدخول عشان تجهّز ERPNext الحقيقي.</div><button class="btn ghost block" id="rs">${icon("trash")} رجّع البيانات التجريبية من الأول</button>`; view.querySelector("#rs").onclick = async () => { if (await UI.confirmBox("إعادة البيانات", "كل التعديلات التجريبية هتتمسح.", "إعادة", "bad")) { MockAPI.reset(); Data.clear(); toast("رجعت", "ok"); } }; return; }
    Data.clear("wf");
    const [{ items, v1 }, testCount] = await Promise.all([checks(), API.list("Employee", { fields: ["name"], filters: [["user_id", "like", `%@${TEST_DOMAIN}`]] }).then((r) => r.length).catch(() => 0)]);
    const auto = items.filter((x) => x[4]), manual = items.filter((x) => !x[4]);
    const todo = auto.filter((x) => !x[1]).length;
    const row = ([, ok, t, d]) => `<div class="row-item"><span class="ri-ic ${ok ? "in" : "late"}">${icon(ok ? "check" : "alert")}</span><span class="ri-main"><span class="ri-t">${t}</span><span class="ri-s">${d}</span></span></div>`;
    view.innerHTML = `${pageHead("تجهيز ERPNext", todo ? `فاضل ${UI.num(todo)} حاجة تتعمل` : "السيستم متجهز")}
      <div class="form" style="margin-bottom:12px">
        <div class="field"><label for="ma">مبلغ خصم نسيان البصمة (كل مرة)</label><input class="input" id="ma" type="number" min="0" value="50" inputmode="decimal"></div>
        <button class="btn primary block lg" id="all">${icon("check")} ${todo ? "جهّز كل حاجة" : "اتأكد تاني"}</button>
        <p class="hint" style="margin:8px 0 0">بيعمل الحاجات الناقصة بس، وتقدر تدوسه أكتر من مرة من غير مشاكل.</p>
      </div>
      <div class="log" id="log" hidden></div>
      <h2 class="sec">بيتعمل لوحده</h2>
      <div class="group">${auto.map(row).join("")}</div>
      <h2 class="sec">محتاج تعمله بنفسك على ERPNext</h2>
      <div class="group">${manual.map(row).join("")}</div>
      <h2 class="sec">موظفين للتجربة</h2>
      <div class="group"><div class="req"><div class="row-item"><span class="ri-ic">${icon("users")}</span><span class="ri-main"><span class="ri-t">5 موظفين تجريبيين</span><span class="ri-s">${testCount ? `موجودين ${UI.num(testCount)}` : "مدير (HR Manager) و4 موظفين مديرهم المباشر هو، بشيفت وفروع ومرتب أساسي"}</span></span></div>
        <div class="item-actions"><button class="btn primary sm" id="tmk">${testCount ? "كمّل الناقص" : "اعملهم"}</button>${testCount ? '<button class="btn bad sm" id="tdel">امسحهم</button>' : ""}</div></div></div>
      ${testCount ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>الإيميل</th><th>الدور</th></tr></thead><tbody>${TEST_PEOPLE.map((p, i) => `<tr><td dir="ltr" style="text-align:start">${testEmail(i)}</td><td>${p[3] ? "مدير مباشر (HR Manager)" : "موظف"}</td></tr>`).join("")}</tbody></table></div><p class="hint" style="margin:6px 4px">الباسورد لكلهم: <b dir="ltr">${TEST_PASS}</b></p>` : ""}
      ${v1.length ? `<h2 class="sec">حاجات من النسخة الأولى</h2><div class="group"><div class="req"><div class="row-item"><span class="ri-ic late">${icon("trash")}</span><span class="ri-main"><span class="ri-t">مش مستخدمة دلوقتي</span><span class="ri-s">${v1.map((x) => esc(x[1])).join("، ")}</span></span></div><div class="item-actions"><button class="btn bad sm" id="v1">مسحهم نهائي</button></div></div></div>` : ""}`;
    const logEl = view.querySelector("#log");
    const log = (m, bad) => { logEl.hidden = false; const d = document.createElement("div"); d.textContent = m; if (bad) d.style.color = "var(--out)"; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };
    // بعد ما أي عملية تخلص: السجل بيفضل ظاهر، وزرار يعرض الحالة الجديدة
    const doneBtn = () => { const b = document.createElement("button"); b.className = "btn ghost block"; b.style.marginTop = "10px"; b.textContent = "اعرض الحالة الجديدة"; b.onclick = () => App.route(); logEl.after(b); logEl.scrollIntoView({ behavior: "smooth", block: "center" }); };
    view.querySelector("#all").onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span> بيجهّز...';
      logEl.innerHTML = "";
      const amount = Number(view.querySelector("#ma").value) || 0;
      const steps = [
        ["Workflow البصمة", () => setupWorkflow(log)],
        ["جدول الفروع", () => setupBranches(log)],
        ["مكونات المرتب", () => setupComponents(log, amount)],
        ["HR Settings", () => setupHRSettings(log)],
        ["إجازة بدون مرتب", () => setupLWP(log)],
      ];
      let failed = 0;
      for (const [name, fn] of steps) {
        try { await fn(); } catch (x) { failed++; log(`${name}: ${x.message}`, true); }
      }
      log(failed ? `خلص، بس ${UI.num(failed)} خطوة ما نفعتش (مكتوبة بالأحمر فوق).` : "خلص ✓ كل حاجة متجهزة.", !!failed);
      toast(failed ? "فيه خطوات ما نفعتش" : "اتجهز", failed ? "bad" : "ok");
      Data.clear();
      b.disabled = false; b.textContent = "اعرض الحالة الجديدة"; b.onclick = () => App.route();
    };
    const tmk = view.querySelector("#tmk");
    tmk.onclick = async () => {
      tmk.disabled = true; tmk.innerHTML = '<span class="spin"></span>'; logEl.innerHTML = "";
      try { await createTestEmployees(log); toast("الموظفين التجريبيين جاهزين", "ok"); } catch (x) { log(x.message, true); }
      doneBtn();
    };
    const tdel = view.querySelector("#tdel");
    if (tdel) tdel.onclick = async () => {
      if (!(await UI.confirmBox("مسح الموظفين التجريبيين", `الموظفين اللي إيميلاتهم @${TEST_DOMAIN} وكل بصماتهم وطلباتهم ومرتباتهم هيتمسحوا.`, "مسح", "bad"))) return;
      tdel.disabled = true; logEl.innerHTML = "";
      try { await deleteTestEmployees(log); toast("اتمسحوا", "ok"); } catch (x) { log(x.message, true); }
      doneBtn();
    };
    const v = view.querySelector("#v1");
    if (v) v.onclick = async () => {
      if (!(await UI.confirmBox("مسح حاجات النسخة الأولى", "المستندات دي والبيانات اللي فيها هتتمسح نهائي من ERPNext. لو فيه بيانات محتاجها، انقلها الأول.", "مسح نهائي", "bad"))) return;
      v.disabled = true;
      for (const [dt, n] of v1) { try { await API.remove(dt, n); log(`اتمسح ${n}`); } catch (e) { log(`${n}: ${e.message}`, true); } }
      doneBtn();
    };
  };
})();
