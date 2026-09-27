import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Radio, Search, X } from "lucide-react";
import { useMusicStore } from "../../store/index.ts";
import type { RadioStation } from "../../types/radio.ts";
import {
	getPopularStations,
	searchStations,
	searchStationsByCountryCode,
	searchStationsByLanguage,
	searchStationsByTag,
} from "../../services/radioApi.ts";
import {
	addRecentStation,
	getCustomStations,
	getFavoriteStations,
	getRecentStations,
	removeCustomStation,
	saveCustomStation,
	toggleFavoriteStation,
} from "../../services/radioStorage.ts";
import { StationCard } from "./StationCard.tsx";
import { AddCustomStationModal } from "./AddCustomStationModal.tsx";

type RadioView = "discover" | "genres" | "countries" | "favorites" | "recent" | "custom";

interface RadioHubModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const GENRES = [
	{ id: "rap", label: "Rap" },
	{ id: "hiphop", label: "Hip-Hop" },
	{ id: "blues", label: "Blues" },
	{ id: "rock", label: "Rock" },
	{ id: "soul", label: "Soul" },
	{ id: "pop", label: "Pop" },
	{ id: "jazz", label: "Jazz" },
	{ id: "electronic", label: "Electronic" },
	{ id: "classical", label: "Clásica" },
	{ id: "metal", label: "Metal" },
	{ id: "reggae", label: "Reggae" },
	{ id: "rnb", label: "R&B" },
	{ id: "latin", label: "Latina" },
	{ id: "ambient", label: "Ambient" },
	{ id: "disco", label: "Disco" },
	{ id: "funk", label: "Funk" },
	{ id: "indie", label: "Indie" },
	{ id: "country", label: "Country" },
];

interface RegionCountryOption {
	id: string;
	kind: "country" | "language";
	queryValue: string;
	nameEs: string;
	nameCa: string;
	nameEn: string;
}

const REGION_OPTIONS: RegionCountryOption[] = [
	{ id: "catalunya", kind: "language", queryValue: "catalan", nameEs: "Catalunya", nameCa: "Catalunya", nameEn: "Catalonia" },
	{ id: "spain", kind: "country", queryValue: "ES", nameEs: "España", nameCa: "Espanya", nameEn: "Spain" },
	{ id: "andorra", kind: "country", queryValue: "AD", nameEs: "Andorra", nameCa: "Andorra", nameEn: "Andorra" },
	{ id: "galego", kind: "language", queryValue: "galician", nameEs: "Gallego", nameCa: "Gallego", nameEn: "Galician" },
	{ id: "euskera", kind: "language", queryValue: "basque", nameEs: "Euskera", nameCa: "Euskera", nameEn: "Basque" },
	{ id: "france", kind: "country", queryValue: "FR", nameEs: "Francia", nameCa: "França", nameEn: "France" },
	{ id: "italy", kind: "country", queryValue: "IT", nameEs: "Italia", nameCa: "Itàlia", nameEn: "Italy" },
	{ id: "uk", kind: "country", queryValue: "GB", nameEs: "Reino Unido", nameCa: "Regne Unit", nameEn: "United Kingdom" },
	{ id: "usa", kind: "country", queryValue: "US", nameEs: "Estados Unidos", nameCa: "Estats Units", nameEn: "United States" },
	{ id: "mexico", kind: "country", queryValue: "MX", nameEs: "México", nameCa: "Mèxic", nameEn: "Mexico" },
	{ id: "argentina", kind: "country", queryValue: "AR", nameEs: "Argentina", nameCa: "Argentina", nameEn: "Argentina" },
	{ id: "colombia", kind: "country", queryValue: "CO", nameEs: "Colombia", nameCa: "Colòmbia", nameEn: "Colombia" },
	{ id: "chile", kind: "country", queryValue: "CL", nameEs: "Chile", nameCa: "Xile", nameEn: "Chile" },
	{ id: "peru", kind: "country", queryValue: "PE", nameEs: "Perú", nameCa: "Perú", nameEn: "Peru" },
	{ id: "germany", kind: "country", queryValue: "DE", nameEs: "Alemania", nameCa: "Alemanya", nameEn: "Germany" },
	{ id: "portugal", kind: "country", queryValue: "PT", nameEs: "Portugal", nameCa: "Portugal", nameEn: "Portugal" },
	{ id: "brazil", kind: "country", queryValue: "BR", nameEs: "Brasil", nameCa: "Brasil", nameEn: "Brazil" },
	{ id: "canada", kind: "country", queryValue: "CA", nameEs: "Canadá", nameCa: "Canadà", nameEn: "Canada" },
	{ id: "australia", kind: "country", queryValue: "AU", nameEs: "Australia", nameCa: "Austràlia", nameEn: "Australia" },
	{ id: "netherlands", kind: "country", queryValue: "NL", nameEs: "Países Bajos", nameCa: "Països Baixos", nameEn: "Netherlands" },
	{ id: "japan", kind: "country", queryValue: "JP", nameEs: "Japón", nameCa: "Japó", nameEn: "Japan" },
];

