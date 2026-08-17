const paymentSettings = require("./paymentSettings");
const omise = require("./omise");

async function getSettings() {
  const payment = await paymentSettings.getPaymentSettings();

  return {
    omise_configured: omise.isConfigured(),
    ...payment,
  };
}

module.exports = {
  getSettings,
};
