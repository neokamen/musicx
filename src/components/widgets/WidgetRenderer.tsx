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

interface WidgetRendererProps {
  widget: WidgetType;
}

export const WidgetRenderer: React.FC<WidgetRendererProps> = ({ widget }) => {
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
      return <StandaloneSpectrumWidget />;
    case "cava_visualizer":
      return <CavaVisualizer />;
    case "dac_telemetry":
      return <DacTelemetryWidget />;
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
    default:
      return (
        <div className="p-4 text-center text-audiophile-muted font-mono text-xs">
          Widget desconocido: {widget}
        </div>
      );
  }
};
