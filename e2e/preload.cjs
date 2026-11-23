const Module = require("node:module");

const original = Module.prototype.require;

function MagicString(value) {
  this.original = String(value ?? "");
  this.modified = this.original;
  this.changed = false;
}

MagicString.prototype.replaceAll = function replaceAll(from, to) {
  const pattern = from instanceof RegExp ? from : new RegExp(escapeRegExp(String(from)), "g");
  const next = this.modified.replace(pattern, String(to));
  if (next !== this.modified) {
    this.modified = next;
    this.changed = true;
  }
  return this;
};

MagicString.prototype.hasChanged = function hasChanged() {
  return this.changed;
};

MagicString.prototype.toString = function toString() {
  return this.modified;
};

MagicString.prototype.generateMap = function generateMap() {
  const map = JSON.stringify({
    version: 3,
    file: "original",
    sources: ["original"],
    names: [],
    mappings: "",
  });
  return { toString: () => map };
};

MagicString.default = MagicString;

Module.prototype.require = function requireWithMagicString(id) {
  if (id === "magic-string") return MagicString;
  return original.apply(this, arguments);
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
