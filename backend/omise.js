const config = require("./config");

const OMISE_API_BASE = "https://api.omise.co";

function isConfigured() {
  return Boolean(config.omiseSecretKey);
}

function getAuthHeader() {
  if (!config.omiseSecretKey) {
    throw new Error("Omise secret key is not configured");
  }
  const token = Buffer.from(`${config.omiseSecretKey}:`).toString("base64");
  return `Basic ${token}`;
}

async function omiseRequest(method, apiPath, body) {
  const response = await fetch(`${OMISE_API_BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data.message ||
      (Array.isArray(data.errors) ? data.errors.map((e) => e.message).join(", ") : null) ||
      `Omise API error (${response.status})`;
    throw new Error(message);
  }

  return data;
}

function bahtToSatang(amountBaht) {
  return Math.round(Number(amountBaht) * 100);
}

function extractQrDownloadUri(source) {
  return (
    source?.scannable_code?.image?.download_uri ||
    source?.scannable_code?.image?.download_uri ||
    null
  );
}

async function fetchQrImageBuffer(downloadUri) {
  const response = await fetch(downloadUri, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "image/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download Omise QR image (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

/**
 * Create PromptPay source + charge for a booth payment session.
 * @returns {{ sourceId: string, chargeId: string, qrDownloadUri: string }}
 */
async function createPromptPayPayment(amountBaht, paymentSessionId) {
  const amount = bahtToSatang(amountBaht);
  if (amount < 2000) {
    throw new Error("Omise PromptPay minimum amount is 20 THB");
  }

  const source = await omiseRequest("POST", "/sources", {
    amount,
    currency: "THB",
    type: "promptpay",
  });

  if (!source.id) {
    throw new Error("Omise did not return a PromptPay source");
  }

  const charge = await omiseRequest("POST", "/charges", {
    amount,
    currency: "THB",
    source: source.id,
    metadata: {
      payment_session_id: paymentSessionId,
      source: "shoot_receipt_booth",
    },
  });

  const qrDownloadUri =
    charge?.source?.scannable_code?.image?.download_uri || extractQrDownloadUri(source);

  if (!charge.id || !qrDownloadUri) {
    throw new Error("Omise did not return a PromptPay QR code");
  }

  return {
    sourceId: charge?.source?.id || source.id,
    chargeId: charge.id,
    qrDownloadUri,
    chargeStatus: charge.status,
  };
}

async function getCharge(chargeId) {
  if (!chargeId) return null;
  return omiseRequest("GET", `/charges/${encodeURIComponent(chargeId)}`);
}

async function getSource(sourceId) {
  if (!sourceId) return null;
  return omiseRequest("GET", `/sources/${encodeURIComponent(sourceId)}`);
}

function isSuccessfulCharge(charge) {
  return charge?.status === "successful" && charge?.paid === true;
}

module.exports = {
  isConfigured,
  createPromptPayPayment,
  getCharge,
  getSource,
  isSuccessfulCharge,
  fetchQrImageBuffer,
  bahtToSatang,
};