export const RadioHubModal: React.FC<RadioHubModalProps> = ({ isOpen, onClose }) => {
	const { activeRadioStation, isRadioPlaying, playRadioStation, appearance, language } = useMusicStore();
	const [view, setView] = useState<RadioView>("discover");
	const [query, setQuery] = useState("");
	const [selectedGenre, setSelectedGenre] = useState("rap");
	const [selectedRegionId, setSelectedRegionId] = useState(() => {
		if (language === "ca") return "catalunya";
		if (language === "en") return "uk";
		return "spain";
	});

	const [stations, setStations] = useState<RadioStation[]>([]);
	const [favorites, setFavorites] = useState<RadioStation[]>(getFavoriteStations);
	const [recents, setRecents] = useState<RadioStation[]>(getRecentStations);
	const [customStations, setCustomStations] = useState<RadioStation[]>(getCustomStations);
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const genresScrollRef = useRef<HTMLDivElement | null>(null);
	const countriesScrollRef = useRef<HTMLDivElement | null>(null);

	const scrollLeft = (ref: React.RefObject<HTMLDivElement | null>) => {
		ref.current?.scrollBy({ left: -220, behavior: "smooth" });
	};

	const scrollRight = (ref: React.RefObject<HTMLDivElement | null>) => {
		ref.current?.scrollBy({ left: 220, behavior: "smooth" });
	};

	// Exact requested ordering:
	// Català: Catalunya, Andorra, Espanya, Gallego, Euskera, França, Itàlia, Regne Unit, Estats Units, Mèxic, etc.
	// Castellano: España, Catalunya, Gallego, Euskera, México, Argentina, Colombia, Chile, Perú, etc.
	const sortedRegions = useMemo(() => {
		if (language === "ca") {
			const priorityOrder = ["catalunya", "andorra", "spain", "galego", "euskera", "france", "italy", "uk", "usa", "mexico", "argentina", "colombia", "chile", "peru"];
			return [...REGION_OPTIONS].sort((a, b) => {
				const idxA = priorityOrder.indexOf(a.id);
				const idxB = priorityOrder.indexOf(b.id);
				if (idxA !== -1 && idxB !== -1) return idxA - idxB;
				if (idxA !== -1) return -1;
				if (idxB !== -1) return 1;
				return a.nameCa.localeCompare(b.nameCa, "ca");
			});
		}

		if (language === "en") {
			const priorityOrder = ["uk", "usa", "canada", "australia", "spain", "catalunya", "france", "germany", "italy", "mexico"];
			return [...REGION_OPTIONS].sort((a, b) => {
				const idxA = priorityOrder.indexOf(a.id);
				const idxB = priorityOrder.indexOf(b.id);
				if (idxA !== -1 && idxB !== -1) return idxA - idxB;
				if (idxA !== -1) return -1;
				if (idxB !== -1) return 1;
				return a.nameEn.localeCompare(b.nameEn, "en");
			});
		}

		// Castellano: España, Catalunya, Gallego, Euskera, México, Argentina, Colombia, Chile, Perú, etc.
		const priorityOrder = ["spain", "catalunya", "galego", "euskera", "mexico", "argentina", "colombia", "chile", "peru", "andorra", "france", "italy", "uk", "usa"];
		return [...REGION_OPTIONS].sort((a, b) => {
			const idxA = priorityOrder.indexOf(a.id);
			const idxB = priorityOrder.indexOf(b.id);
			if (idxA !== -1 && idxB !== -1) return idxA - idxB;
			if (idxA !== -1) return -1;
			if (idxB !== -1) return 1;
			return a.nameEs.localeCompare(b.nameEs, "es");
		});
	}, [language]);

	useEffect(() => {
		if (language === "ca") setSelectedRegionId("catalunya");
		else if (language === "en") setSelectedRegionId("uk");
		else setSelectedRegionId("spain");
	}, [language]);

	const selectedRegion = useMemo(() => {
		return REGION_OPTIONS.find((r) => r.id === selectedRegionId) || REGION_OPTIONS[0];
	}, [selectedRegionId]);

	const viewStations = useMemo(() => {
		if (view === "favorites") return favorites;
		if (view === "recent") return recents;
		if (view === "custom") return customStations;
		return stations;
	}, [view, favorites, recents, customStations, stations]);

	// Load stations
	useEffect(() => {
		if (!isOpen) return;
		if (view === "favorites" || view === "recent" || view === "custom") return;

		let cancelled = false;
		const timeoutId = window.setTimeout(async () => {
			setIsLoading(true);
			setError("");
			try {
				let result: RadioStation[] = [];
				if (query.trim()) {
					result = await searchStations(query.trim());
				} else if (view === "genres") {
					result = await searchStationsByTag(selectedGenre);
				} else if (view === "countries") {
					if (selectedRegion.kind === "language") {
						result = await searchStationsByLanguage(selectedRegion.queryValue);
					} else {
						result = await searchStationsByCountryCode(selectedRegion.queryValue);
					}
				} else {
					result = await getPopularStations();
				}
				if (!cancelled) setStations(result);
			} catch (requestError) {
				if (!cancelled) {
					setError(requestError instanceof Error ? requestError.message : "No se pudo conectar con Radio-Browser.");
					setStations([]);
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}, query.trim() ? 250 : 0);

		return () => {
			cancelled = true;
			window.clearTimeout(timeoutId);
		};
	}, [isOpen, view, query, selectedGenre, selectedRegion]);

	useEffect(() => {
		if (isOpen) {
			setFavorites(getFavoriteStations());
			setRecents(getRecentStations());
			setCustomStations(getCustomStations());
		}
	}, [isOpen]);

	if (!isOpen) return null;

	const handlePlay = async (station: RadioStation) => {
		setError("");
		try {
			await playRadioStation(station);
			addRecentStation(station);
			setRecents(getRecentStations());
		} catch (playError) {
			setError(playError instanceof Error ? playError.message : "No se pudo iniciar la emisora.");
		}
	};

	const handleSaveCustom = (station: RadioStation) => {
		setCustomStations(saveCustomStation(station));
		setView("custom");
	};

	const handleRemoveCustom = (station: RadioStation) => {
		setCustomStations(removeCustomStation(station.stationuuid));
	};

	const views: { id: RadioView; label: string }[] = [
		{ id: "discover", label: language === "ca" ? "Explorar" : language === "en" ? "Explore" : "Explorar" },
		{ id: "genres", label: language === "ca" ? "Estils" : language === "en" ? "Genres" : "Estilos" },
		{ id: "countries", label: language === "ca" ? "Països" : language === "en" ? "Countries" : "Países" },
		{ id: "favorites", label: language === "ca" ? "Preferides" : language === "en" ? "Favorites" : "Favoritas" },
		{ id: "recent", label: language === "ca" ? "Recents" : language === "en" ? "Recent" : "Recientes" },
		{ id: "custom", label: language === "ca" ? "Personalitzades" : language === "en" ? "Custom" : "Personalizadas" },
	];

	const getRegionLabel = (r: RegionCountryOption) => {
		if (language === "ca") return r.nameCa;
		if (language === "en") return r.nameEn;
		return r.nameEs;
	};

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm select-none" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
			<section
				role="dialog"
				aria-modal="true"
				aria-label="Radio online Neowave"
				className="flex h-[760px] w-[860px] max-w-[94vw] max-h-[94vh] flex-col overflow-hidden rounded-xl border border-audiophile-border bg-audiophile-surface shadow-2xl"
			>
				<header className="flex shrink-0 items-center justify-between border-b border-audiophile-border px-4 py-3">
					<div className="flex items-center gap-2.5">
						<Radio size={20} style={{ color: appearance.accentColor }} />
						<div>
							<h2 className="text-sm font-bold text-audiophile-text">
								{language === "ca" ? "Ràdio Online (Neowave)" : language === "en" ? "Online Radio (Neowave)" : "Radio Online (Neowave)"}
							</h2>
							<p className="text-[10px] text-audiophile-muted">Radio-Browser &bull; emisoras mundiales en streaming</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button type="button" onClick={() => setIsAddOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-audiophile-border px-2.5 py-1.5 text-[11px] text-audiophile-text hover:border-audiophile-cyan transition-colors">
							<Plus size={13} /> {language === "ca" ? "Afegir URL" : language === "en" ? "Add URL" : "Añadir URL"}
						</button>
						<button type="button" onClick={onClose} className="rounded-lg p-1.5 text-audiophile-muted hover:bg-audiophile-surface2 hover:text-white transition-colors" aria-label="Cerrar radio">
							<X size={16} />
						</button>
					</div>
				</header>

				{activeRadioStation && (
					<div className="flex shrink-0 items-center justify-between gap-3 border-b border-audiophile-border bg-audiophile-cyan/10 px-4 py-2">
						<div className="flex items-center gap-2 min-w-0">
							<span className="flex items-center gap-1 text-[9px] font-mono uppercase text-emerald-400 font-bold shrink-0">
								<span className={`h-1.5 w-1.5 rounded-full ${isRadioPlaying ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
								{isRadioPlaying ? (language === "ca" ? "En directe" : language === "en" ? "Live" : "En directo") : (language === "ca" ? "Pausat" : language === "en" ? "Paused" : "En pausa")}
							</span>
							<span className="truncate text-xs font-semibold text-audiophile-text">{activeRadioStation.name}</span>
						</div>
						<span className="shrink-0 text-[10px] text-audiophile-muted font-mono">{activeRadioStation.codec} {activeRadioStation.bitrate ? `· ${activeRadioStation.bitrate} kbps` : ""}</span>
					</div>
				)}

				{/* Views Navigation */}
				<nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-audiophile-border px-3 py-2 settings-tabs-scroll" aria-label="Secciones de radio">
					{views.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => {
								setView(item.id);
								setQuery("");
							}}
							className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${view === item.id ? "bg-audiophile-cyan/20 font-semibold text-audiophile-cyan border border-audiophile-cyan/40" : "text-audiophile-muted hover:bg-audiophile-surface2 hover:text-audiophile-text border border-transparent"}`}
						>
							{item.label}
						</button>
					))}
				</nav>

				{/* Subbar for Genres with Left & Right arrows */}
				{view === "genres" && (
					<div className="relative flex shrink-0 items-center border-b border-audiophile-border/70 bg-slate-950/40 px-1 py-1.5">
						<button
							type="button"
							onClick={() => scrollLeft(genresScrollRef)}
							className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 shadow hover:bg-slate-700 hover:text-white"
							title="Desplazar a la izquierda"
						>
							<ChevronLeft size={16} />
						</button>
						<div
							ref={genresScrollRef}
							className="flex flex-1 items-center gap-1.5 overflow-x-auto px-2 py-0.5 settings-tabs-scroll scroll-smooth"
						>
							{GENRES.map((g) => (
								<button
									key={g.id}
									type="button"
									onClick={() => {
										setSelectedGenre(g.id);
										setQuery("");
									}}
									className={`rounded-full px-3 py-1 text-[11px] whitespace-nowrap font-medium transition-all ${selectedGenre === g.id && !query.trim() ? "bg-cyan-500 text-slate-950 font-bold shadow-sm" : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"}`}
								>
									{g.label}
								</button>
							))}
						</div>
						<button
							type="button"
							onClick={() => scrollRight(genresScrollRef)}
							className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 shadow hover:bg-slate-700 hover:text-white"
							title="Desplazar a la derecha"
						>
							<ChevronRight size={16} />
						</button>
					</div>
				)}

				{/* Subbar for Countries / Regions with Left & Right arrows and Clean Names (No flags) */}
				{view === "countries" && (
					<div className="relative flex shrink-0 items-center border-b border-audiophile-border/70 bg-slate-950/40 px-1 py-1.5">
						<button
							type="button"
							onClick={() => scrollLeft(countriesScrollRef)}
							className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 shadow hover:bg-slate-700 hover:text-white"
							title="Desplazar a la izquierda"
						>
							<ChevronLeft size={16} />
						</button>
						<div
							ref={countriesScrollRef}
							className="flex flex-1 items-center gap-1.5 overflow-x-auto px-2 py-0.5 settings-tabs-scroll scroll-smooth"
						>
							{sortedRegions.map((r) => (
								<button
									key={r.id}
									type="button"
									onClick={() => {
										setSelectedRegionId(r.id);
										setQuery("");
									}}
									className={`rounded-full px-3 py-1 text-[11px] whitespace-nowrap font-medium transition-all ${selectedRegionId === r.id && !query.trim() ? "bg-cyan-500 text-slate-950 font-bold shadow-sm" : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"}`}
								>
									{getRegionLabel(r)}
								</button>
							))}
						</div>
						<button
							type="button"
							onClick={() => scrollRight(countriesScrollRef)}
							className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 shadow hover:bg-slate-700 hover:text-white"
							title="Desplazar a la derecha"
						>
							<ChevronRight size={16} />
						</button>
					</div>
				)}

				{/* Search box (in discover, genres, countries) */}
				{(view === "discover" || view === "genres" || view === "countries") && (
					<div className="shrink-0 px-3 pt-2.5 pb-1">
						<label className="flex items-center gap-2 rounded-lg border border-audiophile-border bg-slate-950/60 px-3 py-1.5">
							<Search size={14} className="shrink-0 text-audiophile-muted" />
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={
									language === "ca"
										? "Cercar emissora o filtre..."
										: language === "en"
											? "Search station, genre, or country..."
											: "Buscar emisora por nombre, estilo o país..."
								}
								className="min-w-0 flex-1 bg-transparent text-xs text-audiophile-text outline-none placeholder:text-audiophile-muted"
							/>
							{query && (
								<button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-white">
									<X size={13} />
								</button>
							)}
						</label>
					</div>
				)}

				<div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
					{error && <p role="alert" className="m-2 rounded-lg border border-rose-900/60 bg-rose-950/30 p-2 text-xs text-rose-300">{error}</p>}
					{isLoading ? (
						<div className="flex h-36 items-center justify-center gap-2 text-xs text-audiophile-muted">
							<LoaderCircle size={18} className="animate-spin text-cyan-400" />
							<span>{language === "ca" ? "Carregant emissores…" : language === "en" ? "Loading stations…" : "Cargando emisoras…"}</span>
						</div>
					) : viewStations.length ? (
						viewStations.map((station) => (
							<StationCard
								key={station.stationuuid}
								station={station}
								isFavorite={favorites.some((favorite) => favorite.stationuuid === station.stationuuid)}
								isActive={activeRadioStation?.stationuuid === station.stationuuid}
								isPlaying={isRadioPlaying}
								onPlay={(item) => void handlePlay(item)}
								onToggleFavorite={(item) => setFavorites(toggleFavoriteStation(item))}
								onRemoveCustom={station.isCustom ? handleRemoveCustom : undefined}
							/>
						))
					) : (
						<div className="flex h-36 flex-col items-center justify-center px-4 text-center text-xs text-audiophile-muted gap-1">
							<p>
								{view === "discover"
									? "No se encontraron emisoras."
									: view === "genres"
										? `No se encontraron emisoras de ${selectedGenre}.`
										: view === "countries"
											? `No se encontraron emisoras para ${getRegionLabel(selectedRegion)}.`
											: view === "favorites"
												? "Aún no tienes emisoras favoritas."
												: view === "recent"
													? "Todavía no has escuchado ninguna emisora."
													: "Añade una URL de streaming para crear tu lista."}
							</p>
						</div>
					)}
				</div>

				<footer className="flex shrink-0 items-center justify-between border-t border-audiophile-border px-4 py-2.5 text-[10px] text-audiophile-muted">
					<span>{viewStations.length} {language === "ca" ? "emissores" : language === "en" ? "stations" : "emisoras"}</span>
					<span>MusicX Hi-Fi Radio Core</span>
				</footer>
				<AddCustomStationModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSave={handleSaveCustom} />
			</section>
		</div>
	);
};
