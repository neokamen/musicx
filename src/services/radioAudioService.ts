import type { RadioPlaybackState, RadioStation, RecordedRadioTrack } from "../types/radio.ts";
import { onRadioRelayBytes, onRadioRelayTrack, startRadioRelay, stopRadioRelay } from "./api.ts";

type SpectrumCallback = (spectrum: number[], left: number[], right: number[]) => void;
type RadioListener = (state: RadioPlaybackState) => void;
type RecordingListener = (isRecording: boolean, tracks: RecordedRadioTrack[]) => void;

interface RadioDspSettings {
	isEqEnabled: boolean;
	eqGains: number[];
	subBoost: number;
	bassBoost: number;
	highpass: number;
	lowpass: number;
	isNormalizerEnabled: boolean;
	isXdssEnabled: boolean;
	isXtsProEnabled: boolean;
}

class RadioAudioService {
	private audio = new Audio();
	private listeners = new Set<RadioListener>();
	private recordingListeners = new Set<RecordingListener>();
	private spectrumCallback: SpectrumCallback | null = null;
	private state: RadioPlaybackState = { status: "stopped", elapsedSeconds: 0 };
	private elapsedInterval: number | null = null;
	private animFrameId: number | null = null;
	private audioContext: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private sourceNode: MediaElementAudioSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private eqFilters: BiquadFilterNode[] = [];
	private subBoostFilter: BiquadFilterNode | null = null;
	private bassBoostFilter: BiquadFilterNode | null = null;
	private highpassFilter: BiquadFilterNode | null = null;
	private lowpassFilter: BiquadFilterNode | null = null;
	private xdssFilter: BiquadFilterNode | null = null;
	private xtsFilter: BiquadFilterNode | null = null;
	private normalizer: DynamicsCompressorNode | null = null;
	private dspSettings: RadioDspSettings = {
		isEqEnabled: false,
		eqGains: Array.from({ length: 10 }, () => 0),
		subBoost: 0,
		bassBoost: 0,
		highpass: 0,
		lowpass: 0,
		isNormalizerEnabled: false,
		isXdssEnabled: false,
		isXtsProEnabled: false,
	};
	private pendingVolume = 1;
	private isAnalyserConnected = false;

	// Data-usage tracking: real bytes when the local relay is active, otherwise a bitrate-based estimate
	private currentBitrateKbps = 0;
	private sessionBytesBaseline = 0;
	private currentStreamBytes = 0;
	private relayActive = false;
	private relayListenersReady = false;
	private realBytesPerSecond = 0;
	private lastRealByteSampleTime = 0;
	private lastRealByteSampleValue = 0;
	private currentStreamTitle = "";

	// Auto-record: starts/stops a recording automatically whenever the station announces a new song
	private autoRecordEnabled = false;
	private lastKnownStation: RadioStation | null = null;
	private activeRecordingTitle: string | null = null;

	// Recording pipeline
	private mediaRecorder: MediaRecorder | null = null;
	private recordStreamDest: MediaStreamAudioDestinationNode | null = null;
	private recordedChunks: Blob[] = [];
	private recordingStartTime = 0;
	private currentRecordingStation: RadioStation | null = null;
	private isRecording = false;
	private recordedTracks: RecordedRadioTrack[] = [];
	private maxStoredTracks = 20;

	constructor() {
		this.audio.preload = "none";
		this.audio.crossOrigin = "anonymous";

		this.audio.addEventListener("playing", () => {
			this.startTimer();
			this.startSpectrumLoop();
			this.publish({ status: "playing", elapsedSeconds: this.state.elapsedSeconds });
		});

		this.audio.addEventListener("pause", () => {
			this.stopTimer();
			this.stopSpectrumLoop();
			if (!this.audio.ended && this.state.status !== "stopped") {
				this.publish({ status: "paused", elapsedSeconds: this.state.elapsedSeconds });
			}
		});

		this.audio.addEventListener("error", () => {
			this.stopTimer();
			this.stopSpectrumLoop();
			this.publish({
				status: "error",
				elapsedSeconds: this.state.elapsedSeconds,
				error: "No se pudo reproducir esta emisora.",
			});
		});
	}

