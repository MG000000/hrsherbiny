// بصمة الوجه: بتصوّر الموظف بالكاميرا وتقارن الصورة بصورته المسجلة على ERPNext (حقل image في Employee)
// بتشتغل على أي موبايل فيه كاميرا أمامية، ومش محتاجة Face ID في الموبايل
(function () {
  let loading = null;
  let stream = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.faceapi) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("مش قادر أحمّل مكتبة الوجه"));
      document.head.appendChild(s);
    });
  }

  async function ensureModels() {
    if (!loading) {
      loading = (async () => {
        await loadScript(CONFIG.FACE_API_URL);
        const url = CONFIG.FACE_MODELS_URL;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(url),
          faceapi.nets.faceLandmark68Net.loadFromUri(url),
          faceapi.nets.faceRecognitionNet.loadFromUri(url),
        ]);
      })().catch((e) => { loading = null; throw e; });
    }
    return loading;
  }

  const opts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

  async function descriptorOf(input) {
    const r = await faceapi.detectSingleFace(input, opts()).withFaceLandmarks().withFaceDescriptor();
    return r ? r.descriptor : null;
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("مش قادر أفتح صورة الموظف"));
      img.src = src;
    });
  }

  async function referenceDescriptor(emp) {
    if (!emp.image) return null;
    const key = `hr_face_${emp.name}_${emp.image}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) return new Float32Array(JSON.parse(cached));
    } catch (e) {}
    const blobUrl = await API.fileBlobUrl(emp.image);
    const img = await loadImage(blobUrl);
    const d = await descriptorOf(img);
    if (!d) throw new Error("مفيش وش واضح في صورة الموظف المسجلة على ERPNext. ارفع صورة أوضح.");
    try { localStorage.setItem(key, JSON.stringify(Array.from(d))); } catch (e) {}
    return d;
  }

  async function startCamera(video) {
    stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("المتصفح ده مش بيدعم الكاميرا");
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = stream;
    await video.play();
  }

  function stop() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  }

  function snapshot(video) {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 640; c.height = video.videoHeight || 480;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
  }

  // بترجع { ok, distance, reason }
  async function verify(emp, video, threshold = 0.5) {
    await ensureModels();
    const ref = await referenceDescriptor(emp);
    if (!ref) return { ok: false, reason: "مفيش صورة مسجلة للموظف على ERPNext. لازم ترفع صورة في ملف الموظف الأول." };
    const live = await descriptorOf(snapshot(video));
    if (!live) return { ok: false, reason: "مش شايف وشك كويس. قرّب الموبايل وخلي الإضاءة كويسة." };
    const distance = faceapi.euclideanDistance(ref, live);
    return { ok: distance <= threshold, distance, reason: distance <= threshold ? "" : "الوش مش مطابق للصورة المسجلة." };
  }

  window.Face = { ensureModels, startCamera, stop, verify, snapshot };
})();
