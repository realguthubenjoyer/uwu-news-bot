import test from "node:test";
import assert from "node:assert/strict";

import { hasPaidAdMarker } from "./telegram-relay";

test("hasPaidAdMarker catches hashtag and inline paid-ad markers", () => {
  assert.equal(hasPaidAdMarker("#PAIDAD"), true);
  assert.equal(hasPaidAdMarker("#paidad"), true);
  assert.equal(hasPaidAdMarker("[PAID AD]"), true);
  assert.equal(hasPaidAdMarker("regular market update"), false);
});
