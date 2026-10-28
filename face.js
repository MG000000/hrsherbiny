// بصمة الوجه
// أول مرة: الموظف بيسجّل وشه بالكاميرا (3 لقطات)، والبصمة بتتحفظ على ERPNext كملف مرفق بملف الموظف.
// بعد كده: كل بصمة بتتقارن بالبصمة المتسجلة. والموظف مش بيقدر يسجّل تاني غير لما الموارد البشرية تمسح القديمة.
(function () {
  let loading = null, stream = null;
  const FILE_PREFIX = "face-enroll-";

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.faceapi) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("مش قادر أحمّل مكتبة التعرف على الوجه. اتأكد من الإنترنت."));
      document.head.appendChild(s);
    });
  }
  function ensureModels() {
    if (!loading) loading = (async () => {
      await loadScript(CONFIG.FACE_API_URL);
      const u = CONFIG.FACE_MODELS_URL;
      try { await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(u), faceapi.nets.faceLandmark68Net.loadFromUri(u), faceapi.nets.faceRecognitionNet.loadFromUri(u)]); }
      catch (e) { throw new Error("مش قادر أحمّل ملفات التعرف على الوجه من cdn.jsdelivr.net. جرّب نت تاني، أو اقفل مانع الإعلانات للصفحة دي."); }
    })().catch((e) => { loading = null; throw e; });
    return loading;
  }
  const opts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });

  async function startCamera(video) {
    stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("المتصفح ده مش بيفتح الكاميرا");
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = stream;
    await video.play();
  }
  function stop() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
  function snapshot(video) {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 640; c.height = video.videoHeight || 480;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
  }
  // وش واحد بس في الصورة، وإلا بنرفض
  async function describe(canvas) {
    const all = await faceapi.detectAllFaces(canvas, opts()).withFaceLandmarks().withFaceDescriptors();
    if (!all.length) return { error: "مش شايف وشك. قرّب الموبايل وخلي النور على وشك." };
    if (all.length > 1) return { error: "فيه أكتر من وش قدام الكاميرا. لازم تكون لوحدك." };
    const box = all[0].detection.box;
    if (box.width < canvas.width * 0.18) return { error: "وشك بعيد، قرّب الموبايل شوية." };
    return { descriptor: Array.from(all[0].descriptor) };
  }
  const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ===== البصمة المتسجلة على ERPNext =====
  // بتتحفظ في Comment على ملف الموظف (بتتقري بالـ API عادي)، مش كملف مرفق،
  // لأن تحميل الملفات من موقع تاني (GitHub Pages) بيترفض على Frappe Cloud.
  const MARK = "FACE1:";
  const b64e = (str) => btoa(unescape(encodeURIComponent(str)));
  const b64d = (str) => decodeURIComponent(escape(atob(str)));
  async function enrollmentFiles(employee) {
    const f = [["reference_doctype", "=", "Employee"], ["comment_type", "=", "Info"], ["content", "like", `%${MARK}%`]];
    if (employee) f.push(["reference_name", "=", employee]);
    const rows = await API.admin.list("Comment", { fields: ["name", "reference_name", "creation"], filters: f, order_by: "creation desc" }).catch(() => []);
    return rows.map((r) => ({ ...r, attached_to_name: r.reference_name }));
  }
  async function loadEnrollment(employee) {
    const rows = await API.admin.list("Comment", { fields: ["name", "content", "creation"], filters: [["reference_doctype", "=", "Employee"], ["reference_name", "=", employee], ["comment_type", "=", "Info"], ["content", "like", `%${MARK}%`]], order_by: "creation desc", limit: 1 });
    if (!rows.length) return null;
    try {
      const txt = String(rows[0].content).replace(/<[^>]+>/g, "").replace(/\s+/g, "");
      const raw = txt.slice(txt.indexOf(MARK) + MARK.length);
      const data = JSON.parse(b64d(raw));
      return data && Array.isArray(data.descriptors) && data.descriptors.length ? data : null;
    } catch (e) { return null; }
  }
  function thumb(canvas) {
    const c = document.createElement("canvas"), w = 160, h = Math.round((canvas.height / canvas.width) * w);
    c.width = w; c.height = h; c.getContext("2d").drawImage(canvas, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.7);
  }
  async function saveEnrollment(emp, descriptors, photo) {
    const round = (d) => d.map((x) => Math.round(x * 1e5) / 1e5);
    const data = { v: 1, employee: emp.name, created: UI.nowDT(), by: Session.user, descriptors: descriptors.map(round), photo: photo ? thumb(photo) : null };
    await API.admin.insert("Comment", { comment_type: "Info", reference_doctype: "Employee", reference_name: emp.name, content: MARK + b64e(JSON.stringify(data)) });
    return data;
  }
  async function enrollmentPhoto(employee) { const d = await loadEnrollment(employee).catch(() => null); return d && d.photo; }
  async function resetEnrollment(employee) {
    const rows = await enrollmentFiles(employee);
    for (const r of rows) await API.admin.remove("Comment", r.name);
    // ملفات النسخة القديمة لو موجودة
    const old = await API.admin.list("File", { fields: ["name"], filters: [["attached_to_doctype", "=", "Employee"], ["attached_to_name", "=", employee], ["file_name", "like", "face-enroll-%"]] }).catch(() => []);
    for (const f of old) await API.admin.remove("File", f.name).catch(() => {});
    return rows.length;
  }

  // وضع تجريبي: لو مكتبة الوجه مش متاحة، بنحاكي البصمة عشان تقدر تجرّب باقي الخطوات
  async function ready() {
    try { await ensureModels(); return true; }
    catch (e) { if (API.isDemo()) return false; throw e; }
  }
  const fakeDescriptor = () => Array.from({ length: 128 }, () => 0);

  // تسجيل أول مرة: 3 لقطات، ولازم يكونوا لنفس الشخص
  async function enroll(emp, video, onProgress) {
    const real = await ready();
    const shots = [];
    let photo = null;
    for (let i = 0; i < 3; i++) {
      onProgress && onProgress(i + 1, 3);
      await sleep(i ? 700 : 200);
      const canvas = snapshot(video);
      if (!real) { shots.push(fakeDescriptor()); photo = photo || canvas; continue; }
      const d = await describe(canvas);
      if (d.error) return { ok: false, reason: d.error };
      shots.push(d.descriptor);
      if (!photo) photo = canvas;
    }
    for (let i = 1; i < shots.length; i++) {
      if (dist(shots[0], shots[i]) > 0.45) return { ok: false, reason: "اللقطات مش متطابقة. اثبت مكانك وبص للكاميرا وجرّب تاني." };
    }
    await saveEnrollment(emp, shots, photo);
    return { ok: true };
  }

  // المقارنة وقت البصمة
  async function verify(emp, video, enrollment) {
    const real = await ready();
    if (!real) return { ok: true, distance: 0, simulated: true };
    const d = await describe(snapshot(video));
    if (d.error) return { ok: false, reason: d.error };
    const best = Math.min(...enrollment.descriptors.map((x) => dist(x, d.descriptor)));
    const th = Number(CONFIG.FACE_THRESHOLD) || 0.5;
    return { ok: best <= th, distance: best, reason: best <= th ? "" : "الوش مش مطابق للبصمة المتسجلة." };
  }

  window.Face = { enrollmentPhoto, ensureModels, startCamera, stop, snapshot, enroll, verify, loadEnrollment, enrollmentFiles, resetEnrollment, FILE_PREFIX };
})();
