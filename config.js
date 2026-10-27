// إعدادات الاتصال بـ ERPNext
// تنبيه: الـ key والـ secret هنا للتجربة فقط. بعد التجربة اعمل لهم Regenerate من ERPNext.
window.CONFIG = {
  ERP_URL: "https://sky.erpnext.cloud",
  API_KEY: "c8d911b6eaf93db",
  API_SECRET: "36c62b275deaa0f",

  // true = يشتغل ببيانات وهمية محفوظة في المتصفح (من غير ما يكلم ERPNext)
  // تقدر تغيّره كمان من شاشة الدخول
  DEMO_MODE: false,

  APP_NAME: "حضوري",
  COMPANY_NAME: "",

  // مكتبة التعرف على الوجه
  FACE_API_URL: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js",
  FACE_MODELS_URL: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/",

  // كل كام ثانية يشيّك على الإشعارات
  NOTIFY_POLL_SECONDS: 60,
};
