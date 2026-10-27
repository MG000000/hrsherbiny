// طبقة الاتصال بـ ERPNext (Frappe REST API)
// نفس الواجهة بتشتغل مع ERPNext الحقيقي أو مع البيانات التجريبية (mock.js)

(function () {
  const isDemo = () => {
    try {
      const v = localStorage.getItem("hr_demo_mode");
      if (v !== null) return v === "1";
    } catch (e) {}
    return !!CONFIG.DEMO_MODE;
  };

  const base = () => CONFIG.ERP_URL.replace(/\/+$/, "");
  const authHeader = () => ({ Authorization: `token ${CONFIG.API_KEY}:${CONFIG.API_SECRET}` });

  class ApiError extends Error {
    constructor(message, status, raw) {
      super(message);
      this.status = status;
      this.raw = raw;
    }
  }

  function parseServerError(json, status) {
    let msg = "";
    try {
      if (json && json._server_messages) {
        const arr = JSON.parse(json._server_messages);
        msg = arr.map((m) => { try { return JSON.parse(m).message; } catch (e) { return m; } }).join(" | ");
      }
    } catch (e) {}
    if (!msg && json && json.exception) msg = String(json.exception).split(":").slice(1).join(":").trim() || json.exception;
    if (!msg && json && json.message && typeof json.message === "string") msg = json.message;
    if (!msg) msg = `خطأ من السيرفر (${status})`;
    return msg.replace(/<[^>]+>/g, "");
  }

  async function request(method, path, { body, form, auth = true, query } = {}) {
    let url = base() + path;
    if (query) {
      const qs = Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))}`)
        .join("&");
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }
    const headers = { Accept: "application/json", ...(auth ? authHeader() : {}) };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, { method, headers, body: payload, credentials: "omit" });
    } catch (e) {
      throw new ApiError("مش قادر أوصل للسيرفر. اتأكد من الإنترنت ومن إعداد الـ CORS على ERPNext.", 0, e);
    }
    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok) throw new ApiError(parseServerError(json, res.status), res.status, json || text);
    return json;
  }

  const enc = (s) => encodeURIComponent(s);

  const real = {
    async list(doctype, { fields = ["name"], filters, or_filters, order_by, limit = 0 } = {}) {
      const r = await request("GET", `/api/resource/${enc(doctype)}`, {
        query: { fields, filters, or_filters, order_by, limit_page_length: limit },
      });
      return r.data || [];
    },
    async get(doctype, name) {
      const r = await request("GET", `/api/resource/${enc(doctype)}/${enc(name)}`);
      return r.data;
    },
    async exists(doctype, name) {
      try { await this.get(doctype, name); return true; }
      catch (e) { if (e.status === 404) return false; throw e; }
    },
    async insert(doctype, doc) {
      const r = await request("POST", `/api/resource/${enc(doctype)}`, { body: doc });
      return r.data;
    },
    async update(doctype, name, doc) {
      const r = await request("PUT", `/api/resource/${enc(doctype)}/${enc(name)}`, { body: doc });
      return r.data;
    },
    async remove(doctype, name) {
      await request("DELETE", `/api/resource/${enc(doctype)}/${enc(name)}`);
      return true;
    },
    async call(method, args = {}, httpMethod = "POST") {
      const r = httpMethod === "GET"
        ? await request("GET", `/api/method/${method}`, { query: args })
        : await request("POST", `/api/method/${method}`, { body: args });
      return r ? r.message : null;
    },
    async submit(doctype, name) {
      const doc = await this.get(doctype, name);
      return this.call("frappe.client.submit", { doc });
    },
    async upload(file, { doctype, docname, is_private = 1 } = {}) {
      const fd = new FormData();
      fd.append("file", file, file.name || "image.jpg");
      fd.append("is_private", is_private ? "1" : "0");
      if (doctype) fd.append("doctype", doctype);
      if (docname) fd.append("docname", docname);
      const r = await request("POST", `/api/method/upload_file`, { form: fd });
      return r.message;
    },
    async attachments(doctype, docname) {
      return this.list("File", {
        fields: ["name", "file_url", "file_name"],
        filters: [["attached_to_doctype", "=", doctype], ["attached_to_name", "=", docname]],
      });
    },
    // يجيب صورة (حتى لو private) كـ blob URL
    async fileBlobUrl(fileUrl) {
      if (!fileUrl) return null;
      if (/^(data:|blob:)/.test(fileUrl)) return fileUrl;
      const url = /^https?:/.test(fileUrl) ? fileUrl : base() + fileUrl;
      const res = await fetch(url, { headers: authHeader(), credentials: "omit" });
      if (!res.ok) throw new ApiError("مش قادر أحمّل الصورة", res.status);
      return URL.createObjectURL(await res.blob());
    },
    // التأكد من الإيميل والباسورد بدون ما نعتمد على الكوكيز
    async verifyLogin(usr, pwd) {
      try {
        await request("POST", "/api/method/login", { body: { usr, pwd }, auth: false });
        return true;
      } catch (e) {
        if (e.status === 401) return false;
        throw e;
      }
    },
    async userRoles(user) {
      try {
        const u = await this.get("User", user);
        return (u.roles || []).map((r) => r.role);
      } catch (e) { return []; }
    },
  };

  window.ApiError = ApiError;
  window.API = new Proxy({}, {
    get(_, prop) {
      if (prop === "isDemo") return isDemo;
      if (prop === "setDemo") return (v) => { try { localStorage.setItem("hr_demo_mode", v ? "1" : "0"); } catch (e) {} };
      const impl = isDemo() ? window.MockAPI : real;
      const fn = impl[prop];
      return typeof fn === "function" ? fn.bind(impl) : fn;
    },
  });
})();
