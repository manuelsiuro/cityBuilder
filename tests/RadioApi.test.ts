import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchTopStations, fetchStationsByTag } from "../src/radio/RadioApi";

/** A fetch Response stub carrying `body` as JSON. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const RAW = [
  {
    stationuuid: "uuid-1",
    name: "Groove Salad",
    url_resolved: "https://stream.example/groove",
    favicon: "https://example/icon.png",
    codec: "MP3",
    bitrate: 128,
    country: "United States",
    tags: "lounge,ambient",
  },
  {
    // Dropped: no resolved stream URL.
    stationuuid: "uuid-2",
    name: "Dead Station",
    url_resolved: "",
    bitrate: 0,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RadioApi", () => {
  it("maps raw entries and drops those without a stream URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(RAW))),
    );

    const stations = await fetchTopStations(8);

    expect(stations).toHaveLength(1);
    expect(stations[0]).toEqual({
      uuid: "uuid-1",
      name: "Groove Salad",
      url: "https://stream.example/groove",
      favicon: "https://example/icon.png",
      codec: "MP3",
      bitrate: 128,
      country: "United States",
      tags: "lounge,ambient",
    });
  });

  it("requests the exact-tag endpoint for a genre", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    await fetchStationsByTag("jazz", 8);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/json/stations/bytagexact/jazz");
    expect(url).toContain("order=votes");
    expect(url).toContain("limit=8");
  });

  it("falls back to the next mirror when the first fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse(RAW));
    vi.stubGlobal("fetch", fetchMock);

    const stations = await fetchTopStations(8);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stations).toHaveLength(1);
  });

  it("rejects when every mirror fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );

    await expect(fetchTopStations(8)).rejects.toThrow();
  });
});
