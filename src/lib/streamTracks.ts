import type { Track } from "../types/index.ts";

export const STREAM_FORMAT = "STREAM";

export interface StreamSourceTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  trackNumber?: number;
  duration: number;
  coverUrl?: string;
  sourceUrl?: string;
}

export function isStreamTrack(track: Track | null | undefined): boolean {
  if (!track) return false;
  return track.format === STREAM_FORMAT || track.filepath.startsWith("stream:");
}

export function streamFilepath(neoId: string): string {
  return `stream:${neoId}`;
}

export function streamTrackToNeo(track: Track): StreamSourceTrack {
  const id = track.filepath.startsWith("stream:") ? track.filepath.slice("stream:".length) : track.filepath;
  return {
    id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    trackNumber: track.track_number || undefined,
    duration: track.duration_seconds || 0,
    coverUrl: track.cover_url,
    sourceUrl: track.stream_source || id,
  };
}

export function streamTrackFromNeo(track: StreamSourceTrack): Track {
  return {
    filepath: streamFilepath(track.id),
    title: track.title,
    artist: track.artist,
    album: track.album,
    track_number: track.trackNumber || null,
    duration_seconds: track.duration || 0,
    format: STREAM_FORMAT,
    sample_rate: 44100,
    bit_depth: 16,
    bitrate_kbps: 160,
    file_size: 0,
    mtime: Date.now(),
    cover_url: track.coverUrl || undefined,
    stream_source: track.sourceUrl || track.id,
  };
}
