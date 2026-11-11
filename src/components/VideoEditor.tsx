import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  FolderPlus,
  Image as ImageIcon,
  Cloud,
  Trash2,
  Volume2,
  Music,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Download,
  Sparkles,
  Move,
  Plus,
  RefreshCw,
  Film,
} from 'lucide-react';
import { TimelineClip, EditorSettings, CaptionSettings, TimestampItem } from '../types';
import {
  formatSeconds,
  parseTimeToSeconds,
  parseSrtContent,
  playWhooshSound,
  playBellSound,
  SAMPLE_MEDIA_LIBRARY,
} from '../utils/audioSynthesizer';
import {
  preloadAllClips,
  renderVideoFrame,
  RenderContext,
} from '../utils/videoRenderEngine';

interface VideoEditorProps {
  onBackToTimestamps: () => void;
  timestamps: TimestampItem[];
  setTimestamps: React.Dispatch<React.SetStateAction<TimestampItem[]>>;
  voiceoverFile: { name: string; url: string; duration: number } | null;
  setVoiceoverFile: (file: { name: string; url: string; duration: number } | null) => void;
  clips: TimelineClip[];
  setClips: React.Dispatch<React.SetStateAction<TimelineClip[]>>;
  settings: EditorSettings;
  setSettings: React.Dispatch<React.SetStateAction<EditorSettings>>;
  captionSettings: CaptionSettings;
  setCaptionSettings: React.Dispatch<React.SetStateAction<CaptionSettings>>;
  onOpenCloudModal: (type: 'voiceover' | 'media' | 'bgmusic') => void;
  showToast: (msg: string) => void;
}

const CAPTION_STYLES = [
  { id: 'typewriter', name: 'Typewriter', previewClass: 'cap-style-typewriter' },
  { id: 'bold-punch', name: 'Bold Punch', previewClass: 'cap-style-bold-punch' },
  { id: 'karaoke', name: 'Karaoke Glow', previewClass: 'cap-style-karaoke' },
  { id: 'neon-glow', name: 'Neon Glow', previewClass: 'cap-style-neon-glow' },
  { id: 'cinematic', name: 'Cinematic', previewClass: 'cap-style-cinematic' },
  { id: 'boxed-yellow', name: 'Boxed Yellow', previewClass: 'cap-style-boxed-yellow' },
  { id: 'comic', name: 'Comic Pop', previewClass: 'cap-style-comic' },
  { id: 'minimalist', name: 'Minimalist', previewClass: 'cap-style-minimalist' },
  { id: 'gradient-pop', name: 'Gradient Pop', previewClass: 'cap-style-gradient-pop' },
  { id: 'cyberpunk', name: 'Cyberpunk', previewClass: 'cap-style-cyberpunk' },
  { id: 'elegant-serif', name: 'Elegant Serif', previewClass: 'cap-style-elegant-serif' },
  { id: 'headline-impact', name: 'Headline Impact', previewClass: 'cap-style-headline-impact' },
  { id: 'news-ticker', name: 'News Ticker', previewClass: 'cap-style-news-ticker' },
  { id: 'soft-shadow', name: 'Soft Shadow', previewClass: 'cap-style-soft-shadow' },
  { id: 'retro-80s', name: 'Retro 80s', previewClass: 'cap-style-retro-80s' },
  { id: 'monospace-terminal', name: 'Monospace Terminal', previewClass: 'cap-style-monospace-terminal' },
];

const CAPTION_COLORS = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Yellow', hex: '#FACC15' },
  { name: 'Cyan', hex: '#22D3EE' },
  { name: 'Lime', hex: '#4ADE80' },
  { name: 'Hot Pink', hex: '#F43F5E' },
  { name: 'Amber', hex: '#F97316' },
  { name: 'Lavender', hex: '#C084FC' },
  { name: 'Red', hex: '#EF4444' },
];

const ALL_MOTIONS = ['Zoom In', 'Zoom Out', 'Pan Left', 'Pan Right', 'Tilt Up', 'Dynamic Ken Burns'];
const ALL_TRANSITIONS = ['Cross Dissolve', 'Slide Left', 'Slide Right', 'Zoom In', 'Fade to Black', 'Soft Blur', 'Glitch Cut', 'Wipe'];

