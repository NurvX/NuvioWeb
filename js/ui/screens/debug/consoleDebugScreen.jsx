import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { Router } from "../../navigation/router.js";
import {
  getConsoleDebugEvents,
  subscribeToConsoleDebugEvents
} from "../../../core/diagnostics/consoleDebugBuffer.js";
import { I18n } from "../../../i18n/index.js";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function formatTime(ts) {
  const d = new Date(Number(ts || 0));
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (v, s = 2) => String(v).padStart(s, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function DebugContent({ screen }) {
  const events = Array.isArray(screen.events) ? screen.events : [];
  return (
    <div class="phone-detail-scroll" data-phone-detail-scroll>
      <header class="phone-detail-floating-header visible" data-phone-detail-floating-header>
        <button
          type="button"
          class="phone-detail-floating-back"
          data-phone-action="back"
          aria-label={t("common.back", {}, "Back")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-width="2" d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div class="phone-detail-floating-title">
          {t("about_debug_console_title", {}, "Console debug")}
        </div>
        <span class="phone-detail-meta-badge">{`${events.length} events`}</span>
      </header>
      <div class="phone-detail-body">
        <p class="phone-detail-synopsis">
          {t(
            "debug_console_subtitle",
            {},
            "Last warnings and errors captured from this app session"
          )}
        </p>
        {events.length ? (
          <div class="phone-settings-cards">
            {events
              .slice(-50)
              .reverse()
              .map((ev) => (
                <section class="phone-settings-card" key={String(ev.id)}>
                  <div class="phone-settings-card-header">
                    <span class="phone-settings-card-title">
                      {ev.level === "error" ? "ERROR" : "WARN"} #{ev.id}
                    </span>
                    <span class="phone-settings-card-subtitle">{formatTime(ev.timestamp)}</span>
                  </div>
                  <div class="phone-settings-card-body">
                    <pre
                      class="phone-detail-synopsis"
                      style="white-space:pre-wrap; word-break:break-word;"
                    >
                      {ev.args?.length ? ev.args.join("\n\n") : ev.message || ""}
                    </pre>
                  </div>
                </section>
              ))}
          </div>
        ) : (
          <div class="phone-settings-card">
            <div class="phone-settings-card-body">
              <p class="phone-detail-synopsis">
                {t("debug_console_empty_title", {}, "No warnings or errors")}
              </p>
              <p class="phone-detail-synopsis">
                {t(
                  "debug_console_empty_subtitle",
                  {},
                  "Console warning/error events will appear here until the app is closed."
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const ConsoleDebugScreen = {
  async mount() {
    this.container = document.getElementById("debugConsole");
    ScreenUtils.show(this.container);
    this.events = getConsoleDebugEvents();
    this._unmountPhone = null;
    this.render();
    if (!this.unsubscribe) {
      this.unsubscribe = subscribeToConsoleDebugEvents(() => {
        if (Router.getCurrent() !== "debugConsole") return;
        this.events = getConsoleDebugEvents();
        this.render();
      });
    }
  },

  render() {
    if (!this.container) return;
    if (this._unmountPhone) this._unmountPhone();
    this.container.innerHTML = `<div data-phone-mount-root></div>`;
    const root = this.container.querySelector("[data-phone-mount-root]");
    this._unmountPhone = mountPreact(h(DebugContent, { screen: this }), root);
    this.bindEvents();
  },

  bindEvents() {
    this.container.querySelectorAll("[data-phone-action='back']").forEach((btn) => {
      btn.onclick = (e) => {
        e?.preventDefault?.();
        Router.back();
      };
    });
  },

  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    ScreenUtils.hide(this.container);
  }
};
