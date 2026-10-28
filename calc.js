// حسابات الحضور — في مكان واحد عشان تتراجع بسهولة
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const tMin = (t) => { if (!t) return null; const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
  const dtMin = (dt) => { const [h, m, s] = (String(dt).split(" ")[1] || "0:0:0").split(":").map(Number); return h * 60 + (m || 0) + (s || 0) / 60; };

  function bounds(shift) {
    const start = tMin(shift && shift.start_time) ?? 540;
    let end = tMin(shift && shift.end_time) ?? 1020;
    if (end <= start) end += 1440;
    return { start, end, length: end - start };
  }

  // البصمة محتاجة موافقة؟ السماح اليومي بيتقري من Shift Type نفسه
  function needsApproval({ logType, nowMin, shift, isAssigned }) {
    if (!isAssigned) return { type: "shift", minutes: 0 };
    const { start, end } = bounds(shift);
    if (logType === "IN") {
      const late = Math.round(nowMin - start);
      return late > (Number(shift.late_entry_grace_period) || 0) ? { type: "late", minutes: late } : null;
    }
    let n = nowMin; if (end > 1440 && n < start) n += 1440;
    const early = Math.round(end - n);
    return early > (Number(shift.early_exit_grace_period) || 0) ? { type: "early", minutes: early } : null;
  }

  function day(logs, shift) {
    const s = [...logs].sort((a, b) => (a.time > b.time ? 1 : -1));
    const first = s.find((l) => l.log_type === "IN");
    const last = [...s].reverse().find((l) => l.log_type === "OUT");
    const { start, end } = bounds(shift);
    const inM = first ? dtMin(first.time) : null;
    let outM = last ? dtMin(last.time) : null;
    if (outM !== null && end > 1440 && outM < start) outM += 1440;
    const late = inM !== null ? Math.max(0, Math.round(inM - start)) : 0;
    const early = outM !== null ? Math.max(0, Math.round(end - outM)) : 0;
    const ot = shift && Number(shift.allow_overtime) && outM !== null ? Math.max(0, Math.round(outM - end)) : 0;
    return {
      in: first && first.time, out: last && last.time, late, early, ot,
      missed: (first && !last) || (!first && last) ? 1 : 0,
      pending: s.some((l) => l.workflow_state === "Pending" || String(l.device_id || "").startsWith("app-pending")),
    };
  }

  // الحسبة الشهرية لموظف
  // shiftFor(dateStr) بترجع الـ Shift Type المعيّن للموظف في اليوم ده (من Shift Assignment أو الشيفت الافتراضي)
  function monthly({ emp, shiftFor, checkins, leaves = [], lwpTypes = new Set(), extras = [], base = 0, missedAmount = 0, otMultiplierFor, year, month, today = new Date(), cfg = root.CONFIG || {} }) {
    const todayStr = ymd(today);
    const off = cfg.WEEKLY_OFF || [5];
    const by = {};
    checkins.filter((c) => c.employee === emp.name).forEach((c) => (by[String(c.time).slice(0, 10)] = by[String(c.time).slice(0, 10)] || []).push(c));
    const myLeaves = leaves.filter((l) => l.employee === emp.name && l.status === "Approved");
    const leaveOn = (d) => myLeaves.find((l) => d >= l.from_date && d <= l.to_date);

    const T = { present: 0, absent: 0, leave: 0, lwp: 0, late: 0, early: 0, ot: 0, otPay: 0, missed: 0, pending: 0 };
    const days = [];
    const refShift = shiftFor(ymd(new Date(year, month - 1, 1))) || shiftFor(todayStr);
    const minuteRate = refShift ? base / (cfg.WORKING_DAYS_PER_MONTH || 26) / bounds(refShift).length : 0;

    for (let i = 1; i <= new Date(year, month, 0).getDate(); i++) {
      const date = new Date(year, month - 1, i), ds = ymd(date);
      if (ds > todayStr) break;
      const shift = shiftFor(ds);
      const logs = by[ds] || [];
      let row = { date: ds, status: "absent", shift: shift && shift.name };
      const lv = leaveOn(ds);
      if (logs.length) {
        const st = day(logs, shift);
        if (ds === todayStr && st.in && !st.out) st.missed = 0;
        row = { ...row, ...st, status: "present" };
        T.present++; T.late += st.late; T.early += st.early; T.ot += st.ot; T.missed += st.missed; if (st.pending) T.pending++;
        T.otPay += st.ot * minuteRate * (otMultiplierFor ? otMultiplierFor(shift) : 1);
      } else if (lv) { row.status = "leave"; row.leaveType = lv.leave_type; T.leave++; if (lwpTypes.has(lv.leave_type)) T.lwp++; }
      else if (off.includes(date.getDay())) row.status = "off";
      else if (ds === todayStr) row.status = "today";
      else T.absent++;
      days.push(row);
    }

    const grace = Number(cfg.MONTHLY_GRACE_MINUTES) || 0;
    const mult = Number(cfg.LATE_MULTIPLIER) || 1;
    const lateTotal = T.late + T.early;
    const excess = Math.max(0, lateTotal - grace);
    const ym = `${year}-${pad(month)}`;
    const mine = extras.filter((x) => x.employee === emp.name && String(x.payroll_date).slice(0, 7) === ym && Number(x.docstatus) !== 2);
    return {
      employee: emp.name, employee_name: emp.employee_name, base, minuteRate,
      present: T.present, absent: T.absent, leave: T.leave, lwp: T.lwp, pending: T.pending,
      lateMin: T.late, earlyMin: T.early, lateTotal, grace, excess, mult, lateDeductMin: excess * mult,
      lateDeduct: r2(excess * mult * minuteRate),
      otMin: T.ot, otPay: r2(T.otPay),
      missed: T.missed, missedDeduct: r2(T.missed * missedAmount),
      extras: mine,
      days,
    };
  }

  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371000, t = (x) => (x * Math.PI) / 180;
    const a = Math.sin(t(lat2 - lat1) / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(t(lon2 - lon1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  root.Calc = { ymd, r2, tMin, dtMin, bounds, needsApproval, day, monthly, distance };
  if (typeof module !== "undefined") module.exports = root.Calc;
})(typeof window !== "undefined" ? window : globalThis);
