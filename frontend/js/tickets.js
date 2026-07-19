async function verifyTicketCode(ticketCode) {
  const response = await fetch(`${API_URL}/api/tickets/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket_code: ticketCode }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    const error = new Error(data.message || "ไม่สามารถตรวจสอบรหัสได้");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function redeemTicketCode(ticketCode, chosenFrame) {
  const response = await fetch(`${API_URL}/api/tickets/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticket_code: ticketCode,
      chosen_frame: chosenFrame,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    const error = new Error(data.message || "ไม่สามารถบันทึกการใช้ตั๋วได้");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function recordTicketPrintCount(ticketCode, printCount) {
  const response = await fetch(`${API_URL}/api/tickets/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticket_code: ticketCode,
      print_count: printCount,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    const error = new Error(data.message || "ไม่สามารถบันทึกจำนวนการพิมพ์ได้");
    error.status = response.status;
    throw error;
  }

  return data;
}

function getVerifiedTicketCode() {
  return sessionStorage.getItem("verifiedTicketCode");
}

function setVerifiedTicketCode(code) {
  sessionStorage.setItem("verifiedTicketCode", code);
}

function clearVerifiedTicketCode() {
  sessionStorage.removeItem("verifiedTicketCode");
}
