import type { RadioStation } from "../types/radio.ts";

// Independent, community-run mirrors of the Radio-Browser API; tried in order with automatic fallback
const RADIO_BROWSER_HOSTS = [
	"de1.api.radio-browser.info",
	"de2.api.radio-browser.info",
	"at1.api.radio-browser.info",
	"nl1.api.radio-browser.info",
	"all.api.radio-browser.info",
];

const REQUEST_TIMEOUT_MS = 6000;

// Remembers the last mirror that worked so subsequent calls try it first
let preferredHostIndex = 0;

async function fetchFromHost(host: string, path: string): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(`https://${host}/json${path}`, {
			headers: { Accept: "application/json" },
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
}

async function requestStations(path: string): Promise<RadioStation[]> {
	const orderedHosts = [
		...RADIO_BROWSER_HOSTS.slice(preferredHostIndex),
		...RADIO_BROWSER_HOSTS.slice(0, preferredHostIndex),
	];

	let lastError: unknown = null;
	for (const host of orderedHosts) {
		try {
			const response = await fetchFromHost(host, path);
			if (!response.ok) {
				throw new Error(`Radio-Browser (${host}) respondió ${response.status}`);
			}
			const stations = await response.json() as RadioStation[];
			preferredHostIndex = RADIO_BROWSER_HOSTS.indexOf(host);
			return stations.filter((station) => station.name && (station.url_resolved || station.url));
		} catch (error) {
			lastError = error;
			// Mirror unreachable or timed out: try the next one
		}
	}
	throw lastError instanceof Error ? lastError : new Error("No se pudo contactar con ningún servidor de Radio-Browser");
}


export function getPopularStations(limit = 60): Promise<RadioStation[]> {
	return requestStations(`/stations/topvote/${limit}`);
}

export function searchStations(query: string, limit = 60): Promise<RadioStation[]> {
	const params = new URLSearchParams({
		name: query,
		limit: String(limit),
		hidebroken: "true",
		order: "clickcount",
		reverse: "true",
	});
	return requestStations(`/stations/search?${params.toString()}`);
}

export function searchStationsByTag(tag: string, limit = 60): Promise<RadioStation[]> {
	const params = new URLSearchParams({
		tag,
		limit: String(limit),
		hidebroken: "true",
		order: "clickcount",
		reverse: "true",
	});
	return requestStations(`/stations/search?${params.toString()}`);
}

export function searchStationsByCountryCode(countrycode: string, limit = 60): Promise<RadioStation[]> {
	const params = new URLSearchParams({
		countrycode,
		limit: String(limit),
		hidebroken: "true",
		order: "clickcount",
		reverse: "true",
	});
	return requestStations(`/stations/search?${params.toString()}`);
}

export function searchStationsByLanguage(language: string, limit = 60): Promise<RadioStation[]> {
	const params = new URLSearchParams({
		language,
		limit: String(limit),
		hidebroken: "true",
		order: "clickcount",
		reverse: "true",
	});
	return requestStations(`/stations/search?${params.toString()}`);
}

export function searchStationsByQuality(
	quality: "lossless" | "high-bitrate",
	query = "",
	limit = 100,
): Promise<RadioStation[]> {
	const params = new URLSearchParams({
		hidebroken: "true",
		limit: String(limit),
		order: "bitrate",
		reverse: "true",
	});
	if (quality === "lossless") {
		params.set("codec", "FLAC");
	} else {
		params.set("bitrateMin", "320");
	}
	if (query.trim()) params.set("name", query.trim());
	return requestStations(`/stations/search?${params.toString()}`);
}
