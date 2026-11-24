import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { allowScrape, allowWrite, resetWritesForTests } from "./guard";

describe("allowWrite", { concurrency: 1 }, () => {
  afterEach(() => {
    resetWritesForTests();
  });

  it("allows eight writes for one viewer and still allows another", () => {
    for (let count = 0; count < 8; count += 1) assert.equal(allowWrite("viewer-a"), true);
    assert.equal(allowWrite("viewer-a"), false);
    assert.equal(allowWrite("viewer-a"), false);
    assert.equal(allowWrite("viewer-b"), true);
  });

  it("allows a write again after the ten minute window", () => {
    mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    try {
      for (let count = 0; count < 8; count += 1) assert.equal(allowWrite("viewer-a"), true);
      assert.equal(allowWrite("viewer-a"), false);
      mock.timers.tick(10 * 60 * 1000);
      assert.equal(allowWrite("viewer-a"), true);
    } finally {
      mock.timers.reset();
    }
  });
});

describe("allowScrape", { concurrency: 1 }, () => {
  afterEach(() => {
    resetWritesForTests();
  });

  it("allows three JobsDB searches for one viewer and still allows another", () => {
    for (let count = 0; count < 3; count += 1) assert.equal(allowScrape("viewer-a"), true);
    assert.equal(allowScrape("viewer-a"), false);
    assert.equal(allowScrape("viewer-b"), true);
  });
});
