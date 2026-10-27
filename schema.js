// المستندات والحقول المخصصة اللي الواجهة محتاجاها في ERPNext
// بتتعمل مرة واحدة من شاشة الإعدادات ← "تجهيز ERPNext"

window.SCHEMA = {
  POLICY: "HR Attendance Policy",
  REASON: "HR Leave Reason",
  REQUEST: "HR Attendance Request",
  REWARD: "HR Reward Deduction",

  // المستندات الأساسية من HRMS اللي بنستخدمها زي ما هي
  standard: ["Employee", "Employee Checkin", "Shift Type", "Shift Location", "Leave Application", "Leave Type", "ToDo", "Notification Log", "File"],

  doctypes: [
    {
      name: "HR Attendance Policy",
      issingle: 1,
      fields: [
        { fieldname: "sec_grace", label: "السماح", fieldtype: "Section Break" },
        { fieldname: "checkin_grace_minutes", label: "دقائق السماح للحضور (بعدها طلب للمدير)", fieldtype: "Int", default: "15" },
        { fieldname: "early_leave_grace_minutes", label: "دقائق السماح للانصراف المبكر (قبلها طلب للمدير)", fieldtype: "Int", default: "10" },
        { fieldname: "default_monthly_grace", label: "رصيد السماح الشهري الافتراضي (دقيقة)", fieldtype: "Int", default: "100" },
        { fieldname: "late_multiplier", label: "معامل ضرب الدقائق الزيادة عن السماح", fieldtype: "Float", default: "2" },
        { fieldname: "sec_ot", label: "الأوفر تايم", fieldtype: "Section Break" },
        { fieldname: "overtime_after_minutes", label: "الأوفر تايم يبدأ بعد (دقيقة من نهاية الدوام)", fieldtype: "Int", default: "30" },
        { fieldname: "overtime_multiplier", label: "معامل ضرب دقيقة الأوفر تايم", fieldtype: "Float", default: "1.5" },
        { fieldname: "sec_other", label: "أخرى", fieldtype: "Section Break" },
        { fieldname: "missed_punch_deduction", label: "خصم نسيان البصمة (مبلغ)", fieldtype: "Currency", default: "50" },
        { fieldname: "working_days_per_month", label: "أيام العمل في الشهر (لحساب سعر الدقيقة)", fieldtype: "Int", default: "26" },
        { fieldname: "weekly_off_days", label: "أيام الإجازة الأسبوعية (مفصولة بفاصلة)", fieldtype: "Data", default: "Friday" },
        { fieldname: "require_face", label: "إلزام بصمة الوجه", fieldtype: "Check", default: "1" },
        { fieldname: "face_threshold", label: "حساسية مطابقة الوجه (أقل = أدق)", fieldtype: "Float", default: "0.5" },
      ],
    },
    {
      name: "HR Leave Reason",
      autoname: "field:reason_name",
      fields: [{ fieldname: "reason_name", label: "السبب", fieldtype: "Data", reqd: 1, unique: 1, in_list_view: 1 }],
    },
    {
      name: "HR Attendance Request",
      autoname: "hash",
      fields: [
        { fieldname: "employee", label: "الموظف", fieldtype: "Link", options: "Employee", reqd: 1, in_list_view: 1 },
        { fieldname: "employee_name", label: "اسم الموظف", fieldtype: "Data", in_list_view: 1 },
        { fieldname: "request_type", label: "نوع الطلب", fieldtype: "Select", options: "Late Check-in\nEarly Check-out\nOther Shift", in_list_view: 1 },
        { fieldname: "log_type", label: "حضور/انصراف", fieldtype: "Select", options: "IN\nOUT" },
        { fieldname: "request_time", label: "وقت البصمة", fieldtype: "Datetime" },
        { fieldname: "shift", label: "الشيفت", fieldtype: "Link", options: "Shift Type" },
        { fieldname: "minutes", label: "الدقائق", fieldtype: "Int" },
        { fieldname: "latitude", label: "Latitude", fieldtype: "Float", precision: "6" },
        { fieldname: "longitude", label: "Longitude", fieldtype: "Float", precision: "6" },
        { fieldname: "status", label: "الحالة", fieldtype: "Select", options: "Pending\nApproved\nRejected", default: "Pending", in_list_view: 1 },
        { fieldname: "approver", label: "المدير", fieldtype: "Link", options: "User" },
        { fieldname: "manager_note", label: "رد المدير", fieldtype: "Small Text" },
        { fieldname: "checkin", label: "البصمة اللي اتسجلت", fieldtype: "Link", options: "Employee Checkin" },
      ],
    },
    {
      name: "HR Reward Deduction",
      autoname: "hash",
      fields: [
        { fieldname: "employee", label: "الموظف", fieldtype: "Link", options: "Employee", reqd: 1, in_list_view: 1 },
        { fieldname: "employee_name", label: "اسم الموظف", fieldtype: "Data", in_list_view: 1 },
        { fieldname: "entry_type", label: "النوع", fieldtype: "Select", options: "Reward\nDeduction", in_list_view: 1 },
        { fieldname: "calc_type", label: "طريقة الحساب", fieldtype: "Select", options: "Fixed\nPercent" },
        { fieldname: "value", label: "القيمة / النسبة", fieldtype: "Float" },
        { fieldname: "amount", label: "المبلغ", fieldtype: "Currency", in_list_view: 1 },
        { fieldname: "date", label: "التاريخ", fieldtype: "Date", in_list_view: 1 },
        { fieldname: "reason", label: "السبب", fieldtype: "Small Text" },
        { fieldname: "created_by_user", label: "بواسطة", fieldtype: "Link", options: "User" },
      ],
    },
  ],

  customFields: [
    { dt: "Employee", fieldname: "custom_hr_section", label: "إعدادات الحضور", fieldtype: "Section Break", insert_after: "default_shift" },
    { dt: "Employee", fieldname: "custom_monthly_salary", label: "الراتب الشهري", fieldtype: "Currency", insert_after: "custom_hr_section" },
    { dt: "Employee", fieldname: "custom_monthly_grace_minutes", label: "رصيد السماح الشهري (دقيقة)", fieldtype: "Int", insert_after: "custom_monthly_salary", description: "لو فاضي يتاخد الافتراضي من سياسة الحضور" },
    { dt: "Employee", fieldname: "custom_no_overtime", label: "لا يحسب له أوفر تايم", fieldtype: "Check", insert_after: "custom_monthly_grace_minutes" },
    { dt: "Employee", fieldname: "custom_can_reward", label: "صلاحية إعطاء مكافأة وخصم", fieldtype: "Check", insert_after: "custom_no_overtime" },
    { dt: "Employee", fieldname: "custom_hr_col", fieldtype: "Column Break", insert_after: "custom_can_reward" },
    { dt: "Employee", fieldname: "custom_location_1", label: "موقع الفرع الأول", fieldtype: "Link", options: "Shift Location", insert_after: "custom_hr_col" },
    { dt: "Employee", fieldname: "custom_location_2", label: "موقع الفرع الثاني", fieldtype: "Link", options: "Shift Location", insert_after: "custom_location_1" },
    { dt: "Leave Application", fieldname: "custom_reason", label: "سبب الإجازة", fieldtype: "Link", options: "HR Leave Reason", insert_after: "leave_type" },
    { dt: "Leave Application", fieldname: "custom_deduct_days", label: "عدد أيام الخصم", fieldtype: "Float", insert_after: "custom_reason" },
  ],

  permissions: [
    { role: "System Manager", read: 1, write: 1, create: 1, delete: 1 },
    { role: "HR Manager", read: 1, write: 1, create: 1, delete: 1 },
    { role: "HR User", read: 1, write: 1, create: 1 },
    { role: "Employee", read: 1, write: 1, create: 1 },
  ],
};

