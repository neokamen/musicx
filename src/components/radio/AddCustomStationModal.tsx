import React, { useState } from "react";
import { X } from "lucide-react";
import type { RadioStation } from "../../types/radio.ts";

interface AddCustomStationModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (station: RadioStation) => void;
}

export const AddCustomStationModal: React.FC<AddCustomStationModalProps> = ({ isOpen, onClose, onSave }) => {
	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [error, setError] = useState("");

	if (!isOpen) return null;

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		try {
			const parsedUrl = new URL(url.trim());
			if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error();
			if (!name.trim()) {
				setError("Escribe el nombre de la emisora.");
				return;
			}
			onSave({
				stationuuid: `custom-${Date.now()}`,
				name: name.trim(),
				url: parsedUrl.toString(),
				url_resolved: parsedUrl.toString(),
				codec: parsedUrl.pathname.split(".").pop()?.toUpperCase(),
				isCustom: true,
			});
			setName("");
			setUrl("");
			setError("");
			onClose();
		} catch {
			setError("Introduce una URL de streaming http:// o https:// válida.");
		}
	};

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
			<form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-lg border border-audiophile-border bg-audiophile-surface p-4 shadow-2xl">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-bold text-audiophile-text">Añadir emisora</h3>
					<button type="button" onClick={onClose} className="rounded p-1 text-audiophile-muted hover:text-white" aria-label="Cerrar"><X size={16} /></button>
				</div>
				<label className="block space-y-1 text-xs text-audiophile-muted">
					<span>Nombre</span>
					<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded border border-audiophile-border bg-audiophile-base px-3 py-2 text-audiophile-text outline-none focus:border-audiophile-cyan" placeholder="Mi emisora" />
				</label>
				<label className="block space-y-1 text-xs text-audiophile-muted">
					<span>URL de streaming</span>
					<input value={url} onChange={(event) => setUrl(event.target.value)} className="w-full rounded border border-audiophile-border bg-audiophile-base px-3 py-2 font-mono text-audiophile-text outline-none focus:border-audiophile-cyan" placeholder="https://servidor/emisora.mp3" />
				</label>
				{error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded border border-audiophile-border px-3 py-2 text-xs text-audiophile-muted hover:text-white">Cancelar</button>
					<button type="submit" className="rounded bg-audiophile-cyan px-3 py-2 text-xs font-bold text-audiophile-base">Guardar</button>
				</div>
			</form>
		</div>
	);
};
