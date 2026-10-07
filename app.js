/* =====================================================================
 * HALLOWEEN CARD PHOTO BOOTH — app.js
 * 순수 HTML/CSS/Vanilla JS/Canvas. 서버·DB·AI 사용 없음.
 * 모든 설정값은 config.js (CONFIG) 에서 읽습니다.
 * ===================================================================== */
(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * 0. 기본 도구
   * ------------------------------------------------------------------ */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const C = CONFIG; // config.js 의 전역 상수
  const LS_ACADEMY = "hb.academyName";

  const support = {
    secure: window.isSecureContext === true,
    dirPicker: "showDirectoryPicker" in window,
    openPicker: "showOpenFilePicker" in window,
    camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    fileProtocol: location.protocol === "file:"
  };
  // 저장 방식: config SAVE.mode — "download"(다운로드 폴더, 기본) | "folder"(지정 폴더)
  const SAVE_MODE = (CONFIG.SAVE && CONFIG.SAVE.mode) || "download";
  support.folderSave = SAVE_MODE === "folder" && support.secure && support.dirPicker;
  support.folderOpen = support.secure && support.openPicker;

  const state = {
    academy: "",
    screen: null,
    returnScreen: "start",
    overlays: {},          // typeId -> HTMLImageElement
    overlayErrors: [],
    parentDir: null,       // 사용자가 고른 위치 (예: 바탕화면)
    cardsDir: null,        // `${학원명}_Halloween_Cards`
    fallbackNoticeShown: false,
    player: null,
    print: { files: [], urls: [], rotated: [] }
  };

  function newPlayer() {
    return {
      name: "", nick: "",
      answers: [], qIndex: 0,
      typeId: null,
      photo: null,           // canvas (원본 사진, 최대 2400px로 축소)
      t: null,               // { cx, cy, base, zoom }  카드 좌표계 기준
      finalBlob: null, finalURL: null,
      savedName: null
    };
  }
  state.player = newPlayer();

  /* ------------------------------------------------------------------
   * 1. 화면 전환
   * ------------------------------------------------------------------ */
  function show(name) {
    if (state.screen === "photo" && name !== "photo") stopCamera();
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
    state.screen = name;
    const hasAcademy = !!state.academy;
    $("#btnSettings").hidden = !hasAcademy || name === "setup";
    $("#btnPrintMenu").hidden = !hasAcademy || name === "setup" || name.startsWith("print");
    $("#topAcademy").hidden = !hasAcademy;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function toast(msg, ms = 2600) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), ms);
  }

  /** 모달. buttons: [{label, kind, value}] → Promise<value> */
  function modal(text, buttons = [{ label: "확인", kind: "primary", value: true }], hud = "NOTICE") {
    return new Promise((resolve) => {
      $("#modalHud").textContent = hud;
      $("#modalText").textContent = text;
      const box = $("#modalButtons");
      box.innerHTML = "";
      buttons.forEach((b) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "btn " + (b.kind || "ghost");
        el.textContent = b.label;
        el.addEventListener("click", () => {
          $("#modal").hidden = true;
          if (typeof b.action === "function") b.action();   // 클릭 안에서 바로 실행 (iPad 파일창 대응)
          resolve(b.value);
        });
        box.appendChild(el);
      });
      $("#modal").hidden = false;
      box.lastChild && box.lastChild.focus();
    });
  }

  /* ------------------------------------------------------------------
   * 2. 문구 / 경고 초기화
   * ------------------------------------------------------------------ */
  function initTexts() {
    $$("[data-text]").forEach((el) => (el.textContent = C.TEXT[el.dataset.text] || ""));
    $("#nickInput").maxLength = C.NICKNAME.maxLength;
    $("#academyInput").maxLength = C.ACADEMY_NAME.maxLength;
    document.documentElement.style.setProperty("--card-ratio", `${C.CARD.width} / ${C.CARD.height}`);

    const warns = [];
    if (support.fileProtocol) {
      warns.push("지금은 파일을 더블클릭해서 연 상태(file://)입니다. 이 방식에서는 브라우저 보안 때문에 카드 이미지 저장이 막힐 수 있어요. 함께 드린 start-windows.bat(Windows) 또는 start-mac.command(Mac)로 실행하거나, 웹서버(HTTPS)에 올려서 사용해주세요.");
    }
    if (!support.folderOpen) {
      warns.push("이 브라우저에서는 인쇄할 때 다운로드 폴더를 자동으로 열 수 없어요. 카드는 정상적으로 다운로드되고, 인쇄할 때 다운로드 폴더에서 카드 이미지를 직접 골라주시면 됩니다. 전체 기능은 PC/노트북의 Chrome 또는 Edge를 권장합니다.");
    }
    ["#fsWarnSetup", "#fsWarnStart"].forEach((id) => {
      const el = $(id);
      el.hidden = warns.length === 0;
      el.innerHTML = warns.map((w) => `<p style="margin:0 0 6px">${escapeHTML(w)}</p>`).join("");
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ------------------------------------------------------------------
   * 3. 카드 PNG 불러오기
   * ------------------------------------------------------------------ */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("load fail: " + src));
      img.src = src;
    });
  }

  async function preloadOverlays() {
    // assets 폴더에서 못 찾으면, index.html 바로 옆(폴더 없이 넣은 경우)에서도 한 번 더 찾아봄
    const tryLoad = (src) => loadImage(src).catch(() => {
      const fileOnly = src.split("/").pop();
      return fileOnly !== src ? loadImage(fileOnly) : Promise.reject(new Error("load fail: " + src));
    });
    const results = await Promise.allSettled(C.CARD_TYPES.map((t) => tryLoad(t.overlay)));
    results.forEach((r, i) => {
      const t = C.CARD_TYPES[i];
      if (r.status === "fulfilled") state.overlays[t.id] = r.value;
      else state.overlayErrors.push(t.overlay);
    });
    if (state.overlayErrors.length) showOverlayError();
    buildCardFan();
  }

  /** 카드 PNG 를 못 불러오면 카드가 빈 배경으로 만들어지므로, 원인을 바로 알려줌 */
  function showOverlayError() {
    const list = state.overlayErrors.join("\n");
    return modal(
      "카드 디자인 이미지를 불러오지 못했어요.\n\n" + list +
      "\n\nindex.html 이 있는 폴더 안에 ‘assets’ 폴더가 있고, 그 안에 card-01.png ~ card-06.png 가 정확히 이 이름으로 들어 있는지 확인해주세요. " +
      "(예: ‘card-01 (1).png’ 처럼 이름이 바뀌었거나 assets 폴더 밖에 있으면 안 돼요.) 확인 후 새로고침(F5) 해주세요.",
      undefined, "CARD IMAGE MISSING"
    );
  }

  function buildCardFan() {
    const fan = $("#cardFan");
    fan.innerHTML = "";
    const list = C.CARD_TYPES.filter((t) => state.overlays[t.id]);
    const n = list.length;
    list.forEach((t, i) => {
      const img = document.createElement("img");
      img.src = state.overlays[t.id].src;
      img.alt = "";
      const mid = (n - 1) / 2;
      const rot = (i - mid) * 9;
      img.style.transform = `translateX(-50%) rotate(${rot}deg)`;
      img.style.zIndex = String(10 - Math.abs(Math.round(i - mid)));
      fan.appendChild(img);
    });
  }

  function typeById(id) {
    return C.CARD_TYPES.find((t) => t.id === id) || C.CARD_TYPES[0];
  }

  /** 실제 캔버스 크기 = 카드 PNG 원본 크기 (config.useOverlaySize) */
  function cardSize(typeId) {
    const ov = state.overlays[typeId];
    if (C.CARD.useOverlaySize && ov && ov.naturalWidth) {
      return { w: ov.naturalWidth, h: ov.naturalHeight };
    }
    return { w: C.CARD.width, h: C.CARD.height };
  }

  /* ------------------------------------------------------------------
   * 4. 학원 설정
   * ------------------------------------------------------------------ */
  function loadAcademy() {
    try { state.academy = (localStorage.getItem(LS_ACADEMY) || "").trim(); }
    catch (e) { state.academy = ""; }
    renderAcademy();
  }

  function renderAcademy() {
    $("#topAcademy").textContent = state.academy;
    $("#startAcademy").innerHTML = state.academy ? `PLAYING AT · <b>${escapeHTML(state.academy)}</b>` : "";
  }

  function openSetup(isEdit) {
    $("#academyInput").value = state.academy;
    $("#setupError").hidden = true;
    $("#setupCancel").hidden = !isEdit;
    show("setup");
    setTimeout(() => $("#academyInput").focus(), 50);
  }

  $("#setupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#academyInput").value.replace(/\s+/g, " ").trim();
    if (!v) { $("#setupError").hidden = false; $("#academyInput").focus(); return; }
    const changed = v !== state.academy;
    state.academy = v;
    try { localStorage.setItem(LS_ACADEMY, v); } catch (err) { /* 저장 불가 환경 */ }
    if (changed) state.cardsDir = null; // 학원명이 바뀌면 하위 폴더도 새 이름으로
    renderAcademy();
    // 완성 카드·위치 조정 화면에서 학원명을 바꿨다면, 새 학원명으로 다시 그리도록 위치 조정 화면으로
    if (changed && state.player.photo && (state.returnScreen === "card" || state.returnScreen === "adjust")) {
      state.returnScreen = "adjust";
      openEditor();
      if (state.returnScreen === "adjust") toast("학원명이 바뀌어서 카드를 다시 만들어요. [카드 완성하기]를 눌러주세요.");
      return;
    }
    show(state.returnScreen && state.returnScreen !== "setup" ? state.returnScreen : "start");
  });
  $("#setupCancel").addEventListener("click", () => show(state.returnScreen || "start"));
  $("#btnSettings").addEventListener("click", () => {
    state.returnScreen = state.screen;
    openSetup(true);
  });

  /* ------------------------------------------------------------------
   * 5. 학생 정보
   * ------------------------------------------------------------------ */
  $("#btnStart").addEventListener("click", () => {
    state.player = newPlayer();
    $("#nameInput").value = "";
    $("#nickInput").value = "";
    updateNickCount();
    $("#infoError").hidden = true;
    show("info");
    setTimeout(() => $("#nameInput").focus(), 50);
  });

  function updateNickCount() {
    $("#nickCount").textContent = `${$("#nickInput").value.length} / ${C.NICKNAME.maxLength}`;
  }
  $("#nickInput").addEventListener("input", updateNickCount);

  $("#infoForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#nameInput").value.replace(/\s+/g, " ").trim();
    const nick = $("#nickInput").value.replace(/\s+/g, " ").trim();
    if (!name || !nick) { $("#infoError").hidden = false; return; }
    state.player.name = name;
    state.player.nick = nick.slice(0, C.NICKNAME.maxLength);
    state.player.answers = [];
    state.player.qIndex = 0;
    renderQuestion();
    show("quiz");
  });

  /* ------------------------------------------------------------------
   * 6. 질문 테스트(문항 수는 config.js) + 점수 계산
   * ------------------------------------------------------------------ */
  function renderQuestion() {
    const p = state.player;
    const total = C.QUESTIONS.length;
    const q = C.QUESTIONS[p.qIndex];
    $("#quizStep").textContent = `${p.qIndex + 1} / ${total}`;
    $("#quizBar").style.width = `${((p.qIndex + 1) / total) * 100}%`;
    $("#quizQuestion").textContent = `Q${p.qIndex + 1}. ${q.text}`;
    const box = $("#quizAnswers");
    box.innerHTML = "";
    q.answers.forEach((a, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "answer" + (p.answers[p.qIndex] === i ? " picked" : "");
      b.innerHTML = `<span class="key">${escapeHTML(a.label || String.fromCharCode(65 + i))}</span><span>${escapeHTML(a.text)}</span>`;
      b.addEventListener("click", () => pickAnswer(i, b));
      box.appendChild(b);
    });
  }

  let answerLock = false;
  let answerTimer = null;
  function cancelAnswerTimer() {
    clearTimeout(answerTimer);
    answerTimer = null;
    answerLock = false;
  }
  function pickAnswer(i, el) {
    if (answerLock) return;
    answerLock = true;
    const p = state.player;
    const q = p.qIndex;
    p.answers[q] = i;
    $$("#quizAnswers .answer").forEach((b) => b.classList.remove("picked"));
    el.classList.add("picked");
    answerTimer = setTimeout(() => {
      answerLock = false;
      // 그 사이 뒤로 가기·처음으로·다음 플레이어가 눌렸으면 무시
      if (state.player !== p || state.screen !== "quiz" || p.qIndex !== q) return;
      if (p.qIndex < C.QUESTIONS.length - 1) {
        p.qIndex++;
        renderQuestion();
      } else {
        p.answers.length = C.QUESTIONS.length;
        p.typeId = computeType(p.answers);
        showTypeResult();
      }
    }, 220);
  }

  function quizBackStep() {
    cancelAnswerTimer();
    const p = state.player;
    if (p.qIndex === 0) { show("info"); return; }
    p.qIndex--;
    renderQuestion();
  }

  /**
   * 점수 규칙 (config.js QUESTIONS[].answers[].scores)
   *  - 고른 답변의 scores 를 타입별로 합산
   *  - 최고점 타입 1개 → 결과
   *  - 동점 → 동점 타입(CARD_TYPES 순서) 중 (Σ (문항번호 × 답변번호)) % 동점개수 번째
   *  - 결과는 항상 CARD_TYPES 안의 하나
   */
  function computeType(answers) {
    const score = {};
    C.CARD_TYPES.forEach((t) => (score[t.id] = 0));
    let key = 0;
    answers.forEach((ai, qi) => {
      const a = C.QUESTIONS[qi] && C.QUESTIONS[qi].answers[ai];
      if (!a) return;
      key += (qi + 1) * (ai + 1);
      Object.entries(a.scores || {}).forEach(([id, pt]) => {
        if (id in score) score[id] += Number(pt) || 0;
      });
    });
    const max = Math.max(...Object.values(score));
    const tied = C.CARD_TYPES.filter((t) => score[t.id] === max);
    return tied[key % tied.length].id;
  }
  window.__computeType = computeType; // 검수용

  function showTypeResult() {
    const t = typeById(state.player.typeId);
    document.documentElement.style.setProperty("--accent", t.accent || "#c8ff2e");
    $("#typeName").textContent = t.name;
    $("#typeTagline").textContent = t.tagline || "";
    $("#typeTagline").hidden = !t.tagline;
    const prev = $("#typePreview");
    prev.hidden = !state.overlays[t.id];
    if (state.overlays[t.id]) prev.src = state.overlays[t.id].src;
    show("type");
  }

  $("#btnMakeCard").addEventListener("click", () => {
    if (!state.overlays[state.player.typeId]) { showOverlayError(); return; }
    openPhotoScreen();
  });

  /* ------------------------------------------------------------------
   * 7. 사진 입력 (카메라 / 파일)
   * ------------------------------------------------------------------ */
  let stream = null;

  function openPhotoScreen() {
    $("#photoChoice").hidden = false;
    $("#cameraBox").hidden = true;
    $("#photoError").hidden = true;
    show("photo");
  }

  let camToken = 0;      // 카메라 요청 순번 — 늦게 도착한 스트림은 바로 끄기 위함

  function stopCamera() {
    camToken++;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    const v = $("#cameraVideo");
    if (v) v.srcObject = null;
    // 카메라 화면도 닫아서, 다시 돌아왔을 때 '죽은 카메라'가 남지 않게
    const box = $("#cameraBox"), choice = $("#photoChoice");
    if (box) box.hidden = true;
    if (choice) choice.hidden = false;
    const b = $("#btnCamera");
    if (b) b.disabled = false;
  }

  async function startCamera() {
    $("#photoError").hidden = true;
    if (!support.camera || !window.isSecureContext) {
      return cameraFallback("이 환경에서는 브라우저 카메라를 바로 쓸 수 없어요.");
    }
    stopCamera();
    const my = ++camToken;
    const camBtn = $("#btnCamera");
    camBtn.disabled = true;                      // 연속 클릭 방지
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false
      });
      if (my !== camToken || state.screen !== "photo") {   // 그 사이 다른 화면으로 갔으면 즉시 끄기
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      const v = $("#cameraVideo");
      v.srcObject = stream;
      await v.play().catch(() => {});
      $("#photoChoice").hidden = true;
      $("#cameraBox").hidden = false;
      camBtn.disabled = false;
    } catch (err) {
      if (my !== camToken) return;
      stopCamera();
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      cameraFallback(denied ? "카메라 사용 권한이 거부되었어요." : "카메라를 찾을 수 없거나 사용할 수 없어요.");
    }
  }

  /** 카메라 직접 접근 불가 → file input capture 로 대체 */
  async function cameraFallback(reason) {
    const go = await modal(
      reason + " 기기의 카메라 앱으로 촬영하거나, 저장된 사진을 가져올 수 있어요.",
      [
        { label: "취소", kind: "ghost", value: null },
        { label: "사진 가져오기", kind: "ghost", value: "upload", action: () => $("#fileUpload").click() },
        { label: "카메라 앱으로 촬영", kind: "primary", value: "capture", action: () => $("#fileCapture").click() }
      ],
      "CAMERA"
    );
    return go;
  }

  $("#btnCamera").addEventListener("click", startCamera);
  $("#btnUpload").addEventListener("click", () => $("#fileUpload").click());
  $("#btnCameraCancel").addEventListener("click", () => {
    stopCamera();
    $("#cameraBox").hidden = true;
    $("#photoChoice").hidden = false;
  });

  $("#btnShutter").addEventListener("click", () => {
    const v = $("#cameraVideo");
    if (!v.videoWidth) { toast("카메라 준비 중이에요. 잠시 후 다시 눌러주세요."); return; }
    const cv = document.createElement("canvas");
    cv.width = v.videoWidth;
    cv.height = v.videoHeight;
    const ctx = cv.getContext("2d");
    // 미리보기와 동일하게 좌우 반전(거울 모드)으로 저장
    ctx.translate(cv.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, cv.width, cv.height);
    $(".camera-view").classList.remove("flash");
    void $(".camera-view").offsetWidth;
    $(".camera-view").classList.add("flash");
    stopCamera();
    setPhoto(limitSize(cv));
  });

  function onFilePicked(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      showPhotoError("이미지 파일만 사용할 수 있어요.");
      return;
    }
    const url = URL.createObjectURL(file);
    loadImage(url)
      .then((img) => {
        URL.revokeObjectURL(url);
        setPhoto(limitSize(img));
      })
      .catch(() => {
        URL.revokeObjectURL(url);
        showPhotoError("이 사진은 열 수 없는 형식이에요. JPG 또는 PNG 사진을 사용해주세요.");
      });
  }
  $("#fileUpload").addEventListener("change", onFilePicked);
  $("#fileCapture").addEventListener("change", onFilePicked);

  function showPhotoError(msg) {
    if (state.screen !== "photo") openPhotoScreen();
    $("#photoError").textContent = msg;
    $("#photoError").hidden = false;
  }

  /** 아주 큰 사진은 긴 변 2400px로 줄여서 메모리/속도 확보 (카드 해상도보다 충분히 큼) */
  function limitSize(src) {
    const w = src.naturalWidth || src.videoWidth || src.width;
    const h = src.naturalHeight || src.videoHeight || src.height;
    const MAX = 2400;
    const r = Math.min(1, MAX / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * r));
    cv.height = Math.max(1, Math.round(h * r));
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }

  function setPhoto(canvas) {
    const p = state.player;
    p.photo = canvas;
    resetTransform();
    openEditor();
  }

  /* ------------------------------------------------------------------
   * 8. 사진 위치 조정 (드래그 / 확대 / 축소)
   * ------------------------------------------------------------------ */
  const editor = $("#editorCanvas");
  const ectx = editor.getContext("2d");
  let rafPending = false;

  /** 타입별 위치값: config 기본값 + CARD_TYPES[].layout 덮어쓰기 */
  function layoutFor(typeId) {
    const L = typeById(typeId).layout || {};
    return {
      photoArea: Object.assign({}, C.CARD.photoArea, L.photoArea || {}),
      nickname: Object.assign({}, C.NICKNAME, L.nickname || {}),
      academyName: Object.assign({}, C.ACADEMY_NAME, L.academyName || {},
        { curve: Object.assign({}, C.ACADEMY_NAME.curve || {}, (L.academyName && L.academyName.curve) || {}) })
    };
  }

  function areaScaled(typeId) {
    const { w, h } = cardSize(typeId);
    const sx = w / C.CARD.width, sy = h / C.CARD.height;
    const a = layoutFor(typeId).photoArea;
    return { x: a.x * sx, y: a.y * sy, w: a.width * sx, h: a.height * sy };
  }

  function resetTransform() {
    const p = state.player;
    if (!p.photo) return;
    const a = areaScaled(p.typeId);
    const base = Math.max(a.w / p.photo.width, a.h / p.photo.height); // cover
    p.t = { cx: a.x + a.w / 2, cy: a.y + a.h / 2, base, zoom: 1 };
    $("#zoomRange").value = "1";
  }

  function openEditor() {
    const { w, h } = cardSize(state.player.typeId);
    editor.width = w;
    editor.height = h;
    editor.style.setProperty("--card-ratio", `${w} / ${h}`);
    show("adjust");
    ensureFonts().then(requestDraw);
    requestDraw();
  }

  function requestDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      composeCard(ectx, editor.width, editor.height);
    });
  }

  function setZoom(z, anchor) {
    const p = state.player;
    if (!p.t) return;
    const min = Number($("#zoomRange").min), max = Number($("#zoomRange").max);
    const nz = Math.min(max, Math.max(min, z));
    if (anchor) {
      // anchor(카드 좌표) 기준으로 확대 → 손가락/마우스 위치가 고정되도록
      const k = nz / p.t.zoom;
      p.t.cx = anchor.x + (p.t.cx - anchor.x) * k;
      p.t.cy = anchor.y + (p.t.cy - anchor.y) * k;
    }
    p.t.zoom = nz;
    $("#zoomRange").value = String(nz);
    requestDraw();
  }

  function toCardXY(clientX, clientY) {
    const r = editor.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * editor.width,
      y: ((clientY - r.top) / r.height) * editor.height
    };
  }

  const pointers = new Map();
  let pinch = null;

  editor.addEventListener("pointerdown", (e) => {
    editor.setPointerCapture(e.pointerId);
    if (!state.player.t) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: state.player.t.zoom };
    }
  });
  editor.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !state.player.t) return;
    const prev = pointers.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    const r = editor.getBoundingClientRect();
    const ratio = editor.width / r.width;
    if (pointers.size === 1) {
      state.player.t.cx += (cur.x - prev.x) * ratio;
      state.player.t.cy += (cur.y - prev.y) * ratio;
      requestDraw();
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toCardXY((a.x + b.x) / 2, (a.y + b.y) / 2);
      // 두 손가락 중간점 이동도 반영
      const pm = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch.mid) {
        state.player.t.cx += (pm.x - pinch.mid.x) * ratio;
        state.player.t.cy += (pm.y - pinch.mid.y) * ratio;
      }
      pinch.mid = pm;
      setZoom(pinch.zoom * (d / pinch.dist), mid);
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  editor.addEventListener("pointerup", endPointer);
  editor.addEventListener("pointercancel", endPointer);
  editor.addEventListener("wheel", (e) => {
    if (!state.player.t) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setZoom(state.player.t.zoom * factor, toCardXY(e.clientX, e.clientY));
  }, { passive: false });

  $("#zoomRange").addEventListener("input", (e) => setZoom(Number(e.target.value)));
  $("#btnZoomIn").addEventListener("click", () => state.player.t && setZoom(state.player.t.zoom * 1.12));
  $("#btnZoomOut").addEventListener("click", () => state.player.t && setZoom(state.player.t.zoom / 1.12));
  $("#btnReset").addEventListener("click", () => { resetTransform(); requestDraw(); });
  $("#btnRetake").addEventListener("click", () => { openPhotoScreen(); startCamera(); });
  $("#btnOther").addEventListener("click", () => $("#fileUpload").click());
  $("#btnConfirm").addEventListener("click", finalizeCard);

  /* ------------------------------------------------------------------
   * 9. 카드 합성 (Canvas)
   *    레이어: ① 학생 사진 → ② 타입별 Overlay PNG → ③ 닉네임 → ④ 학원명
   * ------------------------------------------------------------------ */
  function composeCard(ctx, w, h) {
    const p = state.player;
    const sx = w / C.CARD.width, sy = h / C.CARD.height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.CARD.backgroundColor || "#000";
    ctx.fillRect(0, 0, w, h);

    // ① 학생 사진
    if (p.photo && p.t) {
      const s = p.t.base * p.t.zoom;
      const dw = p.photo.width * s, dh = p.photo.height * s;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(p.photo, p.t.cx - dw / 2, p.t.cy - dh / 2, dw, dh);
    }

    // ② 카드 Overlay PNG (사진 영역이 투명)
    const ov = state.overlays[p.typeId];
    if (ov) ctx.drawImage(ov, 0, 0, w, h);

    // ③ 닉네임  ④ 학원명
    const L = layoutFor(p.typeId);
    const nick = L.nickname.uppercase ? p.nick.toUpperCase() : p.nick;
    const academy = L.academyName.uppercase ? state.academy.toUpperCase() : state.academy;
    drawFittedText(ctx, nick, L.nickname, sx, sy);
    if (L.academyName.curve && L.academyName.curve.enabled && L.academyName.curve.radius > 0) {
      drawArcText(ctx, academy, L.academyName, sx, sy);
    } else {
      drawFittedText(ctx, academy, L.academyName, sx, sy);
    }
    ctx.restore();
  }

  /**
   * 지정 위치에 텍스트를 그리되, maxWidth 를 넘으면 글자 크기를 자동으로 줄임.
   * minFontSize 에서도 넘치면 fillText 의 maxWidth 로 폭을 눌러 절대 넘치지 않게 함.
   */
  function drawFittedText(ctx, text, cfg, sx, sy) {
    if (!text) return;
    const k = Math.min(sx, sy);
    const x = cfg.x * sx, y = cfg.y * sy;
    const maxW = (cfg.maxWidth || C.CARD.width) * sx;
    const hasLS = "letterSpacing" in ctx;
    let size = cfg.fontSize * k;
    const min = (cfg.minFontSize || cfg.fontSize * 0.4) * k;

    const setFont = (px) => {
      ctx.font = `${cfg.fontWeight || "700"} ${px}px ${cfg.fontFamily}`;
      if (hasLS) ctx.letterSpacing = `${(cfg.letterSpacing || 0) * k}px`;
    };
    setFont(size);
    while (ctx.measureText(text).width > maxW && size > min) {
      size = Math.max(min, size - 1 * k);
      setFont(size);
    }
    ctx.fillStyle = cfg.color || "#111";
    ctx.textAlign = cfg.align || "center";
    ctx.textBaseline = cfg.baseline || "middle";
    // 자간은 글자 뒤에 붙으므로 가운데 정렬일 때 절반 보정
    const lsFix = hasLS && (cfg.align || "center") === "center" ? ((cfg.letterSpacing || 0) * k) / 2 : 0;
    ctx.fillText(text, x + lsFix, y, maxW);
    if (hasLS) ctx.letterSpacing = "0px";
  }

  /**
   * 학원명을 원호(위로 볼록)를 따라 한 글자씩 배치.
   * 원호 길이가 maxWidth 를 넘으면 글자 크기를 줄이고, minFontSize 에서도 넘치면 글자 폭을 눌러 맞춤.
   */
  function drawArcText(ctx, text, cfg, sx, sy) {
    if (!text) return;
    const k = Math.min(sx, sy);
    const cx = cfg.x * sx, topY = cfg.y * sy;
    const R = cfg.curve.radius * k;
    const maxW = (cfg.maxWidth || C.CARD.width) * sx;
    const ls = (cfg.letterSpacing || 0) * k;
    const chars = Array.from(text);
    const hasLS = "letterSpacing" in ctx;
    if (hasLS) ctx.letterSpacing = "0px";

    let size = cfg.fontSize * k;
    const min = (cfg.minFontSize || cfg.fontSize * 0.4) * k;
    const measure = () => {
      ctx.font = `${cfg.fontWeight || "700"} ${size}px ${cfg.fontFamily}`;
      const ws = chars.map((c) => ctx.measureText(c).width);
      return { ws, total: ws.reduce((a, b) => a + b, 0) + ls * (chars.length - 1) };
    };
    let m = measure();
    while (m.total > maxW && size > min) {
      size = Math.max(min, size - 1 * k);
      m = measure();
    }
    const squeeze = m.total > maxW ? maxW / m.total : 1;  // 최후 수단: 가로 압축
    const total = m.total * squeeze;

    ctx.fillStyle = cfg.color || "#111";
    ctx.textAlign = "center";
    ctx.textBaseline = cfg.baseline || "middle";
    const centerY = topY + R;               // 원의 중심 (글자들 아래쪽)
    let pos = -total / 2;                   // 원호 위에서의 위치 (가운데 = 0)
    chars.forEach((c, i) => {
      const w = m.ws[i] * squeeze;
      const angle = (pos + w / 2) / R;
      ctx.save();
      ctx.translate(cx, centerY);
      ctx.rotate(angle);
      ctx.translate(0, -R);
      if (squeeze < 1) ctx.scale(squeeze, 1);
      ctx.fillText(c, 0, 0);
      ctx.restore();
      pos += w + ls * squeeze;
    });
  }

  /** 웹폰트(닉네임·학원명 글자)를 미리 불러옴. 오프라인이면 2.5초 후 기본 글꼴로 진행 */
  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const p = state.player || {};
    const sample = "가나다ABC123" + (state.academy || "") + (p.nick || "") + (p.nick || "").toUpperCase();
    const loads = [C.NICKNAME, C.ACADEMY_NAME].map((c) =>
      document.fonts.load(`${c.fontWeight || "700"} ${c.fontSize}px ${c.fontFamily}`, sample).catch(() => {})
    );
    const timeout = new Promise((r) => setTimeout(r, 2500));
    return Promise.race([Promise.all(loads), timeout]);
  }

  async function finalizeCard() {
    const p = state.player;
    if (!p.photo) { openPhotoScreen(); return; }
    const btn = $("#btnConfirm");
    btn.disabled = true;
    try {
      await ensureFonts();
      const { w, h } = cardSize(p.typeId);       // 원본 해상도로 렌더링
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      composeCard(cv.getContext("2d"), w, h);
      const blob = await new Promise((resolve, reject) => {
        try {
          cv.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob null"))), C.CARD.exportType || "image/png");
        } catch (err) { reject(err); }
      });
      if (p.finalURL) URL.revokeObjectURL(p.finalURL);
      p.finalBlob = blob;
      p.finalURL = URL.createObjectURL(blob);
      p.savedName = null;
      $("#finalImage").src = p.finalURL;
      $("#saveStatus").hidden = true;
      $("#btnSave").textContent = "이미지 저장";
      renderFolderInfo();
      show("card");
    } catch (err) {
      console.error(err);
      await modal(
        support.fileProtocol
          ? "파일을 직접 열어 실행(file://)하면 브라우저 보안 때문에 카드 이미지를 만들 수 없어요. start-windows.bat / start-mac.command 로 실행하거나 웹서버에 올려서 사용해주세요."
          : "카드 이미지를 만드는 중 문제가 생겼어요. 다시 시도해주세요.",
        undefined, "ERROR"
      );
    } finally {
      btn.disabled = false;
    }
  }

  /* ------------------------------------------------------------------
   * 10. 저장 — File System Access API (+ IndexedDB 핸들 보관) / 다운로드 fallback
   * ------------------------------------------------------------------ */
  const idb = {
    open() {
      return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) return reject(new Error("no idb"));
        const req = indexedDB.open("halloween-booth", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async get(key) {
      try {
        const db = await idb.open();
        return await new Promise((resolve) => {
          const r = db.transaction("kv").objectStore("kv").get(key);
          r.onsuccess = () => resolve(r.result || null);
          r.onerror = () => resolve(null);
        });
      } catch (e) { return null; }
    },
    async set(key, val) {
      try {
        const db = await idb.open();
        await new Promise((resolve) => {
          const tx = db.transaction("kv", "readwrite");
          tx.objectStore("kv").put(val, key);
          tx.oncomplete = resolve;
          tx.onerror = resolve;
        });
      } catch (e) { /* 무시 */ }
    }
  };

  function sanitize(s) {
    return String(s)
      .replace(/[\\/:*?"<>|\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 80);
  }

  function folderName() {
    return (sanitize(state.academy) || "Academy") + C.SAVE.folderSuffix;
  }

  function cardFileBase() {
    const p = state.player;
    const t = typeById(p.typeId);
    const nick = C.NICKNAME.uppercase ? p.nick.toUpperCase() : p.nick;
    const prefix = SAVE_MODE === "download" ? [sanitize(state.academy), (C.SAVE.filePrefix || "Halloween")] : [];
    const parts = [...prefix, sanitize(p.name), sanitize(nick), sanitize(t.fileLabel || t.name)].filter(Boolean);
    return parts.join("_") || "halloween_card";
  }

  async function verifyPermission(handle) {
    if (!handle) return false;
    try {
      const opts = { mode: "readwrite" };
      if ((await handle.queryPermission(opts)) === "granted") return true;
      return (await handle.requestPermission(opts)) === "granted";
    } catch (e) { return false; }
  }

  /** 저장 폴더 확보: (기억된 위치 → 권한 확인) 또는 (최초 1회 위치 선택) → 하위 폴더 생성/재사용 */
  async function getCardsDir() {
    let parent = state.parentDir || (await idb.get("parentDir"));
    if (parent && !(await verifyPermission(parent))) {
      const e = new Error("permission denied");
      e.name = "PermissionDenied";
      throw e;
    }
    if (!parent) {
      await modal(
        "첫 카드 저장이에요! (처음 한 번만)\n\n" +
        "① 곧 열리는 창에서 아무것도 고르지 말고 바로 [폴더 선택]\n" +
        "② [파일 수정 허용]\n\n" +
        "그러면 ‘사진’ 폴더 안에\n“" + folderName() + "”\n폴더가 자동으로 만들어지고, 이후 카드는 묻지 않고 모두 여기에 저장됩니다.",
        [{ label: "저장 위치 선택", kind: "primary", value: true }],
        "SAVE FOLDER"
      );
      try {
        parent = await window.showDirectoryPicker({ mode: "readwrite", startIn: C.SAVE.pickerStartIn || "pictures" });
      } catch (err) {
        if (err && err.name === "TypeError") {
          parent = await window.showDirectoryPicker({ mode: "readwrite" }); // startIn 미지원 브라우저
        } else throw err;
      }
      if (!(await verifyPermission(parent))) {
        const e = new Error("permission denied");
        e.name = "PermissionDenied";
        throw e;
      }
      await idb.set("parentDir", parent);
    }
    state.parentDir = parent;

    // 사용자가 이미 만들어진 Halloween_Cards 폴더 자체를 고른 경우 그대로 사용
    const fname = folderName();
    const dir = parent.name === fname ? parent : await parent.getDirectoryHandle(fname, { create: true });
    state.cardsDir = dir;
    await idb.set("cardsDir", dir);
    return dir;
  }

  async function exists(dir, name) {
    try { await dir.getFileHandle(name); return true; }
    catch (e) { return false; }
  }

  async function writeUnique(dir, base, ext, blob) {
    let name = `${base}.${ext}`;
    for (let i = 2; await exists(dir, name); i++) name = `${base}_${i}.${ext}`;
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return name;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function setSaveStatus(text, warn) {
    const el = $("#saveStatus");
    el.textContent = text;
    el.classList.toggle("warn", !!warn);
    el.hidden = false;
  }

  function renderFolderInfo() {
    const el = $("#folderInfo");
    if (support.folderSave && (state.cardsDir || state.parentDir)) {
      el.textContent = "저장 폴더: " + ((state.cardsDir && state.cardsDir.name) || folderName());
      el.hidden = false;
    } else el.hidden = true;
  }

  let saving = false;
  $("#btnSave").addEventListener("click", async () => {
    const p = state.player;
    if (!p.finalBlob || saving) return;
    saving = true;
    const btn = $("#btnSave");
    btn.disabled = true;
    const ext = (C.CARD.exportType || "image/png").includes("jpeg") ? "jpg" : "png";
    const base = cardFileBase();
    try {
      if (support.folderSave) {
        try {
          const dir = await getCardsDir();
          const name = await writeUnique(dir, base, ext, p.finalBlob);
          p.savedName = name;
          setSaveStatus(`✓ 저장 완료 — ${dir.name} / ${name}`);
          btn.textContent = "한 번 더 저장";
          renderFolderInfo();
          toast("카드를 저장했어요!");
          return;
        } catch (err) {
          if (err && err.name === "AbortError") {
            toast("저장 위치 선택이 취소됐어요. 다시 [이미지 저장]을 눌러주세요.");
            return;
          }
          console.warn("folder save failed → download fallback", err);
          // 권한 거부/오류 → 일반 다운로드로 대체 (아래로 진행)
        }
      }
      const name = `${base}.${ext}`;
      downloadBlob(p.finalBlob, name);
      p.savedName = name;
      if (SAVE_MODE === "download") {
        setSaveStatus(`✓ 다운로드 폴더에 저장했어요 — ${name}`);
        btn.textContent = "한 번 더 저장";
        toast("카드를 다운로드 폴더에 저장했어요!");
        return;
      }
      setSaveStatus(`✓ 다운로드 완료 — ${name}`, true);
      btn.textContent = "한 번 더 저장";
      if (!state.fallbackNoticeShown) {
        state.fallbackNoticeShown = true;
        await modal(C.TEXT.fallbackSaveNotice, undefined, "DOWNLOAD MODE");
      }
    } finally {
      saving = false;
      btn.disabled = false;
    }
  });

  /* ------------------------------------------------------------------
   * 11. 다시 만들기 / NEXT PLAYER / 처음으로
   * ------------------------------------------------------------------ */
  $("#btnRemake").addEventListener("click", () => {
    // 같은 타입·사진으로 위치 조정부터 다시 (다시 촬영 / 다른 사진 선택도 가능)
    openEditor();
  });

  function resetPlayer() {
    cancelAnswerTimer();
    const p = state.player;
    if (p.finalURL) URL.revokeObjectURL(p.finalURL);
    stopCamera();
    state.player = newPlayer();
    $("#nameInput").value = "";
    $("#nickInput").value = "";
    $("#finalImage").removeAttribute("src");
    $("#typePreview").removeAttribute("src");
    $("#saveStatus").hidden = true;
    ectx.clearRect(0, 0, editor.width, editor.height);
    document.documentElement.style.removeProperty("--accent");
  }

  $("#btnNext").addEventListener("click", async () => {
    if (!state.player.savedName) {
      const ok = await modal(
        "아직 카드를 저장하지 않았어요. 저장하지 않고 다음 플레이어로 넘어갈까요?",
        [{ label: "돌아가기", kind: "ghost", value: false }, { label: "넘어가기", kind: "accent", value: true }],
        "NEXT PLAYER"
      );
      if (!ok) return;
    }
    resetPlayer();
    show("start");
  });

  $$('[data-action="home"]').forEach((b) =>
    b.addEventListener("click", async () => {
      const ok = await modal("처음 화면으로 돌아갈까요? 입력한 내용은 지워져요.",
        [{ label: "취소", kind: "ghost", value: false }, { label: "처음으로", kind: "primary", value: true }]);
      if (!ok) return;
      resetPlayer();
      show("start");
    })
  );

  /* ------------------------------------------------------------------
   * 12. 카드 인쇄 — 파일 선택 (최대 8장) → A4 2×4 → window.print()
   * ------------------------------------------------------------------ */
  $("#btnPrintMenu").addEventListener("click", () => {
    if (!state.screen.startsWith("print")) state.returnScreen = state.screen;
    stopCamera();
    openPrintSelect();
  });

  function openPrintSelect() {
    const n = $("#printModeNotice");
    if (support.folderOpen) {
      n.textContent = SAVE_MODE === "download"
        ? "‘카드 이미지 선택’을 누르면 다운로드 폴더가 열려요. 이름이 “" + (sanitize(state.academy) || "학원명") + "_" + (C.SAVE.filePrefix || "Halloween") + "_”로 시작하는 파일이 카드예요. Ctrl(Mac은 ⌘)을 누른 채 여러 장을 선택하세요."
        : "‘카드 이미지 선택’을 누르면 카드 저장 폴더(" + folderName() + ")에서 바로 고를 수 있어요. Ctrl(Mac은 ⌘) 또는 Shift를 누른 채 여러 장을 선택하세요.";
    } else {
      n.textContent = "이 브라우저에서는 저장 폴더를 자동으로 열 수 없어요. 다운로드해 둔 카드 이미지(보통 ‘다운로드’ 폴더)를 직접 여러 장 선택해주세요.";
    }
    n.hidden = false;
    renderPrintSelection();
    show("print-select");
  }

  function isAllowedImage(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const okExt = ["png", "jpg", "jpeg"].includes(ext);
    const okType = !file.type || /^image\/(png|jpe?g|pjpeg)$/i.test(file.type);
    return okExt && okType;
  }

  function clearPrintSelection() {
    state.print.urls.forEach((u) => URL.revokeObjectURL(u));
    state.print = { files: [], urls: [], rotated: [] };
  }

  /** 새로 고른 파일을 기존 선택 목록 뒤에 추가 (최대 8장, 같은 파일은 한 번만) */
  function acceptPrintFiles(files) {
    $("#printError").hidden = true;
    if (!files.length) return;
    const msgs = [];
    const bad = files.filter((f) => !isAllowedImage(f));
    if (bad.length) msgs.push("PNG, JPG, JPEG 이미지만 인쇄할 수 있어서 제외했어요. (" + bad.map((f) => f.name).join(", ") + ")");
    const key = (f) => `${f.name}|${f.size}|${f.lastModified}`;
    const have = new Set(state.print.files.map(key));
    const fresh = files.filter((f) => isAllowedImage(f) && !have.has(key(f)) && have.add(key(f)));
    const dup = files.filter(isAllowedImage).length - fresh.length;
    if (dup > 0) msgs.push(`이미 선택된 카드 ${dup}장은 빼고 추가했어요.`);
    const room = C.PRINT.maxCards - state.print.files.length;
    if (fresh.length > room) {
      msgs.unshift(C.TEXT.tooManyCards + ` 지금 ${state.print.files.length}장이 선택돼 있어서 ${room}장까지만 더 고를 수 있어요. (방금 고른 카드: ${fresh.length}장)`);
      printError(msgs.join("\n"));
      return;                                   // 넘치면 아무것도 추가하지 않음
    }
    fresh.forEach((f) => {
      state.print.files.push(f);
      state.print.urls.push(URL.createObjectURL(f));
    });
    renderPrintSelection();
    if (msgs.length) printError(msgs.join("\n"));
  }

  function removePrintFile(i) {
    URL.revokeObjectURL(state.print.urls[i]);
    state.print.files.splice(i, 1);
    state.print.urls.splice(i, 1);
    $("#printError").hidden = true;
    renderPrintSelection();
  }

  function printError(msg) {
    $("#printError").textContent = msg;
    $("#printError").hidden = false;
  }

  function renderPrintSelection() {
    const box = $("#printThumbs");
    box.innerHTML = "";
    const { files, urls } = state.print;
    files.forEach((f, i) => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.innerHTML = `<span>${i + 1}</span><button type="button" class="thumb-del" aria-label="이 카드 빼기">×</button><img alt=""><p></p>`;
      d.querySelector("img").src = urls[i];
      d.querySelector("p").textContent = f.name;
      d.querySelector(".thumb-del").addEventListener("click", () => removePrintFile(i));
      box.appendChild(d);
    });
    $("#printCount").hidden = files.length === 0;
    $("#printCount").textContent = `선택한 카드 ${files.length} / ${C.PRINT.maxCards}장`;
    $("#btnBuildLayout").disabled = files.length === 0;
    $("#btnPickPrint").textContent = files.length ? "카드 더 추가하기" : "카드 이미지 선택";
  }

  $("#btnPickPrint").addEventListener("click", async () => {
    if (state.print.files.length >= C.PRINT.maxCards) {
      printError(`이미 ${C.PRINT.maxCards}장이 모두 선택됐어요. 다른 카드를 넣으려면 × 를 눌러 먼저 빼주세요.`);
      return;
    }
    if (!support.folderOpen) { $("#printFileInput").click(); return; }
    const base = {
      multiple: true,
      excludeAcceptAllOption: true,
      types: [{ description: "카드 이미지 (PNG, JPG)", accept: C.PRINT.accept }]
    };
    // 이전에 만든 Halloween Cards 폴더에서 시작
    let start = SAVE_MODE === "download" ? null
      : (state.cardsDir || (await idb.get("cardsDir")) || state.parentDir || (await idb.get("parentDir")));
    let handles;
    try {
      handles = await window.showOpenFilePicker(start ? { ...base, startIn: start } : { ...base, startIn: SAVE_MODE === "download" ? "downloads" : "pictures" });
    } catch (err) {
      if (err && err.name === "AbortError") return;
      try { handles = await window.showOpenFilePicker(base); }   // startIn 문제 시 재시도
      catch (err2) {
        if (err2 && err2.name === "AbortError") return;
        $("#printFileInput").click();                            // 최후 fallback
        return;
      }
    }
    try {
      const files = await Promise.all(handles.map((h) => h.getFile()));
      acceptPrintFiles(files);
    } catch (err) {
      printError("선택한 파일을 열 수 없어요. 파일이 옮겨졌거나 지워졌는지 확인하고 다시 골라주세요.");
    }
  });

  $("#printFileInput").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    acceptPrintFiles(files);
  });

  $("#btnPrintBack").addEventListener("click", () => show(state.returnScreen && !state.returnScreen.startsWith("print") ? state.returnScreen : "start"));

  /**
   * 인쇄용 이미지 준비: 세로 카드는 90° 돌려 가로로 눕힘 (A4 2열 × 4행 칸이 가로형이므로)
   * rotate: "alternate" = 왼쪽 열 시계방향 / 오른쪽 열 반시계방향, "cw" = 모두 시계방향, "none" = 회전 안 함
   */
  async function preparePrintImage(url, col) {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    const mode = C.PRINT.rotate || "alternate";
    if (mode === "none" || w >= h) return url;             // 이미 가로형이면 그대로
    const cv = document.createElement("canvas");
    cv.width = h;
    cv.height = w;
    const ctx = cv.getContext("2d");
    const cw = mode === "cw" || col === 0;                  // 왼쪽 열 = 시계방향
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate((cw ? 90 : -90) * Math.PI / 180);
    ctx.drawImage(img, -w / 2, -h / 2);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    const out = URL.createObjectURL(blob);
    state.print.rotated.push(out);
    return out;
  }

  function buildSheet(urls) {
    const P = C.PRINT;
    const sheet = document.createElement("div");
    sheet.className = "a4";
    // 칸 크기(mm): 눕힌 카드 기준 → 가로 = 카드 세로길이, 세로 = 카드 가로길이
    sheet.style.setProperty("--cell-w", String(P.cardHeightMm || 99));
    sheet.style.setProperty("--cell-h", String(P.cardWidthMm || 66));
    sheet.style.setProperty("--gap", String(P.gapMm ?? 2));
    const grid = document.createElement("div");
    grid.className = "a4-grid";
    for (let i = 0; i < P.maxCards; i++) {
      const cell = document.createElement("div");
      cell.className = "a4-cell";
      if (urls[i]) {
        const img = document.createElement("img");
        img.src = urls[i];
        img.alt = "";
        cell.appendChild(img);
      }
      grid.appendChild(cell);
    }
    sheet.appendChild(grid);
    return sheet;
  }

  $("#btnBuildLayout").addEventListener("click", async () => {
    if (!state.print.files.length) return;
    if (state.print.files.length > C.PRINT.maxCards) return printError(C.TEXT.tooManyCards);
    (state.print.rotated || []).forEach((u) => URL.revokeObjectURL(u));
    state.print.rotated = [];
    const urls = await Promise.all(state.print.urls.map((u, i) => preparePrintImage(u, i % 2).catch(() => u)));
    const preview = buildSheet(urls);
    const printSheet = buildSheet(urls);
    $("#a4Preview").replaceChildren(preview);
    $("#print-area").replaceChildren(printSheet);
    const btn = $("#btnDoPrint");
    btn.disabled = true;
    show("print-preview");
    const imgs = [...preview.querySelectorAll("img"), ...printSheet.querySelectorAll("img")];
    await Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
    btn.disabled = false;
  });

  $("#btnPreviewBack").addEventListener("click", () => show("print-select"));
  $("#btnDoPrint").addEventListener("click", () => window.print());

  /* ------------------------------------------------------------------
   * 13. 시작
   * ------------------------------------------------------------------ */
  async function boot() {
    initTexts();
    loadAcademy();
    // 지난 세션의 폴더 핸들 미리 확인 (권한은 저장할 때 다시 확인)
    if (support.folderSave) {
      state.parentDir = await idb.get("parentDir");
      state.cardsDir = await idb.get("cardsDir");
      if (state.cardsDir && state.cardsDir.name !== folderName()) state.cardsDir = null;
    }
    preloadOverlays();
    if (state.academy) show("start");
    else { state.returnScreen = "start"; openSetup(false); }
  }

  /* ------------------------------------------------------------------
   * 14. 뒤로 가기 — 화면 안 [뒤로] 버튼 + 브라우저 뒤로가기 버튼
   * ------------------------------------------------------------------ */
  function goBack() {
    if (!$("#modal").hidden) return;              // 확인 창이 떠 있으면 무시
    switch (state.screen) {
      case "info": show("start"); break;
      case "quiz": quizBackStep(); break;
      case "type":
        state.player.qIndex = C.QUESTIONS.length - 1;
        renderQuestion();
        show("quiz");
        break;
      case "photo":
        if (!$("#cameraBox").hidden) {            // 카메라 화면 → 선택 화면
          stopCamera();
          $("#cameraBox").hidden = true;
          $("#photoChoice").hidden = false;
        } else show("type");
        break;
      case "adjust": openPhotoScreen(); break;
      case "card": openEditor(); break;
      case "print-select":
        show(state.returnScreen && !state.returnScreen.startsWith("print") ? state.returnScreen : "start");
        break;
      case "print-preview": show("print-select"); break;
      case "setup":
        if (state.academy) show(state.returnScreen && state.returnScreen !== "setup" ? state.returnScreen : "start");
        break;
      default: break;                              // 시작 화면: 그대로
    }
  }

  // 각 화면 패널 왼쪽 위에 [뒤로] 버튼 추가
  ["info", "quiz", "type", "photo", "adjust", "card", "print-select", "print-preview"].forEach((name) => {
    const panel = document.querySelector(`[data-screen="${name}"] .panel`);
    if (!panel) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "back-btn";
    b.innerHTML = "<span aria-hidden=\"true\">←</span> 뒤로";
    b.addEventListener("click", goBack);
    panel.classList.add("has-back");
    panel.prepend(b);
  });

  // 브라우저/마우스의 뒤로가기 버튼도 앱 안에서 한 단계 뒤로 (페이지를 벗어나지 않도록)
  try {
    history.replaceState({ booth: "base" }, "");
    history.pushState({ booth: "app" }, "");
    window.addEventListener("popstate", () => {
      goBack();
      history.pushState({ booth: "app" }, "");
    });
  } catch (e) { /* 일부 환경에서 history 사용 불가 */ }

  window.addEventListener("pagehide", stopCamera);
  boot();
})();
