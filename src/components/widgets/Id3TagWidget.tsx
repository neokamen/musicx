import React from "react";
import { Tag } from "lucide-react";
import { useMusicStore } from "../../store/index.ts";

export const Id3TagWidget: React.FC = () => {
  const { currentTrack, telemetry, appearance } = useMusicStore();
  const fields = [
    { label: "Título", value: telemetry.track_title || currentTrack?.title },
    { label: "Artista", value: telemetry.track_artist || currentTrack?.artist },
    { label: "Álbum", value: telemetry.track_album || currentTrack?.album },
    { label: "Pista", value: currentTrack?.track_number ? String(currentTrack.track_number) : undefined },
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-audiophile-surface p-3 text-xs">
      <div className="mb-3 flex items-center gap-2 border-b border-audiophile-border pb-2 font-mono text-[10px] uppercase tracking-wider text-audiophile-muted">
        <Tag size={14} style={{ color: appearance.accentColor }} />
        Etiquetas ID3
      </div>
      <dl className="grid min-h-0 grid-cols-1 gap-y-2 overflow-y-auto">
        {fields.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className="text-[9px] uppercase text-audiophile-muted">{label}</dt>
            <dd className="truncate font-mono text-audiophile-text" title={value || undefined}>{value || "---"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};