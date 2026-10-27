// حسابات الحضور والمرتب — كلها هنا عشان تبقى في مكان واحد وسهل تتراجع
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  const DAY_NAMES = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    "الأحد": 0, "الاحد": 0, "الإثنين": 1, "الاثنين": 1, "الثلاثاء": 2, "الأربعاء": 3, "الاربعاء": 3, "الخميس": 4, "الجمعة": 5, "الجمعه": 5, "السبت": 6,
  };

  // "09:30:00" → 570
  function timeToMin(t) {
    if (!t) return null;
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + (m || 0);
  }
  // "2026-10-27 09:30:15" → 570.25
  function dtToMin(dt) {
    const t = String(dt).split(" ")[1] || "00:00:00";
    const [h, m, s] = t.split(":").map(Number);
    return h * 60 + (m || 0) + (s || 0) / 60;
  }

  function shiftBounds(shift) {
    const start = timeToMin(shift && shift.start_time) ?? 9 * 60;
    let end = timeToMin(shift && shift.end_time) ?? 17 * 60;
    if (end <= start) end += 1440; // شيفت بيعدّي نص الليل
    return { start, end, length: end - start };
  }

  function weeklyOff(policy) {
    return String((policy && policy.weekly_off_days) || "")
      .split(/[,،]/).map((s) => s.trim().toLowerCase()).filter(Boolean)
      .map((s) => DAY_NAMES[s] ?? DAY_NAMES[s.replace(/^ال/, "ال")]).filter((x) => x !== undefined);
  }

  // سعر الدقيقة = الراتب ÷ (أيام العمل × دقائق الشيفت)
  function rates(emp, policy, shift) {
    const salary = Number(emp && emp.custom_monthly_salary) || 0;
    const days = Number(policy && policy.working_days_per_month) || 26;
    const { length } = shiftBounds(shift);
    const dayRate = salary / days;
    const minuteRate = length ? dayRate / length : 0;
    return { salary, days, shiftMinutes: length, dayRate, minuteRate };
  }

  // حسبة يوم واحد من البصمات
  function dayStats(logs, shift, policy, emp) {
    const sorted = [...logs].sort((a, b) => (a.time > b.time ? 1 : -1));
    const ins = sorted.filter((l) => l.log_type === "IN");
    const outs = sorted.filter((l) => l.log_type === "OUT");
    const first = ins[0] || null;
    const last = outs[outs.length - 1] || null;
    const { start, end } = shiftBounds(shift);
    const inMin = first ? dtToMin(first.time) : null;
    let outMin = last ? dtToMin(last.time) : null;
    if (outMin !== null && end > 1440 && outMin < start) outMin += 1440;

    const late = inMin !== null ? Math.max(0, Math.round(inMin - start)) : 0;
    const early = outMin !== null ? Math.max(0, Math.round(end - outMin)) : 0;
    const extra = outMin !== null ? Math.round(outMin - end) : 0;
    const after = Number(policy && policy.overtime_after_minutes) || 0;
    // الأوفر تايم بيتحسب من بعد فترة البداية (مثال: بعد 30 دقيقة من نهاية الدوام)
    const ot = emp && Number(emp.custom_no_overtime) ? 0 : extra > after ? extra - after : 0;
    const missed = (first && !last) || (!first && last) ? 1 : 0;
    return { in: first && first.time, out: last && last.time, late, early, ot, missed };
  }

  // الحسبة الشهرية لموظف واحد
  function monthly({ emp, policy, shifts, checkins, leaves = [], rewards = [], year, month, today = new Date() }) {
    const shift = shifts[emp.default_shift] || Object.values(shifts)[0] || null;
    const R = rates(emp, policy, shift);
    const offDays = weeklyOff(policy);
    const todayStr = ymd(today);

    const byDate = {};
    checkins.filter((c) => c.employee === emp.name).forEach((c) => {
      const d = String(c.time).slice(0, 10);
      (byDate[d] = byDate[d] || []).push(c);
    });

    const myLeaves = leaves.filter((l) => l.employee === emp.name && l.status === "Approved");
    const onLeave = (d) => myLeaves.some((l) => d >= l.from_date && d <= l.to_date);

    const days = [];
    const last = new Date(year, month, 0).getDate();
    const T = { present: 0, absent: 0, leave: 0, off: 0, late: 0, early: 0, ot: 0, missed: 0 };

    for (let i = 1; i <= last; i++) {
      const date = new Date(year, month - 1, i);
      const ds = ymd(date);
      if (ds > todayStr) break;
      const logs = byDate[ds] || [];
      const isOff = offDays.includes(date.getDay());
      let row = { date: ds, status: "absent", in: null, out: null, late: 0, early: 0, ot: 0, missed: 0 };
      if (logs.length) {
        const st = dayStats(logs, shifts[logs[0].shift] || shift, policy, emp);
        // النهارده: لو لسه ما بصمش انصراف، مش نسيان
        if (ds === todayStr && st.in && !st.out) st.missed = 0;
        row = { ...row, ...st, status: "present" };
        T.present++; T.late += st.late; T.early += st.early; T.ot += st.ot; T.missed += st.missed;
      } else if (onLeave(ds)) { row.status = "leave"; T.leave++; }
      else if (isOff) { row.status = "off"; T.off++; }
      else if (ds === todayStr) { row.status = "pending"; }
      else { T.absent++; }
      days.push(row);
    }

    const grace = emp.custom_monthly_grace_minutes !== null && emp.custom_monthly_grace_minutes !== undefined && emp.custom_monthly_grace_minutes !== ""
      ? Number(emp.custom_monthly_grace_minutes) : Number(policy.default_monthly_grace) || 0;
    const lateMultiplier = Number(policy.late_multiplier) || 1;
    const otMultiplier = Number(policy.overtime_multiplier) || 1;

    // التأخير والانصراف المبكر بيتخصموا من نفس رصيد السماح الشهري
    const lateTotal = T.late + T.early;
    const excess = Math.max(0, lateTotal - grace);
    const lateDeductMin = excess * lateMultiplier;
    const lateDeduct = lateDeductMin * R.minuteRate;

    const otPay = T.ot * otMultiplier * R.minuteRate;
    const missedDeduct = T.missed * (Number(policy.missed_punch_deduction) || 0);

    const ym = `${year}-${pad(month)}`;
    const leaveDeductDays = myLeaves.filter((l) => String(l.from_date).slice(0, 7) === ym).reduce((s, l) => s + (Number(l.custom_deduct_days) || 0), 0);
    const leaveDeduct = leaveDeductDays * R.dayRate;

    const mine = rewards.filter((x) => x.employee === emp.name && String(x.date).slice(0, 7) === ym);
    const rewardSum = mine.filter((x) => x.entry_type === "Reward").reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const deductionSum = mine.filter((x) => x.entry_type === "Deduction").reduce((s, x) => s + (Number(x.amount) || 0), 0);

    const additions = otPay + rewardSum;
    const deductions = lateDeduct + missedDeduct + leaveDeduct + deductionSum;

    return {
      employee: emp.name, employee_name: emp.employee_name, shift: shift && shift.name,
      salary: R.salary, minuteRate: R.minuteRate, dayRate: R.dayRate, shiftMinutes: R.shiftMinutes,
      present: T.present, absent: T.absent, leaveDays: T.leave, offDays: T.off,
      lateMin: T.late, earlyMin: T.early, lateTotal, grace, excess, lateMultiplier, lateDeductMin, lateDeduct: r2(lateDeduct),
      otMin: T.ot, otMultiplier, otPay: r2(otPay), noOvertime: !!Number(emp.custom_no_overtime),
      missed: T.missed, missedDeduct: r2(missedDeduct),
      leaveDeductDays, leaveDeduct: r2(leaveDeduct),
      rewards: r2(rewardSum), deductionsManual: r2(deductionSum),
      additions: r2(additions), deductions: r2(deductions), net: r2(R.salary + additions - deductions),
      days,
    };
  }

  // مبلغ المكافأة/الخصم: رقم ثابت أو نسبة من المرتب الأساسي
  function rewardAmount(emp, calcType, value) {
    const v = Number(value) || 0;
    if (calcType === "Percent") return r2((Number(emp.custom_monthly_salary) || 0) * v / 100);
    return r2(v);
  }

  // مسافة بين نقطتين بالمتر
  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371000, toR = (x) => (x * Math.PI) / 180;
    const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // هل البصمة محتاجة موافقة المدير؟
  function needsApproval({ logType, nowMin, shift, policy, isMainShift }) {
    const { start, end } = shiftBounds(shift);
    if (!isMainShift) return { type: "Other Shift", minutes: 0 };
    if (logType === "IN") {
      const late = Math.round(nowMin - start);
      if (late > (Number(policy.checkin_grace_minutes) || 0)) return { type: "Late Check-in", minutes: late };
      return null;
    }
    let n = nowMin;
    if (end > 1440 && n < start) n += 1440;
    const early = Math.round(end - n);
    if (early > (Number(policy.early_leave_grace_minutes) || 0)) return { type: "Early Check-out", minutes: early };
    return null;
  }

  root.Calc = { timeToMin, dtToMin, shiftBounds, rates, dayStats, monthly, rewardAmount, distance, needsApproval, weeklyOff, ymd, r2 };
  if (typeof module !== "undefined") module.exports = root.Calc;
})(typeof window !== "undefined" ? window : globalThis);
