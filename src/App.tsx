import React, { useState } from 'react';
import { Header } from './components/Header';
import { TimestampGenerator } from './components/TimestampGenerator';
import { VideoEditor } from './components/VideoEditor';
import { CloudLinkModal } from './components/CloudLinkModal';
import { Toast } from './components/Toast';
import { TimestampItem, TimelineClip, EditorSettings, CaptionSettings } from './types';
import {
  SAMPLE_MEDIA_LIBRARY,
  SAMPLE_VOICEOVER_SCRIPT,
  createSyntheticVoiceoverWav,
} from './utils/audioSynthesizer';

export default function App() {
  const [activeTab, setActiveTab] = useState<1 | 2>(1);

  // Timestamps state
  const [timestamps, setTimestamps] = useState<TimestampItem[]>([]);
  const [scriptText, setScriptText] = useState<string>('');
  const [voiceoverFile, setVoiceoverFile] = useState<{
    name: string;
    url: string;
    duration: number;
  } | null>(null);

  // Timeline clips state
  const [clips, setClips] = useState<TimelineClip[]>(SAMPLE_MEDIA_LIBRARY);

  // Editor settings state
  const [settings, setSettings] = useState<EditorSettings>(() => {
    // Try to load saved settings
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('saleem_editor_settings');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return {
      videoSize: '1080p',
      quality: 'best',
      fps: 30,
      fitMode: 'fit',
      imageMotion: 'auto',
      motionSpeed: 'normal',
      transitions: 'auto',
      transSounds: 'auto',
      soundVolume: 25,
      gapsMode: 'extend',
      subscribeToggle: 'on',
      subscribeTimes: '0:05, 5:00, 10:00',
      subscribePos: 'top-right',
      subscribeSize: 'normal',
      enabledMotions: ['Zoom In', 'Zoom Out', 'Pan Left', 'Pan Right'],
      enabledTransitions: ['Cross Dissolve', 'Slide Left', 'Slide Right', 'Zoom In', 'Fade to Black'],
    };
  });

  // Caption settings state
  const [captionSettings, setCaptionSettings] = useState<CaptionSettings>({
    style: 'typewriter',
    color: '#FFFFFF',
    xPercent: 50,
    yPercent: 82,
    sizeScale: 100,
    language: 'English',
    text: 'Welcome to Saleem Editor Studio, your automated video workstation.',
  });

  // Cloud modal state
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [cloudTargetType, setCloudTargetType] = useState<'voiceover' | 'media' | 'bgmusic'>('voiceover');

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Transfer from Timestamp Generator to Video Editor
  const handleSendToEditor = () => {
    // Sync captions text
    if (timestamps.length > 0) {
      const fullText = timestamps.map((t) => t.text).join(' ');
      setCaptionSettings((prev) => ({
        ...prev,
        text: fullText,
      }));
    } else if (scriptText.trim()) {
      setCaptionSettings((prev) => ({
        ...prev,
        text: scriptText.trim(),
      }));
    }

    // Distribute clips to match voiceover duration
    if (voiceoverFile && clips.length > 0) {
      const durPerClip = parseFloat((voiceoverFile.duration / clips.length).toFixed(2));
      setClips(clips.map((c) => ({ ...c, duration: durPerClip })));
    }

    // Switch to Tab 2
    setActiveTab(2);
    showToast('Sent voiceover, timestamps, and subtitles to Saleem Editor Studio!');
  };

  const handleOpenCloudModal = (type: 'voiceover' | 'media' | 'bgmusic') => {
    setCloudTargetType(type);
    setCloudModalOpen(true);
  };

  const handleLoadCloudUrl = (url: string, name: string) => {
    if (url === 'sample_studio_explainer') {
      const blob = createSyntheticVoiceoverWav(32);
      const blobUrl = URL.createObjectURL(blob);
      setVoiceoverFile({ name, url: blobUrl, duration: 32 });
      setScriptText(SAMPLE_VOICEOVER_SCRIPT);
      showToast('Loaded sample studio voiceover!');
    } else if (url === 'sample_cinematic_music') {
      showToast('Loaded ambient background music track!');
    } else {
      if (cloudTargetType === 'voiceover') {
        setVoiceoverFile({ name, url, duration: 30 });
      } else if (cloudTargetType === 'media') {
        setClips((prev) => [
          ...prev,
          {
            id: `cloud_${Date.now()}`,
            title: name,
            type: 'image',
            src: url,
            duration: 5.0,
            motion: 'Zoom In',
            transition: 'Cross Dissolve',
          },
        ]);
      }
      showToast(`Loaded cloud file: ${name}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0b0c] text-zinc-100">
      {/* Studio Suite Bar */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        timestampCount={timestamps.length}
        clipCount={clips.length}
      />

      {/* Main Studio View */}
      {activeTab === 1 ? (
        <TimestampGenerator
          timestamps={timestamps}
          setTimestamps={setTimestamps}
          voiceoverFile={voiceoverFile}
          setVoiceoverFile={setVoiceoverFile}
          scriptText={scriptText}
          setScriptText={setScriptText}
          onSendToEditor={handleSendToEditor}
          onOpenCloudModal={handleOpenCloudModal}
          showToast={showToast}
        />
      ) : (
        <VideoEditor
          onBackToTimestamps={() => setActiveTab(1)}
          timestamps={timestamps}
          setTimestamps={setTimestamps}
          voiceoverFile={voiceoverFile}
          setVoiceoverFile={setVoiceoverFile}
          clips={clips}
          setClips={setClips}
          settings={settings}
          setSettings={setSettings}
          captionSettings={captionSettings}
          setCaptionSettings={setCaptionSettings}
          onOpenCloudModal={handleOpenCloudModal}
          showToast={showToast}
        />
      )}

      {/* Cloud Link Import Modal */}
      <CloudLinkModal
        isOpen={cloudModalOpen}
        onClose={() => setCloudModalOpen(false)}
        onLoadUrl={handleLoadCloudUrl}
        targetType={cloudTargetType}
      />

      {/* Toast Notification */}
      <Toast message={toastMessage} />
    </div>
  );
}
