import { h } from "preact";
import { mountPreact } from "../../phone/mountPreact.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { Router } from "../../navigation/router.js";
import { TmdbSettingsStore } from "../../../data/local/tmdbSettingsStore.js";
import { TMDB_API_KEY } from "../../../config.js";
import { I18n } from "../../../i18n/index.js";
import { renderPhoneShelf, bindPhoneShelfEvents } from "../../components/phoneShelf.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w780";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function toImage(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${IMAGE_BASE_URL}${value}`;
  return value;
}

function toType(mediaType) {
  const value = String(mediaType || "").toLowerCase();
  if (value === "tv" || value === "series" || value === "show") return "series";
  return "movie";
}

function CastHero({ person }) {
  const p = person || {};
  return (
    <section class="phone-detail-hero" data-phone-detail-hero>
      <div
        class="phone-detail-hero-bg"
        data-phone-detail-hero-bg
        style={p.profile ? `background-image:url('${p.profile}')` : ""}
      />
      <div class="phone-detail-hero-scrim" aria-hidden="true" />
      <div class="phone-detail-hero-content">
        <h1 class="phone-detail-hero-title">{p.name || "Unknown"}</h1>
        <div class="phone-detail-hero-meta">
          {[p.knownForDepartment, p.birthday].filter(Boolean).join(" • ")}
        </div>
      </div>
    </section>
  );
}

function CastDetailContent({ screen }) {
  const person = screen.person;
  const credits = Array.isArray(screen.credits) ? screen.credits : [];
  const isLoading = screen.isLoading;
  if (isLoading) {
    return (
      <div class="phone-detail-scroll" data-phone-detail-scroll>
        <div class="phone-detail-hero-skeleton phone-skeleton" aria-hidden="true" />
        <div class="phone-detail-body">
          <p class="phone-detail-synopsis">{t("common.loading", {}, "Loading")}</p>
        </div>
      </div>
    );
  }
  if (!person) {
    return (
      <div class="phone-detail-scroll" data-phone-detail-scroll>
        <div class="phone-detail-body">
          <p class="phone-detail-synopsis">
            {t("cast_detail_empty", {}, "Cast profile not found.")}
          </p>
          <button type="button" class="phone-detail-play" data-phone-action="back">
            {t("common.back", {}, "Back")}
          </button>
        </div>
      </div>
    );
  }
  const shelfItems = credits.slice(0, 24).map((item) => ({
    id: item.itemId || item.id,
    posterUrl: item.poster || "",
    title: item.name || "Untitled",
    subtitle: item.subtitle || item.type || "",
    action: "openDetail"
  }));
  return (
    <div class="phone-detail-scroll" data-phone-detail-scroll>
      <CastHero person={person} />
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
        <div class="phone-detail-floating-title">{person.name || ""}</div>
      </header>
      <div class="phone-detail-body">
        {person.biography ? <p class="phone-detail-synopsis expanded">{person.biography}</p> : null}
        {shelfItems.length ? (
          <div
            dangerouslySetInnerHTML={{
              __html: renderPhoneShelf({
                id: "cast_credits",
                title: t("person_popular", {}, "Known For"),
                items: shelfItems,
                variant: "portrait"
              })
            }}
          />
        ) : (
          <p class="phone-detail-synopsis">{t("cast_detail_empty", {}, "No titles found.")}</p>
        )}
      </div>
    </div>
  );
}

export const CastDetailScreen = {
  async mount(params = {}) {
    this.container = document.getElementById("castDetail");
    ScreenUtils.show(this.container);
    this.params = params || {};
    this.loadToken = (this.loadToken || 0) + 1;
    this.person = null;
    this.credits = [];
    this.isLoading = true;
    this._unmountPhone = null;
    await this.loadCastDetails();
  },

  async getPersonIdFromName(name) {
    const settings = TmdbSettingsStore.get();
    const apiKey = String(TMDB_API_KEY || "").trim();
    if (!apiKey || !name) return null;
    const language = settings.language || "en-US";
    const url = `${TMDB_BASE_URL}/search/person?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}&query=${encodeURIComponent(name)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      const first = Array.isArray(data?.results) ? data.results[0] : null;
      return first?.id ? String(first.id) : null;
    } catch {
      return null;
    }
  },

  async loadCastDetails() {
    const token = this.loadToken;
    try {
      const settings = TmdbSettingsStore.get();
      const apiKey = String(TMDB_API_KEY || "").trim();
      if (!apiKey) {
        this.isLoading = false;
        this.render();
        return;
      }
      let personId = String(this.params?.castId || "").trim();
      if (!personId || !/^\d+$/.test(personId)) {
        personId = await this.getPersonIdFromName(this.params?.castName || "");
      }
      if (!personId) {
        this.isLoading = false;
        this.render();
        return;
      }
      const language = settings.language || "en-US";
      const url = `${TMDB_BASE_URL}/person/${encodeURIComponent(personId)}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}&append_to_response=combined_credits,images`;
      const response = await fetch(url);
      if (!response.ok) {
        this.isLoading = false;
        this.render();
        return;
      }
      const person = await response.json();
      if (token !== this.loadToken) return;
      this.person = {
        id: String(person?.id || personId),
        name: person?.name || this.params?.castName || "Unknown",
        biography: person?.biography || "",
        birthday: person?.birthday || "",
        placeOfBirth: person?.place_of_birth || "",
        knownForDepartment: person?.known_for_department || "",
        profile: toImage(person?.profile_path || this.params?.castPhoto || "")
      };
      const credits = Array.isArray(person?.combined_credits?.cast)
        ? person.combined_credits.cast
        : [];
      this.credits = credits
        .map((item) => ({
          id: item?.id ? String(item.id) : "",
          itemId: item?.imdb_id || item?.id ? String(item.imdb_id || item.id) : "",
          type: toType(item?.media_type),
          name: item?.title || item?.name || "Untitled",
          subtitle: item?.character || "",
          poster: toImage(item?.poster_path || item?.backdrop_path || ""),
          popularity: Number(item?.popularity || 0)
        }))
        .filter((item) => Boolean(item.itemId))
        .sort((left, right) => right.popularity - left.popularity);
      this.isLoading = false;
      this.render();
    } catch (error) {
      console.warn("Cast detail load failed", error);
      this.isLoading = false;
      this.render();
    }
  },

  render() {
    if (!this.container) return;
    if (this._unmountPhone) this._unmountPhone();
    const mountRoot = this.container;
    mountRoot.innerHTML = `<div data-phone-mount-root></div>`;
    const root = mountRoot.querySelector("[data-phone-mount-root]");
    this._unmountPhone = mountPreact(h(CastDetailContent, { screen: this }), root);
    this.bindEvents();
  },

  bindEvents() {
    const backBtns = this.container.querySelectorAll("[data-phone-action='back']");
    backBtns.forEach((btn) => {
      btn.onclick = (e) => {
        e?.preventDefault?.();
        Router.back();
      };
    });
    const shelf = this.container.querySelector('[data-shelf-id="cast_credits"]');
    if (shelf) {
      this._detachShelf?.();
      this._detachShelf = bindPhoneShelfEvents(shelf, {
        onSelect: (id) => {
          const item = this.credits.find(
            (c) => String(c.itemId) === String(id) || String(c.id) === String(id)
          );
          if (!item) return;
          Router.navigate("detail", {
            itemId: item.itemId,
            itemType: item.type || "movie",
            fallbackTitle: item.name
          });
        }
      });
    }
  },

  onPointerActivate(target) {
    const card = target?.closest?.(".phone-poster-card[data-id]");
    if (!card) return false;
    const id = String(card.dataset.id || "");
    const item = this.credits.find((c) => String(c.itemId) === id || String(c.id) === id);
    if (!item) return false;
    Router.navigate("detail", {
      itemId: item.itemId,
      itemType: item.type || "movie",
      fallbackTitle: item.name
    });
    return true;
  },

  cleanup() {
    this.loadToken = (this.loadToken || 0) + 1;
    this._detachShelf?.();
    this._detachShelf = null;
    if (this._unmountPhone) {
      this._unmountPhone();
      this._unmountPhone = null;
    }
    ScreenUtils.hide(this.container);
  }
};
