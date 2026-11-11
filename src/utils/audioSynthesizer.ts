import { TimestampItem, TimelineClip } from '../types';

/**
 * Format seconds into mm:ss.ss or mm:ss
 */
export function formatSeconds(sec: number, includeMillis = true): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);

  const mStr = m.toString();
  const sStr = s < 10 ? `0${s}` : `${s}`;
  if (!includeMillis) return `${mStr}:${sStr}`;

  const msStr = ms < 10 ? `0${ms}` : `${ms}`;
  return `${mStr}:${sStr}.${msStr}`;
}

/**
 * Format to standard SRT timecode (00:00:00,000)
 */
export function formatSrtTimecode(sec: number): string {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  const millis = Math.floor((sec % 1) * 1000);

  const hStr = hrs < 10 ? `0${hrs}` : `${hrs}`;
  const mStr = mins < 10 ? `0${mins}` : `${mins}`;
  const sStr = secs < 10 ? `0${secs}` : `${secs}`;
  const msStr = millis.toString().padStart(3, '0');

  return `${hStr}:${mStr}:${sStr},${msStr}`;
}

/**
 * Parse timecode string like "0:05", "1:23.45", "00:01:23,450" into seconds
 */
export function parseTimeToSeconds(str: string): number {
  if (!str) return 0;
  const cleaned = str.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(cleaned) || 0;
}

/**
 * Convert timestamps to SRT subtitle text
 */
export function generateSrtContent(items: TimestampItem[]): string {
  return items
    .map((item, idx) => {
      const startStr = formatSrtTimecode(item.start);
      const endStr = formatSrtTimecode(item.end);
      return `${idx + 1}\n${startStr} --> ${endStr}\n${item.text}\n`;
    })
    .join('\n');
}

/**
 * Convert timestamps to plain text
 */
export function generateTxtContent(items: TimestampItem[]): string {
  return items
    .map((item) => `[${formatSeconds(item.start)} - ${formatSeconds(item.end)}] ${item.text}`)
    .join('\n');
}

/**
 * Parse SRT string into timestamp items
 */
export function parseSrtContent(srtText: string): TimestampItem[] {
  const blocks = srtText.trim().split(/\n\s*\n/);
  const items: TimestampItem[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;

    const [startRaw, endRaw] = timeLine.split('-->').map((t) => t.trim());
    const startSec = parseTimeToSeconds(startRaw);
    const endSec = parseTimeToSeconds(endRaw);

    const timeIndex = lines.indexOf(timeLine);
    const textLines = lines.slice(timeIndex + 1);
    const text = textLines.join(' ');

    if (text) {
      items.push({
        id: Math.random().toString(36).substring(2, 9),
        start: startSec,
        end: endSec,
        text,
      });
    }
  }

  return items;
}

// Audio context singleton for synthesized SFX
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Synthesizes a soft whoosh sound effect for transitions
 */
export function playWhooshSound(volume = 0.25): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.32);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(Math.min(volume * 0.4, 0.4), now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } catch (e) {
    console.warn('Audio playback not supported', e);
  }
}

/**
 * Synthesizes a pleasant bell chime for the Subscribe notification
 */
export function playBellSound(volume = 0.3): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [1046.5, 2093.0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.03);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume * 0.3, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.03);
      osc.stop(now + 1.25);
    });
  } catch (e) {
    console.warn('Bell audio error', e);
  }
}

/**
 * Generates an in-memory sample spoken voiceover WAV Blob
 * with periodic voice-like harmonics so users can immediately test audio sync
 */
export function createSyntheticVoiceoverWav(durationSec = 28): Blob {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Generate pleasant rhythmic speech cadence waves
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Word cadence envelope (pauses every 1.8 to 2.4 seconds)
    const phrase = Math.sin(t * 3.2);
    const speechGate = phrase > -0.2 ? Math.max(0, phrase) : 0;
    
    // Vocal pitch with vibrato
    const pitch = 145 + Math.sin(t * 2) * 12;
    const tone =
      Math.sin(2 * Math.PI * pitch * t) * 0.4 +
      Math.sin(2 * Math.PI * (pitch * 2) * t) * 0.25 +
      Math.sin(2 * Math.PI * (pitch * 3) * t) * 0.15;

    const sample = Math.max(-1, Math.min(1, tone * speechGate * 0.6));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Curated sample clips with real high-resolution images & videos
 */
export const SAMPLE_MEDIA_LIBRARY: TimelineClip[] = [
  {
    id: 'clip_1',
    title: 'Cinematic Mountain Dawn.jpg',
    type: 'image',
    src: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
    duration: 5.5,
    motion: 'Zoom In',
    transition: 'Cross Dissolve',
  },
  {
    id: 'clip_2',
    title: 'Futuristic Studio Workspace.jpg',
    type: 'image',
    src: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    duration: 6.0,
    motion: 'Pan Left',
    transition: 'Slide Left',
  },
  {
    id: 'clip_3',
    title: 'Sunset Ocean Cliffs.jpg',
    type: 'image',
    src: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
    duration: 5.0,
    motion: 'Zoom Out',
    transition: 'Cross Dissolve',
  },
  {
    id: 'clip_4',
    title: 'Modern Architecture Lines.jpg',
    type: 'image',
    src: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    duration: 5.5,
    motion: 'Pan Right',
    transition: 'Zoom In',
  },
  {
    id: 'clip_5',
    title: 'Starry Cosmic Nebula.jpg',
    type: 'image',
    src: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1200&q=80',
    duration: 6.0,
    motion: 'Zoom In',
    transition: 'Cross Dissolve',
  },
];

export const SAMPLE_VOICEOVER_SCRIPT = `Welcome to Saleem Editor Studio, your all-in-one AI timestamping and automated video editing workstation. In this episode, we explore how seamless timestamp alignment transforms rough scripts into viral social content. Watch how our intelligent camera moves, smooth dissolves, and customized captions snap directly to the vocal cadence. Never waste hours manually cutting footage again.`;
