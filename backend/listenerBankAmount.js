const INCOMING_AMOUNT_RE = /รายการเงินเข้า\s*([\d,]+\.\d{2})\s*บาท/;

function parseIncomingSatang(text) {
  const match = String(text ?? "").match(INCOMING_AMOUNT_RE);
  if (!match) return null;
  const raw = match[1].replace(/,/g, "");
  const [baht, frac] = raw.split(".");
  if (!/^\d+$/.test(baht) || !/^\d{2}$/.test(frac)) return null;
  const satang = Number(baht) * 100 + Number(frac);
  if (!Number.isSafeInteger(satang)) return null;
  return satang;
}

function sessionAmountToSatang(amount) {
  const text = String(amount).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [baht, frac = ""] = text.split(".");
  const satang = Number(baht) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(satang)) return null;
  return satang;
}

function satangToBaht(satang) {
  const baht = Math.trunc(satang / 100);
  const frac = satang % 100;
  if (frac === 0) return baht;
  return Number(`${baht}.${String(frac).padStart(2, "0")}`);
}

function matchListenerBankAmount(text, sessionAmount) {
  const receivedSatang = parseIncomingSatang(text);
  if (receivedSatang == null) {
    return { matched: false, reason: "unparseable" };
  }

  const receivedAmount = satangToBaht(receivedSatang);
  const expectedSatang = sessionAmountToSatang(sessionAmount);
  if (expectedSatang == null || receivedSatang !== expectedSatang) {
    return {
      matched: false,
      reason: "amount_mismatch",
      received_amount: receivedAmount,
    };
  }

  return { matched: true, received_amount: receivedAmount };
}

module.exports = {
  matchListenerBankAmount,
  parseIncomingSatang,
};
