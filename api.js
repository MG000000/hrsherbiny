// الاتصال بـ ERPNext (Frappe REST API)
// كل طلب بيتبعت بمفتاح اليوزر اللي داخل، فـ ERPNext نفسه هو اللي بيطبّق الصلاحيات.
(function () {
  const isDemo = () => {
    try { const v = localStorage.getItem("hr_demo_mode"); if (v !== null) return v === "1"; } catch (e) {}
    return !!CONFIG.DEMO_MODE;
  };
  const base = () => CONFIG.ERP_URL.replace(/\/+$/, "");
  const ADMIN = () => `token ${CONFIG.ADMIN_API_KEY}:${CONFIG.ADMIN_API_SECRET}`;
  let userAuth = null;
  try { const t = JSON.parse(localStorage.getItem("hr_token")); if (t) userAuth = `token ${t.key}:${t.secret}`; } catch (e) {}

  // مستندات مرجعية: لو اليوزر مالوش صلاحية يقرأها، بنقرأها بمفتاح الأدمن (قراءة بس)
  const REFERENCE = new Set(["Shift Type", "Shift Location", "Leave Type", "Salary Component", "Overtime Type", "HR Settings", "Salary Structure Assignment", "Shift Assignment", "Employee", "User", "Has Role"]);

  class ApiError extends Error { constructor(m, s, raw) { super(m); this.status = s; this.raw = raw; } }

  function parseErr(json, status) {
    let msg = "";
    try {
      if (json && json._server_messages) msg = JSON.parse(json._server_messages).map((m) => { try { return JSON.parse(m).message; } catch (e) { return m; } }).join(" | ");
    } catch (e) {}
    if (!msg && json && json.exception) msg = String(json.exception).split(":").slice(1).join(":").trim() || json.exception;
    if (!msg && json && typeof json.message === "string") msg = json.message;
    if (!msg) msg = status === 403 ? "مالكش صلاحية تعمل ده على ERPNext" : status === 401 ? "انتهت الجلسة، ادخل تاني" : `خطأ من السيرفر (${status})`;
    return msg.replace(/<[^>]+>/g, "");
  }

  async function request(method, path, { body, form, query, auth = "user" } = {}) {
    let url = base() + path;
    if (query) {
      const qs = Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))}`).join("&");
      if (qs) url += "?" + qs;
    }
    const headers = { Accept: "application/json" };
    const a = auth === "admin" ? ADMIN() : auth === "none" ? null : userAuth;
    if (a) headers.Authorization = a;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    let res;
    try { res = await fetch(url, { method, headers, body: payload, credentials: "omit" }); }
    catch (e) { throw new ApiError("مش قادر أوصل لـ ERPNext. اتأكد من الإنترنت ومن إعداد allow_cors على الموقع.", 0, e); }
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) {
      const err = new ApiError(parseErr(json, res.status), res.status, json || text);
      if (res.status === 401 && auth === "user") window.dispatchEvent(new CustomEvent("hr-auth-expired"));
      throw err;
    }
    return json;
  }

  const enc = encodeURIComponent;
  function make(auth) {
    const withFallback = async (doctype, fn) => {
      try { return await fn(auth); }
      catch (e) { if (auth === "user" && (e.status === 403 || e.status === 417) && REFERENCE.has(doctype)) return fn("admin"); throw e; }
    };
    return {
      async list(doctype, { fields = ["name"], filters, or_filters, order_by, limit = 0 } = {}) {
        return withFallback(doctype, async (au) => (await request("GET", `/api/resource/${enc(doctype)}`, { auth: au, query: { fields, filters, or_filters, order_by, limit_page_length: limit } })).data || []);
      },
      async get(doctype, name) {
        return withFallback(doctype, async (au) => (await request("GET", `/api/resource/${enc(doctype)}/${enc(name)}`, { auth: au })).data);
      },
      async insert(doctype, doc) { return (await request("POST", `/api/resource/${enc(doctype)}`, { auth, body: doc })).data; },
      async update(doctype, name, doc) { return (await request("PUT", `/api/resource/${enc(doctype)}/${enc(name)}`, { auth, body: doc })).data; },
      async remove(doctype, name) { await request("DELETE", `/api/resource/${enc(doctype)}/${enc(name)}`, { auth }); return true; },
      async call(method, args = {}) { const r = await request("POST", `/api/method/${method}`, { auth, body: args }); return r ? r.message : null; },
      // Submit و Cancel للمستندات اللي ليها اعتماد
      async submit(doctype, name) { return (await request("PUT", `/api/resource/${enc(doctype)}/${enc(name)}`, { auth, body: { docstatus: 1 } })).data; },
      async cancel(doctype, name) { return this.call("frappe.client.cancel", { doctype, name }); },
      async insertSubmit(doctype, doc) { return this.insert(doctype, { ...doc, docstatus: 1 }); },
      async upload(file, { doctype, docname, is_private = 1 } = {}) {
        const fd = new FormData();
        fd.append("file", file, file.name || "image.jpg");
        fd.append("is_private", is_private ? "1" : "0");
        if (doctype) fd.append("doctype", doctype);
        if (docname) fd.append("docname", docname);
        return (await request("POST", "/api/method/upload_file", { auth, form: fd })).message;
      },
      async attachments(doctype, docname) {
        return this.list("File", { fields: ["name", "file_url", "file_name"], filters: [["attached_to_doctype", "=", doctype], ["attached_to_name", "=", docname]] }).catch(() => []);
      },
      async fileBlobUrl(fileUrl) {
        if (!fileUrl || /^(data:|blob:)/.test(fileUrl)) return fileUrl;
        const url = /^https?:/.test(fileUrl) ? fileUrl : base() + fileUrl;
        for (const au of [auth, "admin"]) {
          let res;
          try { res = await fetch(url, { headers: { Authorization: au === "admin" ? ADMIN() : userAuth }, credentials: "omit" }); }
          catch (e) { throw new ApiError("مش قادر أحمّل الملف من ERPNext", 0, e); }
          if (res.ok) return URL.createObjectURL(await res.blob());
        }
        throw new ApiError("مش قادر أحمّل الصورة", 404);
      },
    };
  }

  const real = make("user");
  real.admin = make("admin");

  // الدخول: نتأكد من الباسورد، وبعدين نطلّع مفتاح API خاص باليوزر ده
  real.login = async function (usr, pwd) {
    try { await request("POST", "/api/method/login", { auth: "none", body: { usr, pwd } }); }
    catch (e) { if (e.status === 401) throw new ApiError("اسم اليوزر أو الباسورد غلط", 401); throw e; }
    let u = (await request("GET", `/api/resource/User/${enc(usr)}`, { auth: "admin" })).data;
    // لو ده نفس اليوزر اللي مفتاح الأدمن بتاعه في الإعدادات، منغيّرش مفتاحه (وإلا الواجهة كلها هتقف)
    if (u.api_key && u.api_key === CONFIG.ADMIN_API_KEY) {
      try { localStorage.setItem("hr_token", JSON.stringify({ key: CONFIG.ADMIN_API_KEY, secret: CONFIG.ADMIN_API_SECRET })); } catch (e) {}
      userAuth = ADMIN();
      return { user: u.name, full_name: u.full_name || u.name, roles: (u.roles || []).map((r) => r.role) };
    }
    const keys = await request("POST", "/api/method/frappe.core.doctype.user.user.generate_keys", { auth: "admin", body: { user: usr } });
    const secret = keys && keys.message && keys.message.api_secret;
    u = (await request("GET", `/api/resource/User/${enc(usr)}`, { auth: "admin" })).data;
    if (!secret || !u.api_key) throw new ApiError("مش قادر أطلّع مفتاح دخول لليوزر ده", 500);
    try { localStorage.setItem("hr_token", JSON.stringify({ key: u.api_key, secret })); } catch (e) {}
    userAuth = `token ${u.api_key}:${secret}`;
    return { user: u.name, full_name: u.full_name || u.name, roles: (u.roles || []).map((r) => r.role) };
  };
  real.logout = () => { userAuth = null; try { localStorage.removeItem("hr_token"); } catch (e) {} };

  window.ApiError = ApiError;
  window.API = new Proxy({}, {
    get(_, prop) {
      if (prop === "isDemo") return isDemo;
      if (prop === "setDemo") return (v) => { try { localStorage.setItem("hr_demo_mode", v ? "1" : "0"); } catch (e) {} };
      const impl = isDemo() ? window.MockAPI : real;
      const v = impl[prop];
      return typeof v === "function" ? v.bind(impl) : v;
    },
  });
})();
