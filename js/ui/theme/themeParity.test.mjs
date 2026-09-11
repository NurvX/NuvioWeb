import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const baseCss = fs.readFileSync(path.join(repoRoot, "css", "base.css"), "utf8");
const phoneCss = fs.readFileSync(path.join(repoRoot, "css", "phone.css"), "utf8");
const settingsScreenSource = fs.readFileSync(
  path.join(repoRoot, "js", "ui", "screens", "settings", "settingsScreen.js"),
  "utf8"
);
const stringsXml = fs.readFileSync(path.join(repoRoot, "res", "values", "strings.xml"), "utf8");

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { ThemeColors } = await import("./themeColors.js");

function activeAliasTarget(css, alias) {
  const match = css.match(
    new RegExp(`--phone-accent-${alias}:\\s*var\\((--phone-accent-[a-z-]+)\\)`)
  );
  return match ? match[1] : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blockForSelector(css, selector) {
  const match = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "s"));
  return match ? match[1] : null;
}

// Ticket #50, criterion 1: fresh load renders the White default accent and
// card tint (no red-tinted cards). The phone accent alias is the single place
// the default is chosen; ThemeColors/ThemeStore already default to WHITE, so
// the alias is the drift under test.
test("phone accent alias points at the white preset, not crimson", () => {
  assert.equal(activeAliasTarget(baseCss, "secondary"), "--phone-accent-white-secondary");
  assert.equal(activeAliasTarget(baseCss, "variant"), "--phone-accent-white-variant");
  assert.equal(activeAliasTarget(baseCss, "bg-card"), "--phone-accent-white-bg-card");
  assert.equal(activeAliasTarget(baseCss, "focus-ring"), "--phone-accent-white-focus-ring");
  assert.match(baseCss, /--phone-accent-bg-card:\s*var\(--phone-accent-white-bg-card\)/);
});

test("ThemeColors still defaults to WHITE", () => {
  assert.equal(ThemeColors.getPalette()["--secondary-color"], "#f5f5f5");
  assert.equal(ThemeColors.getPalette("white")["--card-bg"], "#222222");
});
// Ticket #50, criterion 2a: all 12 native palettes are selectable with
// correct per-theme focus ink. Expected hex values are literals transcribed
// from NuvioMobile ThemeColors.kt, not recomputed by the code under test.
test("themeColors.js ports every native palette with source hex values", () => {
  const expected = {
    GOLD: { secondary: "#e8a91c", focus: "#ffd45c", focusBg: "#3d2d1a", onSecondary: "#111111" },
    JADE: { secondary: "#22d37c", focus: "#7bf08d", focusBg: "#153a2c", onSecondary: "#111111" },
    ROSE_GOLD: {
      secondary: "#ec70a9",
      focus: "#ffb37a",
      focusBg: "#442037",
      onSecondary: "#111111"
    },
    ARCTIC_BLUE: {
      secondary: "#3185f5",
      focus: "#4de3ff",
      focusBg: "#172844",
      onSecondary: "#ffffff"
    },
    GRAPHITE: {
      secondary: "#aab2be",
      focus: "#f3f5f7",
      focusBg: "#30343a",
      onSecondary: "#111111"
    },
    CRIMSON: { secondary: "#e53935", focus: "#ff5252", focusBg: "#3d1a1a" },
    OCEAN: { secondary: "#1e88e5", focus: "#42a5f5", focusBg: "#1a2d3d" },
    VIOLET: { secondary: "#8e24aa", focus: "#ab47bc", focusBg: "#2d1a3d" },
    EMERALD: { secondary: "#43a047", focus: "#66bb6a", focusBg: "#1a3d1e" },
    AMBER: { secondary: "#fb8c00", focus: "#ffa726", focusBg: "#3d2d1a" },
    ROSE: { secondary: "#d81b60", focus: "#ec407a", focusBg: "#3d1a2d" },
    WHITE: { secondary: "#f5f5f5", focus: "#ffffff", focusBg: "#303030", onSecondary: "#111111" }
  };
  for (const [name, want] of Object.entries(expected)) {
    const palette = ThemeColors.getPalette(name);
    assert.ok(palette, `${name} palette exists`);
    assert.equal(
      String(palette["--secondary-color"]).toLowerCase(),
      want.secondary,
      `${name} secondary`
    );
    assert.equal(String(palette["--focus-color"]).toLowerCase(), want.focus, `${name} focus ring`);
    assert.equal(
      String(palette["--focus-bg"]).toLowerCase(),
      want.focusBg,
      `${name} focus background`
    );
    if (want.onSecondary) {
      assert.equal(
        String(palette["--on-secondary"]).toLowerCase(),
        want.onSecondary,
        `${name} on-secondary ink`
      );
    }
  }
});

