/**
 * Thin typed client for the free radio-browser.info API. Streams are public
 * internet radio; no key is needed. CORS is permissive. The API recommends a
 * custom User-Agent, but a browser cannot set one — that guidance is advisory.
 */

/** A playable station, mapped from the raw radio-browser JSON. */
export interface RadioStation {
  uuid: string;
  name: string;
  /** The resolved (redirect-followed) stream URL. */
  url: string;
  favicon: string;
  codec: string;
  bitrate: number;
  country: string;
  tags: string;
}

/** Genre tabs offered in the UI; `top` has no tag and uses the top-vote list. */
export type RadioGenre = "top" | "jazz" | "lofi" | "rock" | "news";

/** Mirrors tried in order — if one fails the next is used. */
const MIRRORS = [
  "de1.api.radio-browser.info",
  "nl1.api.radio-browser.info",
  "at1.api.radio-browser.info",
];

/** Shape of the fields we read from a raw radio-browser station entry. */
interface RawStation {
  stationuuid?: unknown;
  name?: unknown;
  url_resolved?: unknown;
  favicon?: unknown;
  codec?: unknown;
  bitrate?: unknown;
  country?: unknown;
  tags?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Map a raw entry to a `RadioStation`, or `null` if it has no stream URL. */
function toStation(raw: RawStation): RadioStation | null {
  const url = str(raw.url_resolved);
  const uuid = str(raw.stationuuid);
  if (!url || !uuid) return null;
  return {
    uuid,
    name: str(raw.name) || "Unknown station",
    url,
    favicon: str(raw.favicon),
    codec: str(raw.codec),
    bitrate: typeof raw.bitrate === "number" ? raw.bitrate : 0,
    country: str(raw.country),
    tags: str(raw.tags),
  };
}

/** GET `path` from the first mirror that responds; throws if all fail. */
async function getJson(path: string): Promise<RawStation[]> {
  let lastError: unknown;
  for (const host of MIRRORS) {
    try {
      const res = await fetch(`https://${host}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      return Array.isArray(data) ? (data as RawStation[]) : [];
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("radio-browser: all mirrors failed");
}

/** The most-voted stations overall. */
export async function fetchTopStations(limit = 8): Promise<RadioStation[]> {
  const raw = await getJson(`/json/stations/topvote/${limit}?hidebroken=true`);
  return raw.map(toStation).filter((s): s is RadioStation => s !== null);
}

/** The most-voted stations carrying an exact `tag` (genre). */
export async function fetchStationsByTag(tag: string, limit = 8): Promise<RadioStation[]> {
  const raw = await getJson(
    `/json/stations/bytagexact/${encodeURIComponent(tag)}` +
      `?order=votes&reverse=true&limit=${limit}&hidebroken=true`,
  );
  return raw.map(toStation).filter((s): s is RadioStation => s !== null);
}

/** Fetch the station list for a genre tab. */
export function fetchGenre(genre: RadioGenre, limit = 8): Promise<RadioStation[]> {
  return genre === "top" ? fetchTopStations(limit) : fetchStationsByTag(genre, limit);
}
