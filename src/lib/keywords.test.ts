import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keywordFromSelection, matchingKeywords, normalizeKeyword, splitMarks } from "./keywords";

describe("keyword selection", () => {
  it("keeps a short phrase and drops an empty or oversized selection", () => {
    assert.equal(keywordFromSelection("  React   Native \n"), "React Native");
    assert.equal(normalizeKeyword("  React   Native "), "react native");
    assert.equal(keywordFromSelection("   "), null);
    assert.equal(keywordFromSelection("字".repeat(81)), null);
  });
});

describe("keyword marks", () => {
  it("marks a saved phrase and keeps a shorter word inside a longer token unmarked", () => {
    const parts = splitMarks("Use React Native and golang daily.", ["React", "React Native", "go"]);
    assert.deepEqual(
      parts.filter((part) => part.marked).map((part) => part.value),
      ["React Native"],
    );
    assert.equal(parts.map((part) => part.value).join(""), "Use React Native and golang daily.");
  });

  it("marks the same keyword without regard to letter case", () => {
    const parts = splitMarks("需要 Golang 與工程經驗", ["golang", "工程"]);
    assert.deepEqual(
      parts.filter((part) => part.marked).map((part) => part.value),
      ["Golang", "工程"],
    );
  });

  it("counts a keyword when the application text contains it", () => {
    const matched = matchingKeywords("The role needs Kubernetes.", [
      { text: "Kubernetes", hits: 2 },
      { text: "go", hits: 0 },
    ]);
    assert.deepEqual(matched.map((keyword) => keyword.text), ["Kubernetes"]);
  });
});
