/**
 * Guest name step — after home, before layout selection
 */
const BOOTH_GUEST_NAME_KEY = "boothGuestName";
const BOOTH_GUEST_NAME_MAX = 12;
const BOOTH_GUEST_NAME_EMOJI =
  /^\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/u;
const BOOTH_GUEST_NAME_THAI = /[\u0E00-\u0E7F]/;

function sanitizeBoothGuestNameInput(raw) {
  const value = String(raw ?? "");
  let result = "";

  for (let i = 0; i < value.length && result.length < BOOTH_GUEST_NAME_MAX; ) {
    const rest = value.slice(i);
    const emojiMatch = rest.match(BOOTH_GUEST_NAME_EMOJI);
    if (emojiMatch) {
      result += emojiMatch[0];
      i += emojiMatch[0].length;
      continue;
    }

    const char = value[i];
    if (!BOOTH_GUEST_NAME_THAI.test(char) && /[\x20-\x7E]/.test(char)) {
      result += char;
    }
    i += 1;
  }

  return result;
}

function isAllowedNameEntryInput(text) {
  return sanitizeBoothGuestNameInput(text) === String(text ?? "");
}

function applyNameEntrySanitize(input) {
  if (!input) return;
  const sanitized = sanitizeBoothGuestNameInput(input.value);
  if (input.value !== sanitized) {
    input.value = sanitized;
  }
  updateNameEntrySubmitState();
}

function getBoothGuestName() {
  try {
    const name = sessionStorage.getItem(BOOTH_GUEST_NAME_KEY);
    return name && String(name).trim() ? String(name).trim() : "";
  } catch {
    return "";
  }
}

function setBoothGuestName(name) {
  const trimmed = sanitizeBoothGuestNameInput(String(name || "").trim());
  if (!trimmed) return false;
  sessionStorage.setItem(BOOTH_GUEST_NAME_KEY, trimmed);
  return true;
}

function clearBoothGuestName() {
  sessionStorage.removeItem(BOOTH_GUEST_NAME_KEY);
}

function updateNameEntrySubmitState() {
  const input = document.getElementById("name-entry-input");
  const submitBtn = document.getElementById("name-entry-submit");
  if (!input || !submitBtn) return;
  submitBtn.disabled = !input.value.trim();
}

function goToNameEntry() {
  navigateTo("name-entry");

  const input = document.getElementById("name-entry-input");
  if (input) {
    input.value = sanitizeBoothGuestNameInput(getBoothGuestName());
    updateNameEntrySubmitState();
  }
}

async function submitNameAndContinue() {
  const input = document.getElementById("name-entry-input");
  if (input) applyNameEntrySanitize(input);
  const name = sanitizeBoothGuestNameInput(input?.value?.trim() || "");

  if (!name) {
    input?.focus();
    return;
  }

  input?.blur();
  setBoothGuestName(name);

  await fetchBoothSettings();
  if (isBoothPaymentRequired()) {
    goToPayment();
    return;
  }
  goToLayoutSelect();
}

function goToBoothNameBack() {
  clearBoothGuestName();
  goToHome();
}

function initBoothNameModule() {
  const form = document.getElementById("name-entry-form");
  const input = document.getElementById("name-entry-input");
  const submitBtn = document.getElementById("name-entry-submit");
  const btnBack = document.getElementById("btn-name-back");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  input?.addEventListener("beforeinput", (event) => {
    const data = event.data;
    if (!data) return;
    if (!isAllowedNameEntryInput(data)) {
      event.preventDefault();
    }
  });

  input?.addEventListener("compositionend", () => {
    applyNameEntrySanitize(input);
  });

  input?.addEventListener("input", () => {
    applyNameEntrySanitize(input);
  });

  input?.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = event.clipboardData?.getData("text") || "";
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = sanitizeBoothGuestNameInput(
      `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`
    );
    input.setSelectionRange(input.value.length, input.value.length);
    updateNameEntrySubmitState();
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    input.blur();
  });

  submitBtn?.addEventListener("click", () => {
    void submitNameAndContinue();
  });

  btnBack?.addEventListener("click", goToBoothNameBack);
}

document.addEventListener("DOMContentLoaded", initBoothNameModule);

window.getBoothGuestName = getBoothGuestName;
window.clearBoothGuestName = clearBoothGuestName;
