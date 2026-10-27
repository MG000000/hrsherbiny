// الشاشات: تقرير البصمة، الإعدادات
(function () {
  const { esc, icon, toast } = UI;
  const S = SCHEMA;
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(t ?? v)}</option>`;
  const pad = (n) => String(n).padStart(2, "0");

  // ================= تقرير البصمة =================
  Views.report = async function (view) {
    const isMgr = await Data.isManager();
    const team = isMgr ? await Data.team() : [];
    const me = Session.employee;
    const now = new Date();
    const st = { ym: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`, emp: isMgr ? "" : (me ? me.name : "") };
    if (!isMgr && !me) { view.innerHTML = `${pageHead("تقرير البصمة")}<div class="empty">حسابك مش مربوط بموظف.</div>`; return; }

    view.innerHTML = `${pageHead("تقرير البصمة", "", `<div class="row no-print"><button class="btn ghost sm" id="csv">${icon("download")} Excel</button><button class="btn ghost sm" onclick="print()">${icon("print")} طباعة</button></div>`)}
      <div class="toolbar no-print">
        <input class="input" type="month" id="ym" value="${st.ym}" style="max-width:200px">
        ${isMgr ? `<select class="input" id="emp" style="max-width:260px"><option value="">كل الموظفين</option>${team.map((e) => opt(e.name, e.employee_name)).join("")}</select>` : ""}
      </div>
      <div id="out">${loadingHTML}</div>`;

    let results = [];
    const run = async () => {
      const out = view.querySelector("#out"); out.innerHTML = loadingHTML;
      const [y, m] = st.ym.split("-").map(Number);
      const from = `${st.ym}-01`, to = `${st.ym}-${pad(new Date(y, m, 0).getDate())}`;
      const emps = st.emp ? [isMgr ? team.find((e) => e.name === st.emp) : ((await Data.employee(st.emp)) || me)] : team;
      const empF = st.emp ? [["employee", "=", st.emp]] : [];
      const [policy, shifts, checkins, leaves, rewards] = await Promise.all([
        Data.policy(), Data.shifts(),
        API.list("Employee Checkin", { fields: ["employee", "log_type", "time", "shift"], filters: [["time", ">=", from + " 00:00:00"], ["time", "<=", to + " 23:59:59"], ...empF], order_by: "time asc" }),
        API.list("Leave Application", { fields: ["employee", "from_date", "to_date", "status", "custom_deduct_days", "leave_type"], filters: [["status", "=", "Approved"], ["from_date", "<=", to], ["to_date", ">=", from], ...empF] }).catch(() => []),
        API.list(S.REWARD, { fields: ["employee", "entry_type", "amount", "date"], filters: [["date", ">=", from], ["date", "<=", to], ...empF] }).catch(() => []),
      ]);
      results = emps.filter(Boolean).map((emp) => Calc.monthly({ emp, policy, shifts, checkins, leaves, rewards, year: y, month: m, today: new Date() }));
      const sum = (k) => results.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      const money = (v, cls) => `<td class="num ${v ? cls : ""}">${v ? UI.money(v) : "—"}</td>`;
      out.innerHTML = `
        <div class="stats">
          <div class="stat warn"><div class="k">إجمالي خصم التأخير</div><div class="v">${UI.money(sum("lateDeduct"))}</div></div>
          <div class="stat ok"><div class="k">إجمالي الأوفر تايم</div><div class="v">${UI.money(sum("otPay"))}</div></div>
          <div class="stat bad"><div class="k">نسيان بصمة</div><div class="v">${UI.num(sum("missed"))}</div></div>
          <div class="stat info"><div class="k">أيام غياب</div><div class="v">${UI.num(sum("absent"))}</div></div>
        </div>
        ${results.length ? `<div class="table-wrap"><table>
          <thead><tr><th>الموظف</th><th class="num">حضور</th><th class="num">غياب</th><th class="num">إجازة</th><th class="num">تأخير + مبكر</th><th class="num">السماح</th><th class="num">دقائق الخصم</th><th class="num">خصم التأخير</th><th class="num">نسيان بصمة</th><th class="num">أوفر تايم</th><th class="num">قيمة الأوفر</th><th class="num">خصم إجازات</th><th class="num">مكافآت</th><th class="num">خصومات</th><th class="num">الصافي</th></tr></thead>
          <tbody>${results.map((r, i) => `<tr class="click" data-i="${i}">
            <td><strong>${esc(r.employee_name)}</strong></td>
            <td class="num">${UI.num(r.present)}</td><td class="num ${r.absent ? "neg" : ""}">${UI.num(r.absent)}</td><td class="num">${UI.num(r.leaveDays)}</td>
            <td class="num">${UI.mins(r.lateTotal)}</td><td class="num">${UI.mins(r.grace)}</td>
            <td class="num">${r.lateDeductMin ? `${UI.num(r.excess)} × ${UI.num(r.lateMultiplier)} = ${UI.num(r.lateDeductMin)}` : "—"}</td>
            ${money(r.lateDeduct, "neg")}
            <td class="num">${r.missed ? `<span class="neg">${UI.num(r.missed)} (${UI.money(r.missedDeduct)})</span>` : "—"}</td>
            <td class="num">${r.noOvertime ? '<span class="tag mute">لا يحسب</span>' : r.otMin ? UI.mins(r.otMin) : "—"}</td>
            ${money(r.otPay, "pos")}${money(r.leaveDeduct, "neg")}${money(r.rewards, "pos")}${money(r.deductionsManual, "neg")}
            <td class="num ${r.additions - r.deductions >= 0 ? "pos" : "neg"}">${UI.money(r.additions - r.deductions)}</td></tr>`).join("")}
          </tbody></table></div><p class="hint no-print" style="color:var(--muted);font-size:13px">دوس على أي موظف عشان تشوف التفاصيل يوم بيوم. الصافي = الإضافات − الخصومات (من غير المرتب الأساسي).</p>` : '<div class="empty">مفيش موظفين</div>'}`;
      out.querySelectorAll("tr.click").forEach((tr) => tr.onclick = () => details(results[tr.dataset.i], policy));
    };

    view.querySelector("#ym").onchange = (e) => { st.ym = e.target.value; run(); };
    const es = view.querySelector("#emp"); if (es) es.onchange = (e) => { st.emp = e.target.value; run(); };
    view.querySelector("#csv").onclick = () => {
      const head = ["الموظف", "الراتب", "سعر الدقيقة", "حضور", "غياب", "إجازة", "تأخير", "انصراف مبكر", "السماح", "الزيادة", "المعامل", "دقائق الخصم", "خصم التأخير", "نسيان بصمة", "خصم النسيان", "أوفر تايم (د)", "قيمة الأوفر", "أيام خصم الإجازة", "خصم الإجازات", "مكافآت", "خصومات", "إجمالي الإضافات", "إجمالي الخصومات", "الصافي بعد المرتب"];
      const rows = results.map((r) => [r.employee_name, r.salary, Calc.r2(r.minuteRate), r.present, r.absent, r.leaveDays, r.lateMin, r.earlyMin, r.grace, r.excess, r.lateMultiplier, r.lateDeductMin, r.lateDeduct, r.missed, r.missedDeduct, r.otMin, r.otPay, r.leaveDeductDays, r.leaveDeduct, r.rewards, r.deductionsManual, r.additions, r.deductions, r.net]);
      const csv = "﻿" + [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `تقرير-البصمة-${st.ym}.csv`; a.click();
    };
    await run();
  };

  function details(r, policy) {
    const st = { present: ["حاضر", "ok"], absent: ["غايب", "bad"], leave: ["إجازة", "info"], off: ["إجازة أسبوعية", "mute"], pending: ["النهارده", "mute"] };
    UI.modal({
      title: `${r.employee_name} — التفاصيل`, wide: true, footer: false,
      body: `<div class="grid grid-2" style="margin-bottom:14px">
        <div class="card"><h3>طريقة الحساب</h3><div class="kv">
          <span class="k">الراتب</span><span class="v">${UI.money(r.salary)}</span>
          <span class="k">سعر الدقيقة</span><span class="v">${UI.money(r.minuteRate)} (الراتب ÷ ${UI.num(policy.working_days_per_month)} يوم ÷ ${UI.num(r.shiftMinutes)} دقيقة)</span>
          <span class="k">التأخير والمبكر</span><span class="v">${UI.num(r.lateMin)} + ${UI.num(r.earlyMin)} = ${UI.num(r.lateTotal)} دقيقة</span>
          <span class="k">بعد السماح</span><span class="v">${UI.num(r.lateTotal)} − ${UI.num(r.grace)} = ${UI.num(r.excess)} × ${UI.num(r.lateMultiplier)} = ${UI.num(r.lateDeductMin)} دقيقة ← ${UI.money(r.lateDeduct)}</span>
          <span class="k">الأوفر تايم</span><span class="v">${r.noOvertime ? "لا يحسب لهذا الموظف" : `${UI.num(r.otMin)} × ${UI.num(r.otMultiplier)} × ${UI.money(r.minuteRate)} = ${UI.money(r.otPay)}`}</span>
          <span class="k">نسيان البصمة</span><span class="v">${UI.num(r.missed)} مرة ← ${UI.money(r.missedDeduct)}</span>
          <span class="k">خصم الإجازات</span><span class="v">${UI.num(r.leaveDeductDays)} يوم × ${UI.money(r.dayRate)} = ${UI.money(r.leaveDeduct)}</span>
        </div></div>
        <div class="card"><h3>الخلاصة</h3><div class="kv">
          <span class="k">إضافات</span><span class="v pos">${UI.money(r.additions)}</span>
          <span class="k">خصومات</span><span class="v neg">${UI.money(r.deductions)}</span>
          <span class="k">المرتب بعد التسوية</span><span class="v">${UI.money(r.net)}</span>
        </div></div></div>
        <div class="table-wrap"><table><thead><tr><th>اليوم</th><th>الحالة</th><th class="num">حضور</th><th class="num">انصراف</th><th class="num">تأخير</th><th class="num">مبكر</th><th class="num">أوفر</th></tr></thead><tbody>
        ${r.days.map((d) => { const [t, k] = st[d.status] || [d.status, "mute"]; return `<tr><td>${UI.dateAr(d.date, { weekday: "short", day: "numeric", month: "short" })}</td><td><span class="tag ${k}">${t}</span>${d.missed ? ' <span class="tag bad">نسيان بصمة</span>' : ""}</td><td class="num">${UI.hm(d.in)}</td><td class="num">${UI.hm(d.out)}</td><td class="num ${d.late ? "neg" : ""}">${d.late ? UI.mins(d.late) : "—"}</td><td class="num ${d.early ? "neg" : ""}">${d.early ? UI.mins(d.early) : "—"}</td><td class="num ${d.ot ? "pos" : ""}">${d.ot ? UI.mins(d.ot) : "—"}</td></tr>`; }).join("")}
        </tbody></table></div>`,
    });
  }

  // ================= الإعدادات =================
  Views.settings = async function (view) {
    if (!Session.isAdmin) { view.innerHTML = `${pageHead("الإعدادات")}<div class="empty">الإعدادات للمدير بس.</div>`; return; }
    let tab = sessionStorage.getItem("hr_set_tab") || "policy";
    const tabs = [["policy", "سياسة الحضور"], ["emps", "الموظفين"], ["locs", "مواقع الفروع"], ["reasons", "أسباب الإجازة"], ["setup", "تجهيز ERPNext"]];
    const draw = async () => {
      view.innerHTML = `${pageHead("الإعدادات")}<div class="tabs">${tabs.map(([k, t]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}">${t}</button>`).join("")}</div><div id="tb">${loadingHTML}</div>`;
      view.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => { tab = b.dataset.t; try { sessionStorage.setItem("hr_set_tab", tab); } catch (e) {} draw(); });
      const tb = view.querySelector("#tb");
      try { await ({ policy: tPolicy, emps: tEmps, locs: tLocs, reasons: tReasons, setup: tSetup })[tab](tb, draw); }
      catch (e) { tb.innerHTML = `<div class="note bad">${esc(e.message)}</div><p>لو المستندات المخصصة لسه مش متعملة، روح على "تجهيز ERPNext".</p>`; }
    };
    await draw();
  };

  async function tPolicy(tb) {
    Data.clear("policy");
    const p = await Data.policy();
    const fields = S.doctypes[0].fields;
    let html = "";
    fields.forEach((f) => {
      if (f.fieldtype === "Section Break") { html += `${html ? "</div></div>" : ""}<div class="card"><h2>${esc(f.label)}</h2><div class="grid grid-2" style="gap:4px 14px">`; return; }
      if (f.fieldtype === "Check") html += `<div class="field" style="justify-content:end"><label class="check"><input type="checkbox" name="${f.fieldname}" ${Number(p[f.fieldname]) ? "checked" : ""}> ${esc(f.label)}</label></div>`;
      else html += `<div class="field"><label>${esc(f.label)}</label><input class="input" name="${f.fieldname}" type="${f.fieldtype === "Data" ? "text" : "number"}" step="any" value="${esc(p[f.fieldname] ?? "")}"></div>`;
    });
    html += "</div></div>";
    tb.innerHTML = `<form id="pf">${html}<div class="row end" style="margin-top:14px"><button class="btn primary" type="submit">حفظ السياسة</button></div></form>
      <div class="note" style="margin-top:14px">مثال: رصيد السماح 100 دقيقة، والموظف اتأخر 120 دقيقة في الشهر، والمعامل 2 ← بيتخصم (120 − 100) × 2 = 40 دقيقة بسعر دقيقته. أيام الإجازة الأسبوعية تقدر تكتبها بالعربي أو بالإنجليزي: الجمعة، Saturday.</div>`;
    tb.querySelector("#pf").onsubmit = async (e) => {
      e.preventDefault();
      const patch = {};
      fields.forEach((f) => {
        const el = e.target.elements[f.fieldname]; if (!el) return;
        patch[f.fieldname] = f.fieldtype === "Check" ? (el.checked ? 1 : 0) : f.fieldtype === "Data" ? el.value : Number(el.value) || 0;
      });
      try { await API.update(S.POLICY, S.POLICY, patch); Data.clear("policy"); toast("اتحفظت", "ok"); }
      catch (x) { toast(x.message, "bad"); }
    };
  }

  async function tEmps(tb, redraw) {
    Data.clear("employees");
    const [emps, shifts, locs, policy] = await Promise.all([Data.employees(), Data.shifts(), Data.locations(), Data.policy()]);
    tb.innerHTML = `<div class="toolbar"><input class="input" id="q" placeholder="ابحث..." style="max-width:260px"></div>
      <div class="table-wrap"><table><thead><tr><th>الموظف</th><th class="num">الراتب</th><th>الشيفت الرئيسي</th><th>الفروع</th><th class="num">السماح الشهري</th><th>أوفر تايم</th><th>مكافأة/خصم</th><th>المدير</th><th></th></tr></thead><tbody>
      ${emps.map((e) => `<tr data-s="${esc((e.employee_name + " " + e.name).toLowerCase())}"><td><strong>${esc(e.employee_name)}</strong><div class="hint" style="color:var(--muted);font-size:12px">${esc(e.name)} · ${esc(e.user_id || "مفيش يوزر")}</div></td>
        <td class="num">${e.custom_monthly_salary ? UI.money(e.custom_monthly_salary) : '<span class="tag bad">ناقص</span>'}</td>
        <td>${esc(e.default_shift || "—")}</td><td>${esc([e.custom_location_1, e.custom_location_2].filter(Boolean).join("، ") || "—")}</td>
        <td class="num">${e.custom_monthly_grace_minutes ?? ""}${e.custom_monthly_grace_minutes === null || e.custom_monthly_grace_minutes === undefined || e.custom_monthly_grace_minutes === "" ? `<span class="hint" style="color:var(--muted)">افتراضي ${UI.num(policy.default_monthly_grace)}</span>` : ""}</td>
        <td>${Number(e.custom_no_overtime) ? '<span class="tag mute">لا</span>' : '<span class="tag ok">نعم</span>'}</td>
        <td>${Number(e.custom_can_reward) ? '<span class="tag ok">مسموح</span>' : "—"}</td>
        <td>${esc((emps.find((x) => x.name === e.reports_to) || {}).employee_name || "—")}</td>
        <td><button class="btn ghost sm" data-e="${esc(e.name)}">تعديل</button></td></tr>`).join("")}
      </tbody></table></div>`;
    tb.querySelector("#q").oninput = (ev) => { const q = ev.target.value.toLowerCase(); tb.querySelectorAll("tbody tr").forEach((tr) => tr.classList.toggle("hidden", !!q && !tr.dataset.s.includes(q))); };
    tb.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => {
      const e = emps.find((x) => x.name === b.dataset.e);
      const locOpts = (sel) => `<option value="">—</option>${locs.map((l) => opt(l.name, l.location_name || l.name, sel)).join("")}`;
      const m = UI.modal({
        title: e.employee_name,
        body: `<div class="grid grid-2" style="gap:4px 14px">
          <div class="field"><label>الراتب الشهري</label><input class="input" type="number" id="sal" value="${esc(e.custom_monthly_salary ?? "")}"></div>
          <div class="field"><label>رصيد السماح الشهري (دقيقة)</label><input class="input" type="number" id="gr" value="${esc(e.custom_monthly_grace_minutes ?? "")}" placeholder="افتراضي ${esc(policy.default_monthly_grace)}"></div>
          <div class="field"><label>الشيفت الرئيسي</label><select class="input" id="sh"><option value="">—</option>${Object.keys(shifts).map((s) => opt(s, s, e.default_shift)).join("")}</select></div>
          <div class="field"><label>المدير المباشر</label><select class="input" id="rt"><option value="">—</option>${emps.filter((x) => x.name !== e.name).map((x) => opt(x.name, x.employee_name, e.reports_to)).join("")}</select></div>
          <div class="field"><label>الفرع الأول</label><select class="input" id="l1">${locOpts(e.custom_location_1)}</select></div>
          <div class="field"><label>الفرع الثاني (لو بيشتغل في فرعين)</label><select class="input" id="l2">${locOpts(e.custom_location_2)}</select></div>
          </div>
          <label class="check" style="margin:6px 0"><input type="checkbox" id="no" ${Number(e.custom_no_overtime) ? "checked" : ""}> لا يحسب له أوفر تايم</label>
          <label class="check" style="margin:6px 0"><input type="checkbox" id="cr" ${Number(e.custom_can_reward) ? "checked" : ""}> يقدر يدي مكافأة وخصم</label>
          ${e.image ? "" : '<div class="note warn">الموظف ده مفيش له صورة على ERPNext. لازم ترفعله صورة في ملفه عشان بصمة الوجه تشتغل.</div>'}`,
        footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="sv">حفظ</button>`,
      });
      m.el.querySelector("#sv").onclick = async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true;
        const v = (id) => m.el.querySelector(id).value;
        const rt = v("#rt");
        const mgr = emps.find((x) => x.name === rt);
        const patch = {
          custom_monthly_salary: Number(v("#sal")) || 0,
          custom_monthly_grace_minutes: v("#gr") === "" ? null : Number(v("#gr")),
          default_shift: v("#sh") || null, reports_to: rt || null,
          custom_location_1: v("#l1") || null, custom_location_2: v("#l2") || null,
          custom_no_overtime: m.el.querySelector("#no").checked ? 1 : 0, custom_can_reward: m.el.querySelector("#cr").checked ? 1 : 0,
        };
        if (mgr && mgr.user_id) patch.leave_approver = mgr.user_id;
        try { await API.update("Employee", e.name, patch); Data.clear("employees"); toast("اتحفظ", "ok"); m.close(); redraw(); }
        catch (x) { toast(x.message, "bad"); btn.disabled = false; }
      };
    });
  }

  async function tLocs(tb, redraw) {
    Data.clear("locations");
    const locs = await Data.locations();
    tb.innerHTML = `<div class="grid grid-2">
      <div class="card"><h2>إضافة فرع</h2>
        <div class="field"><label>اسم الفرع</label><input class="input" id="ln"></div>
        <div class="grid grid-2" style="gap:10px"><div class="field"><label>Latitude</label><input class="input" id="la" type="number" step="any" dir="ltr"></div><div class="field"><label>Longitude</label><input class="input" id="lo" type="number" step="any" dir="ltr"></div></div>
        <div class="field"><label>المسافة المسموحة (متر)</label><input class="input" id="lr" type="number" value="100"></div>
        <div class="row"><button class="btn ghost" id="here">${icon("pin")} استخدم موقعي الحالي</button><button class="btn primary" id="add">إضافة</button></div>
        <div class="note">افتح الصفحة دي وانت واقف في الفرع ودوس "استخدم موقعي الحالي".</div>
      </div>
      <div>${locs.length ? `<div class="list">${locs.map((l) => `<div class="item"><div class="top"><span class="title">${esc(l.location_name || l.name)}</span><span class="tag info">${UI.num(l.checkin_radius || 100)} متر</span></div><div class="meta" dir="ltr" style="text-align:end">${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)}</div><div class="actions"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://maps.google.com/?q=${l.latitude},${l.longitude}">${icon("pin")} الخريطة</a></div></div>`).join("")}</div>` : '<div class="empty">مفيش فروع لسه</div>'}</div></div>`;
    tb.querySelector("#here").onclick = () => navigator.geolocation.getCurrentPosition((p) => { tb.querySelector("#la").value = p.coords.latitude.toFixed(6); tb.querySelector("#lo").value = p.coords.longitude.toFixed(6); }, () => toast("مش قادر أحدد الموقع", "bad"), { enableHighAccuracy: true, timeout: 15000 });
    tb.querySelector("#add").onclick = async () => {
      const name = tb.querySelector("#ln").value.trim(), la = Number(tb.querySelector("#la").value), lo = Number(tb.querySelector("#lo").value);
      if (!name || !la || !lo) return toast("اكتب الاسم والإحداثيات", "bad");
      try { await API.insert("Shift Location", { location_name: name, latitude: la, longitude: lo, checkin_radius: Number(tb.querySelector("#lr").value) || 100 }); Data.clear("locations"); toast("اتضاف", "ok"); redraw(); }
      catch (x) { toast(x.message, "bad"); }
    };
  }

  async function tReasons(tb, redraw) {
    Data.clear("reasons");
    const rs = await Data.reasons();
    tb.innerHTML = `<div class="card" style="max-width:560px"><h2>أسباب الإجازة</h2><p style="margin-top:0;color:var(--muted)">الموظف بيختار منها لما يطلب إجازة.</p>
      <div class="row" style="margin-bottom:12px"><input class="input" id="nr" placeholder="سبب جديد" style="flex:1"><button class="btn primary" id="add">${icon("plus")} إضافة</button></div>
      ${rs.length ? `<div class="list">${rs.map((r) => `<div class="item" style="padding:10px 14px"><div class="top"><span>${esc(r.name)}</span><button class="btn ghost sm" data-d="${esc(r.name)}">${icon("trash")}</button></div></div>`).join("")}</div>` : '<div class="empty">مفيش أسباب</div>'}</div>`;
    tb.querySelector("#add").onclick = async () => {
      const v = tb.querySelector("#nr").value.trim(); if (!v) return;
      try { await API.insert(S.REASON, { reason_name: v }); Data.clear("reasons"); redraw(); } catch (x) { toast(x.message, "bad"); }
    };
    tb.querySelectorAll("[data-d]").forEach((b) => b.onclick = async () => {
      if (!(await UI.confirmBox("مسح السبب", `هتمسح "${b.dataset.d}"؟`, "مسح", "bad"))) return;
      try { await API.remove(S.REASON, b.dataset.d); Data.clear("reasons"); redraw(); } catch (x) { toast(x.message, "bad"); }
    });
  }

  async function tSetup(tb) {
    const demo = API.isDemo();
    tb.innerHTML = `<div class="grid grid-2">
      <div class="card"><h2>تجهيز ERPNext</h2>
        <p style="margin-top:0;color:var(--ink-2)">بيعمل المستندات والحقول اللي الواجهة محتاجاها، مرة واحدة بس. اللي موجود بيتخطاه.</p>
        <ul style="color:var(--ink-2);padding-inline-start:18px;margin:0 0 14px">
          ${S.doctypes.map((d) => `<li><code>${esc(d.name)}</code></li>`).join("")}
          <li>حقول على Employee و Leave Application (${UI.num(S.customFields.length)} حقل)</li>
        </ul>
        <button class="btn primary" id="run" ${demo ? "disabled" : ""}>شغّل التجهيز</button>
        ${demo ? '<div class="note warn">انت في الوضع التجريبي. اقفله من شاشة الدخول عشان تجهّز ERPNext الحقيقي.</div>' : ""}
        <div class="log hidden" id="log" style="margin-top:12px"></div>
      </div>
      <div class="card"><h2>الاتصال</h2><div class="kv">
        <span class="k">السيرفر</span><span class="v" dir="ltr">${esc(CONFIG.ERP_URL)}</span>
        <span class="k">الوضع</span><span class="v">${demo ? "تجريبي (بيانات في المتصفح)" : "ERPNext الحقيقي"}</span></div>
        ${demo ? `<button class="btn ghost" id="reset" style="margin-top:14px">${icon("trash")} رجّع البيانات التجريبية من الأول</button>` : ""}
      </div></div>`;
    const run = tb.querySelector("#run");
    if (run) run.onclick = async () => {
      run.disabled = true;
      const log = tb.querySelector("#log"); log.classList.remove("hidden"); log.innerHTML = "";
      await runSetup((m, ok) => { const d = document.createElement("div"); d.textContent = m; if (!ok) d.className = "bad"; log.appendChild(d); log.scrollTop = log.scrollHeight; });
      Data.clear(); run.disabled = false;
    };
    const rs = tb.querySelector("#reset");
    if (rs) rs.onclick = async () => { if (await UI.confirmBox("إعادة البيانات", "كل التعديلات التجريبية هتتمسح.", "إعادة", "bad")) { MockAPI.reset(); Data.clear(); toast("رجعت", "ok"); } };
  }
})();
