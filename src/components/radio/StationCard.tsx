import React, { useState } from "react";
import { Heart, Play, Radio, Trash2 } from "lucide-react";
import type { RadioStation } from "../../types/radio.ts";

interface StationCardProps {
	station: RadioStation;
	isFavorite: boolean;
	isActive: boolean;
	isPlaying: boolean;
	onPlay: (station: RadioStation) => void;
	onToggleFavorite: (station: RadioStation) => void;
	onRemoveCustom?: (station: RadioStation) => void;
}

export const StationCard: React.FC<StationCardProps> = ({
	station,
	isFavorite,
	isActive,
	isPlaying,
	onPlay,
	onToggleFavorite,
	onRemoveCustom,
}) => {
	const [faviconFailed, setFaviconFailed] = useState(false);
	const details = [station.country, station.codec, station.bitrate ? `${station.bitrate} kbps` : null]
		.filter(Boolean)
		.join(" · ");

	return (
		<article className={`flex min-w-0 items-center gap-3 border-b border-audiophile-border/70 px-3 py-2.5 transition-colors ${isActive ? "bg-audiophile-cyan/10" : "hover:bg-audiophile-surface2/70"}`}>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-audiophile-surface2 text-audiophile-cyan">
				{station.favicon && !faviconFailed
					? <img src={station.favicon} alt="" className="h-full w-full object-cover" onError={() => setFaviconFailed(true)} />
					: <Radio size={17} />}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-2">
					<h3 className="truncate text-xs font-semibold text-audiophile-text" title={station.name}>{station.name}</h3>
					{isActive && isPlaying && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" title="En directo" />}
				</div>
				<p className="mt-0.5 truncate text-[10px] text-audiophile-muted" title={station.tags || details}>
					{station.tags || details || "Emisora online"}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<button
					type="button"
					onClick={() => onToggleFavorite(station)}
					className={`rounded p-1.5 transition-colors ${isFavorite ? "text-rose-400" : "text-audiophile-muted hover:text-rose-300"}`}
					title={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
					aria-label={isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
				>
					<Heart size={14} fill={isFavorite ? "currentColor" : "none"} />
				</button>
				<button
					type="button"
					onClick={() => onPlay(station)}
					className="flex h-8 w-8 items-center justify-center rounded-full bg-audiophile-cyan text-audiophile-base transition hover:brightness-110"
					title={`Reproducir ${station.name}`}
					aria-label={`Reproducir ${station.name}`}
				>
					<Play size={14} fill="currentColor" />
				</button>
				{station.isCustom && onRemoveCustom && (
					<button type="button" onClick={() => onRemoveCustom(station)} className="rounded p-1.5 text-audiophile-muted hover:text-rose-400" title="Eliminar emisora personalizada" aria-label="Eliminar emisora personalizada">
						<Trash2 size={14} />
					</button>
				)}
			</div>
		</article>
	);
};