	private setupWebAudio(): void {
		if (this.isAnalyserConnected) return;
		try {
			const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			if (!AudioCtx) return;
			this.audioContext = new AudioCtx();
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = 128;
			this.analyser.smoothingTimeConstant = 0.8;

			try {
				this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
				// Route through a GainNode: some WebViews (e.g. WebKitGTK) ignore element.volume once
				// the element is connected to a Web Audio graph, so volume must be controlled here instead.
				this.gainNode = this.audioContext.createGain();
				this.gainNode.gain.value = this.pendingVolume;
				this.sourceNode.connect(this.gainNode);

				let previousNode: AudioNode = this.gainNode;
				this.subBoostFilter = this.audioContext.createBiquadFilter();
				this.subBoostFilter.type = "lowshelf";
				this.subBoostFilter.frequency.value = 45;
				previousNode.connect(this.subBoostFilter);
				previousNode = this.subBoostFilter;

				this.bassBoostFilter = this.audioContext.createBiquadFilter();
				this.bassBoostFilter.type = "lowshelf";
				this.bassBoostFilter.frequency.value = 110;
				previousNode.connect(this.bassBoostFilter);
				previousNode = this.bassBoostFilter;

				this.eqFilters = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((frequency) => {
					const filter = this.audioContext!.createBiquadFilter();
					filter.type = "peaking";
					filter.frequency.value = frequency;
					filter.Q.value = 1.4;
					previousNode.connect(filter);
					previousNode = filter;
					return filter;
				});

				this.highpassFilter = this.audioContext.createBiquadFilter();
				this.highpassFilter.type = "highpass";
				previousNode.connect(this.highpassFilter);
				previousNode = this.highpassFilter;
				this.lowpassFilter = this.audioContext.createBiquadFilter();
				this.lowpassFilter.type = "lowpass";
				previousNode.connect(this.lowpassFilter);
				previousNode = this.lowpassFilter;

				this.xdssFilter = this.audioContext.createBiquadFilter();
				this.xdssFilter.type = "lowshelf";
				this.xdssFilter.frequency.value = 80;
				previousNode.connect(this.xdssFilter);
				previousNode = this.xdssFilter;
				this.xtsFilter = this.audioContext.createBiquadFilter();
				this.xtsFilter.type = "highshelf";
				this.xtsFilter.frequency.value = 8000;
				previousNode.connect(this.xtsFilter);
				previousNode = this.xtsFilter;

				this.normalizer = this.audioContext.createDynamicsCompressor();
				this.normalizer.threshold.value = -18;
				this.normalizer.knee.value = 12;
				this.normalizer.ratio.value = 1;
				this.normalizer.attack.value = 0.003;
				this.normalizer.release.value = 0.25;
				previousNode.connect(this.normalizer);
				this.normalizer.connect(this.analyser);
				this.analyser.connect(this.audioContext.destination);

				// Record the processed signal so radio recordings include the active EQ.
				this.recordStreamDest = this.audioContext.createMediaStreamDestination();
				this.analyser.connect(this.recordStreamDest);

				this.isAnalyserConnected = true;
				this.applyDspSettings();
			} catch {
				this.isAnalyserConnected = false;
			}
		} catch {
			this.isAnalyserConnected = false;
		}
	}

	private startTimer(): void {
		this.stopTimer();
		this.elapsedInterval = window.setInterval(() => {
			this.state.elapsedSeconds += 1;
			if (!this.relayActive && this.currentBitrateKbps > 0) {
				this.currentStreamBytes += (this.currentBitrateKbps * 1000) / 8;
			}
			this.publish({ status: "playing", elapsedSeconds: this.state.elapsedSeconds });
		}, 1000);
	}

	private stopTimer(): void {
		if (this.elapsedInterval !== null) {
			clearInterval(this.elapsedInterval);
			this.elapsedInterval = null;
		}
	}

