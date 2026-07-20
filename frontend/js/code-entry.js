const CODE_LENGTH = 6;

function initCodeEntryModule() {
  const inputs = [...document.querySelectorAll(".code-digit")];
  const submitBtn = document.getElementById("btn-code-submit");
  const errorEl = document.getElementById("code-entry-error");

  if (!inputs.length || !submitBtn) return;

  const getCode = () => inputs.map((input) => input.value).join("");

  const updateSubmitState = () => {
    const complete = getCode().length === CODE_LENGTH;
    submitBtn.disabled = !complete;
    submitBtn.classList.toggle("code-entry__submit--ready", complete);
  };

  const clearError = () => {
    if (!errorEl) return;
    errorEl.hidden = true;
    errorEl.textContent = "";
  };

  const showError = (message) => {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = message;
    submitBtn.classList.remove("code-entry__submit--ready");
  };

  const resetCodeEntry = () => {
    inputs.forEach((input) => {
      input.value = "";
    });
    clearError();
    updateSubmitState();
    inputs[0]?.focus();
  };

  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      clearError();
      input.value = input.value.replace(/\D/g, "").slice(-1);

      if (input.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }

      updateSubmitState();

      if (getCode().length === CODE_LENGTH) {
        submitBtn.focus();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener("paste", (event) => {
      event.preventDefault();
      clearError();
      const pasted = (event.clipboardData?.getData("text") || "")
        .replace(/\D/g, "")
        .slice(0, CODE_LENGTH);

      pasted.split("").forEach((char, i) => {
        if (inputs[i]) inputs[i].value = char;
      });

      const nextIndex = Math.min(pasted.length, CODE_LENGTH - 1);
      inputs[nextIndex]?.focus();
      updateSubmitState();
    });
  });

  submitBtn.addEventListener("click", async () => {
    const code = getCode();
    if (code.length !== CODE_LENGTH) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Checking...";
    clearError();

    try {
      const result = await verifyTicketCode(code);
      setVerifiedTicketCode(result.ticket_code || code);
      goToFrameSelect();
    } catch (error) {
      showError(error.message || "ไม่สามารถตรวจสอบรหัสได้");
      inputs.forEach((input) => {
        input.value = "";
      });
      updateSubmitState();
      inputs[0]?.focus();
    } finally {
      submitBtn.textContent = "Submit";
      updateSubmitState();
    }
  });

  window.resetCodeEntry = resetCodeEntry;
}

document.addEventListener("DOMContentLoaded", initCodeEntryModule);
