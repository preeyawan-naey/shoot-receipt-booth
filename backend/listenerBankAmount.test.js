const test = require("node:test");
const assert = require("node:assert/strict");
const { matchListenerBankAmount } = require("./listenerBankAmount");

const ONE_BAHT_AT_2102 =
  "SCB Connect รายการเงินเข้า 1.00 บาท เข้าบัญชี X-3708 วันที่ 23 ก.ย. 21:02";

test("1.00 baht at 21:02 does not pay a 2 baht session", () => {
  assert.deepEqual(matchListenerBankAmount(ONE_BAHT_AT_2102, 2), {
    matched: false,
    reason: "amount_mismatch",
    received_amount: 1,
  });
});

test("1.00 baht at 21:02 pays a 1 baht session", () => {
  assert.deepEqual(matchListenerBankAmount(ONE_BAHT_AT_2102, 1), {
    matched: true,
    received_amount: 1,
  });
});

test("1,250.00 baht pays a 1250 baht session", () => {
  assert.deepEqual(matchListenerBankAmount("รายการเงินเข้า 1,250.00 บาท ...", 1250), {
    matched: true,
    received_amount: 1250,
  });
});

test("23.00 baht pays 23 and rejects 2 even when the date is 23", () => {
  const text = "รายการเงินเข้า 23.00 บาท ... วันที่ 23";
  assert.deepEqual(matchListenerBankAmount(text, 23), {
    matched: true,
    received_amount: 23,
  });
  assert.deepEqual(matchListenerBankAmount(text, 2), {
    matched: false,
    reason: "amount_mismatch",
    received_amount: 23,
  });
});

test("outgoing transfer does not pay", () => {
  assert.deepEqual(matchListenerBankAmount("รายการเงินออก 2.00 บาท", 2), {
    matched: false,
    reason: "unparseable",
  });
});

test("text without บาท is unparseable", () => {
  assert.deepEqual(matchListenerBankAmount("รายการเงินเข้า 2.00", 2), {
    matched: false,
    reason: "unparseable",
  });
});
