/**
 * Guest name step — after home, before layout selection
 */
const BOOTH_GUEST_NAME_KEY = "boothGuestName";
const BOOTH_GUEST_NAME_MAX = 24;

function getBoothGuestName() {
  try {
    const name = sessionStorage.getItem(BOOTH_GUEST_NAME_KEY);
    return name && String(name).trim() ? String(name).trim() : "";
  } catch {
    return "";
  }
}

function setBoothGuestName(name) {
  const trimmed = String(name || "").trim().slice(0, BOOTH_GUEST_NAME_MAX);
  if (!trimmed) return false;
  sessionStorage.setItem(BOOTH_GUEST_NAME_KEY, trimmed);
  return true;
}

function clearBoothGuestName() {
  sessionStorage.removeItem(BOOTH_GUEST_NAME_KEY);
}

function goToNameEntry() {
  navigateTo("name-entry");

  const input = document.getElementById("name-entry-input");
  if (input) {
    input.value = getBoothGuestName();
    window.setTimeout(() => {
      input.focus();
      if (typeof input.select === "function") input.select();
    }, 350);
  }
}

async function submitNameAndContinue() {
  const input = document.getElementById("name-entry-input");
  const name = input?.value?.trim() || "";

  if (!name) {
    input?.focus();
    return;
  }

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
  const btnBack = document.getElementById("btn-name-back");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitNameAndContinue();
  });

  btnBack?.addEventListener("click", goToBoothNameBack);
}

document.addEventListener("DOMContentLoaded", initBoothNameModule);

window.getBoothGuestName = getBoothGuestName;
window.clearBoothGuestName = clearBoothGuestName;