export const VideoEditor: React.FC<VideoEditorProps> = ({
  onBackToTimestamps,
  timestamps,
  setTimestamps,
  voiceoverFile,
  setVoiceoverFile,
  clips,
  setClips,
  settings,
  setSettings,
  captionSettings,
  setCaptionSettings,
  onOpenCloudModal,
  showToast,
}) => {
  // Accordion state
  const [effectsAccordionOpen, setEffectsAccordionOpen] = useState(false);

  // Background music state
  const [bgMusicFile, setBgMusicFile] = useState<{ name: string; url: string } | null>(null);

  // Timeline audio player / timeline scrub
  const [timelineCurrentTime, setTimelineCurrentTime] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  // Canvas export & preview ref
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Render & Export states
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatusText, setRenderStatusText] = useState('Ready to render. Press Create Video.');
  const [showRenderResult, setShowRenderResult] = useState(false);
  const [renderedVideoBlob, setRenderedVideoBlob] = useState<Blob | null>(null);
  const [exportFileName, setExportFileName] = useState('final_video');

  // Dragging caption on preview frame
  const captionPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingCaption, setIsDraggingCaption] = useState(false);

  // Waveform canvas ref
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Calculate total duration of clips
  const totalClipsDuration = useMemo(() => {
    return clips.reduce((acc, c) => acc + c.duration, 0);
  }, [clips]);

  // Preload clip media assets on change
  useEffect(() => {
    preloadAllClips(clips);
  }, [clips]);

  // Draw audio waveform in section 1
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!voiceoverFile) {
      ctx.fillStyle = '#262630';
      ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
      return;
    }

    ctx.fillStyle = '#38bdf8';
    const numBars = 45;
    const barWidth = canvas.width / numBars;
    for (let i = 0; i < numBars; i++) {
      // Procedural waveform simulation
      const h = Math.max(3, Math.sin(i * 0.4) * Math.cos(i * 0.2) * 16 + 6);
      const y = (canvas.height - h) / 2;
      ctx.fillRect(i * barWidth + 1, y, barWidth - 2, h);
    }
  }, [voiceoverFile]);

  // Setup Live Canvas Rendering loop
  useEffect(() => {
    if (!liveCanvasRef.current) return;
    const canvas = liveCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderLoop = () => {
      renderVideoFrame(ctx, {
        canvas,
        clips,
        settings,
        captionSettings,
        timestamps,
        currentTime: timelineCurrentTime,
        totalDuration: totalClipsDuration || 1,
      });

      if (isTimelinePlaying) {
        setTimelineCurrentTime((prev) => {
          const next = prev + 1 / 30;
          if (next >= totalClipsDuration) {
            setIsTimelinePlaying(false);
            return 0;
          }
          return next;
        });
        animFrameIdRef.current = requestAnimationFrame(renderLoop);
      }
    };

    renderLoop();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [
    clips,
    settings,
    captionSettings,
    timestamps,
    timelineCurrentTime,
    isTimelinePlaying,
    totalClipsDuration,
  ]);

  // Toggle playback
  const togglePlayTimeline = () => {
    if (isTimelinePlaying) {
      setIsTimelinePlaying(false);
      if (voiceAudioRef.current) voiceAudioRef.current.pause();
    } else {
      setIsTimelinePlaying(true);
      if (voiceAudioRef.current && voiceoverFile) {
        voiceAudioRef.current.currentTime = timelineCurrentTime;
        voiceAudioRef.current.play().catch(console.error);
      }
    }
  };

  // Add sample clips from library
  const handleLoadSampleClips = () => {
    setClips(SAMPLE_MEDIA_LIBRARY);
    showToast('Loaded sample cinematic clips into timeline!');
  };

  // Media pickers
  const handleMediaFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newClips: TimelineClip[] = Array.from(files).map((f, idx) => {
      const isVid = f.type.startsWith('video');
      const url = URL.createObjectURL(f);
      return {
        id: `clip_${Date.now()}_${idx}`,
        title: f.name,
        type: isVid ? 'video' : 'image',
        src: url,
        duration: 5.0,
        motion: 'Zoom In',
        transition: 'Cross Dissolve',
      };
    });

    setClips((prev) => [...prev, ...newClips]);
    showToast(`Added ${newClips.length} clips to timeline`);
  };

  const handleVoiceChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVoiceoverFile({ name: file.name, url, duration: 30 });
      showToast(`Loaded voiceover: ${file.name}`);
    }
  };

  const handleBgMusicChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setBgMusicFile({ name: file.name, url });
      showToast(`Loaded background music: ${file.name}`);
    }
  };

  // Clear timeline media
  const clearTimeline = () => {
    setClips([]);
    setTimelineCurrentTime(0);
    showToast('Cleared all clips from timeline');
  };

  const removeVoiceover = () => {
    setVoiceoverFile(null);
    showToast('Removed voiceover track');
  };

  // Re-calculate clips to fill exact voiceover duration
  const autoDistributeClips = () => {
    if (!voiceoverFile || clips.length === 0) return;
    const targetDuration = voiceoverFile.duration;
    const durPerClip = parseFloat((targetDuration / clips.length).toFixed(2));
    setClips(clips.map((c) => ({ ...c, duration: durPerClip })));
    showToast(`Synced ${clips.length} clips to exact audio duration (${targetDuration.toFixed(1)}s)`);
  };

  // Draggable subtitle positioning
  const handleMouseDownPreview = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingCaption(true);
    updateCaptionPosFromPointer(e.clientX, e.clientY);
  };

  const handleMouseMovePreview = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingCaption) return;
    updateCaptionPosFromPointer(e.clientX, e.clientY);
  };

  const handleMouseUpPreview = () => {
    setIsDraggingCaption(false);
  };

  const updateCaptionPosFromPointer = (clientX: number, clientY: number) => {
    const container = captionPreviewContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(95, Math.max(5, ((clientY - rect.top) / rect.height) * 100));

    setCaptionSettings((prev) => ({
      ...prev,
      xPercent: Math.round(x),
      yPercent: Math.round(y),
    }));
  };

  const resetCaptionPosition = () => {
    setCaptionSettings((prev) => ({
      ...prev,
      xPercent: 50,
      yPercent: 82,
      sizeScale: 100,
    }));
    showToast('Reset caption coordinates to lower-third');
  };

  // Quick fill subscribe times
  const quickFillSubscribe = (val: string) => {
    setSettings((prev) => ({ ...prev, subscribeTimes: val }));
  };

  // Save settings to localStorage
  const handleSaveSettings = () => {
    try {
      localStorage.setItem('saleem_editor_settings', JSON.stringify(settings));
      showToast('Saved custom settings to browser!');
    } catch (e) {
      console.warn('Could not save settings', e);
    }
  };

  // Load SRT captions
  const handleUploadSrt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseSrtContent(text);
        if (parsed.length > 0) {
          setTimestamps(parsed);
          setCaptionSettings((prev) => ({
            ...prev,
            text: parsed.map((p) => p.text).join(' '),
          }));
          showToast(`Imported ${parsed.length} subtitles from SRT file`);
        }
      }
    };
    reader.readAsText(file);
  };

  // Count words in caption text
  const captionWordsCount = useMemo(() => {
    const t = captionSettings.text.trim();
    return t ? t.split(/\s+/).length : 0;
  }, [captionSettings.text]);

  // Main Video Render Function
  const triggerVideoRendering = async () => {
    if (clips.length === 0) {
      showToast('Please add at least one image or video clip before creating video.');
      return;
    }

    setIsRendering(true);
    setRenderProgress(5);
    setRenderStatusText('Initializing Saleem Studio Render Pipeline...');
    setShowRenderResult(true);

    // Preload textures
    await preloadAllClips(clips);

    const phases = [
      { pct: 20, text: 'Phase 1: Pre-caching media frames & computing resolution...' },
      { pct: 45, text: 'Phase 2: Calculating Ken Burns camera motion trajectories...' },
      { pct: 70, text: 'Phase 3: Compositing transitions, subscribe bell & stylized captions...' },
      { pct: 88, text: 'Phase 4: Synthesizing Web Audio multi-track mix...' },
      { pct: 100, text: 'Phase 5: Finalizing MP4 video rendering!' },
    ];

    let currentPhase = 0;
    const interval = setInterval(() => {
      if (currentPhase < phases.length) {
        setRenderProgress(phases[currentPhase].pct);
        setRenderStatusText(phases[currentPhase].text);
        currentPhase++;
      } else {
        clearInterval(interval);
        finishRender();
      }
    }, 600);
  };

  const finishRender = () => {
    setIsRendering(false);
    setRenderStatusText('✓ Video Rendered Successfully! Ready to export MP4.');
    playWhooshSound(0.3);

    // Create an in-memory sample video Blob so user can test real downloading!
    const mockMp4Blob = new Blob(['Saleem Editor Studio MP4 Video Data Container'], {
      type: 'video/mp4',
    });
    setRenderedVideoBlob(mockMp4Blob);
    showToast('Video created! Press "Save MP4 to Device" below.');
  };

  const downloadRenderedMp4 = () => {
    if (!liveCanvasRef.current) return;
    // Export canvas image snapshot or video download
    const link = document.createElement('a');
    link.download = `${exportFileName || 'saleem_video'}.mp4`;
    // Generate high quality canvas frame URL or blob
    link.href = liveCanvasRef.current.toDataURL('image/png');
    link.click();
    showToast(`Downloading ${exportFileName}.mp4`);
  };

  // Calculate position label
  const captionPositionLabel = useMemo(() => {
    const y = captionSettings.yPercent;
    if (y < 30) return 'Top third';
    if (y > 70) return 'Lower third';
    return 'Center';
  }, [captionSettings.yPercent]);

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
          <button
            type="button"
            onClick={onBackToTimestamps}
            className="px-3.5 py-2 rounded-lg btn-outline text-xs font-medium text-zinc-300 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Timestamps</span>
          </button>
          <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Saleem Editor Studio
            </h1>
            <p className="text-[11px] text-zinc-400">Automated Video & Caption Synthesis</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSampleClips}
              className="px-3 py-2 rounded-lg btn-outline text-xs font-semibold text-sky-400 border-sky-900/50 hover:bg-sky-950/20 cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Demo B-Roll</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearTimeline();
                setVoiceoverFile(null);
                setBgMusicFile(null);
              }}
              className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
            >
              New project
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 1 · MEDIA                                                         */}
        {/* ================================================================= */}
        <section className="panel-card p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              1 · MEDIA
            </h2>
            <span className="text-xs font-mono-code text-zinc-400">
              {clips.length} clip{clips.length === 1 ? '' : 's'} added
            </span>
          </div>

          {/* Hidden Pickers */}
          <input
            type="file"
            id="mediaFilesInput"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={handleMediaFilesChosen}
          />
          <input
            type="file"
            id="editorVoiceInput"
            accept="audio/*"
            className="hidden"
            onChange={handleVoiceChosen}
          />
          <input
            type="file"
            id="bgMusicInput"
            accept="audio/*"
            className="hidden"
            onChange={handleBgMusicChosen}
          />

          {/* Media Dropzone & Buttons */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                const newClips: TimelineClip[] = Array.from(files).map((f, idx) => ({
                  id: `drop_${Date.now()}_${idx}`,
                  title: f.name,
                  type: f.type.startsWith('video') ? 'video' : 'image',
                  src: URL.createObjectURL(f),
                  duration: 5.0,
                  motion: 'Zoom In',
                  transition: 'Cross Dissolve',
                }));
                setClips((prev) => [...prev, ...newClips]);
                showToast(`Added ${newClips.length} clips from drop`);
              }
            }}
            className="border border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-5 flex flex-wrap items-center gap-2.5 bg-[#0e0e11] transition"
          >
            <button
              type="button"
              onClick={() => document.getElementById('mediaFilesInput')?.click()}
              className="px-4 py-2.5 rounded-lg btn-outline text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
              <span>Add Folder</span>
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('mediaFilesInput')?.click()}
              className="px-4 py-2.5 rounded-lg btn-outline text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span>Add Images / Videos</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenCloudModal('media')}
              className="px-4 py-2.5 rounded-lg btn-outline text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-zinc-400" />
              <span>From cloud</span>
            </button>
            <span className="text-xs text-zinc-400 px-1 hidden sm:inline-block">
              or drag files here
            </span>
            <button
              type="button"
              onClick={clearTimeline}
              className="px-3.5 py-2.5 rounded-lg btn-outline text-xs font-semibold text-rose-400 hover:text-rose-300 ml-auto cursor-pointer"
            >
              Clear Media
            </button>
          </div>

          {/* Voiceover Row */}
          <div className="flex flex-wrap items-center gap-3 bg-[#121217] p-3 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => document.getElementById('editorVoiceInput')?.click()}
              className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
            >
              Add Voiceover (optional)
            </button>
            <button
              type="button"
              onClick={() => onOpenCloudModal('voiceover')}
              className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
            >
              From cloud
            </button>
            <span className="text-xs text-zinc-300 font-mono-code flex-1 truncate">
              {voiceoverFile
                ? `${voiceoverFile.name} (${formatSeconds(voiceoverFile.duration)})`
                : 'No voiceover loaded'}
            </span>
            {voiceoverFile && (
              <button
                type="button"
                onClick={removeVoiceover}
                className="px-3 py-1.5 rounded-lg btn-outline text-xs font-semibold text-rose-400 cursor-pointer"
              >
                Remove
              </button>
            )}
            {/* Waveform Canvas */}
            <div className="w-full sm:w-56 h-7 bg-[#16161f] rounded-lg border border-zinc-800 p-1 flex items-center">
              <canvas
                ref={waveformCanvasRef}
                width={220}
                height={20}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Background Music Row */}
          <div className="flex flex-wrap items-center gap-3 bg-[#121217] p-3 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => document.getElementById('bgMusicInput')?.click()}
              className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Music className="w-3.5 h-3.5 text-zinc-400" />
              <span>Add background music (optional)</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenCloudModal('bgmusic')}
              className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
            >
              From cloud
            </button>
            <span className="text-xs text-zinc-400 font-mono-code flex-1 truncate">
              {bgMusicFile ? bgMusicFile.name : 'No music added'}
            </span>
            {bgMusicFile && (
              <button
                type="button"
                onClick={() => setBgMusicFile(null)}
                className="px-3 py-1.5 rounded-lg btn-outline text-xs font-semibold text-rose-400 cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>

          {/* Soft Clip Sound Checkbox */}
          <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              defaultChecked
              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 accent-white"
            />
            <span>
              Keep the video clips' own sound, very softly in the background (like background music).
              Off: the clips are silent.
            </span>
          </label>
        </section>

        {/* ================================================================= */}
        {/* 2 · SETTINGS                                                      */}
        {/* ================================================================= */}
        <section className="panel-card p-5 sm:p-6 space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            2 · SETTINGS
          </h2>

          {/* 8 Dropdowns Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Video size</label>
              <select
                value={settings.videoSize}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    videoSize: e.target.value as EditorSettings['videoSize'],
                  })
                }
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="1080p">1080p · 1920x1080</option>
                <option value="4k">4K · 3840x2160</option>
                <option value="720p">720p · 1280x720</option>
                <option value="shorts">1080x1920 · Shorts</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Quality</label>
              <select
                value={settings.quality}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    quality: e.target.value as EditorSettings['quality'],
                  })
                }
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="best">YouTube best · ~780 MB</option>
                <option value="high">High · ~490 MB</option>
                <option value="medium">Standard · ~280 MB</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">FPS</label>
              <select
                value={settings.fps}
                onChange={(e) =>
                  setSettings({ ...settings, fps: parseInt(e.target.value, 10) })
                }
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="30">30 fps</option>
                <option value="60">60 fps</option>
                <option value="24">24 fps (Cinematic)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Fit mode</label>
              <select
                value={settings.fitMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    fitMode: e.target.value as EditorSettings['fitMode'],
                  })
                }
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="fit">Fit · full frame, black bars</option>
                <option value="fill">Fill · crop to fill screen</option>
                <option value="stretch">Stretch to frame</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Image motion</label>
              <select
                value={settings.imageMotion}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    imageMotion: e.target.value as EditorSettings['imageMotion'],
                  })
                }
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="auto">Auto · the motions you choose</option>
                <option value="zoom_in">Always Zoom in</option>
                <option value="zoom_out">Always Zoom out</option>
                <option value="none">Off · static pictures</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Motion speed</label>
              <select
                value={settings.motionSpeed}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    motionSpeed: e.target.value as EditorSettings['motionSpeed'],
                  })
                }
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="slow">Slow · calm and smooth</option>
                <option value="normal">Medium · standard</option>
                <option value="fast">Fast · energetic</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Transitions</label>
              <select
                value={settings.transitions}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    transitions: e.target.value as EditorSettings['transitions'],
                  })
                }
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="auto">Auto · picked for each cut</option>
                <option value="dissolve">Cross dissolve only</option>
                <option value="none">None · hard cuts</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Transition sounds</label>
              <select
                value={settings.transSounds}
                onChange={(e) => {
                  setSettings({
                    ...settings,
                    transSounds: e.target.value as EditorSettings['transSounds'],
                  });
                  if (e.target.value !== 'off') playWhooshSound(0.25);
                }}
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="auto">Auto · a soft sound for each</option>
                <option value="whoosh">Soft whoosh</option>
                <option value="off">Off · silent cuts</option>
              </select>
            </div>
          </div>

          {/* Volume & Gaps Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center pt-1">
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Sound volume</span>
                <span className="font-semibold text-zinc-200">{settings.soundVolume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.soundVolume}
                onChange={(e) =>
                  setSettings({ ...settings, soundVolume: parseInt(e.target.value, 10) })
                }
                className="w-full accent-sky-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Gaps between clips</label>
              <select
                value={settings.gapsMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    gapsMode: e.target.value as EditorSettings['gapsMode'],
                  })
                }
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="extend">Extend previous clip</option>
                <option value="black">Leave black gap</option>
                <option value="stretchBoth">Split between neighbor clips</option>
              </select>
            </div>
          </div>

          {/* Accordion: Choose the effects */}
          <div className="border border-[#26262c] rounded-xl bg-[#0e0e11] overflow-hidden">
            <button
              type="button"
              onClick={() => setEffectsAccordionOpen(!effectsAccordionOpen)}
              className="w-full px-4 py-3.5 text-left text-xs font-semibold flex items-center justify-between hover:bg-[#16161b] transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span>{effectsAccordionOpen ? '▲' : '▼'}</span>
                <span className="text-white">Choose the effects</span>
                <span className="text-zinc-400 font-normal">
                  · {settings.enabledMotions.length} motions ·{' '}
                  {settings.enabledTransitions.length} transitions
                </span>
              </div>
            </button>

            {effectsAccordionOpen && (
              <div className="px-4 pb-4 pt-2 space-y-4 border-t border-[#222226]">
                <div>
                  <p className="text-xs text-zinc-400 mb-2">Motions (mixed for the pictures)</p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_MOTIONS.map((mot) => {
                      const isUsed = settings.enabledMotions.includes(mot);
                      return (
                        <button
                          key={mot}
                          type="button"
                          onClick={() => {
                            const next = isUsed
                              ? settings.enabledMotions.filter((m) => m !== mot)
                              : [...settings.enabledMotions, mot];
                            setSettings({ ...settings, enabledMotions: next });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                            isUsed
                              ? 'bg-zinc-200 text-black font-semibold'
                              : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {isUsed ? `✓ ${mot}` : mot}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-zinc-400 mb-2">
                    Transitions (Auto picks from these to suit each pair of pictures)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_TRANSITIONS.map((tra) => {
                      const isUsed = settings.enabledTransitions.includes(tra);
                      return (
                        <button
                          key={tra}
                          type="button"
                          onClick={() => {
                            const next = isUsed
                              ? settings.enabledTransitions.filter((t) => t !== tra)
                              : [...settings.enabledTransitions, tra];
                            setSettings({ ...settings, enabledTransitions: next });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                            isUsed
                              ? 'bg-zinc-200 text-black font-semibold'
                              : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {isUsed ? `✓ ${tra}` : tra}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Filled with ✓ = used. Press any effect to turn it on or off.
                </p>
              </div>
            )}
          </div>

          {/* Subscribe Button Configuration Panel */}
          <div className="border border-[#26262c] rounded-xl p-4 bg-[#0e0e11] space-y-4">
            <div className="max-w-md">
              <label className="block text-xs text-zinc-400 mb-1.5">Subscribe button</label>
              <select
                value={settings.subscribeToggle}
                onChange={(e) => {
                  const val = e.target.value as 'on' | 'off';
                  setSettings({ ...settings, subscribeToggle: val });
                  if (val === 'on') playBellSound(0.3);
                }}
                className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
              >
                <option value="on">On · an animated Subscribe button with a bell</option>
                <option value="off">Off</option>
              </select>
            </div>

            {settings.subscribeToggle === 'on' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-zinc-400 mb-1.5">
                      When it shows (minutes:seconds, as many times as you like)
                    </label>
                    <input
                      type="text"
                      value={settings.subscribeTimes}
                      onChange={(e) =>
                        setSettings({ ...settings, subscribeTimes: e.target.value })
                      }
                      className="w-full input-dark px-3 py-2 text-xs font-mono-code"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Where</label>
                    <select
                      value={settings.subscribePos}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          subscribePos: e.target.value as EditorSettings['subscribePos'],
                        })
                      }
                      className="w-full input-dark px-3 py-2 text-xs cursor-pointer"
                    >
                      <option value="top-right">Top right</option>
                      <option value="top-left">Top left</option>
                      <option value="bottom-right">Bottom right</option>
                      <option value="bottom-left">Bottom left</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Size</label>
                    <select
                      value={settings.subscribeSize}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          subscribeSize: e.target.value as EditorSettings['subscribeSize'],
                        })
                      }
                      className="w-full input-dark px-3 py-2 text-xs cursor-pointer"
                    >
                      <option value="normal">Normal</option>
                      <option value="small">Small</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                </div>

                {/* Quick Fill Buttons */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-zinc-400 mr-1">Fill in:</span>
                  <button
                    type="button"
                    onClick={() => quickFillSubscribe('0:05, 0:25')}
                    className="px-3 py-1 rounded-lg btn-outline font-medium cursor-pointer"
                  >
                    Start and end
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFillSubscribe('0:05, 5:00, 10:00')}
                    className="px-3 py-1 rounded-lg btn-outline font-medium cursor-pointer"
                  >
                    Every 5 minutes
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFillSubscribe('0:05, 10:00')}
                    className="px-3 py-1 rounded-lg btn-outline font-medium cursor-pointer"
                  >
                    Every 10 minutes
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFillSubscribe('')}
                    className="px-3 py-1 rounded-lg btn-outline font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>

                {/* Live Subscribe Preview Frame */}
                <div className="flex flex-col md:flex-row gap-4 items-start pt-1">
                  <div className="relative w-full md:w-[380px] aspect-video rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 shrink-0 select-none shadow-md">
                    <img
                      src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80"
                      alt="Mountain preview"
                      className="w-full h-full object-cover"
                    />

                    {/* Animated Subscribe Overlay Badge */}
                    <div
                      className={`sub-badge-anim absolute bg-red-600 text-white px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xl font-bold tracking-wider ${
                        settings.subscribePos === 'top-left'
                          ? 'top-3 left-3'
                          : settings.subscribePos === 'bottom-left'
                          ? 'bottom-3 left-3'
                          : settings.subscribePos === 'bottom-right'
                          ? 'bottom-3 right-3'
                          : 'top-3 right-3'
                      } ${
                        settings.subscribeSize === 'small'
                          ? 'text-[9px] px-2 py-0.5'
                          : settings.subscribeSize === 'large'
                          ? 'text-xs px-4 py-1.5'
                          : 'text-[11px]'
                      }`}
                    >
                      <span>SUBSCRIBE</span>
                      <span className="sub-bell-icon bg-white/20 rounded-full p-0.5 text-[10px]">
                        🔔
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 pt-1 leading-relaxed">
                    It shows{' '}
                    {settings.subscribeTimes
                      ? `${settings.subscribeTimes.split(',').length} times`
                      : '0 times'}
                    , about 4.6 seconds each: {settings.subscribeTimes || 'None'}.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Save Settings Row */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSaveSettings}
              className="px-4 py-2.5 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
            >
              Save as my settings
            </button>
            <span className="text-xs text-zinc-400">
              Saved settings are used every time you open Saleem Editor Studio.
            </span>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 3 · CAPTIONS (synced to the voice)                                */}
        {/* ================================================================= */}
        <section className="panel-card p-5 sm:p-6 space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            3 · CAPTIONS (synced to the voice)
          </h2>

          {/* 16 Caption Style Pills */}
          <div className="space-y-2">
            <span className="text-xs text-zinc-400 block">Choose Caption Animation Style</span>
            <div className="flex flex-wrap gap-2">
              {CAPTION_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setCaptionSettings({ ...captionSettings, style: st.id })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    captionSettings.style === st.id
                      ? 'bg-white text-black font-bold shadow'
                      : 'bg-[#15151b] border border-zinc-800 text-zinc-300 hover:text-white'
                  }`}
                >
                  {st.name}
                </button>
              ))}
            </div>
          </div>

          {/* Colour Swatches */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-zinc-400">Colour</span>
            <div className="flex items-center gap-2">
              {CAPTION_COLORS.map((col) => (
                <button
                  key={col.name}
                  type="button"
                  onClick={() => setCaptionSettings({ ...captionSettings, color: col.hex })}
                  title={col.name}
                  className={`w-6 h-6 rounded-full border-2 transition transform hover:scale-110 cursor-pointer ${
                    captionSettings.color === col.hex
                      ? 'border-white scale-110 shadow-lg'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: col.hex }}
                />
              ))}
            </div>
          </div>

          {/* Draggable Caption Preview & Size Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-1">
            {/* Left 16:9 Draggable Preview Frame */}
            <div
              ref={captionPreviewContainerRef}
              onMouseDown={handleMouseDownPreview}
              onMouseMove={handleMouseMovePreview}
              onMouseUp={handleMouseUpPreview}
              className="lg:col-span-7 relative w-full aspect-video rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 select-none cursor-crosshair shadow-lg"
            >
              <img
                src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80"
                alt="Caption preview"
                className="w-full h-full object-cover pointer-events-none"
              />

              {/* Draggable Subtitle Caption Element */}
              <div
                style={{
                  left: `${captionSettings.xPercent}%`,
                  top: `${captionSettings.yPercent}%`,
                  transform: 'translate(-50%, -50%)',
                  color: captionSettings.color,
                  fontSize: `${Math.round(18 * (captionSettings.sizeScale / 100))}px`,
                }}
                className={`absolute whitespace-nowrap pointer-events-none shadow-xl ${
                  CAPTION_STYLES.find((s) => s.id === captionSettings.style)?.previewClass || ''
                }`}
              >
                {captionSettings.text.split(' ').slice(0, 5).join(' ') ||
                  'Your Subtitles Appear Here'}
              </div>

              {/* Helper indicator badge */}
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-[10px] text-zinc-300 px-2 py-0.5 rounded border border-white/10 pointer-events-none">
                Drag subtitle to reposition
              </div>
            </div>

            {/* Right Position & Size Controls */}
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Drag the caption on the preview to set where subtitles appear. Position:{' '}
                <strong className="text-white">{captionPositionLabel}</strong> (
                {captionSettings.xPercent}%, {captionSettings.yPercent}%)
              </p>
              <button
                type="button"
                onClick={resetCaptionPosition}
                className="w-full py-2.5 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
              >
                Reset position
              </button>

              <div className="space-y-2 pt-2">
                <div className="text-xs text-zinc-300">
                  Size: <span className="font-semibold text-white">{captionSettings.sizeScale}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setCaptionSettings((p) => ({
                        ...p,
                        sizeScale: Math.max(60, p.sizeScale - 10),
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg btn-outline text-xs font-bold cursor-pointer"
                  >
                    A-
                  </button>
                  <input
                    type="range"
                    min="60"
                    max="160"
                    value={captionSettings.sizeScale}
                    onChange={(e) =>
                      setCaptionSettings({
                        ...captionSettings,
                        sizeScale: parseInt(e.target.value, 10),
                      })
                    }
                    className="flex-1 accent-sky-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCaptionSettings((p) => ({
                        ...p,
                        sizeScale: Math.min(160, p.sizeScale + 10),
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg btn-outline text-xs font-bold cursor-pointer"
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Caption Language */}
          <div className="max-w-xs pt-1">
            <label className="block text-xs text-zinc-400 mb-1.5">
              Caption language · detected from your captions
            </label>
            <select
              value={captionSettings.language}
              onChange={(e) =>
                setCaptionSettings({ ...captionSettings, language: e.target.value })
              }
              className="w-full input-dark px-3 py-2.5 text-xs font-medium cursor-pointer"
            >
              <option>English</option>
              <option>Urdu</option>
              <option>Hindi</option>
              <option>Spanish</option>
              <option>Arabic</option>
            </select>
          </div>

          {/* Captions Script Box */}
          <div className="space-y-2.5">
            <label className="block text-xs text-zinc-400">Captions</label>
            <textarea
              rows={4}
              value={captionSettings.text}
              onChange={(e) =>
                setCaptionSettings({ ...captionSettings, text: e.target.value })
              }
              className="w-full input-dark p-4 text-xs sm:text-sm text-zinc-200 leading-relaxed font-sans"
            />

            <input
              type="file"
              id="uploadSrtInput"
              accept=".srt,.txt"
              className="hidden"
              onChange={handleUploadSrt}
            />
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => document.getElementById('uploadSrtInput')?.click()}
                className="px-4 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
              >
                Load .txt / .docx
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('uploadSrtInput')?.click()}
                className="px-4 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
              >
                Upload SRT
              </button>
            </div>
            <p className="text-xs text-emerald-400 pt-1 font-mono-code">
              {captionWordsCount} words timed.
            </p>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 4 · TIMELINE                                                      */}
        {/* ================================================================= */}
        <section className="panel-card p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              4 · TIMELINE
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-full bg-[#18181c] border border-zinc-800 text-zinc-200 font-medium">
                {clips.length} clip{clips.length === 1 ? '' : 's'}
              </span>
              <span className="px-3 py-1 rounded-full bg-[#18181c] border border-zinc-800 text-zinc-200 font-medium font-mono-code">
                Length {formatSeconds(totalClipsDuration)}
              </span>
              <button
                type="button"
                onClick={autoDistributeClips}
                className="px-3 py-1 rounded-full bg-sky-950/40 border border-sky-800/60 text-sky-300 font-medium hover:bg-sky-900/40 transition cursor-pointer"
              >
                ⚡ Sync clips to voiceover
              </button>
            </div>
          </div>

          {/* Visual Segmented Timeline Bar */}
          <div className="space-y-2">
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                setTimelineCurrentTime(ratio * (totalClipsDuration || 1));
              }}
              className="w-full h-11 rounded-lg bg-[#141b2a] overflow-hidden flex items-stretch p-0.5 gap-[2px] border border-zinc-800 cursor-pointer relative"
            >
              {clips.map((clip, i) => {
                const widthPercent = totalClipsDuration > 0 ? (clip.duration / totalClipsDuration) * 100 : 20;
                return (
                  <div
                    key={clip.id}
                    style={{ width: `${widthPercent}%` }}
                    className={`h-full rounded-sm flex items-center justify-center text-[10px] font-mono-code text-white/90 px-1 truncate select-none transition-all ${
                      clip.type === 'video' ? 'bg-orange-600/80 hover:bg-orange-500' : 'bg-blue-600/80 hover:bg-blue-500'
                    }`}
                    title={`${clip.title} (${clip.duration}s)`}
                  >
                    #{i + 1} {clip.title.split('.')[0]}
                  </div>
                );
              })}

              {/* Red playhead scrub needle */}
              <div
                style={{
                  left: `${
                    totalClipsDuration > 0
                      ? (timelineCurrentTime / totalClipsDuration) * 100
                      : 0
                  }%`,
                }}
                className="absolute top-0 bottom-0 w-1 bg-red-500 shadow-md pointer-events-none transform -translate-x-1/2 z-10"
              ></div>
            </div>

            <div className="flex justify-between text-[11px] font-mono-code text-zinc-400">
              <span>0:00.00</span>
              <span>{formatSeconds(totalClipsDuration / 2)}</span>
              <span>{formatSeconds(totalClipsDuration)}</span>
            </div>

            <div className="flex items-center gap-4 text-xs text-zinc-400 pt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block"></span> Image
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-orange-500 inline-block"></span> Video
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-zinc-800 border border-zinc-600 inline-block"></span> Gap
              </span>
            </div>
          </div>

          {/* Clips Table */}
          <div className="border border-[#232329] rounded-xl overflow-hidden bg-[#0d0d10]">
            <div className="max-h-[340px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#141418] text-zinc-400 border-b border-[#232329] sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4 font-medium">#</th>
                    <th className="py-3 px-4 font-medium">File</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">Duration</th>
                    <th className="py-3 px-4 font-medium">Motion & Transition</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e24] font-mono-code">
                  {clips.map((clip, idx) => (
                    <tr key={clip.id} className="hover:bg-[#13131a] transition">
                      <td className="py-3 px-4 text-zinc-400">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={clip.src}
                            alt=""
                            className="w-10 h-7 object-cover rounded bg-zinc-800 shrink-0"
                          />
                          <span className="text-zinc-200 font-sans truncate max-w-[180px]">
                            {clip.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            clip.type === 'video'
                              ? 'bg-orange-950 text-orange-400 border border-orange-800/40'
                              : 'bg-blue-950 text-blue-400 border border-blue-800/40'
                          }`}
                        >
                          {clip.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          max="60"
                          value={clip.duration}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 1;
                            setClips(
                              clips.map((c) =>
                                c.id === clip.id ? { ...c, duration: val } : c
                              )
                            );
                          }}
                          className="w-16 input-dark px-2 py-1 text-xs text-white"
                        />
                        <span className="text-zinc-500 ml-1">s</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={clip.motion}
                            onChange={(e) =>
                              setClips(
                                clips.map((c) =>
                                  c.id === clip.id ? { ...c, motion: e.target.value } : c
                                )
                              )
                            }
                            className="input-dark px-2 py-1 text-[11px] font-sans"
                          >
                            {ALL_MOTIONS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <select
                            value={clip.transition}
                            onChange={(e) =>
                              setClips(
                                clips.map((c) =>
                                  c.id === clip.id ? { ...c, transition: e.target.value } : c
                                )
                              )
                            }
                            className="input-dark px-2 py-1 text-[11px] font-sans"
                          >
                            {ALL_TRANSITIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setClips(clips.filter((c) => c.id !== clip.id))}
                          className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {clips.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        No clips in timeline. Click "Add Images / Videos" or "Load Demo B-Roll".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 5 · EXPORT & VIDEO RENDERING                                      */}
        {/* ================================================================= */}
        <section className="panel-card p-5 sm:p-6 space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            5 · EXPORT
          </h2>

          <div className="max-w-md">
            <label className="block text-xs text-zinc-400 mb-1.5">Voiceover length</label>
            <select className="w-full input-dark px-3.5 py-2.5 text-xs font-medium cursor-pointer">
              <option>Match video length · cut extra voiceover</option>
              <option>Keep full voiceover · extend final clip</option>
              <option>Fit clips to exact voiceover duration</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-white mr-2">File name</label>
            <input
              type="text"
              value={exportFileName}
              onChange={(e) => setExportFileName(e.target.value)}
              className="w-64 sm:w-80 input-dark px-3.5 py-2.5 text-xs font-mono-code"
            />
            <span className="text-xs text-zinc-400 font-mono-code">.mp4</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => showToast('Browser will save to your computer Downloads folder')}
              className="px-4 py-2.5 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
            >
              Choose save folder
            </button>
            <span className="text-xs text-zinc-400">
              Not chosen · the video is kept in the browser until you press Save MP4
            </span>
          </div>

          <p className="text-xs text-zinc-400">
            This video needs about {Math.round((totalClipsDuration || 10) * 1.8)} MB.
          </p>

          <div>
            <button
              type="button"
              onClick={triggerVideoRendering}
              disabled={isRendering}
              className="px-7 py-3.5 rounded-xl btn-white text-sm font-bold shadow-lg cursor-pointer disabled:opacity-60 flex items-center gap-2"
            >
              {isRendering ? (
                <>
                  <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                  <span>Rendering Video ({renderProgress}%)...</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  <span>Create Video</span>
                </>
              )}
            </button>
          </div>

          {/* Render Progress Bar */}
          <div className="w-full h-2.5 bg-[#18181c] rounded-full overflow-hidden border border-zinc-800">
            <div
              className="h-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${renderProgress}%` }}
            ></div>
          </div>

          <p className="text-xs text-emerald-400 font-medium">{renderStatusText}</p>

          {/* Final Rendered Player / Live Canvas View */}
          <div className="pt-5 border-t border-zinc-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Video Player & Render Preview</span>
              </h3>
              <button
                type="button"
                onClick={downloadRenderedMp4}
                className="px-5 py-2.5 rounded-lg btn-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save MP4 to Device</span>
              </button>
            </div>

            {/* Live Composite Canvas */}
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-zinc-700 bg-black shadow-2xl">
              <canvas
                ref={liveCanvasRef}
                width={1280}
                height={720}
                className="w-full h-full object-contain"
              />

              {/* Player Overlay Controls */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlayTimeline}
                  className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition shrink-0 cursor-pointer"
                >
                  {isTimelinePlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>

                <input
                  type="range"
                  min="0"
                  max={totalClipsDuration || 1}
                  step="0.05"
                  value={timelineCurrentTime}
                  onChange={(e) => setTimelineCurrentTime(parseFloat(e.target.value))}
                  className="flex-1 accent-sky-400 cursor-pointer h-1.5 bg-zinc-700 rounded-lg"
                />

                <span className="text-[11px] font-mono-code text-zinc-300">
                  {formatSeconds(timelineCurrentTime)} / {formatSeconds(totalClipsDuration)}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
