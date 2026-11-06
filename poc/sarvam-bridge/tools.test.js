const test = require("node:test");
const assert = require("node:assert");
const { openSlots, book, parseSlot } = require("./tools");

const NOW = new Date("2026-10-07T04:00:00Z"); // Wed 09:30 IST

test("closed on Sunday, nothing in the past", () => {
  assert.equal(openSlots("2026-10-11", [], NOW).slots.length, 0); // Sunday
  assert.equal(openSlots("2026-10-06", [], NOW).slots.length, 0);
  assert.match(openSlots("2026-10-11", [], NOW).message, /Sunday/);
});

test("offers up to four slots inside opening hours, never at lunch", () => {
  const r = openSlots("2026-10-08", [], NOW);
  assert.ok(r.slots.length > 0 && r.slots.length <= 4);
  for (const s of r.slots) {
    const { min } = parseSlot(s);
    assert.ok(min >= 600 && min < 1140);
    assert.ok(!(min >= 780 && min < 840));
  }
  assert.equal(r.slots.length, r.slots_voice.length);
});

test("a booked slot is no longer offered", () => {
  const bookings = [];
  const first = openSlots("2026-10-08", bookings, NOW).slots[0];
  const r = book({ customer_name: "Karthik", customer_phone: "9876543210", service_type: "cleaning", slot: first }, bookings, "c1", NOW);
  assert.equal(r.success, true);
  assert.ok(!openSlots("2026-10-08", bookings, NOW).slots.includes(first));
});

test("booking refuses an incomplete phone number", () => {
  const bookings = [];
  const slot = openSlots("2026-10-08", bookings, NOW).slots[0];
  const r = book({ customer_name: "A", customer_phone: "98765", service_type: "x", slot }, bookings, "c", NOW);
  assert.match(r.error, /incomplete/);
  assert.equal(bookings.length, 0);
  assert.equal(book({ customer_name: "A", customer_phone: "+91 98765 43210", service_type: "x", slot }, bookings, "c", NOW).success, true);
});

test("booking rejects missing fields and unavailable times", () => {
  const bookings = [];
  assert.match(book({ customer_name: "A" }, bookings, "c", NOW).error, /Need name/);
  const bad = book({ customer_name: "A", customer_phone: "9876543210", service_type: "x", slot: "2026-10-08T03:00:00+05:30" }, bookings, "c", NOW);
  assert.match(bad.error, /not available/);
  assert.equal(bookings.length, 0);
});
