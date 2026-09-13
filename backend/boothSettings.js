const config = require("./config");
const paymentSettings = require("./paymentSettings");
const omise = require("./omise");

async function getSettings() {
  const payment = await paymentSettings.getPaymentSettings();
  const omiseConfigured = omise.isConfigured();
  const paymentMode = payment.payment_mode || "static_qr";
  const omiseActive = paymentMode === "omise" && omiseConfigured;

  const settings = {
    omise_configured: omiseConfigured,
    omise_enabled: paymentMode === "omise",
    omise_payment_active: omiseActive,
    payment_mode: paymentMode,
    bank_webhook_url: `${config.publicUrl}/api/webhook/bank-notify`,
    bank_webhook_secret_configured: Boolean(config.bankWebhookSecret),
    ...payment,
  };

  if (paymentMode === "static_qr" && config.bankWebhookSecret) {
    settings.bank_webhook_secret = config.bankWebhookSecret;
  }

  return settings;
}

module.exports = {
  getSettings,
};
