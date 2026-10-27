// الدخول، الرئيسية، الحضور اليومي، البصمة
window.Views = window.Views || {};
(function () {
  const { esc, icon, toast } = UI;
  const valid = (c) => !String(c.device_id || "").startsWith("app-rejected");
  window.validCheckin = valid;
  const timeParts = (d = new Date()) => {
    const s = d.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
    const m = s.match(/^(.*?)\s*([صم])$/);
    return m ? [m[1], m[2] === "ص" ? "صباحًا" : "مساءً"] : [s, ""];
  };

  // ================= الدخول =================
  Views.login = function (root) {
    const demo = API.isDemo();
    root.innerHTML = `<div class="login">
      <div class="logo">${icon("finger")}</div>
      <h1>${esc(CONFIG.APP_NAME)}</h1>
      <p class="lead">ادخل بحسابك على ERPNext</p>
      <form id="lf" class="form">
        <div class="field"><label for="u">الإيميل أو اسم اليوزر</label><input class="input" id="u" autocomplete="username" autocapitalize="off" spellcheck="false" dir="ltr" required value="${demo ? "admin@demo.com" : ""}"></div>
        <div class="field"><label for="p">الباسورد</label><input class="input" id="p" type="password" autocomplete="current-password" dir="ltr" required value="${demo ? "demo" : ""}"></div>
        <button class="btn primary block lg" type="submit">دخول</button>
      </form>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="demo" ${demo ? "checked" : ""}> تجربة ببيانات وهمية</label>
      ${demo ? `<div class="note">الباسورد <b>demo</b> لكل الحسابات:<br><span dir="ltr">admin@demo.com</span> مدير موارد بشرية، <span dir="ltr">mona@demo.com</span> HR User وبتوافق على الطلبات، <span dir="ltr">sara@demo.com</span> موظفة</div>` : ""}
      <div id="err"></div></div>`;
    root.querySelector("#demo").onchange = (e) => { API.setDemo(e.target.checked); Data.clear(); Views.login(root); };
    root.querySelector("#lf").onsubmit = async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button"); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
      const raw = root.querySelector("#u").value.trim();
      const usr = raw.includes("@") ? raw.toLowerCase() : raw;
      try {
        const u = await API.login(usr, root.querySelector("#p").value);
        const emp = (await API.list("Employee", { fields: ["*"], filters: [["user_id", "=", u.user]], limit: 1 }).catch(() => []))[0] || null;
        Object.assign(Session, { user: u.user, full_name: emp ? emp.employee_name : u.full_name, roles: u.roles, employee: emp });
        Session.save(); Data.clear(); location.hash = "#/home"; App.start();
      } catch (x) {
        root.querySelector("#err").innerHTML = `<div class="note bad">${esc(x.message)}</div>`;
        b.disabled = false; b.textContent = "دخول";
      }
    };
  };

  // ================= الرئيسية =================
  async function myToday() {
    const me = Session.employee;
    if (!me) return null;
    const d = UI.today();
    const [types, asg, logs] = await Promise.all([
      Data.shiftTypes(), Data.assignments(d, d, me.name),
      API.list("Employee Checkin", { fields: ["log_type", "time", "device_id"], filters: [["employee", "=", me.name], ["time", ">=", d + " 00:00:00"]], order_by: "time asc" }).catch(() => []),
    ]);
    const emp = (await Data.employee(me.name).catch(() => null)) || me;
    const shifts = Data.shiftsOn(emp, d, asg, types);
    return { emp, shifts, logs: logs.filter(valid), types };
  }
  window.myToday = myToday;

  Views.home = async function (view) {
    const t = await myToday();
    const h = new Date().getHours();
    const first = String(Session.full_name || "").split(" ")[0];
    let dial = "";
    if (t) {
      const shift = t.shifts[0] && t.shifts[0].shift;
      const ins = t.logs.filter((l) => l.log_type === "IN"), outs = t.logs.filter((l) => l.log_type === "OUT");
      const last = t.logs[t.logs.length - 1];
      const pending = t.logs.some((l) => String(l.device_id || "").startsWith("app-pending"));
      let p = 0;
      if (shift) { const b = Calc.bounds(shift); const nowM = Calc.dtMin(UI.nowDT()); p = Math.max(0, Math.min(1, (nowM - b.start) / b.length)); }
      const C = 2 * Math.PI * 86;
      const state = !last ? '<span class="tag mute">لسه ما بصمتش</span>'
        : pending ? '<span class="tag warn">بصمتك مستنية موافقة</span>'
        : last.log_type === "IN" ? `<span class="tag ok">حاضر من ${UI.hm(last.time)}</span>` : `<span class="tag bad">انصرفت ${UI.hm(last.time)}</span>`;
      const [tm, ap] = timeParts();
      dial = `<section class="dial">
        <p class="greet">${h < 12 ? "صباح الخير" : "مساء الخير"} يا ${esc(first)}</p>
        <div class="ring" role="img" aria-label="${shift ? `اتقضى ${Math.round(p * 100)}% من الشيفت` : "مفيش شيفت النهارده"}">
          <svg viewBox="0 0 200 200"><circle class="track" cx="100" cy="100" r="86"/><circle class="done" cx="100" cy="100" r="86" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}"/></svg>
          <div class="center"><div class="clock" id="hclk">${tm}</div><div class="hint">${ap}</div>
            <div class="shiftname">${shift ? `${esc(shift.name)}، ${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}` : "مفيش شيفت متعيّن لك النهارده"}</div>
            <div class="state">${state}</div></div>
        </div>
        <div class="cta"><a class="btn primary block lg" href="#/punch">${icon("finger")} ${last && last.log_type === "IN" ? "بصمة انصراف" : "بصمة حضور"}</a></div>
        <div class="times"><div><b>${ins[0] ? UI.hm(ins[0].time) : "—"}</b><span>حضور</span></div><div><b>${outs.length ? UI.hm(outs[outs.length - 1].time) : "—"}</b><span>انصراف</span></div></div>
      </section>`;
    } else {
      dial = `<section class="dial"><p class="greet">أهلًا يا ${esc(first)}</p><div class="note warn">حسابك مش مربوط بموظف على ERPNext، فمش هتقدر تبصم. اطلب من الموارد البشرية يحطوا إيميلك في خانة User ID في ملفك.</div></section>`;
    }

    let strip = "";
    if (Session.isHR || (await Data.team()).length) {
      const [b, pend] = await Promise.all([boardData().catch(() => null), countPending()]);
      if (b) strip = `<a class="today-strip" href="#/board"><div class="in"><b>${UI.num(b.present.length)}</b><span>حاضر</span></div><div class="out"><b>${UI.num(b.absent.length)}</b><span>غايب</span></div><div class="late"><b>${UI.num(b.late)}</b><span>متأخر</span></div><div class="pend"><b>${UI.num(pend)}</b><span>طلب مستني</span></div></a>`;
    }

    const row = (href, ic, cls, t, s) => `<a class="row-item" href="${href}"><span class="ri-ic ${cls}">${icon(ic)}</span><span class="ri-main"><span class="ri-t">${t}</span><span class="ri-s">${s}</span></span><span class="chev">${icon("chev")}</span></a>`;
    view.innerHTML = `${dial}${strip}
      <h2 class="sec">اختصارات</h2>
      <div class="group">
        ${Session.isHR || strip ? row("#/board", "users", "in", "الحضور والانصراف النهارده", "مين حاضر ومين غايب") : ""}
        ${Session.isAdmin ? row("#/assign", "swap", "", "تعيين الشيفتات", "وزّع الموظفين على الشيفتات والفروع") : ""}
        ${t ? row("#/mine", "cal", "", "طلب إجازة", "واعرف حالة طلباتك") : ""}
        ${row("#/report", "report", "late", "تقرير البصمة", Session.isHR ? "تأخير وأوفر تايم كل الموظفين" : "تأخيرك وأوفر تايمك الشهر ده")}
      </div>`;
    const clk = view.querySelector("#hclk");
    if (clk) { const iv = setInterval(() => { if (!document.body.contains(clk)) return clearInterval(iv); clk.textContent = timeParts()[0]; }, 15000); }
  };

  async function countPending() {
    try {
      const p = await pendingRequests();
      return p.att.length + p.shift.length + p.leave.length;
    } catch (e) { return 0; }
  }

  // الطلبات المستنية: البصمات اللي محتاجة موافقة بتتعرف من device_id في Employee Checkin
  async function pendingRequests() {
    const team = new Set((await Data.team()).map((e) => e.name));
    const ok = (emp) => team.has(emp);
    const out = { att: [], shift: [], leave: [] };
    if (Session.isHR) {
      const cks = await API.list("Employee Checkin", { fields: ["name", "employee", "employee_name", "log_type", "time", "device_id", "latitude", "longitude"], filters: [["device_id", "like", "app-pending:AR:%"]] }).catch(() => []);
      out.att = cks.filter((c) => ok(c.employee)).map((c) => ({ ...c, request: c.device_id.split(":")[2] }));
    }
    if (Session.isShiftApprover) {
      const sr = await API.list("Shift Request", { fields: ["*"], filters: [["docstatus", "=", 0], ["status", "=", "Draft"]] }).catch(() => []);
      out.shift = sr.filter((r) => Session.isHR ? ok(r.employee) : r.approver === Session.user);
    }
    if (Session.isLeaveApprover) {
      const lv = await API.list("Leave Application", { fields: ["*"], filters: [["docstatus", "=", 0], ["status", "=", "Open"]] }).catch(() => []);
      out.leave = lv.filter((r) => Session.isHR ? ok(r.employee) : r.leave_approver === Session.user);
    }
    const me = Session.employee && Session.employee.name;
    ["att", "shift", "leave"].forEach((k) => (out[k] = out[k].filter((r) => r.employee !== me || Session.isAdmin)));
    return out;
  }
  window.pendingRequests = pendingRequests;

  // ================= الحضور اليومي =================
  async function boardData() {
    const d = UI.today();
    const [team, types, asg, logs, leaves] = await Promise.all([
      Data.team(), Data.shiftTypes(), Data.assignments(d, d),
      API.list("Employee Checkin", { fields: ["employee", "log_type", "time", "device_id"], filters: [["time", ">=", d + " 00:00:00"], ["time", "<=", d + " 23:59:59"]], order_by: "time asc" }),
      API.list("Leave Application", { fields: ["employee", "leave_type"], filters: [["status", "=", "Approved"], ["docstatus", "=", 1], ["from_date", "<=", d], ["to_date", ">=", d]] }).catch(() => []),
    ]);
    const by = {};
    logs.filter(valid).forEach((l) => (by[l.employee] = by[l.employee] || []).push(l));
    const rows = team.map((e) => {
      const L = by[e.name] || [];
      const sh = Data.shiftsOn(e, d, asg, types)[0];
      const st = L.length ? Calc.day(L, sh && sh.shift) : null;
      return { e, L, shift: sh && sh.shift, location: sh && sh.location, st, leave: leaves.find((l) => l.employee === e.name) };
    });
    const present = rows.filter((r) => r.st), absent = rows.filter((r) => !r.st);
    return { rows, present, absent, late: present.filter((r) => r.st.late > (Number(r.shift && r.shift.late_entry_grace_period) || 0)).length };
  }
  window.boardData = boardData;

  Views.board = async function (view) {
    let k = "absent", q = "";
    const b = await boardData();
    if (!b.rows.length) return deny(view, "الحضور والانصراف");
    const draw = () => {
      const list = (k === "absent" ? b.absent : k === "present" ? b.present : b.rows).filter((r) => !q || r.e.employee_name.includes(q));
      const item = (r) => {
        let tag;
        if (r.st) tag = r.st.pending ? '<span class="tag warn">مستني موافقة</span>' : r.st.late > (Number(r.shift && r.shift.late_entry_grace_period) || 0) ? `<span class="tag warn">متأخر ${UI.mins(r.st.late)}</span>` : '<span class="tag ok">حاضر</span>';
        else tag = r.leave ? `<span class="tag info">${esc(r.leave.leave_type)}</span>` : !r.shift ? '<span class="tag mute">مالوش شيفت</span>' : '<span class="tag bad">غايب</span>';
        return `<div class="row-item"><span class="avatar">${esc(UI.initials(r.e.employee_name))}</span><span class="ri-main"><span class="ri-t">${esc(r.e.employee_name)}</span><span class="ri-s">${esc(r.shift ? r.shift.name : "—")}${r.location ? "، " + esc(r.location) : ""}</span></span><span class="ri-end">${tag}${r.st ? `<div>${UI.hm(r.st.in)} ← ${UI.hm(r.st.out)}</div>` : ""}</span></div>`;
      };
      view.innerHTML = `${pageHead("الحضور والانصراف", UI.dateAr(new Date()))}
        <div class="seg"><button data-k="absent" class="${k === "absent" ? "on" : ""}">الغايبين <span class="n">${UI.num(b.absent.length)}</span></button><button data-k="present" class="${k === "present" ? "on" : ""}">الحاضرين <span class="n">${UI.num(b.present.length)}</span></button><button data-k="all" class="${k === "all" ? "on" : ""}">الكل <span class="n">${UI.num(b.rows.length)}</span></button></div>
        <div class="field"><input class="input" id="q" placeholder="ابحث بالاسم" value="${esc(q)}"></div>
        ${list.length ? `<div class="group">${list.map(item).join("")}</div>` : `<div class="empty">${k === "absent" ? "كل الناس حاضرة النهارده" : "مفيش حد"}</div>`}`;
      view.querySelectorAll(".seg button").forEach((x) => x.onclick = () => { k = x.dataset.k; draw(); });
      const qi = view.querySelector("#q");
      qi.oninput = () => { q = qi.value.trim(); clearTimeout(qi.t); qi.t = setTimeout(() => { draw(); const n = view.querySelector("#q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
    };
    draw();
  };

  // ================= البصمة =================
  Views.punch = async function (view) {
    const t = await myToday();
    if (!t) { view.innerHTML = `${pageHead("البصمة")}<div class="empty">حسابك مش مربوط بموظف على ERPNext.</div>`; return; }
    const { emp, shifts, logs, types } = t;
    const [locs, enrollment] = await Promise.all([Data.locations(), CONFIG.REQUIRE_FACE ? Face.loadEnrollment(emp.name) : null]);
    let enrolled = enrollment;
    const last = logs[logs.length - 1];
    const assigned = shifts.map((s) => s.shift.name);
    const st = { log: last && last.log_type === "IN" ? "OUT" : "IN", shift: assigned[0] || Object.keys(types)[0] || "", pos: null };

    const allowedLocs = () => {
      const names = shifts.filter((s) => s.shift.name === st.shift && s.location).map((s) => s.location);
      const pool = names.length ? names : shifts.map((s) => s.location).filter(Boolean);
      return [...new Set(pool)].map((n) => locs.find((l) => l.name === n)).filter(Boolean);
    };

    view.innerHTML = `${pageHead("البصمة", UI.dateAr(new Date()))}
      <div class="choice"><button data-t="IN">${icon("login")} حضور</button><button data-t="OUT">${icon("logout")} انصراف</button></div>
      <div class="form" style="margin-bottom:12px"><div class="field"><label for="sh">الشيفت</label>
        <select class="input" id="sh">${Object.values(types).map((s) => `<option value="${esc(s.name)}" ${s.name === st.shift ? "selected" : ""}>${esc(s.name)} (${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)})${assigned.includes(s.name) ? "، شيفتك" : ""}</option>`).join("")}</select>
        <span class="hint" id="shh"></span></div></div>
      <div class="group" id="steps">
        <div class="row-item check-step" id="s-loc"><span class="ri-ic">${icon("pin")}</span><span class="ri-main"><span class="ri-t">الموقع</span><span class="ri-s"></span></span></div>
        ${CONFIG.REQUIRE_FACE ? `<div class="row-item check-step" id="s-face"><span class="ri-ic">${icon("face")}</span><span class="ri-main"><span class="ri-t">بصمة الوجه</span><span class="ri-s">${enrollment ? "هتتقارن ببصمة وشك المتسجلة" : "أول مرة: هتسجّل بصمة وشك وتتحفظ"}</span></span></div>` : ""}
      </div>
      <div id="cam"></div>
      <div id="act" style="margin-top:14px"><button class="btn primary block lg" id="go">${icon("finger")} ابدأ البصمة</button></div>
      <h2 class="sec">بصماتك النهارده</h2>
      ${logs.length ? `<div class="group">${logs.map((l) => `<div class="row-item"><span class="ri-ic ${l.log_type === "IN" ? "in" : "out"}">${icon(l.log_type === "IN" ? "login" : "logout")}</span><span class="ri-main"><span class="ri-t">${l.log_type === "IN" ? "حضور" : "انصراف"}</span>${String(l.device_id || "").startsWith("app-pending") ? '<span class="ri-s">مستنية موافقة</span>' : ""}</span><span class="ri-end ri-big">${UI.hm(l.time)}</span></div>`).join("")}</div>` : '<div class="empty">لسه مفيش بصمات النهارده</div>'}`;

    const setChoice = () => view.querySelectorAll(".choice button").forEach((b) => b.classList.toggle("on", b.dataset.t === st.log));
    view.querySelectorAll(".choice button").forEach((b) => b.onclick = () => { st.log = b.dataset.t; setChoice(); });
    setChoice();
    const sh = view.querySelector("#sh"), shh = view.querySelector("#shh");
    const locText = () => { const l = allowedLocs(); view.querySelector("#s-loc .ri-s").textContent = l.length ? "لازم تكون في " + l.map((x) => x.location_name || x.name).join(" أو ") : "هيتسجل موقعك"; };
    const shiftHint = () => { shh.textContent = assigned.length && !assigned.includes(st.shift) ? "ده مش شيفتك، البصمة هتروح طلب تغيير شيفت للمدير." : !assigned.length ? "مفيش شيفت متعيّن لك، البصمة هتروح طلب للمدير." : ""; shh.style.color = "var(--late)"; };
    sh.onchange = () => { st.shift = sh.value; shiftHint(); locText(); };
    shiftHint(); locText();

    const step = (id, cls, text) => {
      const s = view.querySelector(id); if (!s) return;
      s.className = `row-item check-step ${cls}`;
      if (text !== undefined) s.querySelector(".ri-s").innerHTML = text;
      const ic = s.querySelector(".ri-ic");
      if (cls === "ok") ic.innerHTML = icon("check"); else if (cls === "bad") ic.innerHTML = icon("x"); else if (cls === "run") ic.innerHTML = '<span class="spin" style="width:18px;height:18px;border-width:2px"></span>';
    };
    const act = view.querySelector("#act");

    async function geo() {
      step("#s-loc", "run", "بيحدد موقعك...");
      const L = allowedLocs();
      let pos;
      try {
        pos = await new Promise((res, rej) => {
          if (!navigator.geolocation) return rej(new Error("المتصفح ده مش بيحدد الموقع"));
          navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), (e) => rej(new Error(e.code === 1 ? "اسمح للصفحة توصل لموقعك من إعدادات المتصفح" : "مش قادر أحدد موقعك، اطلع في مكان مفتوح وجرّب تاني")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        });
      } catch (e) {
        if (API.isDemo() && L[0]) pos = { lat: Number(L[0].latitude), lng: Number(L[0].longitude), acc: 5, sim: true };
        else { step("#s-loc", "bad", esc(e.message)); throw e; }
      }
      st.pos = pos;
      if (!L.length) { step("#s-loc", "ok", "اتسجل موقعك"); return; }
      const best = L.map((l) => ({ l, d: Calc.distance(pos.lat, pos.lng, Number(l.latitude), Number(l.longitude)), r: Number(l.checkin_radius) || 100 })).sort((a, b) => a.d - b.d)[0];
      if (best.d <= best.r + Math.min(pos.acc || 0, 50)) { step("#s-loc", "ok", `انت في ${esc(best.l.location_name || best.l.name)}`); return; }
      step("#s-loc", "bad", `انت على بُعد ${UI.num(Math.round(best.d))} متر من ${esc(best.l.location_name || best.l.name)}، والمسموح ${UI.num(best.r)} متر`);
      throw new Error("لازم تكون جوه الفرع عشان تبصم");
    }

    function face() {
      if (!CONFIG.REQUIRE_FACE) return Promise.resolve();
      return new Promise(async (resolve, reject) => {
        step("#s-face", "run", "بيفتح الكاميرا...");
        const box = view.querySelector("#cam");
        box.innerHTML = '<div class="cam"><video playsinline muted></video><div class="oval"></div></div>';
        const video = box.querySelector("video");
        try { await Face.startCamera(video); }
        catch (e) { box.innerHTML = ""; step("#s-face", "bad", "اسمح للصفحة توصل للكاميرا من إعدادات المتصفح"); return reject(new Error("الكاميرا مقفولة")); }
        const done = () => { Face.stop(); box.innerHTML = ""; resolve(); };
        const isNew = !enrolled;
        box.scrollIntoView({ behavior: "smooth", block: "start" });
        const fail = (msg) => { step("#s-face", "bad", esc(msg)); const n = act.querySelector(".fmsg"); if (n) n.textContent = msg; else act.insertAdjacentHTML("afterbegin", `<div class="note bad fmsg">${esc(msg)}</div>`); };
        step("#s-face", "run", isNew ? "بص للكاميرا مباشرة، في مكان منوّر، ودوس سجّل" : "خلي وشك جوه الدايرة ودوس تحقق");
        act.innerHTML = `${isNew ? '<div class="note">دي أول مرة تبصم. هناخد 3 لقطات لوشك ونحفظهم، وبعد كده كل بصمة هتتقارن بيهم. اثبت مكانك لحد ما تخلص.</div>' : ""}<button class="btn primary block lg" id="snap">${icon("face")} ${isNew ? "سجّل بصمة وشي" : "تحقق من الوجه"}</button>`;
        act.querySelector("#snap").onclick = async (ev) => {
          const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span>';
          try {
            if (isNew) {
              const r = await Face.enroll(emp, video, (i, n) => (b.innerHTML = `<span class="spin"></span> لقطة ${UI.num(i)} من ${UI.num(n)}`));
              if (r.ok) {
                enrolled = true;
                step("#s-face", "ok", "اتسجلت بصمة وشك");
                Notify.send(await Data.hrUsers(), `${emp.employee_name} سجّل بصمة وشه لأول مرة`, "Employee", emp.name);
                return done();
              }
              fail(r.reason);
            } else {
              const r = await Face.verify(emp, video, enrolled);
              if (r.ok) { step("#s-face", "ok", r.simulated ? "تمام (تجريبي)" : "الوش مطابق"); return done(); }
              fail(r.reason);
            }
          } catch (x) { fail(x.message); }
          b.disabled = false; b.innerHTML = `${icon("face")} جرّب تاني`;
        };
      });
    }

    function result(kind, title, text) {
      act.innerHTML = `<div class="result ${kind}"><div class="big">${icon(kind === "ok" ? "check" : "hourglass")}</div><h2>${esc(title)}</h2><p>${text}</p><a class="btn ghost block" href="#/home">الرئيسية</a></div>`;
      view.querySelector(".choice").style.pointerEvents = "none"; sh.disabled = true;
    }

    async function save() {
      act.innerHTML = loadingHTML;
      const now = UI.nowDT(), shift = types[st.shift];
      const need = Calc.needsApproval({ logType: st.log, nowMin: Calc.dtMin(now), shift, isAssigned: assigned.includes(st.shift) });
      const ck = { employee: emp.name, log_type: st.log, time: now, device_id: "app", latitude: st.pos && st.pos.lat, longitude: st.pos && st.pos.lng };
      const what = st.log === "IN" ? "حضور" : "انصراف";
      if (!need) {
        await API.insert("Employee Checkin", ck);
        return result("ok", `اتسجل ${what}ك`, `الساعة ${UI.hm(now)}`);
      }
      if (need.type === "shift") {
        const hr = await Data.hrUsers();
        const approver = emp.shift_request_approver || (await Data.managerUser(emp)) || hr[0];
        const sr = await API.insert("Shift Request", { employee: emp.name, company: emp.company, shift_type: st.shift, from_date: UI.today(), to_date: UI.today(), approver, status: "Draft" });
        await API.insert("Employee Checkin", { ...ck, device_id: `app-pending:SR:${sr.name}` });
        await Notify.send(approver, `${emp.employee_name} بصم ${what} في ${st.shift} ومحتاج موافقتك`, "Shift Request", sr.name);
        return result("warn", "اتبعت طلب تغيير الشيفت", `${what} الساعة ${UI.hm(now)} في ${esc(st.shift)}. هيوصلك إشعار لما المدير يرد.`);
      }
      const label = `${UI.REQ_TYPE[need.type]} ${UI.mins(need.minutes)}`;
      const ar = await API.insert("Attendance Request", { employee: emp.name, company: emp.company, from_date: UI.today(), to_date: UI.today(), reason: "On Duty", explanation: `${label} — ${what} الساعة ${UI.hm(now)} — ${st.shift}` });
      await API.insert("Employee Checkin", { ...ck, device_id: `app-pending:AR:${ar.name}` });
      await Notify.send([await Data.managerUser(emp), ...(await Data.hrUsers())], `${emp.employee_name}: ${label} ومحتاج موافقتك`, "Attendance Request", ar.name);
      result("warn", "البصمة اتبعتت للمدير", `${esc(label)}. البصمة اتسجلت وهتتحسب لما المدير يوافق، وهيوصلك إشعار بالرد.`);
    }

    view.querySelector("#go").onclick = async () => {
      act.innerHTML = loadingHTML;
      try { await geo(); await face(); await save(); }
      catch (e) {
        act.innerHTML = `<div class="note bad">${esc(e.message)}</div><button class="btn primary block lg" id="re">جرّب تاني</button>`;
        act.querySelector("#re").onclick = () => App.route();
      }
    };
  };
})();
