export interface RadioStation {
	stationuuid: string;
	name: string;
	url: string;
	url_resolved?: string;
	homepage?: string;
	favicon?: string;
	tags?: string;
	country?: string;
	countrycode?: string;
	language?: string;
	codec?: string;
	bitrate?: number;
	description?: string;
	votes?: number;
	isCustom?: boolean;
}

export interface RadioPlaybackState {
	status: "playing" | "paused" | "stopped" | "error";
	elapsedSeconds: number;
	error?: string;
	streamTitle?: string;
	// Instantaneous stream bitrate reported by the station (kbps)
	bitrateKbps?: number;
	// Bytes/second: real measured throughput when the local relay is active, otherwise a bitrate-based estimate
	bytesPerSecond?: number;
	// Estimated/measured bytes consumed across the whole app session (accumulates across stations until reload)
	sessionBytesTotal?: number;
	// True when bytesPerSecond/sessionBytesTotal come from real measured network bytes (relay active)
	isRealDataUsage?: boolean;
}

export interface RecordedRadioTrack {
	id: string;
	title: string;
	stationName: string;
	stationUuid: string;
	recordedAt: number;
	durationSeconds: number;
	blob: Blob;
	blobUrl: string;
	sizeBytes: number;
	mimeType: string;
}
