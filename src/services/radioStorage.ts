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

export function removeCustomStation(stationuuid: string): RadioStation[] {
	const next = getCustomStations().filter((station) => station.stationuuid !== stationuuid);
	writeStations(CUSTOM_STATIONS_KEY, next);
	return next;
}