test("unknown theme names fall back to white", () => {
  assert.equal(ThemeColors.getPalette("nope")["--secondary-color"], "#f5f5f5");
});
// Ticket #50, criterion 2b: the five missing presets are offered in settings
// with labels, and every option resolves a label through the strings table.
test("settings offers all native theme options with labelled rows", () => {
  for (const id of ["GOLD", "JADE", "ROSE_GOLD", "ARCTIC_BLUE", "GRAPHITE", "CUSTOM"]) {
    assert.match(settingsScreenSource, new RegExp(`id:\\s*"${id}"`), `${id} theme option exists`);
  }
  for (const key of [
    "settings.appearance.themes.gold",
    "settings.appearance.themes.jade",
    "settings.appearance.themes.rose_gold",
    "settings.appearance.themes.arctic_blue",
    "settings.appearance.themes.graphite",
    "settings.appearance.themes.custom"
  ]) {
    assert.ok(stringsXml.includes(`name="${key}"`), `${key} has a strings.xml entry`);
  }
});

// Ticket #50, criterion 2c: title Sm/Md/Lg render SemiBold 600 and bodyLg
// renders Regular 400 per the live native type scale (Theme.kt), not Bold.
test("title and bodyLg surfaces use native live weights", () => {
  for (const selector of [
    ".phone-hero-title",
    ".phone-library-title",
    ".phone-catalog-seeall-title"
  ]) {
    const block = blockForSelector(phoneCss, selector);
    assert.ok(block, `${selector} rule exists`);
    assert.ok(
      block.includes("font-weight: var(--phone-font-weight-semibold)"),
      `${selector} semibold`
    );
  }
  const block = blockForSelector(phoneCss, ".phone-zoom-action-label");
  assert.ok(block, ".phone-zoom-action-label rule exists");
  assert.ok(!block.includes("var(--phone-font-weight-semibold)"), "bodyLg label not semibold");
});

// Ticket #50, criterion 3: motion tokens are consumed — sheet dismiss runs
// at sheet-exit speed, hero/zoom run cinematic, toggle runs on tokens;
// shimmer sweep matches the native 2.4s tween; disabled/selected alphas
// match native opacity tokens (0.38 / 0.15).
test("motion tokens are consumed on sheets, hero/zoom, and toggles", () => {
  assert.ok(phoneCss.includes("var(--phone-motion-sheet-exit)"), "sheet-exit is consumed");
  assert.ok(phoneCss.includes("var(--phone-motion-cinematic)"), "cinematic is consumed");
  assert.ok(phoneCss.includes("var(--phone-ease-decelerate)"), "decelerate is consumed");
  assert.ok(phoneCss.includes("var(--phone-ease-accelerate)"), "accelerate is consumed");
  assert.ok(!phoneCss.includes("0.15s ease"), "no hardcoded toggle easing remains");
});

test("shimmer timing and state alphas match native tokens", () => {
  assert.ok(phoneCss.includes("phone-skeleton-shimmer 2.4s"), "shimmer sweep runs at native 2.4s");
  assert.ok(baseCss.includes("--phone-opacity-disabled: 0.38"), "disabled alpha token exists");
  assert.ok(baseCss.includes("--phone-opacity-selected: 0.15"), "selected alpha token exists");
  assert.ok(!phoneCss.match(/opacity:\s*0\.35/), "no 0.35 disabled drift remains");
});
