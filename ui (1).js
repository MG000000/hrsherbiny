// أدوات الواجهة: أيقونات، رسائل، نوافذ، تنسيق
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const P = {
    finger: '<path d="M12 11v3a8 8 0 0 1-1.5 4.7"/><path d="M8.5 21A11.9 11.9 0 0 0 10 14v-3a2 2 0 0 1 4 0v1"/><path d="M14 16c0 1.6-.2 3.1-.6 4.5"/><path d="M17.3 17.6A20 20 0 0 0 18 12v-1a6 6 0 0 0-9.8-4.6"/><path d="M5.2 15a8 8 0 0 0 .8-4 6 6 0 0 1 .5-2.4"/><path d="M21.8 16a20 20 0 0 0 .2-4 10 10 0 0 0-17.5-6.6"/><path d="M2 12v-1a10 10 0 0 1 .7-3.6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    tasks: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    report: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    gear: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    face: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    hourglass: '<path d="M5 22h14M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    chev: '<path d="m15 18-6-6 6-6"/>',
    swap: '<path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.3 18"/><path d="M7 6h1v4"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;

  function toast(msg, kind = "") {
    let box = document.querySelector(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = `toast ${kind}`; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), kind === "bad" ? 6000 : 3200);
  }

  function modal({ title, body, footer, wide, onClose }) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
      <div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icon("x")}</button></div>
      <div class="modal-b"></div>${footer !== false ? '<div class="modal-f"></div>' : ""}</div>`;
    const b = ov.querySelector(".modal-b");
    if (typeof body === "string") b.innerHTML = body; else if (body) b.appendChild(body);
    const f = ov.querySelector(".modal-f");
    if (f && footer) { if (typeof footer === "string") f.innerHTML = footer; else f.appendChild(footer); }
    const close = () => { ov.remove(); onClose && onClose(); };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) close(); });
    document.body.appendChild(ov);
    return { el: ov, body: b, footer: f, close };
  }

  function confirmBox(title, text, okText = "تأكيد", kind = "primary") {
    return new Promise((res) => {
      const m = modal({
        title, body: `<p style="margin:0">${esc(text)}</p>`,
        footer: `<button class="btn ghost" data-close>إلغاء</button><button class="btn ${kind}" data-ok>${esc(okText)}</button>`,
        onClose: () => res(false),
      });
      m.el.querySelector("[data-ok]").onclick = () => { m.el.remove(); res(true); };
    });
  }

  function viewImage(src) {
    modal({ title: "صورة", body: `<img src="${esc(src)}" style="width:100%;border-radius:12px">`, footer: false, wide: true });
  }

  const pad = (n) => String(n).padStart(2, "0");
  const nowDT = () => { const d = new Date(); return `${Calc.ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const today = () => Calc.ymd(new Date());
  const hm = (dt) => (dt ? String(dt).split(" ")[1]?.slice(0, 5) || String(dt).slice(0, 5) : "—");
  const money = (n) => (Number(n) || 0).toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const num = (n) => (Number(n) || 0).toLocaleString("ar-EG");
  const mins = (m) => {
    m = Math.round(Number(m) || 0);
    if (m < 60) return `${num(m)} د`;
    return `${num(Math.floor(m / 60))} س ${m % 60 ? num(m % 60) + " د" : ""}`.trim();
  };
  const dateAr = (d, opts = { weekday: "long", day: "numeric", month: "long" }) => {
    const x = typeof d === "string" ? new Date(d.replace(" ", "T")) : d;
    return x.toLocaleDateString("ar-EG", opts);
  };
  const ago = (dt) => {
    const d = new Date(String(dt).replace(" ", "T"));
    const s = (Date.now() - d) / 1000;
    if (s < 60) return "دلوقتي";
    if (s < 3600) return `من ${num(Math.floor(s / 60))} دقيقة`;
    if (s < 86400) return `من ${num(Math.floor(s / 3600))} ساعة`;
    return dateAr(d, { day: "numeric", month: "short" });
  };
  const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");

  const REQ_TYPE = { late: "حضور متأخر", early: "انصراف مبكر", shift: "بصمة في شيفت تاني" };
  const STATUS = {
    Pending: ["في الانتظار", "warn"], Open: ["في الانتظار", "warn"], Draft: ["في الانتظار", "warn"], Approved: ["مقبول", "ok"], Rejected: ["مرفوض", "bad"], Cancelled: ["ملغي", "mute"],
  };
  const statusTag = (s) => { const [t, k] = STATUS[s] || [s, "mute"]; return `<span class="tag ${k}">${esc(t)}</span>`; };

  const sheet = (o) => modal(o);
  window.UI = { sheet, esc, icon, toast, modal, confirmBox, viewImage, nowDT, today, hm, money, num, mins, dateAr, ago, initials, REQ_TYPE, statusTag };
})();
