// Deep-link builders for handing a resolved stream URL off to a native player
// app installed on the phone browsing this app's URL. Templates match what
// Stremio's own web client sends (stremio-core's ExternalPlayerLink), minus
// the x-success/x-error callback params those templates point back into the
// Stremio app itself with — there is no NuvioWeb native app on the phone to
// receive that callback, so those params are simply omitted here.

export const DISABLED_PLAYER_ID = "disabled";

export const EXTERNAL_PLAYER_OPTIONS = [
  { id: DISABLED_PLAYER_ID, labelKey: "external_player_disabled", label: "Disabled (play in app)" },
  {
    id: "choose",
    labelKey: "external_player_choose",
    label: "Allow choosing",
    platforms: ["android"]
  },
  { id: "vlc", labelKey: "external_player_vlc", label: "VLC", platforms: ["ios", "android"] },
  {
    id: "mxplayer",
    labelKey: "external_player_mxplayer",
    label: "MX Player",
    platforms: ["android"]
  },
  {
    id: "justplayer",
    labelKey: "external_player_justplayer",
    label: "Just Player",
    platforms: ["android"]
  },
  {
    id: "outplayer",
    labelKey: "external_player_outplayer",
    label: "Outplayer",
    platforms: ["ios"]
  },
  { id: "infuse", labelKey: "external_player_infuse", label: "Infuse", platforms: ["ios"] },
  { id: "vidhub", labelKey: "external_player_vidhub", label: "Vidhub", platforms: ["ios"] },
  { id: "m3u", labelKey: "external_player_m3u", label: "M3U Playlist" }
];

const ANDROID_PACKAGES = {
  vlc: "org.videolan.vlc",
  mxplayer: "com.mxtech.videoplayer.ad",
  justplayer: "com.brouken.player"
};

export function getExternalPlayerOptionsForMobileOs(mobileOs) {
  return EXTERNAL_PLAYER_OPTIONS.filter(
    (option) => !option.platforms || option.platforms.includes(mobileOs)
  );
}

export function isExternalPlayerSelectable(playerId, mobileOs) {
  return getExternalPlayerOptionsForMobileOs(mobileOs).some((option) => option.id === playerId);
}

function buildAndroidIntentLink(streamUrl, playerId) {
  const intentBase = String(streamUrl).replace(/^https?:\/\//i, "intent://");
  if (playerId === "choose") {
    return `${intentBase}#Intent;type=video/any;scheme=https;end`;
  }
  const packageName = ANDROID_PACKAGES[playerId];
  if (!packageName) {
    return null;
  }
  return `${intentBase}#Intent;package=${packageName};type=video;scheme=https;end`;
}

function buildIosLink(streamUrl, playerId) {
  const encodedUrl = encodeURIComponent(streamUrl);
  if (playerId === "vlc") {
    return `vlc-x-callback://x-callback-url/stream?url=${encodedUrl}`;
  }
  if (playerId === "outplayer") {
    return String(streamUrl).replace(/^https?:\/\//i, "outplayer://");
  }
  if (playerId === "infuse") {
    return `infuse://x-callback-url/play?url=${encodedUrl}`;
  }
  if (playerId === "vidhub") {
    return `open-vidhub://x-callback-url/open?url=${encodedUrl}`;
  }
  return null;
}

// UTF-8-safe base64, matching stremio-core's get_m3u_data_uri exactly:
// "data:application/octet-stream;charset=utf-8;base64," + base64("#EXTM3U\n#EXTINF:0\n{url}")
export function buildM3uDataUri(streamUrl) {
  const content = `#EXTM3U\n#EXTINF:0\n${streamUrl}`;
  const base64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(content))) : "";
  return `data:application/octet-stream;charset=utf-8;base64,${base64}`;
}

export function buildMagnetFallback(stream = {}) {
  const infoHash = String(stream?.infoHash || stream?.raw?.infoHash || "").trim();
  if (!infoHash) {
    return null;
  }
  const displayName = String(
    stream?.title || stream?.name || stream?.raw?.title || stream?.raw?.name || ""
  ).trim();
  const dn = displayName ? `&dn=${encodeURIComponent(displayName)}` : "";
  return `magnet:?xt=urn:btih:${infoHash}${dn}`;
}

// Returns { href, download? } for an <a> click, or null when this player
// can't handle the given platform/URL combination.
export function buildExternalPlayerLink({ playerId, mobileOs, streamUrl }) {
  if (!playerId || playerId === DISABLED_PLAYER_ID) {
    return null;
  }
  if (playerId === "m3u") {
    if (!streamUrl) {
      return null;
    }
    return { href: buildM3uDataUri(streamUrl), download: "playlist.m3u" };
  }
  if (!streamUrl) {
    return null;
  }
  if (mobileOs === "android") {
    const href = buildAndroidIntentLink(streamUrl, playerId);
    return href ? { href } : null;
  }
  if (mobileOs === "ios") {
    const href = buildIosLink(streamUrl, playerId);
    return href ? { href } : null;
  }
  return null;
}
