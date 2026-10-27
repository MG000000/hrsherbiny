// الشاشات: الإجازات، الطلبات، المكافآت والخصومات، المهام
(function () {
  const { esc, icon, toast } = UI;
  const S = SCHEMA;
  const opt = (v, t, sel) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(t ?? v)}</option>`;
  const LEAVE_AR = { "Casual Leave": "إجازة عارضة", "Sick Leave": "إجازة مرضية", "Annual Leave": "إجازة سنوية", "Leave Without Pay": "إجازة بدون مرتب", "Compensatory Off": "بدل راحة", "Privilege Leave": "إجازة اعتيادية" };
  const lt = (n) => LEAVE_AR[n] || n;

  async function attachFiles(files, doctype, docname) {
    for (const f of files) await API.upload(f, { doctype, docname });
  }
  async function thumbsHTML(doctype, name) {
    const files = await API.attachments(doctype, name).catch(() => []);
    if (!files.length) return "";
    const urls = await Promise.all(files.filter((f) => /\.(png|jpe?g|webp|gif|heic)$/i.test(f.file_name || f.file_url) || /^data:image/.test(f.file_url)).map((f) => API.fileBlobUrl(f.file_url).catch(() => null)));
    return `<div class="thumbs">${urls.filter(Boolean).map((u) => `<img src="${esc(u)}" alt="">`).join("")}</div>`;
  }
  function wireThumbs(el) { el.querySelectorAll(".thumbs img").forEach((i) => i.onclick = () => UI.viewImage(i.src)); }

  // ================= الإجازات =================
  Views.leave = async function (view) {
    const me = Session.employee;
    if (!me) { view.innerHTML = `${pageHead("الإجازات")}<div class="empty">حسابك مش مربوط بموظف.</div>`; return; }
    const [types, reasons, mine] = await Promise.all([
      Data.leaveTypes(), Data.reasons(),
      API.list("Leave Application", { fields: ["name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "custom_reason", "custom_deduct_days", "description"], filters: [["employee", "=", me.name]], order_by: "creation desc", limit: 30 }),
    ]);
    const t = UI.today();
    view.innerHTML = `${pageHead("الإجازات")}
      <div class="grid grid-2">
        <div class="card"><h2>طلب إجازة جديد</h2>
          <form id="lf">
            <div class="field"><label>نوع الإجازة</label><select class="input" name="leave_type" required>${types.map((x) => opt(x.name, lt(x.name))).join("")}</select></div>
            <div class="grid grid-2" style="gap:10px">
              <div class="field"><label>من</label><input class="input" type="date" name="from_date" value="${t}" required></div>
              <div class="field"><label>إلى</label><input class="input" type="date" name="to_date" value="${t}" required></div>
            </div>
            <div class="field"><label>السبب</label><select class="input" name="custom_reason" required><option value="">اختار السبب</option>${reasons.map((r) => opt(r.name)).join("")}</select>${reasons.length ? "" : '<span class="hint">مفيش أسباب متسجلة. المدير يضيفها من الإعدادات.</span>'}</div>
            <div class="field"><label>ملاحظات (اختياري)</label><textarea class="input" name="description"></textarea></div>
            <button class="btn primary block" type="submit">${icon("cal")} ابعت الطلب</button>
          </form>
        </div>
        <div><h2 style="margin:0 0 12px;font-size:17px">طلباتي</h2>
          ${mine.length ? `<div class="list">${mine.map((l) => `<div class="item"><div class="top"><span class="title">${esc(lt(l.leave_type))}</span>${UI.statusTag(l.status)}</div>
            <div class="meta">${UI.dateAr(l.from_date, { day: "numeric", month: "short" })}${l.to_date !== l.from_date ? " ← " + UI.dateAr(l.to_date, { day: "numeric", month: "short" }) : ""} · ${UI.num(l.total_leave_days || 1)} يوم${l.custom_reason ? " · " + esc(l.custom_reason) : ""}</div>
            ${l.status === "Approved" && Number(l.custom_deduct_days) ? `<div class="body"><span class="tag bad">خصم ${UI.num(l.custom_deduct_days)} يوم</span></div>` : ""}</div>`).join("")}</div>` : '<div class="empty">مفيش طلبات</div>'}
        </div>
      </div>`;
    view.querySelector("#lf").onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.to_date < f.from_date) return toast("تاريخ النهاية قبل البداية", "bad");
      const b = e.target.querySelector("button"); b.disabled = true;
      try {
        const emp = (await Data.employee(me.name)) || me;
        const approver = await Data.approverFor(emp);
        const doc = await API.insert("Leave Application", { ...f, employee: emp.name, company: emp.company, leave_approver: approver, status: "Open", posting_date: UI.today() });
        await Notify.send(approver, `${emp.employee_name} طالب ${lt(f.leave_type)} من ${f.from_date} إلى ${f.to_date} (${f.custom_reason})`, "Leave Application", doc.name);
        toast("الطلب اتبعت للمدير", "ok");
        App.route();
      } catch (x) { toast(x.message, "bad"); b.disabled = false; }
    };
  };

  // ================= الطلبات (للمدير) =================
  Views.requests = async function (view) {
    let tab = "pending";
    const draw = async () => {
      const team = await Data.team();
      const teamSet = new Set(team.map((e) => e.name));
      const myEmp = Session.employee && Session.employee.name;
      const mine = (r, ap) => (Session.isAdmin || r[ap] === Session.user || teamSet.has(r.employee)) && r.employee !== myEmp;
      const pend = tab === "pending";
      const [att, lv] = await Promise.all([
        API.list(S.REQUEST, { fields: ["*"], filters: pend ? [["status", "=", "Pending"]] : [["status", "!=", "Pending"]], order_by: "creation desc", limit: pend ? 0 : 50 }).catch(() => []),
        API.list("Leave Application", { fields: ["*"], filters: pend ? [["status", "=", "Open"], ["docstatus", "=", 0]] : [["status", "in", ["Approved", "Rejected"]]], order_by: "creation desc", limit: pend ? 0 : 50 }).catch(() => []),
      ]);
      const A = att.filter((r) => mine(r, "approver")), L = lv.filter((r) => mine(r, "leave_approver"));
      const items = [
        ...A.map((r) => ({ kind: "att", r, at: r.creation })),
        ...L.map((r) => ({ kind: "leave", r, at: r.creation })),
      ].sort((a, b) => (a.at < b.at ? 1 : -1));

      const card = ({ kind, r }) => kind === "att" ? `<div class="item" data-kind="att" data-n="${esc(r.name)}">
          <div class="top"><span class="title">${esc(r.employee_name)}</span>${UI.statusTag(r.status)}</div>
          <div class="meta"><span class="tag warn">${esc(UI.REQ_TYPE[r.request_type] || r.request_type)}</span> ${r.log_type === "IN" ? "حضور" : "انصراف"} الساعة ${UI.hm(r.request_time)} · ${UI.dateAr(String(r.request_time).slice(0, 10), { day: "numeric", month: "short" })}${Number(r.minutes) ? ` · ${UI.mins(r.minutes)}` : ""}${r.shift ? ` · ${esc(r.shift)}` : ""}</div>
          ${r.manager_note ? `<div class="body">الرد: ${esc(r.manager_note)}</div>` : ""}
          ${pend ? `<div class="actions"><button class="btn ok sm" data-a="ok">${icon("check")} قبول</button><button class="btn bad sm" data-a="no">${icon("x")} رفض</button></div>` : ""}</div>`
        : `<div class="item" data-kind="leave" data-n="${esc(r.name)}">
          <div class="top"><span class="title">${esc(r.employee_name)}</span>${UI.statusTag(r.status)}</div>
          <div class="meta"><span class="tag info">${esc(lt(r.leave_type))}</span> ${UI.dateAr(r.from_date, { day: "numeric", month: "short" })}${r.to_date !== r.from_date ? " ← " + UI.dateAr(r.to_date, { day: "numeric", month: "short" }) : ""} · ${UI.num(r.total_leave_days || 1)} يوم${r.custom_reason ? " · السبب: " + esc(r.custom_reason) : ""}</div>
          ${r.description ? `<div class="body">${esc(r.description)}</div>` : ""}
          ${!pend && r.status === "Approved" ? `<div class="body"><span class="tag ${Number(r.custom_deduct_days) ? "bad" : "mute"}">خصم ${UI.num(r.custom_deduct_days || 0)} يوم</span></div>` : ""}
          ${pend ? `<div class="actions"><button class="btn ok sm" data-a="ok">${icon("check")} قبول</button><button class="btn bad sm" data-a="no">${icon("x")} رفض</button></div>` : ""}</div>`;

      view.innerHTML = `${pageHead("الطلبات", "طلبات البصمة والإجازات")}
        <div class="toolbar"><div class="seg"><button data-t="pending" class="${pend ? "on" : ""}">في الانتظار <span class="n">${pend ? UI.num(items.length) : ""}</span></button><button data-t="done" class="${!pend ? "on" : ""}">اتردّ عليها</button></div></div>
        ${items.length ? `<div class="list">${items.map(card).join("")}</div>` : `<div class="empty">${pend ? "مفيش طلبات مستنية ردّك" : "مفيش"}</div>`}`;
      view.querySelectorAll(".seg button").forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
      view.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => {
        const it = b.closest(".item");
        const r = (it.dataset.kind === "att" ? A : L).find((x) => x.name === it.dataset.n);
        (it.dataset.kind === "att" ? decideAttendance : decideLeave)(r, b.dataset.a === "ok", draw);
      });
    };
    await draw();
  };

  async function userOf(employee) { const e = await Data.employee(employee); return e && e.user_id; }

  function decideAttendance(r, approve, done) {
    const m = UI.modal({
      title: approve ? "قبول الطلب" : "رفض الطلب",
      body: `<p style="margin-top:0">${esc(r.employee_name)}: ${esc(UI.REQ_TYPE[r.request_type])} الساعة ${UI.hm(r.request_time)}</p>
        <div class="field"><label>رد للموظف (اختياري)</label><textarea class="input" id="note"></textarea></div>`,
      footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn ${approve ? "ok" : "bad"}" id="do">${approve ? "قبول" : "رفض"}</button>`,
    });
    m.el.querySelector("#do").onclick = async (e) => {
      e.target.disabled = true;
      const note = m.el.querySelector("#note").value.trim();
      try {
        const patch = { status: approve ? "Approved" : "Rejected", manager_note: note };
        if (approve) {
          const ck = await API.insert("Employee Checkin", { employee: r.employee, log_type: r.log_type, time: r.request_time, device_id: "web-app (approved)", latitude: r.latitude, longitude: r.longitude });
          patch.checkin = ck.name;
        }
        await API.update(S.REQUEST, r.name, patch);
        await Notify.send(await userOf(r.employee), `طلب ${UI.REQ_TYPE[r.request_type]} الساعة ${UI.hm(r.request_time)} ${approve ? "اتقبل ✓" : "اترفض ✗"}${note ? " — " + note : ""}`, S.REQUEST, r.name);
        toast(approve ? "اتقبل واتسجلت البصمة" : "اترفض", "ok");
        m.close(); done();
      } catch (x) { toast(x.message, "bad"); e.target.disabled = false; }
    };
  }

  function decideLeave(r, approve, done) {
    const days = Number(r.total_leave_days) || 1;
    const m = UI.modal({
      title: approve ? "قبول الإجازة" : "رفض الإجازة",
      body: `<p style="margin-top:0">${esc(r.employee_name)}: ${esc(lt(r.leave_type))} ${UI.num(days)} يوم (${esc(r.custom_reason || "")})</p>
        ${approve ? `<div class="field"><label>هتتحسب بخصم كام يوم؟</label><input class="input" type="number" id="dd" min="0" step="0.5" value="${r.leave_type === "Leave Without Pay" ? days : 0}"><span class="hint">0 = من غير خصم من المرتب</span></div>` : ""}
        <div class="field"><label>رد للموظف (اختياري)</label><textarea class="input" id="note"></textarea></div>`,
      footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn ${approve ? "ok" : "bad"}" id="do">${approve ? "قبول" : "رفض"}</button>`,
    });
    m.el.querySelector("#do").onclick = async (e) => {
      e.target.disabled = true;
      const note = m.el.querySelector("#note").value.trim();
      const dd = approve ? Number(m.el.querySelector("#dd").value) || 0 : 0;
      try {
        await API.update("Leave Application", r.name, { status: approve ? "Approved" : "Rejected", custom_deduct_days: dd });
        let warn = "";
        try { await API.submit("Leave Application", r.name); }
        catch (x) { warn = x.message; }
        await Notify.send(await userOf(r.employee), `طلب ${lt(r.leave_type)} من ${r.from_date} ${approve ? `اتقبل ✓${dd ? ` بخصم ${dd} يوم` : " من غير خصم"}` : "اترفض ✗"}${note ? " — " + note : ""}`, "Leave Application", r.name);
        toast(approve ? "الإجازة اتقبلت" : "الإجازة اترفضت", "ok");
        if (warn) toast("ERPNext ما قبلش يعتمد المستند نهائيًا (Submit): " + warn, "bad");
        m.close(); done();
      } catch (x) { toast(x.message, "bad"); e.target.disabled = false; }
    };
  }

  // ================= المكافآت والخصومات =================
  Views.rewards = async function (view) {
    const canGive = Session.canReward;
    const me = Session.employee;
    const recent = await API.list(S.REWARD, {
      fields: ["*"], order_by: "creation desc", limit: 40,
      filters: canGive ? (Session.isAdmin ? [] : [["created_by_user", "=", Session.user]]) : [["employee", "=", me ? me.name : "-"]],
    }).catch(() => []);
    const list = recent.length ? `<div class="list">${recent.map((x) => `<div class="item" data-n="${esc(x.name)}"><div class="top"><span class="title">${esc(x.employee_name)}</span><span class="tag ${x.entry_type === "Reward" ? "ok" : "bad"}">${x.entry_type === "Reward" ? "مكافأة" : "خصم"} ${UI.money(x.amount)}</span></div>
      <div class="meta">${UI.dateAr(x.date, { day: "numeric", month: "short", year: "numeric" })}${x.calc_type === "Percent" ? ` · ${UI.num(x.value)}% من الأساسي` : ""}</div>${x.reason ? `<div class="body">${esc(x.reason)}</div>` : ""}<div class="th"></div></div>`).join("")}</div>` : '<div class="empty">مفيش لسه</div>';

    if (!canGive) {
      view.innerHTML = `${pageHead("مكافآتي وخصوماتي")}${list}`;
    } else {
      const team = (await Data.team()).filter((e) => Session.isAdmin || e.name !== (me && me.name));
      view.innerHTML = `${pageHead("المكافآت والخصومات")}
        <div class="grid grid-2">
          <div class="card"><h2>إضافة جديدة</h2>
            <div class="field"><label>النوع</label><div class="seg" id="et"><button data-v="Reward" class="on">مكافأة</button><button data-v="Deduction">خصم</button></div></div>
            <div class="field"><label>طريقة الحساب</label><div class="seg" id="ct"><button data-v="Fixed" class="on">مبلغ ثابت</button><button data-v="Percent">نسبة من الأساسي %</button></div></div>
            <div class="grid grid-2" style="gap:10px">
              <div class="field"><label id="vl">المبلغ</label><input class="input" type="number" id="val" min="0" step="0.01"></div>
              <div class="field"><label>التاريخ</label><input class="input" type="date" id="dt" value="${UI.today()}"></div>
            </div>
            <div class="field"><label>السبب</label><textarea class="input" id="rs"></textarea></div>
            <div class="field"><label>صور (اختياري)</label><input class="input" type="file" id="imgs" accept="image/*" multiple></div>
            <div class="field"><label>الموظفين <span class="hint" id="cnt"></span></label>
              <input class="input" id="fq" placeholder="ابحث..." style="margin-bottom:6px">
              <div class="pick-list" id="pl"><label><input type="checkbox" id="all"> <strong>تحديد الكل</strong></label>${team.map((e) => `<label data-s="${esc((e.employee_name + " " + e.name).toLowerCase())}"><input type="checkbox" value="${esc(e.name)}"> ${esc(e.employee_name)} <span class="hint">${esc(e.designation || "")}</span></label>`).join("")}</div>
            </div>
            <div id="prev"></div>
            <button class="btn primary block" id="save" disabled>حفظ</button>
          </div>
          <div><h2 style="margin:0 0 12px;font-size:17px">آخر الإضافات</h2>${list}</div>
        </div>`;

      const st = { entry_type: "Reward", calc_type: "Fixed", overrides: {} };
      const seg = (id, key) => view.querySelectorAll(`#${id} button`).forEach((b) => b.onclick = () => { st[key] = b.dataset.v; view.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b)); st.overrides = {}; preview(); });
      seg("et", "entry_type"); seg("ct", "calc_type");
      const sel = () => [...view.querySelectorAll('#pl input[value]:checked')].map((i) => i.value);
      const preview = () => {
        view.querySelector("#vl").textContent = st.calc_type === "Percent" ? "النسبة %" : "المبلغ";
        const ids = sel(), v = view.querySelector("#val").value;
        view.querySelector("#cnt").textContent = ids.length ? `(${UI.num(ids.length)} محدد)` : "";
        view.querySelector("#save").disabled = !ids.length || !v;
        if (!ids.length || !v) { view.querySelector("#prev").innerHTML = ""; return; }
        const rows = ids.map((id) => { const e = team.find((x) => x.name === id); return { e, amt: st.overrides[id] ?? Calc.rewardAmount(e, st.calc_type, v) }; });
        const total = rows.reduce((s, r) => s + Number(r.amt || 0), 0);
        view.querySelector("#prev").innerHTML = `<div class="field"><label>المبالغ (تقدر تعدّل أي مبلغ)</label><div class="table-wrap"><table><thead><tr><th>الموظف</th>${st.calc_type === "Percent" ? '<th class="num">الأساسي</th>' : ""}<th class="num">المبلغ</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td>${esc(r.e.employee_name)}</td>${st.calc_type === "Percent" ? `<td class="num">${UI.money(r.e.custom_monthly_salary)}</td>` : ""}<td class="num"><input class="input" type="number" step="0.01" data-o="${esc(r.e.name)}" value="${r.amt}" style="width:120px;padding:6px 8px"></td></tr>`).join("")}
          <tr><td><strong>الإجمالي</strong></td>${st.calc_type === "Percent" ? "<td></td>" : ""}<td class="num"><strong>${UI.money(total)}</strong></td></tr></tbody></table></div></div>`;
        view.querySelectorAll("[data-o]").forEach((i) => i.onchange = () => { st.overrides[i.dataset.o] = Number(i.value) || 0; setTimeout(preview, 0); });
      };
      view.querySelector("#val").oninput = () => { st.overrides = {}; preview(); };
      view.querySelector("#pl").onchange = (e) => {
        if (e.target.id === "all") view.querySelectorAll('#pl label:not(.hidden) input[value]').forEach((i) => i.checked = e.target.checked);
        preview();
      };
      view.querySelector("#fq").oninput = (e) => { const q = e.target.value.toLowerCase(); view.querySelectorAll("#pl label[data-s]").forEach((l) => l.classList.toggle("hidden", !!q && !l.dataset.s.includes(q))); };
      view.querySelector("#save").onclick = async (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span> بيحفظ...';
        const v = Number(view.querySelector("#val").value), date = view.querySelector("#dt").value, reason = view.querySelector("#rs").value.trim();
        const files = [...view.querySelector("#imgs").files];
        let ok = 0;
        for (const id of sel()) {
          const e = team.find((x) => x.name === id);
          const amount = st.overrides[id] ?? Calc.rewardAmount(e, st.calc_type, v);
          try {
            const doc = await API.insert(S.REWARD, { employee: e.name, employee_name: e.employee_name, entry_type: st.entry_type, calc_type: st.calc_type, value: v, amount, date, reason, created_by_user: Session.user });
            await attachFiles(files, S.REWARD, doc.name);
            await Notify.send(e.user_id, `${st.entry_type === "Reward" ? "اتضافلك مكافأة" : "اتسجل عليك خصم"} ${UI.money(amount)}${reason ? " — " + reason : ""}`, S.REWARD, doc.name);
            ok++;
          } catch (x) { toast(`${e.employee_name}: ${x.message}`, "bad"); }
        }
        toast(`اتحفظ لـ ${UI.num(ok)} موظف`, "ok");
        App.route();
      };
    }
    // صور المرفقات
    view.querySelectorAll(".item[data-n]").forEach(async (it) => { it.querySelector(".th").innerHTML = await thumbsHTML(S.REWARD, it.dataset.n); wireThumbs(it); });
  };

  // ================= المهام =================
  Views.tasks = async function (view) {
    let tab = "mine";
    const isMgr = await Data.isManager();
    const draw = async () => {
      const filters = tab === "mine" ? [["allocated_to", "=", Session.user], ["status", "=", "Open"]]
        : tab === "done" ? [["allocated_to", "=", Session.user], ["status", "=", "Closed"]]
        : [["assigned_by", "=", Session.user], ["allocated_to", "!=", Session.user]];
      const rows = await API.list("ToDo", { fields: ["name", "description", "status", "date", "allocated_to", "assigned_by", "priority", "creation"], filters, order_by: "creation desc", limit: 60 });
      const emps = await Data.employees();
      const nameOf = (u) => (emps.find((e) => e.user_id === u) || {}).employee_name || u;
      const prio = { High: ["عاجلة", "bad"], Medium: ["عادية", "mute"], Low: ["مش مستعجلة", "mute"] };
      view.innerHTML = `${pageHead("المهام", "", isMgr ? `<button class="btn primary sm" id="new">${icon("plus")} مهمة جديدة</button>` : "")}
        <div class="toolbar"><div class="seg">
          <button data-t="mine" class="${tab === "mine" ? "on" : ""}">مهامي</button>
          <button data-t="done" class="${tab === "done" ? "on" : ""}">خلصتها</button>
          ${isMgr ? `<button data-t="sent" class="${tab === "sent" ? "on" : ""}">اللي بعتها</button>` : ""}
        </div></div>
        ${rows.length ? `<div class="list">${rows.map((r) => `<div class="item" data-n="${esc(r.name)}">
          <div class="top"><span class="title">${esc(String(r.description || "").replace(/<[^>]+>/g, " ").trim())}</span>${r.status === "Closed" ? '<span class="tag ok">تم</span>' : `<span class="tag ${(prio[r.priority] || prio.Medium)[1]}">${(prio[r.priority] || prio.Medium)[0]}</span>`}</div>
          <div class="meta">${tab === "sent" ? "لـ " + esc(nameOf(r.allocated_to)) : "من " + esc(nameOf(r.assigned_by))}${r.date ? " · الميعاد " + UI.dateAr(r.date, { day: "numeric", month: "short" }) : ""}</div>
          <div class="th"></div>
          ${tab === "mine" ? `<div class="actions"><button class="btn ok sm" data-done>${icon("check")} تم</button></div>` : ""}</div>`).join("")}</div>` : `<div class="empty">${tab === "mine" ? "مفيش مهام مفتوحة" : "مفيش"}</div>`}`;
      view.querySelectorAll(".seg button").forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
      const nb = view.querySelector("#new"); if (nb) nb.onclick = () => newTask(draw);
      view.querySelectorAll("[data-done]").forEach((b) => b.onclick = () => { const it = b.closest(".item"); finishTask(rows.find((r) => r.name === it.dataset.n), draw); });
      if (tab !== "mine") view.querySelectorAll(".item[data-n]").forEach(async (it) => { it.querySelector(".th").innerHTML = await thumbsHTML("ToDo", it.dataset.n); wireThumbs(it); });
    };
    await draw();
  };

  function finishTask(r, done) {
    const m = UI.modal({
      title: "تعليم المهمة إنها تمت",
      body: `<p style="margin-top:0">${esc(String(r.description || "").replace(/<[^>]+>/g, " "))}</p><div class="field"><label>صورة (اختياري)</label><input class="input" type="file" id="img" accept="image/*" capture="environment" multiple></div>`,
      footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn ok" id="do">${icon("check")} تم</button>`,
    });
    m.el.querySelector("#do").onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await attachFiles([...m.el.querySelector("#img").files], "ToDo", r.name);
        await API.update("ToDo", r.name, { status: "Closed" });
        await Notify.send(r.assigned_by, `${Session.full_name} خلّص المهمة: ${String(r.description || "").replace(/<[^>]+>/g, " ").slice(0, 80)}`, "ToDo", r.name);
        toast("برافو، اتعلّمت إنها تمت", "ok"); m.close(); done();
      } catch (x) { toast(x.message, "bad"); btn.disabled = false; }
    };
  }

  async function newTask(done) {
    const team = (await Data.team()).filter((e) => e.user_id);
    const m = UI.modal({
      title: "مهمة جديدة",
      body: `<div class="field"><label>المهمة</label><textarea class="input" id="ds" required></textarea></div>
        <div class="grid grid-2" style="gap:10px"><div class="field"><label>الميعاد</label><input class="input" type="date" id="dt" value="${UI.today()}"></div>
        <div class="field"><label>الأولوية</label><select class="input" id="pr">${opt("Medium", "عادية")}${opt("High", "عاجلة")}${opt("Low", "مش مستعجلة")}</select></div></div>
        <div class="field"><label>لمين؟</label><div class="pick-list">${team.map((e) => `<label><input type="checkbox" value="${esc(e.user_id)}"> ${esc(e.employee_name)}</label>`).join("")}</div></div>`,
      footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn primary" id="do">ابعت</button>`,
    });
    m.el.querySelector("#do").onclick = async (e) => {
      const ds = m.el.querySelector("#ds").value.trim();
      const users = [...m.el.querySelectorAll(".pick-list input:checked")].map((i) => i.value);
      if (!ds || !users.length) return toast("اكتب المهمة واختار موظف واحد على الأقل", "bad");
      e.currentTarget.disabled = true;
      for (const u of users) {
        try {
          const t = await API.insert("ToDo", { allocated_to: u, description: ds, date: m.el.querySelector("#dt").value, priority: m.el.querySelector("#pr").value, status: "Open", assigned_by: Session.user });
          await Notify.send(u, `عندك مهمة جديدة: ${ds.slice(0, 80)}`, "ToDo", t.name);
        } catch (x) { toast(x.message, "bad"); }
      }
      toast("المهمة اتبعتت", "ok"); m.close(); done();
    };
  }
})();
