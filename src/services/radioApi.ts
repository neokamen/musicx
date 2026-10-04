import type { RadioStation } from "../types/radio.ts";

// Independent, community-run mirrors of the Radio-Browser API; tried in order with automatic fallback
const RADIO_BROWSER_HOSTS = [
	"all.api.radio-browser.info",
	"nl1.api.radio-browser.info",
	"de1.api.radio-browser.info",
	"at1.api.radio-browser.info",
	"de2.api.radio-browser.info",
];

const REQUEST_TIMEOUT_MS = 5000;

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

export const CURATED_LOSSLESS_STATIONS: RadioStation[] = [
	{
		stationuuid: "curated-rp-main-flac",
		name: "Radio Paradise Main Mix (FLAC)",
		url: "https://stream.radioparadise.com/flac",
		url_resolved: "https://stream.radioparadise.com/flac",
		homepage: "https://radioparadise.com",
		favicon: "https://radioparadise.com/favicon.ico",
		tags: "flac,lossless,audiophile,eclectic,rock",
		country: "United States",
		countrycode: "US",
		language: "english",
		codec: "FLAC",
		bitrate: 1411,
		votes: 9999,
	},
	{
		stationuuid: "curated-rp-mellow-flac",
		name: "Radio Paradise Mellow Mix (FLAC)",
		url: "https://stream.radioparadise.com/mellow-flac",
		url_resolved: "https://stream.radioparadise.com/mellow-flac",
		homepage: "https://radioparadise.com",
		favicon: "https://radioparadise.com/favicon.ico",
		tags: "flac,lossless,audiophile,acoustic,chillout",
		country: "United States",
		countrycode: "US",
		language: "english",
		codec: "FLAC",
		bitrate: 1411,
		votes: 9500,
	},
	{
		stationuuid: "curated-rp-rock-flac",
		name: "Radio Paradise Rock Mix (FLAC)",
		url: "https://stream.radioparadise.com/rock-flac",
		url_resolved: "https://stream.radioparadise.com/rock-flac",
		homepage: "https://radioparadise.com",
		favicon: "https://radioparadise.com/favicon.ico",
		tags: "flac,lossless,audiophile,rock,classic rock",
		country: "United States",
		countrycode: "US",
		language: "english",
		codec: "FLAC",
		bitrate: 1411,
		votes: 9400,
	},
	{
		stationuuid: "curated-rp-global-flac",
		name: "Radio Paradise Global Mix (FLAC)",
		url: "https://stream.radioparadise.com/world-etc-flac",
		url_resolved: "https://stream.radioparadise.com/world-etc-flac",
		homepage: "https://radioparadise.com",
		favicon: "https://radioparadise.com/favicon.ico",
		tags: "flac,lossless,audiophile,world,electronic",
		country: "United States",
		countrycode: "US",
		language: "english",
		codec: "FLAC",
		bitrate: 1411,
		votes: 9200,
	},
	{
		stationuuid: "curated-mother-earth-flac",
		name: "Mother Earth Radio (Hi-Res FLAC 96k/24b)",
		url: "https://motherearth.stream:8000/motherearth",
		url_resolved: "https://motherearth.stream:8000/motherearth",
		homepage: "https://motherearthradio.de",
		favicon: "https://motherearthradio.de/wp-content/uploads/2021/01/favicon.png",
		tags: "flac,lossless,hi-res,audiophile,vinyl",
		country: "Germany",
		countrycode: "DE",
		language: "english,german",
		codec: "FLAC",
		bitrate: 3200,
		votes: 8900,
	},
	{
		stationuuid: "curated-mother-earth-klassik",
		name: "Mother Earth Klassik (Hi-Res FLAC 96k/24b)",
		url: "https://motherearth.stream:8000/klassik",
		url_resolved: "https://motherearth.stream:8000/klassik",
		homepage: "https://motherearthradio.de",
		favicon: "https://motherearthradio.de/wp-content/uploads/2021/01/favicon.png",
		tags: "flac,lossless,hi-res,classical",
		country: "Germany",
		countrycode: "DE",
		language: "english,german",
		codec: "FLAC",
		bitrate: 3200,
		votes: 8500,
	},
	{
		stationuuid: "curated-mother-earth-jazz",
		name: "Mother Earth Jazz (Hi-Res FLAC 96k/24b)",
		url: "https://motherearth.stream:8000/jazz",
		url_resolved: "https://motherearth.stream:8000/jazz",
		homepage: "https://motherearthradio.de",
		favicon: "https://motherearthradio.de/wp-content/uploads/2021/01/favicon.png",
		tags: "flac,lossless,hi-res,jazz",
		country: "Germany",
		countrycode: "DE",
		language: "english,german",
		codec: "FLAC",
		bitrate: 3200,
		votes: 8400,
	},
	{
		stationuuid: "curated-jb-radio2-flac",
		name: "JB Radio-2 (Studio FLAC)",
		url: "http://199.189.87.9:10999/flac",
		url_resolved: "http://199.189.87.9:10999/flac",
		homepage: "https://jbradio2.ca",
		favicon: "https://jbradio2.ca/favicon.ico",
		tags: "flac,lossless,audiophile,rock,pop,eclectic",
		country: "Canada",
		countrycode: "CA",
		language: "english",
		codec: "FLAC",
		bitrate: 1411,
		votes: 8300,
	},
	{
		stationuuid: "curated-cro-ddur-flac",
		name: "ČRo D-dur (Classical FLAC)",
		url: "http://amp.cesnet.cz:8000/cro-d-dur.flac",
		url_resolved: "http://amp.cesnet.cz:8000/cro-d-dur.flac",
		homepage: "https://d-dur.rozhlas.cz",
		favicon: "https://d-dur.rozhlas.cz/sites/default/files/favicon.ico",
		tags: "flac,lossless,classical",
		country: "Czechia",
		countrycode: "CZ",
		language: "czech",
		codec: "FLAC",
		bitrate: 1411,
		votes: 8100,
	},
	{
		stationuuid: "curated-cro-jazz-flac",
		name: "ČRo Jazz (FLAC Lossless)",
		url: "http://amp.cesnet.cz:8000/cro-jazz.flac",
		url_resolved: "http://amp.cesnet.cz:8000/cro-jazz.flac",
		homepage: "https://jazz.rozhlas.cz",
		favicon: "https://jazz.rozhlas.cz/sites/default/files/favicon_jazz.ico",
		tags: "flac,lossless,jazz",
		country: "Czechia",
		countrycode: "CZ",
		language: "czech",
		codec: "FLAC",
		bitrate: 1411,
		votes: 7900,
	},
	{
		stationuuid: "curated-pure-lounge-flac",
		name: "Pure Lounge Radio (FLAC)",
		url: "https://stream.purelounge.radio/flac",
		url_resolved: "https://stream.purelounge.radio/flac",
		homepage: "https://purelounge.radio",
		favicon: "",
		tags: "flac,lossless,chillout,lounge,ambient",
		country: "United Kingdom",
		countrycode: "GB",
		language: "english",
		codec: "FLAC",
		bitrate: 1411,
		votes: 7600,
	},
	{
		stationuuid: "curated-sector-space-flac",
		name: "Sector Radio: Space (FLAC)",
		url: "https://sectorradio.com:8002/space",
		url_resolved: "https://sectorradio.com:8002/space",
		homepage: "https://sectorradio.com",
		favicon: "https://sectorradio.com/favicon.ico",
		tags: "flac,lossless,ambient,space,electronic",
		country: "Russian Federation",
		countrycode: "RU",
		language: "english,russian",
		codec: "FLAC",
		bitrate: 1411,
		votes: 7500,
	},
	{
		stationuuid: "curated-sector-prog-flac",
		name: "Sector Radio: Progressive (FLAC)",
		url: "https://sectorradio.com:8002/progressive",
		url_resolved: "https://sectorradio.com:8002/progressive",
		homepage: "https://sectorradio.com",
		favicon: "https://sectorradio.com/favicon.ico",
		tags: "flac,lossless,progressive rock,electronic",
		country: "Russian Federation",
		countrycode: "RU",
		language: "english,russian",
		codec: "FLAC",
		bitrate: 1411,
		votes: 7400,
	},
	{
		stationuuid: "curated-frequence3-flac",
		name: "Fréquence 3 (FLAC Hi-Fi)",
		url: "https://frequence3.net-radio.fr/frequence3.flac",
		url_resolved: "https://frequence3.net-radio.fr/frequence3.flac",
		homepage: "https://frequence3.com",
		favicon: "https://frequence3.com/favicon.ico",
		tags: "flac,lossless,pop,dance,hits",
		country: "France",
		countrycode: "FR",
		language: "french",
		codec: "FLAC",
		bitrate: 1411,
		votes: 7200,
	},
];

