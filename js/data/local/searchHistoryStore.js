import { LocalStore } from "../../core/storage/localStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

// Recent-searches list for the phone Search screen (js/ui/screens/search/searchScreenPhone.js,
// ticket 03-01, mobile-parity epic). TV's search screen has no equivalent concept — this is
// new, phone-only local state, profile-scoped the same way ContinueWatchingPreferences
// (js/data/local/continueWatchingPreferences.js) scopes its own per-profile list, but without
// that store's cloud-sync queueing: a recent-searches list is disposable local UI convenience,
// not a setting worth round-tripping through Supabase.

const KEY = "phoneSearchHistory";
const VERSION = 1;
const MAX_TERMS = 12;

function activeProfileId() {
  return String(ProfileManager.getActiveProfileId() || "1");
}

function normalizeTerm(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeCaseInsensitive(terms = []) {
  const seen = new Set();
  const result = [];
  terms.forEach((term) => {
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(term);
  });
  return result;
}

function normalizeState(raw = {}) {
  const terms = Array.isArray(raw.terms) ? raw.terms.map(normalizeTerm).filter(Boolean) : [];
  return {
    version: VERSION,
    terms: dedupeCaseInsensitive(terms).slice(0, MAX_TERMS)
  };
}

function readAll() {
  const raw = LocalStore.get(KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

function writeAll(next) {
  LocalStore.set(KEY, next && typeof next === "object" ? next : {});
}

function readForProfile(profileId = activeProfileId()) {
  const all = readAll();
  return normalizeState(all[String(profileId || "1")] || {});
}

function writeForProfile(profileId, state) {
  const pid = String(profileId || "1");
  const all = readAll();
  all[pid] = normalizeState(state);
  writeAll(all);
  return all[pid];
}

export const SearchHistoryStore = {
  getRecent(profileId = activeProfileId()) {
    return readForProfile(profileId).terms;
  },

  addTerm(term, profileId = activeProfileId()) {
    const normalized = normalizeTerm(term);
    if (!normalized) {
      return readForProfile(profileId).terms;
    }
    const current = readForProfile(profileId);
    return writeForProfile(profileId, { terms: [normalized, ...current.terms] }).terms;
  },

  removeTerm(term, profileId = activeProfileId()) {
    const normalized = normalizeTerm(term).toLowerCase();
    const current = readForProfile(profileId);
    return writeForProfile(profileId, {
      terms: current.terms.filter((entry) => entry.toLowerCase() !== normalized)
    }).terms;
  },

  clearAll(profileId = activeProfileId()) {
    return writeForProfile(profileId, { terms: [] }).terms;
  }
};
