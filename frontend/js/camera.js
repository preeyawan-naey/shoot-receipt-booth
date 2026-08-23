/**
 * Camera Page — Webcam live view, countdown, capture
 */
const cameraState = {
  frame: null,
  stream: null,
  capturedPhotos: [],
  currentShot: 0,
  totalShots: 0,
  isCountingDown: false,
  isSessionActive: false,
  countdownTimer: null,
  audioCtx: null,
};

const COUNTDOWN_START = 5;
const BETWEEN_SHOTS_MS = 1400;
const CAMERA_BRIGHTNESS_FILTER = "Graysclae(100%) brightness(0.8) contrast(1.2)";

function initCameraModule() {
  const btnShutter = document.getElementById("btn-shutter");
  btnShutter?.addEventListener("click", () => {
    if (cameraState.isSessionActive && !cameraState.isCountingDown) {
      startCountdown();
    }
  });
}

/**
 * เริ่ม session ถ่ายรูปเมื่อเข้าหน้ากล้อง
 * @param {object} layout - config จาก layouts.js
 */
async function startCameraSession(frame) {
  stopCameraSession();

  cameraState.frame = frame;
  cameraState.capturedPhotos = [];
  cameraState.currentShot = 0;
  cameraState.totalShots = frame.photoCount;
  cameraState.isSessionActive = true;

  updatePhotoCounter();

  const video = document.getElementById("camera-video");
  const viewport = document.getElementById("camera-viewport");

  viewport?.classList.remove("camera-viewport--error", "camera-viewport--ready");
  viewport?.classList.add("camera-viewport--loading");

  try {
    cameraState.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
        exposureMode: "continuous",
        whiteBalanceMode: "continuous",
      },
      audio: false,
    });

    if (video) {
      video.srcObject = cameraState.stream;
      await video.play();
      applyCameraBrightness();
    }

    viewport?.classList.remove("camera-viewport--loading", "camera-viewport--error");
    viewport?.classList.add("camera-viewport--ready");
  } catch (err) {
    viewport?.classList.remove("camera-viewport--loading", "camera-viewport--ready");
    viewport?.classList.add("camera-viewport--error");
    console.error("Camera access failed:", err);
    return;
  }

  hideCountdown();
}

function applyCameraBrightness() {
  const track = cameraState.stream?.getVideoTracks?.()?.[0];
  if (!track) return;

  const caps = track.getCapabilities?.();
  if (caps?.exposureCompensation) {
    const mid =
      (caps.exposureCompensation.min + caps.exposureCompensation.max) / 2;
    const target = Math.min(caps.exposureCompensation.max, mid + 0.35);
    track
      .applyConstraints({ advanced: [{ exposureCompensation: target }] })
      .catch(() => {});
  }
}

function stopCameraSession() {
  cameraState.isSessionActive = false;
  cameraState.isCountingDown = false;

  if (cameraState.countdownTimer) {
    clearInterval(cameraState.countdownTimer);
    cameraState.countdownTimer = null;
  }

  if (cameraState.stream) {
    cameraState.stream.getTracks().forEach((track) => track.stop());
    cameraState.stream = null;
  }

  const video = document.getElementById("camera-video");
  if (video) {
    video.srcObject = null;
  }

  const viewport = document.getElementById("camera-viewport");
  viewport?.classList.remove("camera-viewport--ready", "camera-viewport--error");
  viewport?.classList.add("camera-viewport--loading");

  hideCountdown();
}

function updatePhotoCounter() {
  const counter = document.getElementById("camera-photo-counter");
  if (!counter) return;

  const current = String(cameraState.currentShot).padStart(2, "0");
  const total = String(cameraState.totalShots).padStart(2, "0");
  counter.textContent = `${current}/${total}`;
}

function startCountdown() {
  if (cameraState.isCountingDown || !cameraState.isSessionActive) return;

  cameraState.isCountingDown = true;
  let remaining = COUNTDOWN_START;

  const overlay = document.getElementById("countdown-overlay");
  const numberEl = document.getElementById("countdown-number");

  if (overlay) overlay.hidden = false;
  if (numberEl) numberEl.textContent = String(remaining);

  playBeep(440);

  cameraState.countdownTimer = setInterval(() => {
    remaining -= 1;

    if (remaining > 0) {
      if (numberEl) numberEl.textContent = String(remaining);
      playBeep(440);
      pulseCountdown();
    } else {
      clearInterval(cameraState.countdownTimer);
      cameraState.countdownTimer = null;
      cameraState.isCountingDown = false;

      if (numberEl) numberEl.textContent = "";
      hideCountdown();

      playBeep(880, 0.15);
      capturePhoto();
    }
  }, 1000);
}

