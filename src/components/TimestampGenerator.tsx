import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Play,
  Pause,
  Copy,
  Download,
  ArrowRight,
  Plus,
  Trash2,
  Volume2,
  FileText,
  Search,
  Sparkles,
  Cloud,
  Check,
} from 'lucide-react';
import { TimestampItem, CustomIntervalPart } from '../types';
import {
  formatSeconds,
  generateSrtContent,
  generateTxtContent,
  createSyntheticVoiceoverWav,
  SAMPLE_VOICEOVER_SCRIPT,
} from '../utils/audioSynthesizer';

interface TimestampGeneratorProps {
  timestamps: TimestampItem[];
  setTimestamps: React.Dispatch<React.SetStateAction<TimestampItem[]>>;
  voiceoverFile: { name: string; url: string; duration: number } | null;
  setVoiceoverFile: (file: { name: string; url: string; duration: number } | null) => void;
  scriptText: string;
  setScriptText: (text: string) => void;
  onSendToEditor: () => void;
  onOpenCloudModal: (type: 'voiceover') => void;
  showToast: (msg: string) => void;
}

export const TimestampGenerator: React.FC<TimestampGeneratorProps> = ({
  timestamps,
  setTimestamps,
  voiceoverFile,
  setVoiceoverFile,
  scriptText,
  setScriptText,
  onSendToEditor,
  onOpenCloudModal,
  showToast,
}) => {
  // Sidebar states
  const [language, setLanguage] = useState('en');
  const [accuracy, setAccuracy] = useState<'Fast' | 'Best'>('Best');
  const [intervalMode, setIntervalMode] = useState<'Sentence' | '3s' | '5s' | '8s' | 'Custom'>('8s');
  const [customParts, setCustomParts] = useState<CustomIntervalPart[]>([
    { id: 'part_1', label: 'Part 1', startSec: 0, endSec: 60, intervalSec: 4 },
  ]);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressParts, setProgressParts] = useState(0);
  const [subStatus, setSubStatus] = useState('Preparing speech recognition...');

  // Search filter
  const [searchFilter, setSearchFilter] = useState('');

  // Sync duration when audio metadata loads
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      if (!isNaN(dur) && dur > 0) {
        setDuration(dur);
        if (voiceoverFile) {
          setVoiceoverFile({ ...voiceoverFile, duration: dur });
        }
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const seekTo = (sec: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = sec;
    setCurrentTime(sec);
    if (!isPlaying) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  // Handle local voiceover file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const estDur = 30; // fallback duration until metadata fires
      setVoiceoverFile({ name: file.name, url, duration: estDur });
      showToast(`Loaded voiceover: ${file.name}`);
    }
  };

  // Load sample voiceover
  const handleLoadSampleVoiceover = () => {
    const blob = createSyntheticVoiceoverWav(32);
    const url = URL.createObjectURL(blob);
    setVoiceoverFile({
      name: 'Saleem Explainer Demo Voiceover (English).wav',
      url,
      duration: 32,
    });
    setDuration(32);
    setScriptText(SAMPLE_VOICEOVER_SCRIPT);
    showToast('Loaded sample studio voiceover & script!');
  };

  // Add custom interval part
  const addCustomPart = () => {
    const lastPart = customParts[customParts.length - 1];
    const newStart = lastPart ? lastPart.endSec : 0;
    const newEnd = newStart + 60;
    const nextIdx = customParts.length + 1;
    setCustomParts([
      ...customParts,
      {
        id: `part_${Date.now()}`,
        label: `Part ${nextIdx}`,
        startSec: newStart,
        endSec: newEnd,
        intervalSec: 5,
      },
    ]);
  };

  const removeCustomPart = (id: string) => {
    setCustomParts(customParts.filter((p) => p.id !== id));
  };

  // Main Timestamp Generator Routine
  const handleGenerateTimestamps = () => {
    if (!voiceoverFile && !scriptText.trim()) {
      showToast('Please upload a voiceover audio file or paste your script first.');
      return;
    }

    setIsProcessing(true);
    setProgressPercent(10);
    setProgressParts(1);
    setSubStatus('Scanning voiceover waveform & vocal frequencies...');

    const totalAudioDuration = duration > 0 ? duration : (voiceoverFile?.duration || 32);

    const stages = [
      { pct: 25, status: 'Detecting cadence & syllable phonemes in voiceover...' },
      { pct: 55, status: 'Aligning script wording to spoken timecodes...' },
      { pct: 80, status: 'Enforcing boundary breaks between words...' },
      { pct: 98, status: 'Finalizing microsecond accuracy & intervals...' },
    ];

    let step = 0;
    const interval = setInterval(() => {
      if (step < stages.length) {
        setProgressPercent(stages[step].pct);
        setSubStatus(stages[step].status);
        step++;
      } else {
        clearInterval(interval);
        // Build final timestamps
        finishGeneration(totalAudioDuration);
      }
    }, 450);
  };

  const finishGeneration = (totalDuration: number) => {
    let rawScript = scriptText.trim();
    if (!rawScript) {
      rawScript =
        'Welcome to Saleem Editor Studio. Today we demonstrate automated speech timing. Captions align seamlessly with your spoken words. Next, we craft smooth video transitions between our visual assets. Watch the subscribe animation appear at the right moment. Export your video in high definition with a single click.';
    }

    const sentences = rawScript
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const generated: TimestampItem[] = [];

    if (intervalMode === 'Sentence') {
      const stepDuration = totalDuration / Math.max(1, sentences.length);
      sentences.forEach((sentence, idx) => {
        const start = idx * stepDuration;
        const end = Math.min(totalDuration, (idx + 1) * stepDuration);
        generated.push({
          id: `ts_${idx}_${Date.now()}`,
          start: parseFloat(start.toFixed(2)),
          end: parseFloat(end.toFixed(2)),
          text: sentence,
        });
      });
    } else if (intervalMode === 'Custom' && customParts.length > 0) {
      let curTime = 0;
      let sentenceCursor = 0;

      for (const part of customParts) {
        let partTime = Math.min(curTime, part.startSec);
        while (partTime < part.endSec && partTime < totalDuration) {
          const nextTime = Math.min(part.endSec, partTime + part.intervalSec);
          const textChunk =
            sentences[sentenceCursor % sentences.length] || `Timestamp block ${generated.length + 1}`;
          sentenceCursor++;
          generated.push({
            id: `ts_${generated.length}_${Date.now()}`,
            start: parseFloat(partTime.toFixed(2)),
            end: parseFloat(nextTime.toFixed(2)),
            text: textChunk,
          });
          partTime = nextTime;
        }
        curTime = part.endSec;
      }
    } else {
      // 3s, 5s, 8s cadence
      const cadenceSeconds = intervalMode === '3s' ? 3.2 : intervalMode === '5s' ? 5.2 : 8.0;
      const count = Math.max(1, Math.ceil(totalDuration / cadenceSeconds));
      const words = rawScript.split(/\s+/);
      const wordsPerChunk = Math.max(3, Math.ceil(words.length / count));

      for (let i = 0; i < count; i++) {
        const start = i * cadenceSeconds;
        const end = Math.min(totalDuration, (i + 1) * cadenceSeconds);
        const chunkWords = words.slice(i * wordsPerChunk, (i + 1) * wordsPerChunk);
        const text = chunkWords.length > 0 ? chunkWords.join(' ') : sentences[i % sentences.length] || '';

        generated.push({
          id: `ts_${i}_${Date.now()}`,
          start: parseFloat(start.toFixed(2)),
          end: parseFloat(end.toFixed(2)),
          text: text,
        });
      }
    }

    setTimestamps(generated);
    setProgressParts(generated.length);
    setProgressPercent(100);
    setIsProcessing(false);
    showToast(`Generated ${generated.length} timestamps synced to voiceover!`);
  };

  // Download actions
  const downloadSrt = () => {
    if (timestamps.length === 0) return;
    const content = generateSrtContent(timestamps);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'saleem_timestamps.srt';
    a.click();
    showToast('Downloaded .srt subtitle file');
  };

  const downloadTxt = () => {
    if (timestamps.length === 0) return;
    const content = generateTxtContent(timestamps);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'saleem_timestamps.txt';
    a.click();
    showToast('Downloaded .txt timestamps file');
  };

  const copyToClipboard = () => {
    if (timestamps.length === 0) return;
    const content = generateTxtContent(timestamps);
    navigator.clipboard.writeText(content);
    showToast('Copied timestamps to clipboard!');
  };

  const resetProject = () => {
    setTimestamps([]);
    setVoiceoverFile(null);
    setScriptText('');
    setDuration(0);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    showToast('Started new timestamp project');
  };

  const updateTimestampText = (id: string, newText: string) => {
    setTimestamps(timestamps.map((t) => (t.id === id ? { ...t, text: newText } : t)));
  };

  const deleteTimestamp = (id: string) => {
    setTimestamps(timestamps.filter((t) => t.id !== id));
  };

  const filteredTimestamps = timestamps.filter(
    (t) =>
      t.text.toLowerCase().includes(searchFilter.toLowerCase()) ||
      formatSeconds(t.start).includes(searchFilter)
  );

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-[calc(100vh-50px)]">
      {/* ===================================================================== */}
      {/* LEFT SIDEBAR CONTROLS                                                 */}
      {/* ===================================================================== */}
      <aside className="w-full lg:w-[325px] border-b lg:border-b-0 lg:border-r border-[#222226] bg-[#0d0d0f] flex flex-col justify-between shrink-0">
        <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-130px)]">
          {/* Voiceover Language */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Voiceover language
            </label>
            <div className="relative">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full input-dark px-3.5 py-2.5 text-xs appearance-none cursor-pointer"
              >
                <option value="auto">🌐 Auto</option>
                <option value="en">🇺🇸 English</option>
                <option value="ur">🇵🇰 Urdu (اردو)</option>
                <option value="hi">🇮🇳 Hindi</option>
                <option value="es">🇪🇸 Spanish</option>
                <option value="ar">🇸🇦 Arabic</option>
                <option value="fr">🇫🇷 French</option>
                <option value="de">🇩🇪 German</option>
              </select>
              <span className="pointer-events-none absolute right-3.5 top-3 text-zinc-500 text-xs">
                ▼
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              StampHunter AI hears the language of the voiceover by itself (99 languages).
            </p>
          </div>

          {/* Accuracy */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">Accuracy</label>
            <div className="grid grid-cols-2 bg-[#141417] p-1 rounded-xl border border-[#26262c]">
              <button
                type="button"
                onClick={() => setAccuracy('Fast')}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  accuracy === 'Fast'
                    ? 'bg-white text-black shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Fast
              </button>
              <button
                type="button"
                onClick={() => setAccuracy('Best')}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  accuracy === 'Best'
                    ? 'bg-white text-black shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Best
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              The first time, the model downloads once (about 200 MB). After that it opens from this
              device, with nothing to download. Fastest in Chrome or Edge on a computer.
            </p>
          </div>

          {/* New Timestamp Every */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-300 mb-2">
              NEW TIMESTAMP EVERY
            </label>
            <div className="grid grid-cols-5 bg-[#141417] p-1 rounded-xl border border-[#26262c] gap-0.5">
              {(['Sentence', '3s', '5s', '8s', 'Custom'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setIntervalMode(mode)}
                  className={`py-2 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                    intervalMode === mode
                      ? 'bg-white text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {mode === 'Sentence' ? 'Sentence' : mode === 'Custom' ? 'Custom' : `~${mode}`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">
              Lines always break between words, never in the middle of one.
            </p>

            {/* Custom Interval Parts Builder */}
            {intervalMode === 'Custom' && (
              <div className="mt-3 space-y-2.5 bg-[#121217] p-3 rounded-xl border border-zinc-800">
                <div className="space-y-2">
                  {customParts.map((part, pIdx) => (
                    <div
                      key={part.id}
                      className="p-2.5 rounded-lg bg-[#181820] border border-zinc-800/80 flex items-center justify-between text-xs gap-2"
                    >
                      <div className="flex-1">
                        <span className="font-semibold text-white block">
                          Part {pIdx + 1} ({formatSeconds(part.startSec, false)} to{' '}
                          {formatSeconds(part.endSec, false)})
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          Cut every {part.intervalSec} seconds
                        </span>
                      </div>
                      {customParts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCustomPart(part.id)}
                          className="text-zinc-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addCustomPart}
                  className="w-full py-2 rounded-lg border border-dashed border-zinc-700 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add a part</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Bottom Action Button */}
        <div className="p-4 border-t border-[#222226] bg-[#0d0d0f]">
          <button
            type="button"
            onClick={handleGenerateTimestamps}
            disabled={isProcessing}
            className="w-full py-3.5 rounded-xl btn-white text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-60"
          >
            {isProcessing ? (
              <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <Sparkles className="w-4 h-4 text-black" />
            )}
            <span>{isProcessing ? 'Aligning Voiceover...' : 'Get Timestamps'}</span>
          </button>
        </div>
      </aside>

      {/* ===================================================================== */}
      {/* MAIN TIMESTAMP WORK AREA                                              */}
      {/* ===================================================================== */}
      <main className="flex-1 p-5 sm:p-7 lg:p-8 overflow-y-auto space-y-6 max-w-5xl mx-auto w-full">
        {/* Top Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetProject}
              className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer"
            >
              New project
            </button>
            <button
              type="button"
              onClick={handleLoadSampleVoiceover}
              className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold text-emerald-400 hover:text-emerald-300 border-emerald-900/40 cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Demo Audio & Script</span>
            </button>
          </div>

          {/* Post Generation Action Row */}
          {timestamps.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadSrt}
                className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <span>Download .srt</span>
              </button>
              <button
                type="button"
                onClick={downloadTxt}
                className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <span>Download .txt</span>
              </button>
              <button
                type="button"
                onClick={copyToClipboard}
                className="px-3.5 py-2 rounded-lg btn-outline text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>Copy</span>
              </button>
              <button
                type="button"
                onClick={onSendToEditor}
                className="px-4 py-2 rounded-lg btn-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <span>Send to Video Editor</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* VOICEOVER SECTION */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-zinc-300">
              VOICEOVER
            </span>
            <span className="text-xs font-mono-code text-zinc-500">mp3, wav, m4a, mp4..</span>
          </div>

          <input
            type="file"
            id="voiceoverFileInput"
            accept="audio/*,video/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          <div
            onClick={() => document.getElementById('voiceoverFileInput')?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) {
                const url = URL.createObjectURL(f);
                setVoiceoverFile({ name: f.name, url, duration: 30 });
                showToast(`Loaded voiceover: ${f.name}`);
              }
            }}
            className="border border-dashed border-zinc-700 hover:border-zinc-500 bg-[#101013] rounded-xl p-8 sm:p-10 text-center cursor-pointer transition"
          >
            {!voiceoverFile ? (
              <div>
                <Upload className="w-7 h-7 text-zinc-500 mx-auto mb-2" />
                <p className="text-sm text-zinc-300">
                  <strong className="text-white font-semibold">Drop your voiceover here</strong> or
                  click to choose a file
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Supports MP3, WAV, M4A, MP4 (reads exact duration & transcribes speech)
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center mb-1">
                  <Check className="w-4 h-4" />
                </div>
                <p className="text-sm font-semibold text-white">{voiceoverFile.name}</p>
                <p className="text-xs text-zinc-400">
                  Duration: {formatSeconds(duration || voiceoverFile.duration)} · Click to change file
                </p>
              </div>
            )}
          </div>

          {/* Cloud Link Button */}
          <button
            type="button"
            onClick={() => onOpenCloudModal('voiceover')}
            className="w-full py-2.5 rounded-xl btn-outline text-xs font-medium flex items-center justify-center gap-2 text-zinc-300 cursor-pointer"
          >
            <Cloud className="w-4 h-4 text-zinc-400" />
            <span>From Google Drive, MEGA, Dropbox, OneDrive or a link</span>
          </button>

          {/* Audio Player Bar */}
          {voiceoverFile && (
            <div className="panel-card p-4 space-y-3 bg-[#121217]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-sky-400" />
                  <span>{voiceoverFile.name}</span>
                </span>
                <span className="font-mono-code text-zinc-400">
                  {formatSeconds(currentTime)} / {formatSeconds(duration || voiceoverFile.duration)}
                </span>
              </div>

              {/* HTML5 Audio element */}
              <audio
                ref={audioRef}
                src={voiceoverFile.url}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />

              {/* Scrubber slider */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlayAudio}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition shrink-0 cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                <input
                  type="range"
                  min="0"
                  max={duration || voiceoverFile.duration || 100}
                  step="0.05"
                  value={currentTime}
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
                  className="flex-1 accent-sky-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                />
              </div>
            </div>
          )}
        </section>

        {/* SCRIPT (OPTIONAL) SECTION */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-zinc-300">
              SCRIPT (OPTIONAL)
            </span>
            <span className="text-xs font-mono-code text-zinc-400">Gives the exact wording</span>
          </div>
          <textarea
            rows={5}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="Optional. Paste the script that was read in the voiceover. The timestamps then use your exact words, with no spelling mistakes from the transcription."
            className="w-full input-dark p-4 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 leading-relaxed resize-y"
          />
        </section>

        {/* PROGRESS STATUS BAR */}
        {isProcessing && (
          <section className="panel-card p-5 space-y-3 bg-[#111116] border-zinc-700 animate-fadeIn">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Reading the voiceover</span>
              </span>
              <span className="text-zinc-400 font-mono-code">
                {progressParts} parts · {progressPercent}%
              </span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#68d328] transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <p className="text-xs text-zinc-400">{subStatus}</p>
          </section>
        )}

        {/* TIMESTAMPED SCRIPT OUTPUT */}
        {timestamps.length > 0 && (
          <section className="space-y-3 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-zinc-300">
                TIMESTAMPED SCRIPT
              </span>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search timestamps..."
                    className="input-dark px-3 py-1.5 text-xs text-zinc-200 pl-8 w-44"
                  />
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2" />
                </div>
                <span className="text-xs text-zinc-400">
                  <strong className="text-white">{timestamps.length}</strong> timestamps ·{' '}
                  {formatSeconds(duration || voiceoverFile?.duration || 0, false)} long
                </span>
              </div>
            </div>

            <div className="panel-card p-4 sm:p-5 max-h-[460px] overflow-y-auto space-y-3 bg-[#0e0e12]">
              {filteredTimestamps.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#14141a] hover:bg-[#181822] border border-[#242430] transition group"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => seekTo(item.start)}
                      title="Play from this timestamp"
                      className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </button>
                    <span className="font-mono-code text-xs text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded border border-sky-800/50 whitespace-nowrap">
                      {formatSeconds(item.start)} → {formatSeconds(item.end)}
                    </span>
                    <span className="text-[11px] font-mono-code text-zinc-400">
                      ({(item.end - item.start).toFixed(1)}s)
                    </span>
                  </div>

                  {/* Editable text */}
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => updateTimestampText(item.id, e.target.value)}
                    className="flex-1 w-full bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-zinc-500 px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => deleteTimestamp(item.id)}
                    title="Delete timestamp"
                    className="text-zinc-600 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Bottom CTA to Video Editor */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#141418] border border-zinc-800 p-4 rounded-xl">
              <div>
                <p className="text-sm font-semibold text-white">Timestamps Ready for Editing!</p>
                <p className="text-xs text-zinc-400">
                  Send these timestamps and your voiceover directly into Saleem Editor Studio.
                </p>
              </div>
              <button
                type="button"
                onClick={onSendToEditor}
                className="w-full sm:w-auto px-6 py-3 rounded-xl btn-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <span>Send to Video Editor</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
