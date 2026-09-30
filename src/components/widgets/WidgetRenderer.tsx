import React from "react";
import type { WidgetType } from "../../types/layout.ts";
import { FolderExplorerWidget } from "./FolderExplorerWidget.tsx";
import { VirtualTrackList } from "./VirtualTrackList.tsx";
import { CoverWidget } from "./CoverWidget.tsx";
import { InspectorWidget } from "./InspectorWidget.tsx";
import { EqBarsWidget } from "./EqBarsWidget.tsx";
import { DacTelemetryWidget } from "./DacTelemetryWidget.tsx";
import { StandaloneSpectrumWidget } from "./StandaloneSpectrumWidget.tsx";
import { QueueWidget } from "./QueueWidget.tsx";
import { CavaVisualizer } from "./CavaVisualizer.tsx";
import { BpmWidget } from "./BpmWidget.tsx";
import { Id3TagWidget } from "./Id3TagWidget.tsx";
import { RadioWidget } from "./RadioWidget.tsx";
import { BufferInspectorWidget } from "./BufferInspectorWidget.tsx";
import { BufferInspectorCompactWidget } from "./BufferInspectorCompactWidget.tsx";
import { EqCompactWidget } from "./EqCompactWidget.tsx";
import { SignalStatsWidget } from "./SignalStatsWidget.tsx";
import { ListeningStatsWidget } from "./ListeningStatsWidget.tsx";
import { RadioTelemetryWidget } from "./RadioTelemetryWidget.tsx";
import { AudioDiagnosticsWidget } from "./AudioDiagnosticsWidget.tsx";
import { DacTelemetryCompactWidget } from "./DacTelemetryCompactWidget.tsx";
import { SignalMonitorWidget } from "./SignalMonitorWidget.tsx";
import { EqSpectrumWidget } from "./EqSpectrumWidget.tsx";
import { LoudnessWidget } from "./LoudnessWidget.tsx";
import { AudioTelemetryFullWidget } from "./AudioTelemetryFullWidget.tsx";

interface WidgetRendererProps {
  widget: WidgetType;
  nodeKey?: string;
}

export const WidgetRenderer: React.FC<WidgetRendererProps> = ({ widget, nodeKey }) => {
  switch (widget) {
    case "folder_explorer":
      return <FolderExplorerWidget />;
    case "tracklist":
      return <VirtualTrackList />;
    case "cover":
      return <CoverWidget />;
    case "inspector":
      return <InspectorWidget />;
    case "eq_bars":
      return <EqBarsWidget />;
    case "spectrum":
      return <StandaloneSpectrumWidget nodeKey={nodeKey} />;
    case "cava_visualizer":
      return <CavaVisualizer nodeKey={nodeKey} />;
    case "dac_telemetry":
      return <DacTelemetryWidget />;
    case "dac_telemetry_compact":
      return <DacTelemetryCompactWidget />;
    case "queue":
      return <QueueWidget />;
    case "bpm":
      return <BpmWidget />;
    case "id3_tags":
      return <Id3TagWidget />;
    case "radio":
      return <RadioWidget />;
    case "buffer_inspector":
      return <BufferInspectorWidget />;
    case "buffer_inspector_compact":
      return <BufferInspectorCompactWidget />;
    case "buffer_inspector_basic":
      return <BufferInspectorWidget showStability={false} />;
    case "buffer_stability_compact":
      return <BufferInspectorWidget compactStability />;
    case "eq_bars_compact":
      return <EqCompactWidget />;
    case "signal_stats":
      return <SignalStatsWidget />;
    case "listening_stats":
      return <ListeningStatsWidget />;
    case "radio_telemetry":
      return <RadioTelemetryWidget />;
    case "audio_diagnostics":
      return <AudioDiagnosticsWidget />;
    case "signal_monitor_compact":
      return <SignalMonitorWidget />;
    case "eq_spectrum":
      return <EqSpectrumWidget />;
    case "loudness_normalizer":
      return <LoudnessWidget />;
    case "audio_telemetry_full":
      return <AudioTelemetryFullWidget />;
    default:
      return (
        <div className="p-4 text-center text-audiophile-muted font-mono text-xs">
          Widget desconocido: {widget}
        </div>
      );
  }
};