function hideCountdown() {
  const overlay = document.getElementById("countdown-overlay");
  if (overlay) overlay.hidden = true;
}

function pulseCountdown() {
  const numberEl = document.getElementById("countdown-number");
  if (!numberEl) return;

  numberEl.classList.remove("countdown-number--pulse");
  void numberEl.offsetWidth;
  numberEl.classList.add("countdown-number--pulse");
}

function playBeep(frequency, duration = 0.08) {
  try {
    if (!cameraState.audioCtx) {
      cameraState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const ctx = cameraState.audioCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // fallback: silent if audio unavailable
  }
}

function triggerFlash() {
  const flash = document.getElementById("flash-overlay");
  if (!flash) return;

  flash.classList.add("flash-overlay--active");
  setTimeout(() => flash.classList.remove("flash-overlay--active"), 280);
}

const CAPTURE_LANDSCAPE_WIDTH = 960;
const CAPTURE_LANDSCAPE_HEIGHT = 720;

function getLandscapeVideoCrop(vw, vh, targetRatio = CAPTURE_LANDSCAPE_WIDTH / CAPTURE_LANDSCAPE_HEIGHT) {
  const videoRatio = vw / vh;

  if (videoRatio > targetRatio) {
    const sHeight = vh;
    const sWidth = vh * targetRatio;
    return { sx: (vw - sWidth) / 2, sy: 0, sWidth, sHeight };
  }

  const sWidth = vw;
  const sHeight = vw / targetRatio;
  return { sx: 0, sy: (vh - sHeight) / 2, sWidth, sHeight };
}

function capturePhoto() {
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");

  if (!video || !canvas) return;

  triggerFlash();

  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const crop = getLandscapeVideoCrop(vw, vh);

  canvas.width = CAPTURE_LANDSCAPE_WIDTH;
  canvas.height = CAPTURE_LANDSCAPE_HEIGHT;

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.filter = CAMERA_BRIGHTNESS_FILTER;
  ctx.translate(CAPTURE_LANDSCAPE_WIDTH, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(
    video,
    crop.sx,
    crop.sy,
    crop.sWidth,
    crop.sHeight,
    0,
    0,
    CAPTURE_LANDSCAPE_WIDTH,
    CAPTURE_LANDSCAPE_HEIGHT
  );
  ctx.restore();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  cameraState.capturedPhotos.push(dataUrl);
  cameraState.currentShot += 1;

  if (cameraState.currentShot >= cameraState.totalShots) {
    finishCaptureSession();
  } else {
    updatePhotoCounter();
    setTimeout(() => {
      if (
        cameraState.isSessionActive &&
        cameraState.currentShot < cameraState.totalShots &&
        !cameraState.isCountingDown
      ) {
        startCountdown();
      }
    }, BETWEEN_SHOTS_MS);
  }
}

function finishCaptureSession() {
  cameraState.isSessionActive = false;

  const payload = {
    frameId: cameraState.frame.id,
    frameLabel: cameraState.frame.label,
    photoCount: cameraState.frame.photoCount,
    layout: cameraState.frame.layout,
    decorativeFrameId: getSelectedFrameId(),
    photos: cameraState.capturedPhotos,
    capturedAt: new Date().toISOString(),
  };

  sessionStorage.setItem("capturedPhotos", JSON.stringify(payload));

  stopCameraSession();
  navigateToProcess(payload);
}

/**
 * นำทางไปหน้า Preview พร้อมข้อมูลรูปที่ถ่าย
 * @param {object} payload
 */
function navigateToProcess(payload) {
  showPreviewPage(payload.photos, payload.frameId)
    .then(() => {
      navigateTo("process");
    })
    .catch((error) => {
      console.error("[preview]", error);
      alert("โหลดเฟรมไม่สำเร็จ กรุณาเลือกเฟรมใหม่");
      sessionStorage.removeItem("capturedPhotos");
      const layoutId = getSelectedLayoutId();
      if (layoutId && layoutHasFrames(layoutId)) {
        if (typeof initFrameGrid === "function") {
          initFrameGrid(layoutId);
        }
        navigateTo("frame-select");
      } else {
        navigateTo("layout-select");
      }
    });
}

document.addEventListener("DOMContentLoaded", initCameraModule);
