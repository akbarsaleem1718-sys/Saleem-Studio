import React, { useState } from 'react';
import { X, Cloud, Link2, CheckCircle2, Music, Sparkles } from 'lucide-react';

interface CloudLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadUrl: (url: string, name: string) => void;
  targetType: 'voiceover' | 'media' | 'bgmusic';
}

export const CloudLinkModal: React.FC<CloudLinkModalProps> = ({
  isOpen,
  onClose,
  onLoadUrl,
  targetType,
}) => {
  const [linkInput, setLinkInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim()) {
      setErrorMsg('Please paste a valid cloud or direct media link.');
      return;
    }
    setErrorMsg('');
    const fileName = linkInput.split('/').pop()?.split('?')[0] || 'cloud_media_file';
    onLoadUrl(linkInput.trim(), fileName);
    onClose();
  };

  const handleSelectSample = (url: string, name: string) => {
    onLoadUrl(url, name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-[#121217] border border-[#2b2b36] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-sky-400">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Import from Cloud or Direct Link</h3>
            <p className="text-xs text-zinc-400">
              Paste public share links from Google Drive, Dropbox, MEGA, OneDrive, or raw media URLs.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              File or Share URL
            </label>
            <div className="relative">
              <input
                type="url"
                value={linkInput}
                onChange={(e) => {
                  setLinkInput(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="https://drive.google.com/file/d/... or direct audio/video link"
                className="w-full input-dark px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 pr-10"
                autoFocus
              />
              <Link2 className="w-4 h-4 text-zinc-500 absolute right-3 top-3" />
            </div>
            {errorMsg && <p className="text-xs text-rose-400 mt-1.5">{errorMsg}</p>}
          </div>

          <div className="pt-1 border-t border-zinc-800">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Or Choose Curated Sample Audio
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  handleSelectSample(
                    'sample_studio_explainer',
                    'Saleem Studio Explainer Voiceover (32s).wav'
                  )
                }
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#181820] hover:bg-[#20202c] border border-zinc-800 text-left transition"
              >
                <div className="flex items-center gap-2.5">
                  <Music className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Saleem Studio Explainer Voiceover (English)
                    </p>
                    <p className="text-[11px] text-zinc-400">Crisp studio narration · 32 seconds</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-sky-400">Load sample →</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSelectSample(
                    'sample_cinematic_music',
                    'Ambient Cinematic Lo-fi Beat (45s).mp3'
                  )
                }
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#181820] hover:bg-[#20202c] border border-zinc-800 text-left transition"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Ambient Cinematic Lo-fi Beat (Music Track)
                    </p>
                    <p className="text-[11px] text-zinc-400">Smooth atmospheric sound bed</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-purple-400">Load music →</span>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg btn-outline text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg btn-white text-xs font-bold"
            >
              Import File
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
