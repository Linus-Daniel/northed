/**
 * Video URL handling shared by the Convex backend and the Next.js frontend.
 *
 * NorthEd can play a lesson from a link (YouTube, Vimeo, Mux, Cloudflare
 * Stream, S3) or from a file the tutor uploaded to Convex file storage. This
 * module handles the links: it validates them and derives the URL that should
 * be handed to an <iframe> (hosted providers) or a <video> tag (direct files).
 *
 * Adding a new provider (Mux, Cloudflare Stream, S3, ...) is a matter of
 * extending `parseVideoSourceDetailed` — the schema and the mutations do not
 * change.
 */

export type VideoProvider =
  | "youtube"
  | "vimeo"
  | "mux"
  | "cloudflare"
  | "s3"
  | "direct";

export type VideoSource = {
  /** The normalized, validated URL as it should be stored. */
  url: string;
  /** Which provider hosts the video. */
  provider: VideoProvider;
  /** URL to render in an <iframe> (hosted providers) or <video> (direct files). */
  embedUrl: string;
  /** Provider specific video identifier, when there is one. */
  videoId: string | null;
};

/** Why a link could not be used. */
export type VideoParseFailure =
  | { kind: "empty" }
  | { kind: "malformed" }
  | { kind: "insecure" }
  | { kind: "unsupported_host"; host: string }
  | { kind: "unreadable"; host: string };

export type VideoParseResult =
  | { ok: true; source: VideoSource }
  | { ok: false; failure: VideoParseFailure };

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "studio.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

const DIRECT_MEDIA_EXTENSIONS = [".mp4", ".webm", ".m3u8", ".mov", ".ogv", ".ogg"];

const MAX_URL_LENGTH = 2048;

function hasExtension(pathname: string, extensions: string[]): boolean {
  const lower = pathname.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

/**
 * Give a pasted address a scheme when it does not have one.
 *
 * People copy `youtube.com/watch?v=...` out of the address bar all the time,
 * and a link without a scheme is still a link. Anything that already carries a
 * scheme is left alone, so `javascript:` style addresses keep failing the
 * protocol check below.
 */
function addScheme(raw: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return raw;
  }
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }
  return `https://${raw}`;
}

function parseYoutube(url: URL): VideoSource | null {
  let videoId: string | null = null;

  if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
    videoId = url.pathname.replace(/^\//, "").split("/")[0] ?? null;
  } else {
    videoId = url.searchParams.get("v");
    if (videoId === null) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (
        segments[0] === "embed" ||
        segments[0] === "shorts" ||
        segments[0] === "live" ||
        segments[0] === "v"
      ) {
        videoId = segments[1] ?? null;
      }
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return null;
  }

  return {
    url: url.toString(),
    provider: "youtube",
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    videoId,
  };
}

function parseVimeo(url: URL): VideoSource | null {
  // A shared Vimeo link can carry a private hash after the id
  // (`vimeo.com/123456789/abc123`), so the id is the first numeric segment.
  const segments = url.pathname.split("/").filter(Boolean);
  const videoId = segments.find((segment) => /^\d{5,20}$/.test(segment)) ?? null;

  if (!videoId) {
    return null;
  }

  return {
    url: url.toString(),
    provider: "vimeo",
    embedUrl: `https://player.vimeo.com/video/${videoId}`,
    videoId,
  };
}

/**
 * Parse and validate a video URL, explaining what went wrong when it fails.
 */
export function parseVideoSourceDetailed(raw: string): VideoParseResult {
  if (typeof raw !== "string") {
    return { ok: false, failure: { kind: "empty" } };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, failure: { kind: "empty" } };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, failure: { kind: "malformed" } };
  }

  let url: URL;
  try {
    url = new URL(addScheme(trimmed));
  } catch {
    return { ok: false, failure: { kind: "malformed" } };
  }

  if (url.protocol !== "https:") {
    // Plain HTTP is only tolerated for local development hosts.
    if (url.protocol !== "http:" || !isLoopback(url.hostname)) {
      return { ok: false, failure: { kind: "insecure" } };
    }
  }

  const hostname = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(hostname)) {
    const source = parseYoutube(url);
    return source !== null
      ? { ok: true, source }
      : { ok: false, failure: { kind: "unreadable", host: hostname } };
  }

  if (VIMEO_HOSTS.has(hostname)) {
    const source = parseVimeo(url);
    return source !== null
      ? { ok: true, source }
      : { ok: false, failure: { kind: "unreadable", host: hostname } };
  }

  if (hostname === "mux.com" || hostname.endsWith(".mux.com")) {
    return {
      ok: true,
      source: {
        url: url.toString(),
        provider: "mux",
        embedUrl: url.toString(),
        videoId: url.searchParams.get("playback_id"),
      },
    };
  }

  if (
    hostname === "cloudflarestream.com" ||
    hostname.endsWith(".cloudflarestream.com")
  ) {
    return {
      ok: true,
      source: {
        url: url.toString(),
        provider: "cloudflare",
        embedUrl: url.toString(),
        videoId: url.pathname.replace(/^\//, "") || null,
      },
    };
  }

  if (
    hostname.endsWith(".amazonaws.com") ||
    hostname.endsWith(".cloudfront.net")
  ) {
    return {
      ok: true,
      source: {
        url: url.toString(),
        provider: "s3",
        embedUrl: url.toString(),
        videoId: null,
      },
    };
  }

  if (hasExtension(url.pathname, DIRECT_MEDIA_EXTENSIONS)) {
    return {
      ok: true,
      source: {
        url: url.toString(),
        provider: "direct",
        embedUrl: url.toString(),
        videoId: null,
      },
    };
  }

  return { ok: false, failure: { kind: "unsupported_host", host: hostname } };
}

/**
 * Parse and validate a video URL.
 *
 * @returns the parsed source, or `null` when the URL is malformed or points at
 * a host that is not on the allow list.
 */
export function parseVideoSource(raw: string): VideoSource | null {
  const result = parseVideoSourceDetailed(raw);
  return result.ok ? result.source : null;
}

export function isAllowedVideoUrl(raw: string): boolean {
  return parseVideoSource(raw) !== null;
}

/**
 * A sentence explaining why a link was refused.
 *
 * The studio shows this instead of a generic message, so the tutor knows
 * whether the link was the wrong shape or the wrong host.
 */
export function describeVideoUrlFailure(raw: string): string {
  const result = parseVideoSourceDetailed(raw);
  if (result.ok) {
    return "";
  }

  switch (result.failure.kind) {
    case "empty":
      return "Add the address of the video first.";
    case "malformed":
      return "That does not look like a web address. Copy the whole link, starting with https://.";
    case "insecure":
      return "The link has to start with https://.";
    case "unsupported_host":
      return `Links from ${result.failure.host} are not supported. Use a YouTube, Vimeo, Mux, Cloudflare Stream or S3 link, or upload the video file.`;
    case "unreadable":
      return `That ${result.failure.host} link does not point at a single video.`;
  }
}