// تشغيل التجهيز: بيعمل اللي ناقص بس، وبيتخطى اللي موجود
window.runSetup = async function (log) {
  const S = window.SCHEMA;
  const out = (m, ok = true) => log && log(m, ok);

  for (const dt of S.standard) {
    try {
      await API.list(dt, { fields: ["name"], limit: 1 });
      out(`✓ ${dt} موجود`);
    } catch (e) {
      out(`✗ ${dt} مش موجود أو مفيش صلاحية: ${e.message}. اتأكد إن HRMS متسطّب.`, false);
    }
  }

  for (const d of S.doctypes) {
    try {
      if (await API.exists("DocType", d.name)) { out(`✓ ${d.name} موجود بالفعل`); continue; }
      const doc = {
        doctype: "DocType",
        name: d.name,
        module: "Custom",
        custom: 1,
        issingle: d.issingle || 0,
        autoname: d.autoname,
        track_changes: 1,
        fields: d.fields,
        permissions: S.permissions.map((p) => ({ ...p })),
      };
      await API.insert("DocType", doc);
      out(`✓ اتعمل ${d.name}`);
    } catch (e) {
      out(`✗ ${d.name}: ${e.message}`, false);
    }
  }

  for (const f of S.customFields) {
    const name = `${f.dt}-${f.fieldname}`;
    try {
      if (await API.exists("Custom Field", name)) { out(`✓ حقل ${f.label || f.fieldname} موجود`); continue; }
      await API.insert("Custom Field", { doctype: "Custom Field", ...f });
      out(`✓ اتضاف حقل ${f.label || f.fieldname} على ${f.dt}`);
    } catch (e) {
      out(`✗ حقل ${f.fieldname}: ${e.message}`, false);
    }
  }

  try {
    const pol = await API.get(S.POLICY, S.POLICY);
    const patch = {};
    S.doctypes[0].fields.forEach((f) => {
      if (f.default !== undefined && (pol[f.fieldname] === null || pol[f.fieldname] === undefined || pol[f.fieldname] === "")) patch[f.fieldname] = f.default;
    });
    if (Object.keys(patch).length) await API.update(S.POLICY, S.POLICY, patch);
    out("✓ سياسة الحضور جاهزة بالقيم الافتراضية");
  } catch (e) {
    out(`✗ سياسة الحضور: ${e.message}`, false);
  }

  out("خلص التجهيز.");
};
