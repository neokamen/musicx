import type { Track } from "./index.ts";
import { streamTrackToNeo } from "../lib/streamTracks.ts";

export interface NeoTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  trackNumber: number;
  totalTracks: number;
  duration: number;
  durationString: string;
  coverUrl: string;
  sourceUrl?: string;
}

export interface AnalyzeResult {
  kind: "track" | "playlist" | "album" | "search";
  name: string;
  totalTracks: number;
  tracks: NeoTrack[];
}

export interface TrackProgress {
  trackId: string;
  phase: "queued" | "downloading" | "converting" | "tagging" | "done" | "error";
  percent: number;
  message: string;
  filePath?: string;
}

function formatSeconds(sec: number): string {
  if (!sec || isNaN(sec)) return "0:00";
  const mins = Math.floor(sec / 60);
  const remaining = Math.floor(sec % 60);
  return `${mins}:${remaining.toString().padStart(2, "0")}`;
}

export function trackToSoundixTrack(track: Track): NeoTrack {
  const neo = streamTrackToNeo(track);
  return {
    id: neo.id,
    title: neo.title,
    artist: neo.artist,
    album: neo.album,
    year: "",
    trackNumber: neo.trackNumber || 1,
    totalTracks: 1,
    duration: Math.round(neo.duration || 0),
    durationString: formatSeconds(neo.duration || 0),
    coverUrl: neo.coverUrl || "",
    sourceUrl: neo.sourceUrl,
  };
}

export const DEFAULT_STREAM_TRACKS: NeoTrack[] = [
  {
    id: "yt_cZnBNuqqz5g",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    year: "1975",
    trackNumber: 1,
    totalTracks: 8,
    duration: 355,
    durationString: "5:55",
    coverUrl: "https://i.ytimg.com/vi/cZnBNuqqz5g/hqdefault.jpg",
  },
  {
    id: "yt_hTWKbfoikeg",
    title: "Smells Like Teen Spirit",
    artist: "Nirvana",
    album: "Nevermind",
    year: "1991",
    trackNumber: 1,
    totalTracks: 8,
    duration: 301,
    durationString: "5:01",
    coverUrl: "https://i.ytimg.com/vi/hTWKbfoikeg/hqdefault.jpg",
  },
  {
    id: "yt_OPf0YbXqDm0",
    title: "Uptown Funk",
    artist: "Mark Ronson ft. Bruno Mars",
    album: "Uptown Special",
    year: "2014",
    trackNumber: 4,
    totalTracks: 8,
    duration: 270,
    durationString: "4:30",
    coverUrl: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg",
  },
  {
    id: "yt_09R8_2nJtjg",
    title: "Sugar",
    artist: "Maroon 5",
    album: "V",
    year: "2014",
    trackNumber: 5,
    totalTracks: 8,
    duration: 235,
    durationString: "3:55",
    coverUrl: "https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg",
  },
  {
    id: "yt_fJ9rUzIMcZQ",
    title: "Bohemian Rhapsody (Live Aid 1985)",
    artist: "Queen",
    album: "Live Aid",
    year: "1985",
    trackNumber: 1,
    totalTracks: 8,
    duration: 148,
    durationString: "2:28",
    coverUrl: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
  },
  {
    id: "yt_eVTXPUF4Oz4",
    title: "In the End",
    artist: "Linkin Park",
    album: "Hybrid Theory",
    year: "2000",
    trackNumber: 8,
    totalTracks: 8,
    duration: 216,
    durationString: "3:36",
    coverUrl: "https://i.ytimg.com/vi/eVTXPUF4Oz4/hqdefault.jpg",
  },
  {
    id: "yt_kXYiU_JCYtU",
    title: "Numb",
    artist: "Linkin Park",
    album: "Meteora",
    year: "2003",
    trackNumber: 13,
    totalTracks: 8,
    duration: 187,
    durationString: "3:07",
    coverUrl: "https://i.ytimg.com/vi/kXYiU_JCYtU/hqdefault.jpg",
  },
  {
    id: "yt_JGwWNGJdvx8",
    title: "Shape of You",
    artist: "Ed Sheeran",
    album: "÷ (Divide)",
    year: "2017",
    trackNumber: 4,
    totalTracks: 8,
    duration: 233,
    durationString: "3:53",
    coverUrl: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg",
  },
];