	private startSpectrumLoop(): void {
		this.stopSpectrumLoop();
		const numBands = 64;
		const dataArray = new Uint8Array(64);
		let phase = 0;

		const tick = () => {
			if (this.state.status !== "playing") return;
			phase += 0.08;

			const spectrum = new Array<number>(numBands);
			const left = new Array<number>(numBands);
			const right = new Array<number>(numBands);

			let hasRealData = false;
			if (this.isAnalyserConnected && this.analyser) {
				this.analyser.getByteFrequencyData(dataArray);
				const sum = dataArray.reduce((acc, val) => acc + val, 0);
				if (sum > 10) {
					hasRealData = true;
					for (let i = 0; i < numBands; i++) {
						const val = dataArray[i] / 255;
						spectrum[i] = val;
						left[i] = val * 0.95;
						right[i] = val * 1.05;
					}
				}
			}

			if (!hasRealData) {
				// Organic audio wave simulation synchronized with active playback
				for (let i = 0; i < numBands; i++) {
					const bass = Math.max(0, 1 - i / 14) * 0.45;
					const w1 = Math.sin(phase * 2.2 + i * 0.25) * 0.28;
					const w2 = Math.cos(phase * 3.7 + i * 0.48) * 0.22;
					const w3 = Math.sin(phase * 1.1 + i * 0.15) * 0.18;
					const val = Math.min(1, Math.max(0.08, 0.42 + w1 + w2 + w3 + bass));

					spectrum[i] = val;
					left[i] = Math.min(1, Math.max(0.04, val * (0.9 + Math.sin(phase + i * 0.1) * 0.1)));
					right[i] = Math.min(1, Math.max(0.04, val * (0.9 + Math.cos(phase + i * 0.1) * 0.1)));
				}
			}

			this.spectrumCallback?.(spectrum, left, right);
			this.animFrameId = requestAnimationFrame(tick);
		};

		this.animFrameId = requestAnimationFrame(tick);
	}

	private stopSpectrumLoop(): void {
		if (this.animFrameId !== null) {
			cancelAnimationFrame(this.animFrameId);
			this.animFrameId = null;
		}
		this.spectrumCallback?.([], [], []);
	}

	private publish(state: RadioPlaybackState): void {
		const estimatedRate = (this.currentBitrateKbps * 1000) / 8;
		this.state = {
			...state,
			bitrateKbps: this.currentBitrateKbps,
			streamTitle: this.currentStreamTitle,
			bytesPerSecond: this.relayActive ? this.realBytesPerSecond : estimatedRate,
			sessionBytesTotal: this.sessionBytesBaseline + this.currentStreamBytes,
			isRealDataUsage: this.relayActive,
		};
		this.listeners.forEach((listener) => listener(this.state));
	}

