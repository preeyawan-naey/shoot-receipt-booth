const paymentSettings = require("./paymentSettings");
const omise = require("./omise");

async function getSettings() {
  const payment = await paymentSettings.getPaymentSettings();
  const omiseConfigured = omise.isConfigured();

  return {
    omise_configured: omiseConfigured,
    omise_enabled: payment.omise_enabled,
    omise_payment_active: omiseConfigured && payment.omise_enabled,
    ...payment,
  };
}

module.exports = {
  getSettings,
};
