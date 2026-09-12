// Phone floating resume prompt, ported from NuvioMobile's ResumePromptRepository +
// ResumePromptStorage (ResumePromptRepository.kt) — see parity ticket #53. After a player
// session, returning home shows a floating card offering to resume the last video (the
// "floating resume prompt" in the ticket). The prompt is one-shot: entering the player arms
// it, leaving normally (`markPlayerExitedNormally`, e.g. Back to stream) clears it, and
// showing it on home consumes it (mobile: `consumeResumePrompt` clears `wasInPlayer`).
//
// Storage shape (localStorage via LocalStore): `{ wasInPlayer, videoId, item, ts }` where
// `item` is a compact Continue-Watching-shaped snapshot used to rebuild player params.
//
// Behavior tests assert the storage transitions and the prompt's action wiring, not
// class names.

import { LocalStore } from "../../core/storage/localStore.js";

const RESUME_PROMPT_KEY = "nuvio.phoneResumePrompt";

export function readResumePromptState() {
  const raw = LocalStore.get(RESUME_PROMPT_KEY, null);
  if (!raw || typeof raw !== "object") {
    return { wasInPlayer: false, videoId: "", item: null };
  }
  return {
    wasInPlayer: raw.wasInPlayer === true,
    videoId: String(raw.videoId || ""),
    item: raw.item && typeof raw.item === "object" ? raw.item : null,
    ts: raw.ts || null
  };
}

/** Arms the prompt when playback starts for `videoId`. `item` is the CW-shaped snapshot
 * (title/poster/type/season/episode/progress) used to rebuild the resume route. */
export function markPlayerEntered(videoId = "", item = null) {
  if (!videoId) {
    return;
  }
  LocalStore.set(RESUME_PROMPT_KEY, {
    wasInPlayer: true,
    videoId,
    item: item || {},
    ts: Date.now()
  });
}

/** Clears the prompt when the player exits normally (Back to stream / finished route). */
export function markPlayerExitedNormally() {
  LocalStore.set(RESUME_PROMPT_KEY, {
    wasInPlayer: false,
    videoId: "",
    item: null,
    ts: null
  });
}

/** Returns the one-shot resume item when armed (and clears the arm). Returns null when not
 * armed or when no video was recorded. */
export function consumeResumePrompt() {
  const state = readResumePromptState();
  markPlayerExitedNormally();
  if (!state.wasInPlayer || !state.videoId) {
    return null;
  }
  return { videoId: state.videoId, item: state.item || null };
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Floating resume-prompt markup: a bottom-anchored card with a poster thumb, copy column,
 * and Resume (primary) + Dismiss actions. Wired by `bindResumePrompt`.
 */
export function renderResumePromptFloating({
  title = "",
  subtitle = "",
  posterUrl = "",
  resumeLabel = "Resume",
  dismissLabel = "Dismiss"
} = {}) {
  const artwork = posterUrl
    ? `<img class="phone-resume-prompt-poster-image" src="${escapeHtml(posterUrl)}" alt="" />`
    : `<span class="phone-resume-prompt-poster-image phone-resume-prompt-poster-image-empty" aria-hidden="true"></span>`;
  return `
    <div class="phone-resume-prompt" role="status" aria-live="polite">
      <div class="phone-resume-prompt-poster">${artwork}</div>
      <div class="phone-resume-prompt-copy">
        <div class="phone-resume-prompt-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="phone-resume-prompt-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      </div>
      <button type="button" class="phone-resume-prompt-action" data-resume-action>${escapeHtml(resumeLabel)}</button>
      <button type="button" class="phone-resume-prompt-dismiss" data-resume-dismiss aria-label="${escapeHtml(dismissLabel)}">×</button>
    </div>
  `;
}

/** Wires the prompt's Resume/Dismiss actions inside `root`. Safe to call when no prompt is
 * present (no-op). */
export function bindResumePrompt(root, { onResume = null, onDismiss = null } = {}) {
  if (!root) {
    return;
  }
  const resumeButton = root.querySelector("[data-resume-action]");
  if (resumeButton) {
    resumeButton.onclick = (event) => {
      event?.preventDefault?.();
      if (typeof onResume === "function") {
        onResume();
      }
    };
  }
  const dismissButton = root.querySelector("[data-resume-dismiss]");
  if (dismissButton) {
    dismissButton.onclick = (event) => {
      event?.preventDefault?.();
      if (typeof onDismiss === "function") {
        onDismiss();
      }
    };
  }
}
