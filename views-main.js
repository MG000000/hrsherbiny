// الشاشات: الدخول، الرئيسية، الحضور والانصراف، البصمة
window.Views = window.Views || {};
(function () {
  const { esc, icon, toast } = UI;
  const S = SCHEMA;

  // ================= الدخول =================
  Views.login = function (root) {
    const demo = API.isDemo();
    root.innerHTML = `<div class="login"><div class="card">
      <div class="brand"><span class="brand-mark">${icon("finger")}</span><span>${esc(CONFIG.APP_NAME)}</span></div>
      <p class="lead">الحضور والانصراف والموارد البشرية</p>
      <form id="lf">
        <div class="field"><label for="u">الإيميل</label><input class="input" id="u" type="email" autocomplete="username" required dir="ltr" value="${demo ? "admin@demo.com" : ""}"></div>
        <div class="field"><label for="p">الباسورد</label><input class="input" id="p" type="password" autocomplete="current-password" required dir="ltr" value="${demo ? "demo" : ""}"></div>
        <button class="btn primary block lg" type="submit">${icon("login")} دخول</button>
      </form>
      <label class="check" style="margin-top:16px"><input type="checkbox" id="demo" ${demo ? "checked" : ""}> وضع تجريبي (بيانات وهمية من غير ERPNext)</label>
      ${demo ? `<div class="note">حسابات التجربة (الباسورد demo):<br><span dir="ltr">admin@demo.com</span> مدير النظام · <span dir="ltr">mona@demo.com</span> مديرة فرع · <span dir="ltr">sara@demo.com</span> موظفة</div>` : `<div class="note">ادخل بنفس إيميل وباسورد حسابك على ERPNext.</div>`}
      <div id="lerr"></div>
    </div></div>`;
    root.querySelector("#demo").onchange = (e) => { API.setDemo(e.target.checked); Data.clear(); Views.login(root); };
    root.querySelector("#lf").onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button"); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
      const usr = root.querySelector("#u").value.trim().toLowerCase(), pwd = root.querySelector("#p").value;
      const err = root.querySelector("#lerr"); err.innerHTML = "";
      try {
        const ok = await API.verifyLogin(usr, pwd);
        if (!ok) throw new Error("الإيميل أو الباسورد غلط");
        const roles = await API.userRoles(usr);
        let full = usr;
        try { const u = await API.get("User", usr); full = u.full_name || usr; } catch (x) {}
        const emps = await API.list("Employee", { fields: ["*"], filters: [["user_id", "=", usr]], limit: 1 }).catch(() => []);
        Object.assign(Session, { user: usr, full_name: emps[0] ? emps[0].employee_name : full, roles, employee: emps[0] || null });
        Session.save(); Data.clear();
        location.hash = "#/home";
        App.start();
      } catch (x) {
        err.innerHTML = `<div class="note bad">${esc(x.message)}</div>`;
        btn.disabled = false; btn.innerHTML = `${icon("login")} دخول`;
      }
    };
  };

  // ================= الرئيسية =================
  Views.home = async function (view) {
    const me = Session.employee;
    const [isMgr, myLogs, pending] = await Promise.all([
      Data.isManager(),
      me ? API.list("Employee Checkin", { fields: ["log_type", "time"], filters: [["employee", "=", me.name], ["time", ">=", UI.today() + " 00:00:00"]], order_by: "time asc" }).catch(() => []) : [],
      countPending(),
    ]);
    const last = myLogs[myLogs.length - 1];
    const status = !me ? "حسابك مش مربوط بموظف على ERPNext"
      : !last ? "لسه ما بصمتش النهارده"
      : last.log_type === "IN" ? `بصمت حضور الساعة ${UI.hm(last.time)}` : `بصمت انصراف الساعة ${UI.hm(last.time)}`;

    let stats = "";
    if (isMgr) {
      const b = await boardData();
      stats = `<div class="stats">
        <div class="stat ok"><div class="k">حاضرين</div><div class="v">${UI.num(b.present.length)}</div></div>
        <div class="stat bad"><div class="k">غايبين</div><div class="v">${UI.num(b.absent.length)}</div></div>
        <div class="stat warn"><div class="k">متأخرين</div><div class="v">${UI.num(b.late)}</div></div>
        <div class="stat info"><div class="k">طلبات مستنية ردّك</div><div class="v">${UI.num(pending)}</div></div></div>`;
    }

    const tile = (href, ic, t, d, cls = "", count = 0) => `<a class="tile ${cls}" href="${href}">${count ? `<span class="count">${UI.num(count)}</span>` : ""}<span class="ti">${icon(ic)}</span><span class="tt">${t}</span><span class="td">${d}</span></a>`;
    const h = new Date().getHours();
    view.innerHTML = `
      <div class="hello"><div><h1>${h < 12 ? "صباح الخير" : "مساء الخير"}، ${esc(String(Session.full_name).split(" ")[0])}</h1><div class="date">${UI.dateAr(new Date())}</div></div></div>
      ${me ? `<a class="punch-hero" href="#/punch"><span class="ico">${icon("finger")}</span><span><div class="t1">${last && last.log_type === "IN" ? "بصمة انصراف" : "بصمة حضور"}</div><div class="t2">${esc(status)}</div></span><span class="arrow">${icon("arrow")}</span></a>` : `<div class="note warn" style="margin-bottom:18px">${esc(status)}</div>`}
      ${stats}
      <div class="tiles">
        ${isMgr ? tile("#/board", "users", "الحضور والانصراف", "مين حاضر ومين غايب النهارده", "c-ok") : ""}
        ${isMgr ? tile("#/requests", "inbox", "الطلبات", "طلبات البصمة والإجازات", "c-warn", pending) : ""}
        ${me ? tile("#/leave", "cal", "الإجازات", "اطلب إجازة وتابع طلباتك", "c-info") : ""}
        ${tile("#/tasks", "tasks", "المهام", "مهامك والمهام اللي بعتها")}
        ${tile("#/rewards", "gift", "المكافآت والخصومات", Session.canReward ? "إضافة لموظف أو أكتر" : "مكافآتك وخصوماتك", "c-ok")}
        ${tile("#/report", "report", "تقرير البصمة", "التأخير والأوفر تايم والخصومات", "c-info")}
        ${Session.isAdmin ? tile("#/settings", "gear", "الإعدادات", "السياسة والموظفين والفروع") : ""}
      </div>`;
  };

  async function countPending() {
    try {
      if (!(await Data.isManager())) return 0;
      const team = new Set((await Data.team()).map((e) => e.name));
      const [a, l] = await Promise.all([
        API.list(S.REQUEST, { fields: ["employee", "approver"], filters: [["status", "=", "Pending"]] }).catch(() => []),
        API.list("Leave Application", { fields: ["employee", "leave_approver"], filters: [["status", "=", "Open"], ["docstatus", "=", 0]] }).catch(() => []),
      ]);
      const mine = (r, ap) => Session.isAdmin || r[ap] === Session.user || team.has(r.employee);
      const myEmp = Session.employee && Session.employee.name;
      return [...a.filter((r) => mine(r, "approver") && r.employee !== myEmp), ...l.filter((r) => mine(r, "leave_approver") && r.employee !== myEmp)].length;
    } catch (e) { return 0; }
  }
  window.countPending = countPending;

  // ================= الحضور والانصراف (لوحة اليوم) =================
  async function boardData() {
    const d = UI.today();
    const [team, logs, leaves, reqs, policy, shifts] = await Promise.all([
      Data.team(),
      API.list("Employee Checkin", { fields: ["employee", "log_type", "time"], filters: [["time", ">=", d + " 00:00:00"], ["time", "<=", d + " 23:59:59"]], order_by: "time asc" }),
      API.list("Leave Application", { fields: ["employee", "leave_type", "from_date", "to_date"], filters: [["status", "=", "Approved"], ["from_date", "<=", d], ["to_date", ">=", d]] }).catch(() => []),
      API.list(S.REQUEST, { fields: ["employee", "request_type", "status"], filters: [["status", "=", "Pending"], ["request_time", ">=", d + " 00:00:00"]] }).catch(() => []),
      Data.policy(), Data.shifts(),
    ]);
    const byEmp = {};
    logs.forEach((l) => (byEmp[l.employee] = byEmp[l.employee] || []).push(l));
    const rows = team.map((e) => {
      const L = byEmp[e.name] || [];
      const ins = L.filter((x) => x.log_type === "IN"), outs = L.filter((x) => x.log_type === "OUT");
      const shift = shifts[e.default_shift] || Object.values(shifts)[0];
      const late = ins[0] ? Math.max(0, Math.round(Calc.dtToMin(ins[0].time) - Calc.shiftBounds(shift).start)) : 0;
      return {
        e, inT: ins[0] && ins[0].time, outT: outs.length ? outs[outs.length - 1].time : null, late,
        leave: leaves.find((l) => l.employee === e.name), req: reqs.find((r) => r.employee === e.name), shift,
      };
    });
    const present = rows.filter((r) => r.inT || r.outT);
    const absent = rows.filter((r) => !r.inT && !r.outT);
    return { rows, present, absent, late: present.filter((r) => r.late > 0).length, policy };
  }

  Views.board = async function (view) {
    let filter = "absent", q = "";
    const draw = async () => {
      const b = await boardData();
      const list = (filter === "absent" ? b.absent : filter === "present" ? b.present : b.rows)
        .filter((r) => !q || (r.e.employee_name + " " + r.e.name + " " + (r.e.designation || "")).toLowerCase().includes(q.toLowerCase()));
      const card = (r) => {
        let tag;
        if (r.inT || r.outT) tag = r.late > 0 ? `<span class="tag warn">متأخر ${UI.mins(r.late)}</span>` : '<span class="tag ok">حاضر</span>';
        else if (r.leave) tag = '<span class="tag info">إجازة</span>';
        else if (r.req) tag = `<span class="tag warn">طلب ${esc(UI.REQ_TYPE[r.req.request_type] || "")}</span>`;
        else tag = '<span class="tag bad">غايب</span>';
        return `<div class="person"><span class="avatar">${esc(UI.initials(r.e.employee_name))}</span>
          <div class="info"><div class="nm">${esc(r.e.employee_name)}</div><div class="meta">${esc(r.e.designation || r.e.name)} · ${esc(r.shift ? r.shift.name : "")}</div></div>
          <div class="times">${tag}${r.inT || r.outT ? `<div>${UI.hm(r.inT)} ← ${UI.hm(r.outT)}</div>` : ""}</div></div>`;
      };
      view.innerHTML = `${pageHead("الحضور والانصراف", UI.dateAr(new Date()), `<button class="btn ghost sm" id="rf">تحديث</button>`)}
        <div class="toolbar">
          <div class="seg" role="tablist">
            <button data-k="absent" class="${filter === "absent" ? "on" : ""}">الغايبين <span class="n">${UI.num(b.absent.length)}</span></button>
            <button data-k="present" class="${filter === "present" ? "on" : ""}">الحاضرين <span class="n">${UI.num(b.present.length)}</span></button>
            <button data-k="all" class="${filter === "all" ? "on" : ""}">الكل <span class="n">${UI.num(b.rows.length)}</span></button>
          </div>
          <input class="input" id="q" placeholder="ابحث بالاسم..." style="max-width:260px" value="${esc(q)}">
        </div>
        ${list.length ? `<div class="people">${list.map(card).join("")}</div>` : `<div class="empty">${filter === "absent" ? "مفيش حد غايب 🎉" : "مفيش نتايج"}</div>`}`;
      view.querySelectorAll(".seg button").forEach((bt) => bt.onclick = () => { filter = bt.dataset.k; draw(); });
      const qi = view.querySelector("#q");
      qi.oninput = () => { q = qi.value; clearTimeout(qi._t); qi._t = setTimeout(async () => { await draw(); const n = view.querySelector("#q"); n.focus(); n.setSelectionRange(q.length, q.length); }, 250); };
      view.querySelector("#rf").onclick = draw;
    };
    await draw();
  };

  // ================= البصمة =================
  Views.punch = async function (view) {
    const me = Session.employee;
    if (!me) { view.innerHTML = `${pageHead("البصمة")}<div class="empty">حسابك مش مربوط بموظف على ERPNext (حقل User ID في ملف الموظف).</div>`; return; }
    const [policy, shifts, locs, logs] = await Promise.all([
      Data.policy(), Data.shifts(), Data.locations(),
      API.list("Employee Checkin", { fields: ["log_type", "time"], filters: [["employee", "=", me.name], ["time", ">=", UI.today() + " 00:00:00"]], order_by: "time asc" }),
    ]);
    const emp = (await Data.employee(me.name)) || me;
    const last = logs[logs.length - 1];
    const state = { logType: last && last.log_type === "IN" ? "OUT" : "IN", shift: emp.default_shift || Object.keys(shifts)[0] || "", pos: null, face: null };
    const myLocs = [emp.custom_location_1, emp.custom_location_2].filter(Boolean).map((n) => locs.find((l) => l.name === n)).filter(Boolean);
    const requireFace = !!Number(policy.require_face);

    view.innerHTML = `${pageHead("البصمة")}
      <div class="punch-wrap">
        <div class="clock"><div class="t" id="clk"></div><div class="d">${UI.dateAr(new Date())}</div></div>
        <div class="choice">
          <button class="in" data-t="IN">${icon("login")} حضور</button>
          <button class="out" data-t="OUT">${icon("logout")} انصراف</button>
        </div>
        <div class="field"><label for="sh">الشيفت</label>
          <select class="input" id="sh">${Object.values(shifts).map((s) => `<option value="${esc(s.name)}" ${s.name === state.shift ? "selected" : ""}>${esc(s.name)} (${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)})${s.name === emp.default_shift ? " · الرئيسي" : ""}</option>`).join("")}</select>
          <span class="hint" id="shh"></span>
        </div>
        <div class="steps">
          <div class="step" id="s-loc"><span class="si">${icon("pin")}</span><div><div class="st">الموقع</div><div class="sd">${myLocs.length ? "لازم تكون في: " + esc(myLocs.map((l) => l.location_name || l.name).join(" أو ")) : "مفيش فرع محدد ليك، هيتسجل موقعك بس"}</div></div></div>
          ${requireFace ? `<div class="step" id="s-face"><span class="si">${icon("face")}</span><div><div class="st">بصمة الوجه</div><div class="sd">هتتصور وتتقارن بصورتك المسجلة</div></div></div>` : ""}
        </div>
        <div id="cam-box"></div>
        <div id="act"><button class="btn primary block lg" id="go">${icon("finger")} ابدأ البصمة</button></div>
        <div style="margin-top:18px"><h3>بصماتك النهارده</h3>${logs.length ? `<div class="list">${logs.map((l) => `<div class="item"><div class="top"><span class="tag ${l.log_type === "IN" ? "ok" : "bad"}">${l.log_type === "IN" ? "حضور" : "انصراف"}</span><span class="meta">${UI.hm(l.time)}</span></div></div>`).join("")}</div>` : '<div class="empty">لسه مفيش</div>'}</div>
      </div>`;

    const clk = view.querySelector("#clk");
    const tick = () => { if (!document.body.contains(clk)) return clearInterval(t); clk.textContent = new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }); };
    const t = setInterval(tick, 1000); tick();

    const setType = () => view.querySelectorAll(".choice button").forEach((b) => b.classList.toggle("on", b.dataset.t === state.logType));
    view.querySelectorAll(".choice button").forEach((b) => b.onclick = () => { state.logType = b.dataset.t; setType(); });
    setType();
    const sh = view.querySelector("#sh"), shh = view.querySelector("#shh");
    const shHint = () => { shh.textContent = sh.value !== emp.default_shift ? "ده مش شيفتك الرئيسي، البصمة هتروح طلب للمدير يوافق عليه." : ""; shh.style.color = "var(--warn)"; };
    sh.onchange = () => { state.shift = sh.value; shHint(); }; shHint();

    const setStep = (id, cls, desc) => { const s = view.querySelector(id); if (!s) return; s.className = `step ${cls}`; if (desc) s.querySelector(".sd").innerHTML = desc; if (cls === "ok") s.querySelector(".si").innerHTML = icon("check"); if (cls === "bad") s.querySelector(".si").innerHTML = icon("x"); if (cls === "run") s.querySelector(".si").innerHTML = '<span class="spin" style="width:16px;height:16px;border-width:2px"></span>'; };
    const act = view.querySelector("#act");

    async function stepLocation() {
      setStep("#s-loc", "run", "بيحدد موقعك...");
      let pos;
      try {
        pos = await new Promise((res, rej) => {
          if (!navigator.geolocation) return rej(new Error("المتصفح مش بيدعم تحديد الموقع"));
          navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), (e) => rej(new Error(e.code === 1 ? "لازم تسمح للمتصفح بالوصول للموقع" : "مش قادر أحدد موقعك، جرّب تاني")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
        });
      } catch (e) {
        if (API.isDemo() && myLocs[0]) {
          pos = { lat: Number(myLocs[0].latitude), lng: Number(myLocs[0].longitude), acc: 10, sim: true };
        } else { setStep("#s-loc", "bad", esc(e.message)); throw e; }
      }
      state.pos = pos;
      if (!myLocs.length) { setStep("#s-loc", "ok", "اتسجل موقعك"); return true; }
      const ds = myLocs.map((l) => ({ l, d: Calc.distance(pos.lat, pos.lng, Number(l.latitude), Number(l.longitude)), r: Number(l.checkin_radius) || 100 }));
      ds.sort((a, b) => a.d - b.d);
      const best = ds[0];
      if (best.d <= best.r + Math.min(pos.acc || 0, 50)) {
        setStep("#s-loc", "ok", `انت في ${esc(best.l.location_name || best.l.name)}${pos.sim ? " (موقع محاكي)" : ""}`);
        return true;
      }
      setStep("#s-loc", "bad", `انت بعيد ${UI.num(Math.round(best.d))} متر عن ${esc(best.l.location_name || best.l.name)} (المسموح ${UI.num(best.r)} متر)`);
      throw new Error("انت مش في موقع الفرع");
    }

    async function stepFace() {
      if (!requireFace) return true;
      setStep("#s-face", "run", "بيفتح الكاميرا...");
      const box = view.querySelector("#cam-box");
      box.innerHTML = `<div class="cam"><video playsinline muted></video><div class="ring"></div></div>`;
      const video = box.querySelector("video");
      try { await Face.startCamera(video); }
      catch (e) { setStep("#s-face", "bad", "مش قادر أفتح الكاميرا. اسمح للمتصفح بالوصول للكاميرا."); box.innerHTML = ""; throw e; }
      setStep("#s-face", "run", "بص للكاميرا ودوس تحقق");
      const noImage = !emp.image;
      return new Promise((resolve, reject) => {
        act.innerHTML = `<button class="btn primary block lg" id="snap">${icon("face")} تحقق من الوجه</button>${API.isDemo() && noImage ? '<button class="btn ghost block" id="skip" style="margin-top:8px">تخطي (وضع تجريبي)</button>' : ""}`;
        const done = (ok, msg) => { Face.stop(); box.innerHTML = ""; ok ? resolve(true) : reject(new Error(msg)); };
        act.querySelector("#snap").onclick = async (e) => {
          const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span> بيتحقق...';
          try {
            if (API.isDemo() && noImage) { setStep("#s-face", "ok", "تمام (تجريبي)"); return done(true); }
            const r = await Face.verify(emp, video, Number(policy.face_threshold) || 0.5);
            if (r.ok) { setStep("#s-face", "ok", "الوش مطابق"); done(true); }
            else { setStep("#s-face", "bad", esc(r.reason)); b.disabled = false; b.innerHTML = `${icon("face")} جرّب تاني`; }
          } catch (x) { setStep("#s-face", "bad", esc(x.message)); b.disabled = false; b.innerHTML = `${icon("face")} جرّب تاني`; }
        };
        const sk = act.querySelector("#skip");
        if (sk) sk.onclick = () => { setStep("#s-face", "ok", "اتخطى (تجريبي)"); done(true); };
      });
    }

    function result(kind, title, text) {
      const ic = kind === "ok" ? "check" : kind === "warn" ? "hourglass" : "alert";
      act.innerHTML = `<div class="card result ${kind}"><div class="big">${icon(ic)}</div><h2>${esc(title)}</h2><p style="margin:0 0 14px;color:var(--ink-2)">${text}</p><a class="btn ghost" href="#/home">الرئيسية</a></div>`;
      view.querySelector(".choice").style.pointerEvents = "none"; sh.disabled = true;
    }

    async function submit() {
      act.innerHTML = loadingHTML;
      const nowDT = UI.nowDT();
      const nowMin = Calc.dtToMin(nowDT);
      const shift = shifts[state.shift];
      const need = Calc.needsApproval({ logType: state.logType, nowMin, shift, policy, isMainShift: state.shift === emp.default_shift || !emp.default_shift });
      if (need) {
        const approver = await Data.approverFor(emp);
        const req = await API.insert(S.REQUEST, {
          employee: emp.name, employee_name: emp.employee_name, request_type: need.type, log_type: state.logType,
          request_time: nowDT, shift: state.shift, minutes: need.minutes, status: "Pending", approver,
          latitude: state.pos && state.pos.lat, longitude: state.pos && state.pos.lng,
        });
        const what = need.type === "Late Check-in" ? `حضور متأخر ${UI.mins(need.minutes)}` : need.type === "Early Check-out" ? `انصراف مبكر ${UI.mins(need.minutes)}` : `بصمة ${state.logType === "IN" ? "حضور" : "انصراف"} في ${state.shift}`;
        await Notify.send(approver, `${emp.employee_name} طالب ${what}`, S.REQUEST, req.name);
        result("warn", "الطلب اتبعت للمدير", `${esc(what)}. هيوصلك إشعار أول ما المدير يرد.`);
        return;
      }
      await API.insert("Employee Checkin", {
        employee: emp.name, log_type: state.logType, time: nowDT, device_id: "web-app",
        latitude: state.pos && state.pos.lat, longitude: state.pos && state.pos.lng,
      });
      result("ok", state.logType === "IN" ? "اتسجل حضورك" : "اتسجل انصرافك", `الساعة ${UI.hm(nowDT)}`);
    }

    view.querySelector("#go").onclick = async () => {
      act.innerHTML = loadingHTML;
      try {
        await stepLocation();
        await stepFace();
        await submit();
      } catch (e) {
        act.innerHTML = `<div class="note bad" style="margin-bottom:10px">${esc(e.message)}</div><button class="btn primary block lg" id="go2">جرّب تاني</button>`;
        act.querySelector("#go2").onclick = () => App.route();
      }
    };
  };
})();
