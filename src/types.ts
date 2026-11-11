export interface TimestampItem {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

export interface CustomIntervalPart {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  intervalSec: number;
}

export interface TimelineClip {
  id: string;
  title: string;
  type: 'image' | 'video' | 'gap';
  src: string;
  duration: number; // in seconds
  motion: string;
  transition: string;
  width?: number;
  height?: number;
}

export interface EditorSettings {
  videoSize: '1080p' | '4k' | '720p' | 'shorts';
  quality: 'best' | 'high' | 'medium';
  fps: number;
  fitMode: 'fit' | 'fill' | 'stretch';
  imageMotion: 'auto' | 'zoom_in' | 'zoom_out' | 'none';
  motionSpeed: 'slow' | 'normal' | 'fast';
  transitions: 'auto' | 'dissolve' | 'none';
  transSounds: 'auto' | 'whoosh' | 'off';
  soundVolume: number; // 0 - 100
  gapsMode: 'extend' | 'black' | 'stretchBoth';
  subscribeToggle: 'on' | 'off';
  subscribeTimes: string;
  subscribePos: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  subscribeSize: 'normal' | 'small' | 'large';
  enabledMotions: string[];
  enabledTransitions: string[];
}

export interface CaptionSettings {
  style: string;
  color: string;
  xPercent: number; // 0 - 100
  yPercent: number; // 0 - 100
  sizeScale: number; // 60 - 160
  language: string;
  text: string;
}