export function isStationLossless(station: RadioStation): boolean {
	const codec = (station.codec || "").toLowerCase();
	const name = (station.name || "").toLowerCase();
	const tags = (station.tags || "").toLowerCase();
	const url = (station.url_resolved || station.url || "").toLowerCase();
	return (
		/flac|alac|wav|pcm/.test(codec) ||
		/flac|lossless|hi-res|pcm/.test(tags) ||
		/flac|lossless|hi-res/.test(name) ||
		/\.(flac|wav)(\?|$)/i.test(url)
	);
}

export function isStationHighBitrate(station: RadioStation): boolean {
	const bitrate = station.bitrate || 0;
	const kbps = bitrate > 1000 ? Math.round(bitrate / 1000) : bitrate;
	return kbps >= 320 || isStationLossless(station);
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

export async function searchStationsByQuality(
	quality: "lossless" | "high-bitrate",
	query = "",
	limit = 100,
): Promise<RadioStation[]> {
	const trimmed = query.trim().toLowerCase();

	if (quality === "lossless") {
		// 1. Query Radio-Browser with multiple complementary searches in parallel
		const searchPromises: Promise<RadioStation[]>[] = [
			requestStations(`/stations/search?name=flac&hidebroken=true&order=clickcount&reverse=true&limit=${limit}`).catch(() => []),
			requestStations(`/stations/search?tag=flac&hidebroken=true&order=clickcount&reverse=true&limit=${limit}`).catch(() => []),
			requestStations(`/stations/search?tag=lossless&hidebroken=true&order=clickcount&reverse=true&limit=${limit}`).catch(() => []),
			requestStations(`/stations/search?codec=FLAC&hidebroken=true&order=clickcount&reverse=true&limit=${limit}`).catch(() => []),
		];

		const results = await Promise.all(searchPromises);
		const seenUuids = new Set<string>();
		const seenUrls = new Set<string>();
		const combined: RadioStation[] = [];

		const addStation = (st: RadioStation) => {
			const cleanUrl = (st.url_resolved || st.url || "").trim().toLowerCase();
			if (!cleanUrl || seenUuids.has(st.stationuuid) || seenUrls.has(cleanUrl)) return;
			seenUuids.add(st.stationuuid);
			seenUrls.add(cleanUrl);
			combined.push(st);
		};

		// Prioritize curated high-fidelity streams
		for (const st of CURATED_LOSSLESS_STATIONS) {
			if (!trimmed || st.name.toLowerCase().includes(trimmed) || (st.tags || "").toLowerCase().includes(trimmed)) {
				addStation(st);
			}
		}

		// Add fetched stations from Radio-Browser
		for (const list of results) {
			for (const st of list) {
				if (!trimmed || st.name.toLowerCase().includes(trimmed) || (st.tags || "").toLowerCase().includes(trimmed)) {
					addStation(st);
				}
			}
		}

		return combined.slice(0, limit);
	}

	// 2. High-Bitrate: >= 320 kbps (ordered by popularity/clickcount)
	const params = new URLSearchParams({
		hidebroken: "true",
		limit: String(limit),
		order: "clickcount",
		reverse: "true",
		bitrateMin: "320",
	});
	if (trimmed) params.set("name", trimmed);

	const stations = await requestStations(`/stations/search?${params.toString()}`).catch(() => []);
	return stations;
}
