import React, { useState } from 'react';
import { X, Link2, Play, AlertCircle } from 'lucide-react';
import { parseViglooInput } from '../utils/viglooParser';

interface LoadUrlModalProps {
  isOpen: boolean;
  currentUrl: string;
  uiLang: 'km' | 'en';
  onClose: () => void;
  onLoadProgram: (programId: number, episodeNumber: number) => void;
}

const PRESET_LINKS = [
  {
    programId: 15003223,
    episodeNumber: 1,
    title: 'Riding with My Bully Stepbrother',
    url: 'https://www.vigloo.com/en/video/15003223?episode=1',
    note: 'EP 1–5 Free · 40 Episodes',
  },
  {
    programId: 15003049,
    episodeNumber: 1,
    title: "Forbidden Tides : Don't Tell My Stepson",
    url: 'https://www.vigloo.com/en/video/15003049?episode=1',
    note: 'EP 1–4 Free · 50 Episodes',
  },
  {
    programId: 15003526,
    episodeNumber: 1,
    title: 'One Night with My Stepfather',
    url: 'https://www.vigloo.com/en/video/15003526?episode=1',
    note: 'EP 1–5 Free · 44 Episodes',
  },
  {
    programId: 15003454,
    episodeNumber: 1,
    title: 'Good Vibrations with the Pleasure King',
    url: 'https://www.vigloo.com/en/video/15003454?episode=1',
    note: 'EP 1–7 Free · 48 Episodes',
  },
];

export const LoadUrlModal: React.FC<LoadUrlModalProps> = ({
  isOpen,
  currentUrl,
  uiLang,
  onClose,
  onLoadProgram,
}) => {
  const [inputValue, setInputValue] = useState(currentUrl);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseViglooInput(inputValue);
    if (!parsed.valid || !parsed.programId) {
      setValidationError(parsed.error || 'Invalid Vigloo URL');
      return;
    }
    setValidationError(null);
    onLoadProgram(parsed.programId, parsed.episodeNumber || 1);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-vigloo-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#121216] border border-white/10 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Link2 className="w-5 h-5 text-teal-400" />
            <h2 id="load-vigloo-modal-title" className="text-lg font-semibold text-white">
              {uiLang === 'km' ? 'បើកមើលវីដេអូតាមតំណ Vigloo' : 'Load Vigloo Video URL'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <div>
            <label htmlFor="vigloo-url-input" className="block text-xs font-medium text-zinc-300 mb-2">
              {uiLang === 'km'
                ? 'បញ្ចូលតំណភ្ជាប់ Vigloo ឬលេខសម្គាល់កម្មវិធី (Program ID)'
                : 'Paste a Vigloo video URL or numeric Program ID'}
            </label>
            <div className="flex gap-2">
              <input
                id="vigloo-url-input"
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="https://www.vigloo.com/en/video/15003223?episode=1"
                className="flex-1 rounded-lg bg-zinc-900 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-teal-400 font-mono-tabular"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-lg bg-teal-400 text-zinc-950 font-semibold text-sm hover:bg-teal-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {uiLang === 'km' ? 'ផ្ទុកវីដេអូ' : 'Load Video'}
              </button>
            </div>
            {validationError && (
              <div
                role="alert"
                className="mt-2.5 flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <p className="text-xs font-medium text-zinc-400 mb-2.5">
              {uiLang === 'km' ? 'រឿងពេញនិយមនៅលើ Vigloo (ចុចដើម្បីមើលភ្លាមៗ)៖' : 'Popular Vigloo Series (Click to Watch):'}
            </p>
            <div className="space-y-2">
              {PRESET_LINKS.map((preset) => (
                <button
                  key={preset.programId}
                  type="button"
                  onClick={() => {
                    setInputValue(preset.url);
                    setValidationError(null);
                    onLoadProgram(preset.programId, preset.episodeNumber);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800/90 border border-white/10 text-left transition-colors cursor-pointer group"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white group-hover:text-teal-300 transition-colors truncate">
                      {preset.title}
                    </div>
                    <div className="text-xs text-zinc-400 font-mono-tabular truncate mt-0.5">
                      {preset.url} · {preset.note}
                    </div>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-teal-400/15 text-teal-300 flex items-center justify-center shrink-0 group-hover:bg-teal-400 group-hover:text-zinc-950 transition-colors">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
