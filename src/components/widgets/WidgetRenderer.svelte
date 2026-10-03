<script lang="ts">
  import type { WidgetType } from "../../types/layout.ts";
  import FolderExplorerWidget from "./FolderExplorerWidget.svelte";
  import VirtualTrackList from "./VirtualTrackList.svelte";
  import CoverWidget from "./CoverWidget.svelte";
  import InspectorWidget from "./InspectorWidget.svelte";
  import EqBarsWidget from "./EqBarsWidget.svelte";
  import DacTelemetryWidget from "./DacTelemetryWidget.svelte";
  import StandaloneSpectrumWidget from "./StandaloneSpectrumWidget.svelte";
  import QueueWidget from "./QueueWidget.svelte";
  import CavaVisualizer from "./CavaVisualizer.svelte";
  import BpmWidget from "./BpmWidget.svelte";
  import Id3TagWidget from "./Id3TagWidget.svelte";
  import RadioWidget from "./RadioWidget.svelte";
  import BufferInspectorWidget from "./BufferInspectorWidget.svelte";
  import BufferInspectorCompactWidget from "./BufferInspectorCompactWidget.svelte";
  import EqCompactWidget from "./EqCompactWidget.svelte";
  import SignalStatsWidget from "./SignalStatsWidget.svelte";
  import ListeningStatsWidget from "./ListeningStatsWidget.svelte";
  import RadioTelemetryWidget from "./RadioTelemetryWidget.svelte";
  import AudioDiagnosticsWidget from "./AudioDiagnosticsWidget.svelte";
  import DacTelemetryCompactWidget from "./DacTelemetryCompactWidget.svelte";
  import SignalMonitorWidget from "./SignalMonitorWidget.svelte";
  import EqSpectrumWidget from "./EqSpectrumWidget.svelte";
  import LoudnessWidget from "./LoudnessWidget.svelte";
  import AudioTelemetryFullWidget from "./AudioTelemetryFullWidget.svelte";
  import StreamMusicModal from "./StreamMusicModal.svelte";
  import WaveformBarsWidget from "./WaveformBarsWidget.svelte";
  import WaveformEnvelopeWidget from "./WaveformEnvelopeWidget.svelte";
  import WaveformMatrixWidget from "./WaveformMatrixWidget.svelte";

  interface Props {
    widget: WidgetType;
    nodeKey?: string;
    isEditing?: boolean;
  }

  let { widget, nodeKey = undefined, isEditing = false }: Props = $props();
</script>

{#if widget === "folder_explorer"}
  <FolderExplorerWidget />
{:else if widget === "tracklist"}
  <VirtualTrackList />
{:else if widget === "cover"}
  <CoverWidget />
{:else if widget === "inspector"}
  <InspectorWidget />
{:else if widget === "eq_bars"}
  <EqBarsWidget />
{:else if widget === "spectrum"}
  <StandaloneSpectrumWidget {nodeKey} {isEditing} />
{:else if widget === "cava_visualizer"}
  <CavaVisualizer {nodeKey} {isEditing} />
{:else if widget === "dac_telemetry"}
  <DacTelemetryWidget />
{:else if widget === "dac_telemetry_compact"}
  <DacTelemetryCompactWidget />
{:else if widget === "queue"}
  <QueueWidget />
{:else if widget === "bpm"}
  <BpmWidget />
{:else if widget === "id3_tags"}
  <Id3TagWidget />
{:else if widget === "radio"}
  <RadioWidget />
{:else if widget === "stream_music"}
  <StreamMusicModal embedded={true} />
{:else if widget === "buffer_inspector"}
  <BufferInspectorWidget />
{:else if widget === "buffer_inspector_compact"}
  <BufferInspectorCompactWidget />
{:else if widget === "buffer_inspector_basic"}
  <BufferInspectorWidget showStability={false} />
{:else if widget === "buffer_stability_compact"}
  <BufferInspectorWidget compactStability={true} />
{:else if widget === "eq_bars_compact"}
  <EqCompactWidget />
{:else if widget === "signal_stats"}
  <SignalStatsWidget />
{:else if widget === "listening_stats"}
  <ListeningStatsWidget />
{:else if widget === "radio_telemetry"}
  <RadioTelemetryWidget />
{:else if widget === "audio_diagnostics"}
  <AudioDiagnosticsWidget />
{:else if widget === "signal_monitor_compact"}
  <SignalMonitorWidget />
{:else if widget === "eq_spectrum"}
  <EqSpectrumWidget />
{:else if widget === "loudness_normalizer"}
  <LoudnessWidget />
{:else if widget === "audio_telemetry_full"}
  <AudioTelemetryFullWidget />
{:else if widget === "waveform_bars"}
  <WaveformBarsWidget />
{:else if widget === "waveform_envelope"}
  <WaveformEnvelopeWidget />
{:else if widget === "waveform_matrix"}
  <WaveformMatrixWidget />
{:else}
  <div class="p-4 text-center text-audiophile-muted font-mono text-xs">
    Widget desconocido: {widget}
  </div>
{/if}
