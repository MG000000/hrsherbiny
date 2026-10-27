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
      await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(u), faceapi.nets.faceLandmark68Net.loadFromUri(u), faceapi.nets.faceRecognitionNet.loadFromUri(u)]);
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
  async function enrollmentFiles(employee) {
    const f = [["attached_to_doctype", "=", "Employee"], ["file_name", "like", `${FILE_PREFIX}%`]];
    if (employee) f.push(["attached_to_name", "=", employee]);
    return API.admin.list("File", { fields: ["name", "file_name", "file_url", "attached_to_name", "creation"], filters: f, order_by: "creation desc" }).catch(() => []);
  }
  async function loadEnrollment(employee) {
    const files = await enrollmentFiles(employee);
    const json = files.find((f) => /\.json$/i.test(f.file_name));
    if (!json) return null;
    const url = await API.admin.fileBlobUrl(json.file_url);
    try { const data = await (await fetch(url)).json(); return data && Array.isArray(data.descriptors) && data.descriptors.length ? data : null; }
    catch (e) { return null; }
  }
  async function saveEnrollment(emp, descriptors, photo) {
    const data = { v: 1, employee: emp.name, created: UI.nowDT(), by: Session.user, descriptors };
    const json = new File([JSON.stringify(data)], `${FILE_PREFIX}${emp.name}.json`, { type: "application/json" });
    await API.admin.upload(json, { doctype: "Employee", docname: emp.name, is_private: 1 });
    if (photo) {
      const blob = await new Promise((r) => photo.toBlob(r, "image/jpeg", 0.85));
      if (blob) await API.admin.upload(new File([blob], `${FILE_PREFIX}${emp.name}.jpg`, { type: "image/jpeg" }), { doctype: "Employee", docname: emp.name, is_private: 1 });
    }
    return data;
  }
  async function resetEnrollment(employee) {
    const files = await enrollmentFiles(employee);
    for (const f of files) await API.admin.remove("File", f.name);
    return files.length;
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

  window.Face = { ensureModels, startCamera, stop, snapshot, enroll, verify, loadEnrollment, enrollmentFiles, resetEnrollment, FILE_PREFIX };
})();
