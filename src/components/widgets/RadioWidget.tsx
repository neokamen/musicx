import React, { useState, useEffect, useMemo, useRef } from "react";
import {
	Radio,
	Library,
	Search,
	Star,
	Play,
	Pause,
	Square,
	X,
	ExternalLink,
	Clock,
	Loader2,
	Volume2,
	Sparkles,
	CircleDot,
	Download,
	Trash2,
	Check,
} from "lucide-react";
import { useMusicStore } from "../../store/index.ts";
import {
	getFavoriteStations,
	getRecentStations,
	toggleFavoriteStation,
} from "../../services/radioStorage.ts";
import { searchStations } from "../../services/radioApi.ts";
import { radioAudioService } from "../../services/radioAudioService.ts";
import { saveRadioRecording } from "../../services/api.ts";
import type { RadioStation, RecordedRadioTrack } from "../../types/radio.ts";
import { formatDataSize } from "../../lib/formatBytes.ts";

export const RadioWidget: React.FC<{ onBackToLibrary?: () => void }> = ({ onBackToLibrary }) => {
	const {
		activeRadioStation,
		isRadioPlaying,
		playRadioStation,
		togglePlayPause,
		stopRadio,
		setRadioHubOpen,
		appearance,
		librarySettings,
		setLibrarySettings,
	} = useMusicStore();

	const [favorites, setFavorites] = useState<RadioStation[]>(() => getFavoriteStations());
	const [recents, setRecents] = useState<RadioStation[]>(() => getRecentStations());
	const [activeTab, setActiveTab] = useState<"favorites" | "search" | "recents" | "recordings">("favorites");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<RadioStation[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Recording state
	const [isRecording, setIsRecording] = useState(false);
	const [recordings, setRecordings] = useState<RecordedRadioTrack[]>([]);
	const [savingTrackId, setSavingTrackId] = useState<string | null>(null);
	const [saveSuccessTrackId, setSaveSuccessTrackId] = useState<string | null>(null);
	const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
	const previewAudioRef = useRef<HTMLAudioElement | null>(null);

	// Live/session data-usage (real measured bytes when available, otherwise a bitrate-based estimate)
	const [bytesPerSecond, setBytesPerSecond] = useState(0);
	const [sessionBytesTotal, setSessionBytesTotal] = useState(0);
	const [isRealDataUsage, setIsRealDataUsage] = useState(false);
	const [streamTitle, setStreamTitle] = useState("");

	useEffect(() => {
		const unsub = radioAudioService.subscribe((playbackState) => {
			setBytesPerSecond(playbackState.status === "playing" ? playbackState.bytesPerSecond || 0 : 0);
			setSessionBytesTotal(playbackState.sessionBytesTotal || 0);
			setIsRealDataUsage(Boolean(playbackState.isRealDataUsage));
			setStreamTitle(playbackState.streamTitle || "");
		});
		return () => unsub();
	}, []);

	// Keep the auto-record toggle in sync with the persisted setting
	useEffect(() => {
		radioAudioService.setAutoRecordEnabled(Boolean(librarySettings.radioAutoRecordEnabled));
	}, [librarySettings.radioAutoRecordEnabled]);


	// Synchronize favorites and recents with events and storage
	useEffect(() => {
		const handleFavoritesChanged = () => {
			setFavorites(getFavoriteStations());
		};
		const handleRecentsChanged = () => {
			setRecents(getRecentStations());
		};

		window.addEventListener("musicx:radio-favorites-changed", handleFavoritesChanged);
		window.addEventListener("musicx:radio-recents-changed", handleRecentsChanged);
		window.addEventListener("storage", handleFavoritesChanged);

		return () => {
			window.removeEventListener("musicx:radio-favorites-changed", handleFavoritesChanged);
			window.removeEventListener("musicx:radio-recents-changed", handleRecentsChanged);
			window.removeEventListener("storage", handleFavoritesChanged);
		};
	}, []);

	// Synchronize radio recording state
	useEffect(() => {
		radioAudioService.setMaxStoredTracks(librarySettings.radioMaxStoredTracks || 20);
		const unsub = radioAudioService.subscribeRecording((recStatus, recList) => {
			setIsRecording(recStatus);
			setRecordings(recList);
		});
		return () => unsub();
	}, [librarySettings.radioMaxStoredTracks]);

	// Clean up preview audio on unmount
	useEffect(() => {
		return () => {
			if (previewAudioRef.current) {
				previewAudioRef.current.pause();
				previewAudioRef.current = null;
			}
		};
	}, []);

	const handleToggleRecord = () => {
		if (isRecording) {
			radioAudioService.stopRecording();
		} else {
			if (!activeRadioStation) return;
			radioAudioService.startRecording(activeRadioStation);
		}
	};

	const handleSaveTrack = async (track: RecordedRadioTrack) => {
		if (!librarySettings.radioRecordingFolder) {
			alert("Por favor configura una carpeta de destino para grabaciones en Ajustes > Biblioteca.");
			return;
		}
		setSavingTrackId(track.id);
		try {
			const arrayBuffer = await track.blob.arrayBuffer();
			const uint8 = new Uint8Array(arrayBuffer);
			const ext = track.mimeType.includes("ogg") ? "ogg" : "webm";
			const cleanStation = track.stationName.replace(/[/\\?%*:|"<>]/g, "_").trim();
			const timestamp = new Date(track.recordedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
			const filename = `${cleanStation}_${timestamp}.${ext}`;

			await saveRadioRecording(librarySettings.radioRecordingFolder, filename, uint8);
			setSaveSuccessTrackId(track.id);
			setTimeout(() => {
				setSaveSuccessTrackId((curr) => (curr === track.id ? null : curr));
			}, 3000);
		} catch (err) {
			console.error("Error guardando grabación:", err);
			alert(`Error guardando grabación en disco: ${err}`);
		} finally {
			setSavingTrackId(null);
		}
	};

	const handleDeleteTrack = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		if (previewPlayingId === id && previewAudioRef.current) {
			previewAudioRef.current.pause();
			setPreviewPlayingId(null);
		}
		radioAudioService.deleteRecordedTrack(id);
	};

	const handlePlayPreview = (track: RecordedRadioTrack) => {
		if (previewPlayingId === track.id) {
			if (previewAudioRef.current) {
				previewAudioRef.current.pause();
			}
			setPreviewPlayingId(null);
			return;
		}

		if (previewAudioRef.current) {
			previewAudioRef.current.pause();
		}

		const audio = new Audio(track.blobUrl);
		previewAudioRef.current = audio;
		audio.play().catch(console.error);
		setPreviewPlayingId(track.id);
		audio.onended = () => {
			setPreviewPlayingId(null);
		};
	};


	// Debounced search when user types
	useEffect(() => {
		const query = searchQuery.trim();
		if (!query) {
			setSearchResults([]);
			setIsSearching(false);
			return;
		}

		setActiveTab("search");
		setIsSearching(true);
		const timer = setTimeout(() => {
			searchStations(query, 25)
				.then((results) => {
					setSearchResults(results);
				})
				.catch((err) => {
					console.error("Error buscando emisoras en widget:", err);
					setSearchResults([]);
				})
				.finally(() => {
					setIsSearching(false);
				});
		}, 300);

		return () => clearTimeout(timer);
	}, [searchQuery]);

	const favoriteMap = useMemo(() => {
		return new Set(favorites.map((s) => s.stationuuid));
	}, [favorites]);

	const handleToggleFavorite = (station: RadioStation, e: React.MouseEvent) => {
		e.stopPropagation();
		const updated = toggleFavoriteStation(station);
		setFavorites(updated);
	};

	const handlePlayStation = (station: RadioStation) => {
		if (activeRadioStation?.stationuuid === station.stationuuid) {
			void togglePlayPause();
		} else {
			void playRadioStation(station);
		}
	};

	const clearSearch = () => {
		setSearchQuery("");
		setSearchResults([]);
		setActiveTab(favorites.length > 0 ? "favorites" : "recents");
		searchInputRef.current?.focus();
	};

	return (
		<div className="flex flex-col h-full w-full bg-audiophile-surface select-none font-sans overflow-hidden text-xs relative">
			{/* Top Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-audiophile-border bg-slate-950/40">
				<div className="flex items-center gap-2">
					<div
						className="p-1 rounded-md"
						style={{ backgroundColor: `${appearance.accentColor}20` }}
					>
						<Radio size={14} style={{ color: appearance.accentColor }} />
					</div>
					<span className="font-semibold text-audiophile-text text-xs tracking-wider uppercase font-mono">
						Radio
					</span>
					{isRadioPlaying && (
						<span className="flex items-center gap-1 text-[9px] font-mono uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
							<span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
							Live
						</span>
					)}
				</div>

				<div className="flex items-center gap-1">
					{onBackToLibrary && (
						<button type="button" onClick={onBackToLibrary} className="grid size-7 place-items-center text-audiophile-muted hover:text-audiophile-cyan" title="Volver a la biblioteca" aria-label="Volver a la biblioteca">
							<Library size={13} />
						</button>
					)}
					<button
						type="button"
						onClick={() => setRadioHubOpen(true)}
						className="flex items-center gap-1 text-[11px] text-audiophile-muted hover:text-audiophile-cyan transition-colors px-1.5 py-0.5 rounded hover:bg-audiophile-surface2"
						title="Abrir explorador completo de emisoras"
					>
						<span>Explorador</span>
						<ExternalLink size={12} />
					</button>
				</div>
			</div>

			{/* Search Bar */}
			<div className="p-2 bg-slate-900/40">
				<div className="flex items-center bg-audiophile-base border border-slate-800/60 rounded px-2.5 py-1">
					<Search size={13} className="text-audiophile-muted mr-2 shrink-0 pointer-events-none" />
					<input
						ref={searchInputRef}
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Buscar emisora o género..."
						className="w-full bg-transparent font-mono text-[11px] text-audiophile-text placeholder:text-audiophile-muted/50 focus:outline-none"
					/>
					{isSearching ? (
						<Loader2 size={12} className="text-audiophile-cyan animate-spin shrink-0 ml-1.5" />
					) : searchQuery ? (
						<button
							type="button"
							onClick={clearSearch}
							className="text-audiophile-muted hover:text-audiophile-text p-0.5 rounded shrink-0 ml-1.5"
						>
							<X size={12} />
						</button>
					) : null}
				</div>
			</div>

			{/* Tabs selector */}
			<div className="flex items-center gap-1 px-2 py-1.5 bg-slate-950/20 text-[11px]">
				<button
					type="button"
					onClick={() => setActiveTab("favorites")}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium ${
						activeTab === "favorites"
							? "bg-audiophile-surface2 text-audiophile-text shadow-sm"
							: "text-audiophile-muted hover:text-audiophile-text"
					}`}
				>
					<Star
						size={12}
						className={activeTab === "favorites" ? "text-amber-400 fill-amber-400" : ""}
					/>
					<span>Favoritos</span>
					<span className="text-[10px] text-audiophile-muted px-1 rounded-full bg-slate-800/80">
						{favorites.length}
					</span>
				</button>

				{searchQuery.trim().length > 0 && (
					<button
						type="button"
						onClick={() => setActiveTab("search")}
						className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium ${
							activeTab === "search"
								? "bg-audiophile-surface2 text-audiophile-text shadow-sm"
								: "text-audiophile-muted hover:text-audiophile-text"
						}`}
					>
						<Search size={12} />
						<span>Resultados</span>
						<span className="text-[10px] text-audiophile-muted px-1 rounded-full bg-slate-800/80">
							{searchResults.length}
						</span>
					</button>
				)}

				<button
					type="button"
					onClick={() => setActiveTab("recents")}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium ${
						activeTab === "recents"
							? "bg-audiophile-surface2 text-audiophile-text shadow-sm"
							: "text-audiophile-muted hover:text-audiophile-text"
					}`}
				>
					<Clock size={12} />
					<span>Recientes</span>
				</button>

				<button
					type="button"
					onClick={() => setActiveTab("recordings")}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors font-medium relative ${
						activeTab === "recordings"
							? "bg-audiophile-surface2 text-audiophile-text shadow-sm"
							: "text-audiophile-muted hover:text-audiophile-text"
					}`}
					title="Grabaciones de radio en memoria"
				>
					<CircleDot size={12} className={isRecording ? "text-rose-500 animate-pulse" : "text-rose-400/70"} />
					<span>Grabaciones</span>
					{recordings.length > 0 && (
						<span className="text-[10px] text-rose-400 font-semibold px-1 rounded-full bg-rose-950/60 border border-rose-900/60">
							{recordings.length}
						</span>
					)}
				</button>
			</div>

			{/* Main Content Area: Station List */}
			<div className="flex-1 overflow-y-auto p-1 divide-y divide-audiophile-border/30">
				{activeTab === "recordings" && (
					<div className="p-2 space-y-2">
						<div className="flex items-center justify-between text-[11px] text-audiophile-muted px-1">
							<span>
								En memoria: <strong className="text-audiophile-text">{recordings.length}</strong> / {librarySettings.radioMaxStoredTracks || 20}
							</span>
							{recordings.length > 0 && (
								<button
									type="button"
									onClick={() => radioAudioService.clearAllRecordings()}
									className="text-[10px] text-rose-400/80 hover:text-rose-300 transition-colors"
								>
									Limpiar todas
								</button>
							)}
						</div>

						{recordings.length === 0 ? (
							<div className="flex flex-col items-center justify-center p-6 text-center text-audiophile-muted gap-2">
								<CircleDot size={26} className="text-rose-500/40" />
								<span className="text-xs font-medium text-audiophile-text">
									Sin pistas grabadas
								</span>
								<p className="text-[11px] max-w-[220px] text-audiophile-muted leading-relaxed">
									Usa el botón de grabación en el reproductor inferior mientras escuchas una emisora para capturar canciones al vuelo (Neowave Recorder).
								</p>
							</div>
						) : (
							<div className="space-y-1.5">
								{recordings.map((rec) => {
									const isPreviewing = previewPlayingId === rec.id;
									const isSaving = savingTrackId === rec.id;
									const isSaved = saveSuccessTrackId === rec.id;
									const sizeMb = (rec.sizeBytes / (1024 * 1024)).toFixed(2);
									const minutes = Math.floor(rec.durationSeconds / 60);
									const seconds = rec.durationSeconds % 60;
									const durStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

									return (
										<div
											key={rec.id}
											className="flex items-center justify-between p-2 rounded bg-audiophile-surface2/60 border border-audiophile-border/40 hover:border-audiophile-cyan/40 transition-colors"
										>
											<div className="min-w-0 flex items-center gap-2">
												<button
													type="button"
													onClick={() => handlePlayPreview(rec)}
													className="p-1.5 rounded-full bg-slate-900 text-audiophile-cyan hover:scale-105 transition-transform shrink-0"
													title={isPreviewing ? "Pausar preescucha" : "Preescuchar"}
												>
													{isPreviewing ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
												</button>
												<div className="min-w-0">
													<div className="text-xs font-medium text-audiophile-text truncate">
														{rec.title}
													</div>
													<div className="text-[10px] text-audiophile-muted flex items-center gap-1.5 font-mono">
														<span>{durStr}</span>
														<span>•</span>
														<span>{sizeMb} MB</span>
														<span>•</span>
														<span>{rec.stationName}</span>
													</div>
												</div>
											</div>

											<div className="flex items-center gap-1 shrink-0 ml-2">
												<button
													type="button"
													onClick={() => handleSaveTrack(rec)}
													disabled={isSaving}
													className={`p-1.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors ${
														isSaved
															? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
															: "bg-audiophile-base hover:bg-audiophile-surface text-audiophile-text border border-audiophile-border"
													}`}
													title="Guardar archivo en la carpeta configurada de tu ordenador"
												>
													{isSaving ? (
														<Loader2 size={12} className="animate-spin text-audiophile-cyan" />
													) : isSaved ? (
														<>
															<Check size={12} className="text-emerald-400" />
															<span className="text-[10px]">Guardado</span>
														</>
													) : (
														<>
															<Download size={12} />
															<span className="text-[10px]">Guardar</span>
														</>
													)}
												</button>

												<button
													type="button"
													onClick={(e) => handleDeleteTrack(rec.id, e)}
													className="p-1.5 rounded text-neutral-500 hover:text-rose-400 transition-colors"
													title="Eliminar de la lista temporal"
												>
													<Trash2 size={12} />
												</button>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}
				{activeTab === "favorites" && (
					<>
						{favorites.length === 0 ? (
							<div className="flex flex-col items-center justify-center p-6 text-center text-audiophile-muted h-full gap-2">
								<Star size={26} className="text-amber-400/40" />
								<span className="text-xs font-medium text-audiophile-text">
									Sin emisoras favoritas
								</span>
								<p className="text-[11px] max-w-[220px] text-audiophile-muted leading-relaxed">
									Busca emisoras con la barra superior o explora el catálogo para añadirlas aquí.
								</p>
								<button
									type="button"
									onClick={() => setRadioHubOpen(true)}
									className="mt-1 flex items-center gap-1.5 rounded-md border border-audiophile-border bg-audiophile-surface2 px-2.5 py-1 text-xs text-audiophile-text hover:border-audiophile-cyan transition-colors"
								>
									<Sparkles size={12} /> Explorar emisoras
								</button>
							</div>
						) : (
							favorites.map((station) => (
								<StationRow
									key={station.stationuuid}
									station={station}
									isCurrent={activeRadioStation?.stationuuid === station.stationuuid}
									isPlaying={Boolean(activeRadioStation?.stationuuid === station.stationuuid && isRadioPlaying)}
									isFav={favoriteMap.has(station.stationuuid)}
									onPlay={() => handlePlayStation(station)}
									onToggleFav={(e) => handleToggleFavorite(station, e)}
								/>
							))
						)}
					</>
				)}

				{activeTab === "search" && (
					<>
						{isSearching ? (
							<div className="flex flex-col items-center justify-center p-8 text-center text-audiophile-muted gap-2">
								<Loader2 size={20} className="animate-spin text-audiophile-cyan" />
								<span className="text-xs">Buscando emisoras...</span>
							</div>
						) : searchResults.length === 0 ? (
							<div className="flex flex-col items-center justify-center p-6 text-center text-audiophile-muted h-full gap-2">
								<Search size={22} className="text-slate-600" />
								<span className="text-xs font-medium text-audiophile-text">
									No se encontraron emisoras
								</span>
								<p className="text-[11px] text-audiophile-muted">
									Prueba buscando por nombre ("BBC", "Ibiza", "Rock FM") o género.
								</p>
							</div>
						) : (
							searchResults.map((station) => (
								<StationRow
									key={station.stationuuid}
									station={station}
									isCurrent={activeRadioStation?.stationuuid === station.stationuuid}
									isPlaying={Boolean(activeRadioStation?.stationuuid === station.stationuuid && isRadioPlaying)}
									isFav={favoriteMap.has(station.stationuuid)}
									onPlay={() => handlePlayStation(station)}
									onToggleFav={(e) => handleToggleFavorite(station, e)}
								/>
							))
						)}
					</>
				)}

				{activeTab === "recents" && (
					<>
						{recents.length === 0 ? (
							<div className="flex flex-col items-center justify-center p-6 text-center text-audiophile-muted h-full gap-2">
								<Clock size={22} className="text-slate-600" />
								<span className="text-xs font-medium text-audiophile-text">
									Sin historial reciente
								</span>
								<p className="text-[11px] text-audiophile-muted">
									Las emisoras que escuches se guardarán aquí para acceso rápido.
								</p>
							</div>
						) : (
							recents.map((station) => (
								<StationRow
									key={station.stationuuid}
									station={station}
									isCurrent={activeRadioStation?.stationuuid === station.stationuuid}
									isPlaying={Boolean(activeRadioStation?.stationuuid === station.stationuuid && isRadioPlaying)}
									isFav={favoriteMap.has(station.stationuuid)}
									onPlay={() => handlePlayStation(station)}
									onToggleFav={(e) => handleToggleFavorite(station, e)}
								/>
							))
						)}
					</>
				)}
			</div>

			{/* Docked Now Playing Mini-Player at bottom */}
			{activeRadioStation && (
				<div className="border-t border-audiophile-border bg-slate-950/70 p-2.5 backdrop-blur-sm">
					<div className="flex items-center justify-between gap-2">
						{/* Station info */}
						<div className="flex items-center gap-2 min-w-0">
							{activeRadioStation.favicon ? (
								<img
									src={activeRadioStation.favicon}
									alt=""
									className="h-8 w-8 rounded object-cover shrink-0 border border-slate-750"
									onError={(e) => {
										(e.currentTarget as HTMLImageElement).style.display = "none";
									}}
								/>
							) : (
								<div className="h-8 w-8 rounded bg-audiophile-surface2 flex items-center justify-center shrink-0">
									<Radio size={14} style={{ color: appearance.accentColor }} />
								</div>
							)}
							<div className="min-w-0">
								<div className="truncate text-xs font-semibold text-audiophile-text">
									{activeRadioStation.name}
								</div>
								{streamTitle && (
									<div className="truncate text-[10px] text-audiophile-cyan" title={streamTitle}>
										{streamTitle}
									</div>
								)}
								<div className="truncate text-[10px] text-audiophile-muted flex items-center gap-1.5">
									{activeRadioStation.country && <span>{activeRadioStation.country}</span>}
									{activeRadioStation.codec && <span>· {activeRadioStation.codec}</span>}
									{Boolean(activeRadioStation.bitrate && activeRadioStation.bitrate > 0) && (
										<span>· {activeRadioStation.bitrate} kbps</span>
									)}
								</div>
							</div>
						</div>

						{/* Quick playback controls */}
						<div className="flex items-center gap-1 shrink-0">
							<button
								type="button"
								onClick={(e) => handleToggleFavorite(activeRadioStation, e)}
								className="p-1.5 rounded text-audiophile-muted hover:text-amber-400 transition-colors"
								title={favoriteMap.has(activeRadioStation.stationuuid) ? "Quitar de favoritos" : "Añadir a favoritos"}
							>
								<Star
									size={14}
									className={favoriteMap.has(activeRadioStation.stationuuid) ? "text-amber-400 fill-amber-400" : ""}
								/>
							</button>

							<button
								type="button"
								onClick={handleToggleRecord}
								className={`p-1.5 rounded transition-colors flex items-center justify-center ${
									isRecording
										? "text-rose-400 bg-rose-950/60 border border-rose-600 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.4)]"
										: "text-audiophile-muted hover:text-rose-400"
								}`}
								title={isRecording ? "Detener grabación y añadir a lista" : "Grabar emisora (Neowave Recorder)"}
							>
								<CircleDot size={14} className={isRecording ? "fill-rose-500" : ""} />
							</button>

							<button
								type="button"
								onClick={() => setLibrarySettings({ radioAutoRecordEnabled: !librarySettings.radioAutoRecordEnabled })}
								className={`p-1.5 rounded transition-colors flex items-center justify-center ${
									librarySettings.radioAutoRecordEnabled
										? "text-emerald-400 bg-emerald-950/50 border border-emerald-600/60"
										: "text-audiophile-muted hover:text-emerald-400"
								}`}
								title={
									librarySettings.radioAutoRecordEnabled
										? "Guardado automático de canciones activado (requiere que la emisora envíe metadatos ICY)"
										: "Activar guardado automático de canciones detectadas"
								}
							>
								<Sparkles size={14} />
							</button>

							<button
								type="button"
								onClick={() => void togglePlayPause()}
								className="p-1.5 rounded-full text-slate-950 font-bold transition-transform hover:scale-105 active:scale-95"
								style={{ backgroundColor: appearance.accentColor }}
								title={isRadioPlaying ? "Pausar emisora" : "Reanudar emisora"}
							>
								{isRadioPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
							</button>

							<button
								type="button"
								onClick={stopRadio}
								className="p-1.5 rounded text-audiophile-muted hover:text-rose-400 transition-colors"
								title="Detener emisora"
							>
								<Square size={12} />
							</button>
						</div>
					</div>

					{/* Real-time and accumulated network data usage */}
					{isRadioPlaying && (
						<div
							className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-audiophile-muted"
							title={isRealDataUsage ? "Bytes reales medidos en la red" : "Estimado a partir del bitrate reportado por la emisora"}
						>
							<span>
								{bytesPerSecond > 0 ? `${(bytesPerSecond / 1024).toFixed(0)} KB/s ${isRealDataUsage ? "en vivo" : "(estimado)"}` : "Consumo no disponible"}
							</span>
							<span>Sesión: {formatDataSize(sessionBytesTotal)}</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

interface StationRowProps {
	station: RadioStation;
	isCurrent: boolean;
	isPlaying: boolean;
	isFav: boolean;
	onPlay: () => void;
	onToggleFav: (e: React.MouseEvent) => void;
}

const StationRow: React.FC<StationRowProps> = ({
	station,
	isCurrent,
	isPlaying,
	isFav,
	onPlay,
	onToggleFav,
}) => {
	return (
		<div
			onClick={onPlay}
			className={`group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
				isCurrent
					? "bg-audiophile-cyan/15 text-audiophile-cyan"
					: "text-audiophile-text hover:bg-audiophile-surface2/70"
			}`}
		>
			<div className="flex items-center gap-2.5 min-w-0">
				{/* Favicon or Radio icon */}
				<div className="relative h-6 w-6 shrink-0 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-center overflow-hidden">
					{station.favicon ? (
						<img
							src={station.favicon}
							alt=""
							className="h-full w-full object-cover"
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = "none";
							}}
						/>
					) : (
						<Radio size={12} className="text-audiophile-muted" />
					)}

					{/* Playing overlay */}
					{isCurrent && isPlaying && (
						<div className="absolute inset-0 bg-black/60 flex items-center justify-center">
							<Volume2 size={11} className="text-audiophile-cyan animate-pulse" />
						</div>
					)}
				</div>

				<div className="min-w-0">
					<div className={`truncate text-xs font-medium leading-tight ${isCurrent ? "font-semibold" : ""}`}>
						{station.name}
					</div>
					<div className="truncate text-[10px] text-audiophile-muted flex items-center gap-1.5">
						{station.country && <span>{station.country}</span>}
						{station.tags && (
							<span className="truncate max-w-[120px] text-slate-500">
								· {station.tags.split(",").slice(0, 2).join(", ")}
							</span>
						)}
					</div>
				</div>
			</div>

			<div className="flex items-center gap-1 shrink-0 ml-2">
				{/* Action icons */}
				<button
					type="button"
					onClick={onToggleFav}
					className={`p-1 rounded transition-colors ${
						isFav
							? "text-amber-400"
							: "text-audiophile-muted/40 hover:text-amber-400 opacity-0 group-hover:opacity-100"
					}`}
					title={isFav ? "Quitar de favoritos" : "Guardar en favoritos"}
				>
					<Star size={12} className={isFav ? "fill-amber-400" : ""} />
				</button>

				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onPlay();
					}}
					className="p-1 rounded text-audiophile-muted hover:text-audiophile-text opacity-0 group-hover:opacity-100 transition-opacity"
					title={isCurrent && isPlaying ? "Pausar" : "Reproducir"}
				>
					{isCurrent && isPlaying ? <Pause size={12} /> : <Play size={12} />}
				</button>
			</div>
		</div>
	);
};