	subscribe(listener: RadioListener): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => this.listeners.delete(listener);
	}

	setSpectrumCallback(callback: SpectrumCallback): void {
		this.spectrumCallback = callback;
		callback([], [], []);
	}

	setAutoRecordEnabled(enabled: boolean): void {
		this.autoRecordEnabled = enabled;
		if (!enabled && this.isRecording && this.activeRecordingTitle !== null) {
			// Only auto-stop recordings that were started automatically, never a manual one
			this.stopRecording();
		}
	}

	private ensureRelayListeners(): void {
		if (this.relayListenersReady) return;
		this.relayListenersReady = true;

		void onRadioRelayBytes((bytesTotal) => {
			const now = Date.now();
			if (this.lastRealByteSampleTime > 0) {
				const deltaBytes = bytesTotal - this.lastRealByteSampleValue;
				const deltaSeconds = (now - this.lastRealByteSampleTime) / 1000;
				if (deltaSeconds > 0) {
					this.realBytesPerSecond = Math.max(0, deltaBytes / deltaSeconds);
				}
			}
			this.currentStreamBytes = bytesTotal;
			this.lastRealByteSampleTime = now;
			this.lastRealByteSampleValue = bytesTotal;
			this.publish({ ...this.state });
		}).catch(() => {
			// Ignore: relay events unavailable, estimated data usage still works
		});

		void onRadioRelayTrack((title) => {
			this.handleSongTitleChanged(title);
		}).catch(() => {
			// Ignore: no ICY metadata available for this station
		});
	}

	private handleSongTitleChanged(title: string): void {
		this.currentStreamTitle = title;
		this.publish({ ...this.state, streamTitle: title });
		if (!this.autoRecordEnabled || !this.lastKnownStation) return;
		if (this.isRecording) {
			this.stopRecording();
		}
		this.startRecording(this.lastKnownStation, title);
	}

	async playStation(station: RadioStation, volume: number): Promise<void> {
		const url = station.url_resolved || station.url;
		if (!url) throw new Error("La emisora no tiene una URL de streaming válida.");
		this.state.elapsedSeconds = 0;
		this.currentStreamTitle = "";
		this.currentBitrateKbps = station.bitrate && station.bitrate > 0 ? station.bitrate : 0;
		this.lastKnownStation = station;

		// Fold the previous stream's usage into the session baseline before starting a new one
		this.sessionBytesBaseline += this.currentStreamBytes;
		this.currentStreamBytes = 0;
		this.realBytesPerSecond = 0;
		this.lastRealByteSampleTime = 0;
		this.relayActive = false;
		this.ensureRelayListeners();

		let playbackUrl = url;
		try {
			playbackUrl = await startRadioRelay(url);
			this.relayActive = true;
		} catch {
			// Relay unavailable (e.g. blocked network path): fall back to the direct stream URL
			playbackUrl = url;
			this.relayActive = false;
		}

		this.audio.src = playbackUrl;
		this.setVolume(volume);
		this.audio.load();

		try {
			if (this.audioContext && this.audioContext.state === "suspended") {
				await this.audioContext.resume();
			}
			this.setupWebAudio();
		} catch {
			// Ignore audio context errors
		}

		await this.audio.play();
	}

	async resume(): Promise<void> {
		if (this.audioContext && this.audioContext.state === "suspended") {
			await this.audioContext.resume();
		}
		await this.audio.play();
	}

	pause(): void {
		this.audio.pause();
	}

	stop(): void {
		this.stopTimer();
		this.stopSpectrumLoop();
		this.currentBitrateKbps = 0;
		this.currentStreamTitle = "";
		this.sessionBytesBaseline += this.currentStreamBytes;
		this.currentStreamBytes = 0;
		this.realBytesPerSecond = 0;
		this.lastRealByteSampleTime = 0;
		if (this.relayActive) {
			this.relayActive = false;
			void stopRadioRelay().catch(() => {
				// Ignore: relay may already be stopped
			});
		}
		this.publish({ status: "stopped", elapsedSeconds: 0 });
		this.audio.pause();
		this.audio.removeAttribute("src");
		this.audio.load();
	}

	setVolume(volume: number): void {
		const clamped = Math.max(0, Math.min(1, volume));
		this.pendingVolume = clamped;
		this.audio.volume = clamped;
		if (this.gainNode) {
			this.gainNode.gain.value = clamped;
		}
	}

	setDspSettings(settings: RadioDspSettings): void {
		this.dspSettings = { ...settings, eqGains: [...settings.eqGains] };
		this.applyDspSettings();
	}

	private applyDspSettings(): void {
		const { isEqEnabled, eqGains } = this.dspSettings;
		this.eqFilters.forEach((filter, index) => {
			filter.gain.value = isEqEnabled ? Math.max(-12, Math.min(12, eqGains[index] || 0)) : 0;
		});
		if (this.subBoostFilter) this.subBoostFilter.gain.value = isEqEnabled ? this.dspSettings.subBoost : 0;
		if (this.bassBoostFilter) this.bassBoostFilter.gain.value = isEqEnabled ? this.dspSettings.bassBoost : 0;
		if (this.highpassFilter) this.highpassFilter.frequency.value = isEqEnabled && this.dspSettings.highpass > 0
			? this.dspSettings.highpass
			: 10;
		if (this.lowpassFilter) this.lowpassFilter.frequency.value = isEqEnabled && this.dspSettings.lowpass > 0
			? this.dspSettings.lowpass
			: 22000;
		if (this.xdssFilter) this.xdssFilter.gain.value = this.dspSettings.isXdssEnabled ? 4 : 0;
		if (this.xtsFilter) this.xtsFilter.gain.value = this.dspSettings.isXtsProEnabled ? 2.5 : 0;
		if (this.normalizer) this.normalizer.ratio.value = this.dspSettings.isNormalizerEnabled ? 3 : 1;
	}

	subscribeRecording(listener: RecordingListener): () => void {
		this.recordingListeners.add(listener);
		listener(this.isRecording, [...this.recordedTracks]);
		return () => this.recordingListeners.delete(listener);
	}

	private publishRecording(): void {
		const tracksCopy = [...this.recordedTracks];
		this.recordingListeners.forEach((listener) => listener(this.isRecording, tracksCopy));
	}

	setMaxStoredTracks(max: number): void {
		this.maxStoredTracks = Math.max(1, max);
		if (this.recordedTracks.length > this.maxStoredTracks) {
			const removed = this.recordedTracks.slice(this.maxStoredTracks);
			removed.forEach((t) => URL.revokeObjectURL(t.blobUrl));
			this.recordedTracks = this.recordedTracks.slice(0, this.maxStoredTracks);
			this.publishRecording();
		}
	}

	getRecordedTracks(): RecordedRadioTrack[] {
		return [...this.recordedTracks];
	}

	getIsRecording(): boolean {
		return this.isRecording;
	}

	startRecording(station?: RadioStation, songTitle?: string): boolean {
		if (this.isRecording) return false;
		if (!this.recordStreamDest) {
			try {
				this.setupWebAudio();
			} catch {
				//
			}
		}

		if (!this.recordStreamDest) {
			console.warn("[RadioAudioService] Cannot record: recordStreamDest not initialized");
			return false;
		}

		try {
			const stream = this.recordStreamDest.stream;
			let mimeType = "audio/webm;codecs=opus";
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = MediaRecorder.isTypeSupported("audio/webm")
					? "audio/webm"
					: MediaRecorder.isTypeSupported("audio/ogg")
					? "audio/ogg"
					: "";
			}

			const options = mimeType ? { mimeType } : undefined;
			this.mediaRecorder = new MediaRecorder(stream, options);
			this.recordedChunks = [];
			this.recordingStartTime = Date.now();
			this.currentRecordingStation = station || null;
			this.activeRecordingTitle = songTitle || null;

			this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
				if (event.data && event.data.size > 0) {
					this.recordedChunks.push(event.data);
				}
			};

			this.mediaRecorder.onstop = () => {
				const durationSec = Math.max(1, Math.round((Date.now() - this.recordingStartTime) / 1000));
				const blobType = this.mediaRecorder?.mimeType || "audio/webm";
				const blob = new Blob(this.recordedChunks, { type: blobType });
				const blobUrl = URL.createObjectURL(blob);

				const stationName = this.currentRecordingStation?.name || "Radio Recording";
				const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
				const title = this.activeRecordingTitle || `${stationName} - ${dateStr}`;

				const newTrack: RecordedRadioTrack = {
					id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					title,
					stationName,
					stationUuid: this.currentRecordingStation?.stationuuid || "",
					recordedAt: Date.now(),
					durationSeconds: durationSec,
					blob,
					blobUrl,
					sizeBytes: blob.size,
					mimeType: blobType,
				};

				this.recordedTracks.unshift(newTrack);
				if (this.recordedTracks.length > this.maxStoredTracks) {
					const dropped = this.recordedTracks.pop();
					if (dropped) URL.revokeObjectURL(dropped.blobUrl);
				}

				this.isRecording = false;
				this.activeRecordingTitle = null;
				this.publishRecording();
			};

			this.mediaRecorder.start(1000);
			this.isRecording = true;
			this.publishRecording();
			return true;
		} catch (err) {
			console.error("[RadioAudioService] Failed to start MediaRecorder:", err);
			this.isRecording = false;
			this.publishRecording();
			return false;
		}
	}

	stopRecording(): void {
		if (!this.isRecording || !this.mediaRecorder) return;
		try {
			if (this.mediaRecorder.state !== "inactive") {
				this.mediaRecorder.stop();
			}
		} catch (err) {
			console.error("[RadioAudioService] Failed to stop MediaRecorder:", err);
		}
	}

	deleteRecordedTrack(id: string): void {
		const idx = this.recordedTracks.findIndex((t) => t.id === id);
		if (idx >= 0) {
			URL.revokeObjectURL(this.recordedTracks[idx].blobUrl);
			this.recordedTracks.splice(idx, 1);
			this.publishRecording();
		}
	}

	clearAllRecordings(): void {
		this.recordedTracks.forEach((t) => URL.revokeObjectURL(t.blobUrl));
		this.recordedTracks = [];
		this.publishRecording();
	}
}

export const radioAudioService = new RadioAudioService();

