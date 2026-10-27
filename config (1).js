// إعدادات الواجهة
window.CONFIG = {
  ERP_URL: "https://sky.erpnext.cloud",

  // مفتاح الأدمن: بيتستخدم بس وقت الدخول (عشان يطلّع مفتاح خاص لكل يوزر)، وفي إرسال الإشعارات
  // وقراءة بيانات مرجعية زي الشيفتات. كل باقي الشغل بيتعمل بصلاحيات اليوزر نفسه على ERPNext.
  // ⚠️ أي حد يفتح كود الصفحة يقدر يشوفه. بعد التجربة اعمل له Regenerate.
  ADMIN_API_KEY: "c8d911b6eaf93db",
  ADMIN_API_SECRET: "36c62b275deaa0f",

  DEMO_MODE: false,
  APP_NAME: "حضوري",

  // ===== قواعد مالهاش خانة أصلية في ERPNext =====
  MONTHLY_GRACE_MINUTES: 100,   // رصيد السماح الشهري (دقيقة)
  LATE_MULTIPLIER: 2,           // الدقائق الزيادة عن السماح بتتضرب في كام
  WORKING_DAYS_PER_MONTH: 26,   // لحساب سعر الدقيقة من المرتب الأساسي
  WEEKLY_OFF: [5],              // أيام الإجازة الأسبوعية: 0 الأحد ... 5 الجمعة 6 السبت
  OVERTIME_MULTIPLIER_FALLBACK: 1.5, // لو الشيفت مالوش Overtime Type

  // ===== مكونات المرتب (Salary Component) اللي الحسابات بتتبعت عليها كـ Additional Salary =====
  COMPONENTS: {
    late: "خصم التأخير",            // Deduction
    missed: "خصم نسيان البصمة",     // Deduction — المبلغ لكل مرة بيتقري من خانة Amount في المكون
    overtime: "أوفر تايم",          // Earning — لو الشيفت له Overtime Type بيتاخد المكون بتاعه
    reward: "مكافأة",               // Earning
    deduction: "خصم إداري",         // Deduction
  },

  FACE_API_URL: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js",
  FACE_MODELS_URL: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/",
  FACE_THRESHOLD: 0.5,
  REQUIRE_FACE: true,
  NOTIFY_POLL_SECONDS: 60,
};
