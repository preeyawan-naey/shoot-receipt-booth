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
const BETWEEN_SHOTS_MS = 1800;
const AUTO_START_DELAY_MS = 1200;

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
 * @param {object} frame - config จาก frames.js
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

  try {
    cameraState.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    if (video) {
      video.srcObject = cameraState.stream;
      await video.play();
    }

    viewport?.classList.remove("camera-viewport--error");
  } catch (err) {
    viewport?.classList.add("camera-viewport--error");
    console.error("Camera access failed:", err);
    return;
  }

  setTimeout(() => {
    if (cameraState.isSessionActive && !cameraState.isCountingDown) {
      startCountdown();
    }
  }, AUTO_START_DELAY_MS);
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

  hideCountdown();
}

function updatePhotoCounter() {
  const counter = document.getElementById("camera-photo-counter");
  if (!counter) return;

  const current = String(cameraState.currentShot + 1).padStart(2, "0");
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

function capturePhoto() {
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");

  if (!video || !canvas) return;

  triggerFlash();

  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / vw);

  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(-scale, scale);
  ctx.drawImage(video, -vw, 0, vw, vh);
  ctx.restore();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  cameraState.capturedPhotos.push(dataUrl);
  cameraState.currentShot += 1;

  if (cameraState.currentShot >= cameraState.totalShots) {
    finishCaptureSession();
  } else {
    updatePhotoCounter();
    setTimeout(() => {
      if (cameraState.isSessionActive) {
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
  showPreviewPage(payload.photos, payload.frameId).then(() => {
    navigateTo("process");
  });
}

document.addEventListener("DOMContentLoaded", initCameraModule);
