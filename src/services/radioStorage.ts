import type { RadioStation } from "../types/radio.ts";

const FAVORITES_KEY = "musicx_radio_favorites_v1";
const RECENTS_KEY = "musicx_radio_recents_v1";
const CUSTOM_STATIONS_KEY = "musicx_radio_custom_v1";

function readStations(key: string): RadioStation[] {
	try {
		const value = JSON.parse(localStorage.getItem(key) || "[]");
		return Array.isArray(value) ? value as RadioStation[] : [];
	} catch {
		return [];
	}
}

function writeStations(key: string, stations: RadioStation[]): void {
	try {
		localStorage.setItem(key, JSON.stringify(stations));
		if (typeof window !== "undefined") {
			if (key === FAVORITES_KEY) {
				window.dispatchEvent(new CustomEvent("musicx:radio-favorites-changed", { detail: stations }));
			} else if (key === RECENTS_KEY) {
				window.dispatchEvent(new CustomEvent("musicx:radio-recents-changed", { detail: stations }));
			}
		}
	} catch {
		// Ignore storage failures.
	}
}

export function getFavoriteStations(): RadioStation[] {
	return readStations(FAVORITES_KEY);
}

export function isFavoriteStation(stationuuid: string): boolean {
	return getFavoriteStations().some((station) => station.stationuuid === stationuuid);
}

export function toggleFavoriteStation(station: RadioStation): RadioStation[] {
	const favorites = getFavoriteStations();
	const next = favorites.some((item) => item.stationuuid === station.stationuuid)
		? favorites.filter((item) => item.stationuuid !== station.stationuuid)
		: [station, ...favorites];
	writeStations(FAVORITES_KEY, next);
	return next;
}

export function getRecentStations(): RadioStation[] {
	return readStations(RECENTS_KEY);
}

export function addRecentStation(station: RadioStation): void {
	const next = [station, ...getRecentStations().filter((item) => item.stationuuid !== station.stationuuid)].slice(0, 30);
	writeStations(RECENTS_KEY, next);
}

export function getCustomStations(): RadioStation[] {
	return readStations(CUSTOM_STATIONS_KEY);
}

export function saveCustomStation(station: RadioStation): RadioStation[] {
	const next = [station, ...getCustomStations().filter((item) => item.stationuuid !== station.stationuuid)];
	writeStations(CUSTOM_STATIONS_KEY, next);
	return next;
}

export function importRadioPlaylist(contents: string): RadioStation[] {
	const text = contents.replace(/^\uFEFF/, "");
	let stations: RadioStation[] = [];
	if (text.trimStart().startsWith("{")) {
		const parsed = JSON.parse(text) as unknown;
		const entries = Array.isArray(parsed)
			? parsed
			: parsed && typeof parsed === "object" && "stations" in parsed && Array.isArray(parsed.stations)
				? parsed.stations
				: parsed && typeof parsed === "object" && "radios" in parsed && Array.isArray(parsed.radios)
					? parsed.radios
					: [];
		stations = entries.flatMap((entry) => {
			if (!entry || typeof entry !== "object") return [];
			const radio = entry as Record<string, unknown>;
			const url = String(radio.url || radio.stream_url || radio.url_resolved || "").trim();
			if (!/^https?:\/\//i.test(url)) return [];
			return [makeImportedStation(url, String(radio.name || radio.title || "Radio importada"), radio)];
		});
	} else if (/^\s*\[playlist\]/im.test(text)) {
		const entries = new Map<number, Record<string, string>>();
		for (const line of text.split(/\r?\n/)) {
			const match = line.match(/^\s*(File|Title|Length)(\d+)\s*=\s*(.*)$/i);
			if (!match) continue;
			const index = Number(match[2]);
			const entry = entries.get(index) || {};
			entry[match[1].toLowerCase()] = match[3].trim();
			entries.set(index, entry);
		}
		stations = [...entries.values()].flatMap((entry) =>
			entry.file && /^https?:\/\//i.test(entry.file)
				? [makeImportedStation(entry.file, entry.title || "Radio importada", entry)]
				: [],
		);
	} else {
		let name = "";
		for (const line of text.split(/\r?\n/)) {
			const value = line.trim();
			if (!value) continue;
			if (value.startsWith("#EXTINF:")) {
				name = value.slice(value.indexOf(",") + 1).trim();
				continue;
			}
			if (value.startsWith("#")) continue;
			if (/^https?:\/\//i.test(value)) {
				stations.push(makeImportedStation(value, name || "Radio importada", {}));
				name = "";
			}
		}
	}

	if (stations.length === 0) throw new Error("La lista no contiene emisoras HTTP/HTTPS válidas.");
	const merged = [...stations.reverse(), ...getCustomStations()];
	const unique = [...new Map(merged.map((station) => [station.stationuuid, station])).values()];
	writeStations(CUSTOM_STATIONS_KEY, unique);
	return unique;
}

function makeImportedStation(url: string, name: string, source: Record<string, unknown>): RadioStation {
	const stationText = `${name} ${url}`;
	const inferredCodec = stationText.match(/\b(flac|aac|mp3|ogg|alac|wav)\b/i)?.[1];
	const inferredBitrate = stationText.match(/\b(\d{2,4})\s*(?:kbps|kbit\/s)\b/i)?.[1];
	const codec = String(source.codec || codecFromUrl(url) || inferredCodec || "").toUpperCase();
	const bitrate = Number(source.bitrate || source.bitrate_kbps || inferredBitrate || 0) || undefined;
	return {
		stationuuid: `import-${hashString(url)}`,
		name: name.trim() || "Radio importada",
		url,
		url_resolved: url,
		codec,
		bitrate,
		country: String(source.country || ""),
		favicon: String(source.logo_url || source.favicon || "") || undefined,
		description: String(source.description || "") || undefined,
		tags: "moOde importada",
		isCustom: true,
	};
}

function codecFromUrl(url: string): string | undefined {
	const match = url.match(/\.(flac|aac|mp3|ogg)(?:$|[?#])/i);
	return match?.[1].toUpperCase();
}

function hashString(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	}
	return (hash >>> 0).toString(16);
}

export function removeCustomStation(stationuuid: string): RadioStation[] {
	const next = getCustomStations().filter((station) => station.stationuuid !== stationuuid);
	writeStations(CUSTOM_STATIONS_KEY, next);
	return next;
}
