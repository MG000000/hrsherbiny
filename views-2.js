// الطلبات (للمدير)، طلباتي، المهام، المكافآت والخصومات
(function () {
  const { esc, icon, toast } = UI;
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(t ?? v)}</option>`;
  const dshort = (d) => UI.dateAr(d, { day: "numeric", month: "short" });
  const range = (a, b) => (a === b ? dshort(a) : `${dshort(a)} ← ${dshort(b)}`);
  const comment = (dt, name, content) => API.insert("Comment", { comment_type: "Comment", reference_doctype: dt, reference_name: name, content }).catch(() => {});
  const userOf = async (emp) => { const e = await Data.employee(emp).catch(() => null); return e && e.user_id; };
  // بنجرّب بصلاحيات اليوزر الأول، ولو ERPNext رفض (المدير مالوش صلاحية كتابة) بنكمّل بمفتاح الأدمن
  // (الواجهة متأكدة قبلها إن الموظف ده في فريقه المباشر)
  const asUserOrAdmin = (fn) => fn(API).catch((e) => ([401, 403, 417].includes(e.status) ? fn(API.admin) : Promise.reject(e)));
  const applyWorkflow = (name, action) => asUserOrAdmin((A) => A.call("frappe.model.workflow.apply_workflow", { doc: JSON.stringify({ doctype: "Employee Checkin", name }), action }));
  const tagCheckin = (name, device_id) => asUserOrAdmin((A) => A.update("Employee Checkin", name, { device_id }));
  async function filesOf(dt, name) {
    const f = await API.attachments(dt, name);
    const urls = await Promise.all(f.map((x) => API.fileBlobUrl(x.file_url).catch(() => null)));
    return urls.filter(Boolean).length ? `<div class="thumbs">${urls.filter(Boolean).map((u) => `<img src="${esc(u)}" alt="">`).join("")}</div>` : "";
  }

  // ================= الطلبات (للمدير) =================
  Views.inbox = async function (view) {
    if (!Session.canApprove) return Views.mine(view);
    let tab = "punch";
    const draw = async () => {
      view.innerHTML = `${pageHead("الطلبات", "محتاجة موافقتك")}<div class="seg"><button data-k="punch">البصمات</button><button data-k="leave">الإجازات</button><button data-k="done">اتردّ عليها</button></div><div id="list">${loadingHTML}</div>`;
      view.querySelectorAll(".seg button").forEach((b) => { b.classList.toggle("on", b.dataset.k === tab); b.onclick = () => { tab = b.dataset.k; draw(); }; });
      const list = view.querySelector("#list");
      if (tab === "done") return history(list);
      const p = await pendingRequests();
      const segN = (k, n) => { const b = view.querySelector(`.seg [data-k="${k}"]`); if (n) b.insertAdjacentHTML("beforeend", ` <span class="n">${UI.num(n)}</span>`); };
      segN("punch", p.att.length); segN("leave", p.leave.length);
      let html = "";
      if (tab === "punch") {
        html = p.att.map((c) => card(`att:${c.name}`, c.employee_name, `<span class="tag warn">${esc(reasonOf(c))}</span>`, `${c.log_type === "IN" ? "حضور" : "انصراف"} الساعة ${UI.hm(c.time)}، ${dshort(String(c.time).slice(0, 10))}`)).join("");
      } else {
        html = p.leave.map((r) => card(`leave:${r.name}`, r.employee_name, `<span class="tag info">${esc(r.leave_type)}</span>`, `${range(r.from_date, r.to_date)}، ${UI.num(r.total_leave_days || 1)} يوم${r.description ? "، " + esc(r.description) : ""}`)).join("");
      }
      list.innerHTML = html ? `<div class="group">${html}</div>` : `<div class="empty">مفيش طلبات مستنية ردّك</div>`;
      list.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => {
        const [kind, name] = b.closest("[data-id]").dataset.id.split(":");
        const ok = b.dataset.a === "ok";
        if (kind === "att") decideAtt(p.att.find((x) => x.name === name), ok, draw);
        if (kind === "leave") decideLeave(p.leave.find((x) => x.name === name), ok, draw);
      });
    };
    const card = (id, who, tag, meta) => `<div class="req" data-id="${esc(id)}"><div class="row-item"><span class="avatar">${esc(UI.initials(who))}</span><span class="ri-main"><span class="ri-t">${esc(who)}</span><span class="ri-s">${meta}</span><span class="ri-tag">${tag}</span></span></div><div class="item-actions"><button class="btn ok sm" data-a="ok">${icon("check")} موافقة</button><button class="btn bad sm" data-a="no">${icon("x")} رفض</button></div></div>`;
    await draw();
  };

  async function history(list) {
    const team = (await Data.team()).map((e) => e.name);
    if (!team.length) { list.innerHTML = '<div class="empty">لسه مفيش</div>'; return; }
    const A = Data.api();
    const [lv, ck] = await Promise.all([
      A.list("Leave Application", { fields: ["name", "employee_name", "leave_type", "from_date", "to_date", "status", "modified"], filters: [["status", "in", ["Approved", "Rejected"]], ["employee", "in", team]], order_by: "modified desc", limit: 20 }).catch(() => []),
      A.list("Employee Checkin", { fields: ["*"], filters: [["workflow_state", "in", ["Approved", "Rejected"]], ["device_id", "like", "app:%"], ["employee", "in", team]], order_by: "modified desc", limit: 20 }).catch(() => []),
    ]);
    const rows = [
      ...lv.map((r) => ({ at: r.modified, who: r.employee_name, what: `${r.leave_type}، ${range(r.from_date, r.to_date)}`, st: r.status })),
      ...ck.map((c) => ({ at: c.modified, who: c.employee_name, what: `${reasonOf(c)}، ${UI.hm(c.time)} ${dshort(String(c.time).slice(0, 10))}`, st: c.workflow_state })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));
    list.innerHTML = rows.length ? `<div class="group">${rows.map((r) => `<div class="row-item"><span class="ri-main"><span class="ri-t">${esc(r.who)}</span><span class="ri-s">${esc(r.what)}</span></span><span class="ri-end">${UI.statusTag(r.st)}</span></div>`).join("")}</div>` : '<div class="empty">لسه مفيش</div>';
  }

  function decideSheet(title, ok, extra = "") {
    return new Promise((resolve) => {
      const s = UI.sheet({
        title, body: `${extra}<div class="field"><label for="note">رد للموظف (اختياري)</label><textarea class="input" id="note"></textarea></div>`,
        footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn ${ok ? "ok" : "bad"}" id="do">${ok ? "موافقة" : "رفض"}</button>`,
        onClose: () => resolve(null),
      });
      s.el.querySelector("#do").onclick = (e) => { e.currentTarget.disabled = true; const v = { note: s.el.querySelector("#note").value.trim(), el: s.el }; s.el.remove(); resolve(v); };
    });
  }

  // موافقة أو رفض البصمة عن طريق الـ Workflow بتاع Employee Checkin
  async function decideAtt(c, ok, done) {
    const v = await decideSheet(ok ? "موافقة على البصمة" : "رفض البصمة", ok, `<p style="margin-top:0">${esc(c.employee_name)}: ${esc(reasonOf(c))}، ${c.log_type === "IN" ? "حضور" : "انصراف"} الساعة ${UI.hm(c.time)}</p>`);
    if (!v) return;
    try {
      if (String(c.device_id || "").startsWith("app-pending")) {
        await tagCheckin(c.name, ok ? "app-approved" : "app-rejected"); // بصمات النسخة القديمة
      } else {
        await applyWorkflow(c.name, ok ? "Approve" : "Reject");
        if (ok) await asUserOrAdmin((A) => A.update("Employee Checkin", c.name, { skip_auto_attendance: 0 }));
        // بصمة في شيفت تاني: بنعيّنه على الشيفت ده اليوم ده بس عشان الحضور يتحسب صح
        const [, kind] = String(c.device_id).split(":");
        if (ok && kind === "shift") {
          const shift = String(c.device_id).split(":").slice(2).join(":"), day = String(c.time).slice(0, 10);
          const emp = await Data.employee(c.employee);
          await API.admin.insertSubmit("Shift Assignment", { employee: c.employee, company: emp && emp.company, shift_type: shift, start_date: day, end_date: day, status: "Active" })
            .catch((e) => toast(`البصمة اتقبلت، بس تعيين الشيفت ليوم ${day} ما اتعملش: ${e.message}`, "bad"));
        }
      }
      if (v.note) await comment("Employee Checkin", c.name, v.note);
      await Notify.send(await userOf(c.employee), `بصمة ${c.log_type === "IN" ? "الحضور" : "الانصراف"} الساعة ${UI.hm(c.time)} ${ok ? "اتقبلت ✓" : "اترفضت ✗"}${v.note ? " — " + v.note : ""}`, "Employee Checkin", c.name);
      toast(ok ? "اتوافق عليها" : "اترفضت", "ok"); done();
    } catch (e) { toast(e.message, "bad"); }
  }

  async function decideLeave(r, ok, done) {
    const types = await Data.leaveTypes();
    const lwp = types.filter((t) => Number(t.is_lwp));
    const extra = `<p style="margin-top:0">${esc(r.employee_name)}: ${esc(r.leave_type)}، ${UI.num(r.total_leave_days || 1)} يوم</p>` + (ok && lwp.length ? `<div class="field"><label for="lt">تتحسب إزاي؟</label><select class="input" id="lt">${opt(r.leave_type, `${r.leave_type} (زي ما طلبها)`, r.leave_type)}${lwp.filter((t) => t.name !== r.leave_type).map((t) => opt(t.name, `${t.name} (تتخصم من المرتب)`)).join("")}</select><span class="hint">الإجازة بدون مرتب ERPNext بيخصمها لوحده في الـ Payroll.</span></div>` : "");
    const s = UI.sheet({
      title: ok ? "موافقة على الإجازة" : "رفض الإجازة",
      body: `${extra}<div class="field"><label for="note">رد للموظف (اختياري)</label><textarea class="input" id="note"></textarea></div>`,
      footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn ${ok ? "ok" : "bad"}" id="do">${ok ? "موافقة" : "رفض"}</button>`,
    });
    s.el.querySelector("#do").onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const note = s.el.querySelector("#note").value.trim();
      const lt = s.el.querySelector("#lt") ? s.el.querySelector("#lt").value : r.leave_type;
      try {
        await asUserOrAdmin((A) => A.update("Leave Application", r.name, { status: ok ? "Approved" : "Rejected", leave_type: lt }));
        await asUserOrAdmin((A) => A.submit("Leave Application", r.name));
        if (note) await comment("Leave Application", r.name, note);
        await Notify.send(await userOf(r.employee), `طلب ${lt} من ${r.from_date} ${ok ? "اتقبل ✓" : "اترفض ✗"}${note ? " — " + note : ""}`, "Leave Application", r.name);
        toast(ok ? "الإجازة اتقبلت" : "الإجازة اترفضت", "ok"); s.close(); done();
      } catch (x) { toast(x.message, "bad"); b.disabled = false; }
    };
  }

  // ================= طلباتي (الموظف) =================
  Views.mine = async function (view) {
    const me = Session.employee;
    if (!me) { view.innerHTML = `${pageHead("طلباتي")}<div class="empty">حسابك مش مربوط بموظف على ERPNext.</div>`; return; }
    const [types, lv, cks] = await Promise.all([
      Data.leaveTypes(),
      API.list("Leave Application", { fields: ["name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "description"], filters: [["employee", "=", me.name]], order_by: "creation desc", limit: 20 }).catch(() => []),
      API.list("Employee Checkin", { fields: ["*"], filters: [["employee", "=", me.name], ["device_id", "like", "app:%"]], order_by: "time desc", limit: 15 }).catch(() => []),
    ]);
    const t = UI.today();
    const items = [
      ...lv.map((r) => ({ ic: "cal", t: r.leave_type, s: `${range(r.from_date, r.to_date)}، ${UI.num(r.total_leave_days || 1)} يوم`, st: r.status })),
      ...cks.filter((c) => c.workflow_state).map((c) => ({ ic: "finger", t: reasonOf(c), s: `${c.log_type === "IN" ? "حضور" : "انصراف"} ${UI.hm(c.time)}، ${dshort(String(c.time).slice(0, 10))}`, st: c.workflow_state })),
    ];
    view.innerHTML = `${pageHead("طلباتي")}
      <form class="form" id="lf">
        <div class="field"><label for="lt">نوع الإجازة</label><select class="input" id="lt" name="leave_type" required>${types.map((x) => opt(x.name)).join("")}</select></div>
        <div class="two"><div class="field"><label for="fd">من</label><input class="input" id="fd" type="date" name="from_date" value="${t}" required></div><div class="field"><label for="td">لحد</label><input class="input" id="td" type="date" name="to_date" value="${t}" required></div></div>
        <div class="field"><label for="ds">السبب</label><textarea class="input" id="ds" name="description" placeholder="اكتب السبب للمدير" required></textarea></div>
        <button class="btn primary block" type="submit">ابعت طلب الإجازة</button>
      </form>
      <h2 class="sec">حالة طلباتك</h2>
      ${items.length ? `<div class="group">${items.map((x) => `<div class="row-item"><span class="ri-ic">${icon(x.ic)}</span><span class="ri-main"><span class="ri-t">${esc(x.t)}</span><span class="ri-s">${x.s}</span></span><span class="ri-end">${UI.statusTag(x.st)}</span></div>`).join("")}</div>` : '<div class="empty">مفيش طلبات</div>'}`;
    view.querySelector("#lf").onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.to_date < f.from_date) return toast("تاريخ النهاية قبل البداية", "bad");
      const b = e.target.querySelector("button"); b.disabled = true;
      try {
        const emp = (await Data.employee(me.name).catch(() => null)) || me;
        const approver = emp.leave_approver || (await Data.managerUser(emp));
        const doc = await API.insert("Leave Application", { ...f, employee: emp.name, company: emp.company, leave_approver: approver, status: "Open", posting_date: t });
        await Notify.send(approver, `${emp.employee_name} طالب ${f.leave_type} من ${f.from_date} لحد ${f.to_date}`, "Leave Application", doc.name);
        toast("الطلب اتبعت للمدير", "ok"); App.route();
      } catch (x) { toast(x.message, "bad"); b.disabled = false; }
    };
  };

  // ================= المهام (ToDo) =================
  Views.tasks = async function (view) {
    let tab = "open";
    const team = await Data.team().catch(() => []);
    const canAssign = team.length > 0;
    const draw = async () => {
      const f = tab === "open" ? [["allocated_to", "=", Session.user], ["status", "=", "Open"]] : tab === "done" ? [["allocated_to", "=", Session.user], ["status", "=", "Closed"]] : [["assigned_by", "=", Session.user], ["allocated_to", "!=", Session.user], ["status", "!=", "Cancelled"]];
      const rows = await API.list("ToDo", { fields: ["name", "description", "status", "date", "allocated_to", "assigned_by", "priority"], filters: f, order_by: "creation desc", limit: 50 }).catch(() => []);
      const emps = await Data.employees().catch(() => []);
      const nm = (u) => (emps.find((e) => e.user_id === u) || {}).employee_name || u;
      const txt = (r) => String(r.description || "").replace(/<[^>]+>/g, " ").trim();
      view.innerHTML = `${pageHead("المهام", "", canAssign ? `<button class="ibtn" id="new" aria-label="مهمة جديدة">${icon("plus")}</button>` : "")}
        <div class="seg"><button data-k="open">مفتوحة</button><button data-k="done">خلصت</button>${canAssign ? '<button data-k="sent">اللي بعتها</button>' : ""}</div>
        ${rows.length ? `<div class="group">${rows.map((r) => `<div class="req" data-n="${esc(r.name)}"><div class="row-item"><span class="ri-ic ${r.status === "Closed" ? "in" : r.priority === "High" ? "out" : ""}">${icon(r.status === "Closed" ? "check" : "tasks")}</span><span class="ri-main"><span class="ri-t">${esc(txt(r))}</span><span class="ri-s">${tab === "sent" ? "لـ " + esc(nm(r.allocated_to)) : "من " + esc(nm(r.assigned_by))}${r.date ? "، الميعاد " + dshort(r.date) : ""}${r.priority === "High" ? "، عاجلة" : ""}</span><span class="th"></span></span>${tab === "sent" ? `<span class="ri-end">${r.status === "Closed" ? '<span class="tag ok">تم</span>' : '<span class="tag mute">لسه</span>'}</span>` : ""}</div>${tab === "open" ? `<div class="item-actions"><button class="btn ok sm" data-done>${icon("check")} خلصتها</button></div>` : ""}</div>`).join("")}</div>` : `<div class="empty">${tab === "open" ? "مفيش مهام مفتوحة" : "مفيش"}</div>`}`;
      view.querySelectorAll(".seg button").forEach((b) => { b.classList.toggle("on", b.dataset.k === tab); b.onclick = () => { tab = b.dataset.k; draw(); }; });
      const nb = view.querySelector("#new"); if (nb) nb.onclick = () => newTask(team, draw);
      view.querySelectorAll("[data-done]").forEach((b) => b.onclick = () => finish(rows.find((r) => r.name === b.closest("[data-n]").dataset.n), draw));
      if (tab !== "open") view.querySelectorAll("[data-n]").forEach(async (el) => { el.querySelector(".th").innerHTML = await filesOf("ToDo", el.dataset.n); });
    };
    await draw();
  };

  function finish(r, done) {
    const s = UI.sheet({
      title: "خلصت المهمة",
      body: `<p style="margin-top:0">${esc(String(r.description || "").replace(/<[^>]+>/g, " "))}</p><div class="field"><label for="img">صور (اختياري)</label><input class="input" id="img" type="file" accept="image/*" multiple></div>`,
      footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn ok" id="do">${icon("check")} خلصتها</button>`,
    });
    s.el.querySelector("#do").onclick = async (e) => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      try {
        for (const f of s.el.querySelector("#img").files) await API.upload(f, { doctype: "ToDo", docname: r.name });
        await API.update("ToDo", r.name, { status: "Closed" });
        await Notify.send(r.assigned_by, `${Session.full_name} خلّص المهمة: ${String(r.description || "").replace(/<[^>]+>/g, " ").slice(0, 70)}`, "ToDo", r.name);
        toast("اتعلّمت إنها خلصت", "ok"); s.close(); done();
      } catch (x) { toast(x.message, "bad"); b.disabled = false; b.textContent = "خلصتها"; }
    };
  }

  function newTask(team, done) {
    const people = team.filter((e) => e.user_id);
    const s = UI.sheet({
      title: "مهمة جديدة",
      body: `<div class="field"><label for="ds">المهمة</label><textarea class="input" id="ds"></textarea></div>
        <div class="two"><div class="field"><label for="dt">الميعاد</label><input class="input" id="dt" type="date" value="${UI.today()}"></div><div class="field"><label for="pr">الأولوية</label><select class="input" id="pr">${opt("Medium", "عادية")}${opt("High", "عاجلة")}${opt("Low", "مش مستعجلة")}</select></div></div>
        <div class="field"><label>لمين؟</label><div class="pick-list">${people.map((e) => `<label><input type="checkbox" value="${esc(e.user_id)}"> ${esc(e.employee_name)}</label>`).join("")}</div></div>`,
      footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="do">ابعت المهمة</button>`,
    });
    s.el.querySelector("#do").onclick = async (e) => {
      const ds = s.el.querySelector("#ds").value.trim();
      const users = [...s.el.querySelectorAll(".pick-list input:checked")].map((i) => i.value);
      if (!ds || !users.length) return toast("اكتب المهمة واختار حد واحد على الأقل", "bad");
      const b = e.currentTarget; b.disabled = true;
      for (const u of users) {
        try {
          const t = await API.insert("ToDo", { allocated_to: u, description: ds, date: s.el.querySelector("#dt").value, priority: s.el.querySelector("#pr").value, status: "Open", assigned_by: Session.user });
          await Notify.send(u, `عندك مهمة جديدة: ${ds.slice(0, 70)}`, "ToDo", t.name);
        } catch (x) { toast(x.message, "bad"); }
      }
      toast("المهمة اتبعتت", "ok"); s.close(); done();
    };
  }

  // ================= المكافآت والخصومات (Additional Salary) =================
  Views.rewards = async function (view) {
    const C = CONFIG.COMPONENTS;
    const me = Session.employee;
    const team = await Data.team();
    const canGive = Session.canReward && team.length > 0;
    // الأدمن: الكل. المدير: فريقه المباشر. غير كده: نفسه بس
    const scope = Session.isAdmin ? [] : [["employee", "in", [...(canGive ? team.map((e) => e.name) : []), me ? me.name : "-"]]];
    const recent = await (canGive ? Data.api() : API).list("Additional Salary", {
      fields: ["name", "employee", "employee_name", "salary_component", "amount", "payroll_date", "docstatus"],
      filters: [["salary_component", "in", [C.reward, C.deduction]], ["docstatus", "!=", 2], ...scope],
      order_by: "creation desc", limit: 30,
    }).catch(() => []);
    const list = recent.length ? `<div class="group">${recent.map((x) => `<div class="row-item" data-n="${esc(x.name)}"><span class="ri-ic ${x.salary_component === C.reward ? "in" : "out"}">${icon(x.salary_component === C.reward ? "gift" : "coins")}</span><span class="ri-main"><span class="ri-t">${esc(x.employee_name)}</span><span class="ri-s">${esc(x.salary_component)}، ${dshort(x.payroll_date)}</span><span class="th"></span></span><span class="ri-end ri-big ${x.salary_component === C.reward ? "pos" : "neg"}">${UI.money(x.amount)}</span></div>`).join("")}</div>` : '<div class="empty">لسه مفيش</div>';
    const loadThumbs = () => view.querySelectorAll("[data-n]").forEach(async (el) => { el.querySelector(".th").innerHTML = await filesOf("Additional Salary", el.dataset.n); el.querySelectorAll(".thumbs img").forEach((i) => i.onclick = () => UI.viewImage(i.src)); });
    if (!canGive) { view.innerHTML = `${pageHead("مكافآتي وخصوماتي")}${list}`; loadThumbs(); return; }

    const st = { comp: C.reward, calc: "Fixed", ov: {}, base: {} };
    view.innerHTML = `${pageHead("المكافآت والخصومات", "بتتسجل Additional Salary وتدخل المرتب")}
      <div class="form">
        <div class="seg" id="tp"><button data-v="${esc(C.reward)}" class="on">مكافأة</button><button data-v="${esc(C.deduction)}">خصم</button></div>
        <div class="seg" id="cl"><button data-v="Fixed" class="on">مبلغ ثابت</button><button data-v="Percent">نسبة من الأساسي</button></div>
        <div class="two"><div class="field"><label for="val" id="vl">المبلغ</label><input class="input" id="val" type="number" min="0" step="0.01" inputmode="decimal"></div><div class="field"><label for="pd">تاريخ المرتب</label><input class="input" id="pd" type="date" value="${UI.today()}"></div></div>
        <div class="field"><label for="rs">السبب</label><textarea class="input" id="rs"></textarea></div>
        <div class="field"><label for="imgs">صور (اختياري)</label><input class="input" id="imgs" type="file" accept="image/*" multiple></div>
        <div class="field"><label>الموظفين <span class="hint" id="cnt"></span></label><input class="input" id="fq" placeholder="ابحث" style="margin-bottom:8px"><div class="pick-list" id="pl"><label><input type="checkbox" id="all"> <b>تحديد الكل</b></label>${team.map((e) => `<label data-s="${esc(e.employee_name)}"><input type="checkbox" value="${esc(e.name)}"> ${esc(e.employee_name)}</label>`).join("")}</div></div>
        <div id="prev"></div>
        <button class="btn primary block lg" id="save" disabled>حفظ</button>
      </div>
      <h2 class="sec">آخر الإضافات</h2>${list}`;
    loadThumbs();
    const sel = () => [...view.querySelectorAll("#pl input[value]:checked")].map((i) => i.value);
    const amountOf = (id) => {
      const v = Number(view.querySelector("#val").value) || 0;
      if (id in st.ov) return st.ov[id];
      return st.calc === "Percent" ? Calc.r2((st.base[id] || 0) * v / 100) : v;
    };
    const preview = async () => {
      view.querySelector("#vl").textContent = st.calc === "Percent" ? "النسبة %" : "المبلغ";
      const ids = sel(), v = view.querySelector("#val").value;
      view.querySelector("#cnt").textContent = ids.length ? `(${UI.num(ids.length)})` : "";
      view.querySelector("#save").disabled = !ids.length || !v;
      if (!ids.length || !v) return (view.querySelector("#prev").innerHTML = "");
      if (st.calc === "Percent") await Promise.all(ids.filter((id) => !(id in st.base)).map(async (id) => (st.base[id] = await Data.baseSalary(id, view.querySelector("#pd").value))));
      const total = ids.reduce((s, id) => s + amountOf(id), 0);
      view.querySelector("#prev").innerHTML = `<div class="field"><label>المبالغ، وتقدر تعدّل أي واحد</label><div class="group" style="background:var(--bg)">${ids.map((id) => { const e = team.find((x) => x.name === id); return `<div class="row-item"><span class="ri-main"><span class="ri-t">${esc(e.employee_name)}</span>${st.calc === "Percent" ? `<span class="ri-s">الأساسي ${UI.money(st.base[id])}</span>` : ""}</span><input class="input" style="width:120px" type="number" step="0.01" data-o="${esc(id)}" value="${amountOf(id)}"></div>`; }).join("")}<div class="row-item"><span class="ri-main"><span class="ri-t">الإجمالي</span></span><span class="ri-end ri-big">${UI.money(total)}</span></div></div>${st.calc === "Percent" && ids.some((id) => !st.base[id]) ? '<span class="hint" style="color:var(--out)">فيه موظفين مالهمش Salary Structure Assignment، فالنسبة طلعت صفر.</span>' : ""}</div>`;
      view.querySelectorAll("[data-o]").forEach((i) => i.onchange = () => { st.ov[i.dataset.o] = Number(i.value) || 0; setTimeout(preview, 0); });
    };
    const seg = (id, key) => view.querySelectorAll(`#${id} button`).forEach((b) => b.onclick = () => { st[key] = b.dataset.v; st.ov = {}; view.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b)); preview(); });
    seg("tp", "comp"); seg("cl", "calc");
    view.querySelector("#val").oninput = () => { st.ov = {}; preview(); };
    view.querySelector("#pl").onchange = (e) => { if (e.target.id === "all") view.querySelectorAll("#pl label:not([hidden]) input[value]").forEach((i) => (i.checked = e.target.checked)); preview(); };
    view.querySelector("#fq").oninput = (e) => view.querySelectorAll("#pl label[data-s]").forEach((l) => (l.hidden = !!e.target.value && !l.dataset.s.includes(e.target.value)));
    view.querySelector("#save").onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      const date = view.querySelector("#pd").value, reason = view.querySelector("#rs").value.trim(), files = [...view.querySelector("#imgs").files];
      let n = 0;
      for (const id of sel()) {
        const e = team.find((x) => x.name === id), amount = amountOf(id);
        try {
          const d = await asUserOrAdmin((A) => A.insert("Additional Salary", { employee: id, company: e.company, salary_component: st.comp, amount, payroll_date: date, overwrite_salary_structure_amount: 0, docstatus: 1 }));
          for (const f of files) await asUserOrAdmin((A) => A.upload(f, { doctype: "Additional Salary", docname: d.name }));
          if (reason) await comment("Additional Salary", d.name, reason);
          await Notify.send(e.user_id, `${st.comp === C.reward ? "اتضافلك مكافأة" : "اتسجل عليك خصم"} ${UI.money(amount)}${reason ? " — " + reason : ""}`, "Additional Salary", d.name);
          n++;
        } catch (x) { toast(`${e.employee_name}: ${x.message}`, "bad"); }
      }
      toast(`اتسجلت لـ ${UI.num(n)} موظف`, "ok"); App.route();
    };
  };
})();
