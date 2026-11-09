import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Download,
  Subtitles,
  Lock,
  ExternalLink,
  RotateCcw,
  Gauge,
  Sparkles,
  PictureInPicture2,
  Move,
  X,
  Loader2,
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Camera,
  Wrench,
} from 'lucide-react';
import {
  SubtitleCue,
  formatDuration,
  findActiveCueIndex,
  MiniPlayerCorner,
  VipStreamSourceMode,
  buildEpisodeCoverFilename,
  diagnoseAndPlanAutoRepair,
} from '../utils/viglooParser';
import {
  downloadMp4BlobToDevice,
  downloadImageBlobToDevice,
  captureVideoFrameToDevice,
} from '../utils/downloadHelper';

export interface StreamData {
  playable: boolean;
  locked: boolean;
  isVipEpisode?: boolean;
  isVipAutoUnlocked?: boolean;
  vipMode?: VipStreamSourceMode;
  defaultStreamMode?: 'hls' | 'mp4';
  code?: string;
  seasonId: number;
  episodeNumber: number;
  programId: number;
  posterUrl: string;
  storyboardFrames?: string[];
  hlsMasterUrl?: string;
  mp4Url?: string;
  downloadUrl?: string;
  message?: string;
  officialWebUrl?: string;
  deeplinkUrl?: string;
  qualities?: {
    id: string;
    label: string;
    resolution: string;
    width: number;
    height: number;
    bandwidth: number;
  }[];
  subtitles?: {
    lang: string;
    name: string;
    isDefault: boolean;
    cmftUrl: string;
    apiUrl: string;
    vttUrl: string;
  }[];
}

interface VideoStageProps {
  programTitle: string;
  seasonId: number;
  episodeNumber: number;
  totalEpisodes: number;
  freeEpisodeCount: number;
  episodeDuration: number;
  streamData: StreamData | null;
  isLoadingStream: boolean;
  cues: SubtitleCue[];
  selectedSubLang: string;
  subtitlesEnabled: boolean;
  autoAdvance: boolean;
  autoUnlockVip: boolean;
  autoDownloadOnWatch: boolean;
  vipSourceMode: VipStreamSourceMode;
  isMiniPlayer: boolean;
  isMiniPlayerDismissed: boolean;
  miniPlayerCorner: MiniPlayerCorner;
  uiLang: 'km' | 'en';
  currentTime: number;
  seekRequest: { time: number; nonce: number } | null;
  onTimeUpdate: (time: number) => void;
  onSelectEpisode: (ep: number) => void;
  onSelectSubLang: (lang: string) => void;
  onToggleSubtitles: () => void;
  onToggleAutoUnlockVip: () => void;
  onToggleAutoDownloadOnWatch: () => void;
  onChangeVipSourceMode: (mode: VipStreamSourceMode) => void;
  onOpenVipPanel: () => void;
  onOpenCoversPanel?: () => void;
  onEnterMiniPlayer: () => void;
  onExpandFromMiniPlayer: () => void;
  onDismissMiniPlayer: () => void;
  onRestoreMiniPlayer: () => void;
  onCycleMiniPlayerCorner: () => void;
  onAutoRepairComplete?: () => void;
}

export const VideoStage: React.FC<VideoStageProps> = ({
  programTitle,
  seasonId,
  episodeNumber,
  totalEpisodes,
  freeEpisodeCount,
  episodeDuration,
  streamData,
  isLoadingStream,
  cues,
  selectedSubLang,
  subtitlesEnabled,
  autoAdvance,
  autoUnlockVip,
  autoDownloadOnWatch,
  vipSourceMode,
  isMiniPlayer,
  isMiniPlayerDismissed,
  miniPlayerCorner,
  uiLang,
  currentTime,
  seekRequest,
  onTimeUpdate,
  onSelectEpisode,
  onSelectSubLang,
  onToggleSubtitles,
  onToggleAutoUnlockVip,
  onToggleAutoDownloadOnWatch,
  onChangeVipSourceMode,
  onOpenVipPanel,
  onOpenCoversPanel,
  onEnterMiniPlayer,
  onExpandFromMiniPlayer,
  onDismissMiniPlayer,
  onRestoreMiniPlayer,
  onCycleMiniPlayerCorner,
  onAutoRepairComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const autoDownloadedSetRef = useRef<Set<string>>(new Set());
  const repairAttemptsRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(episodeDuration || 78);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [streamMode, setStreamMode] = useState<'hls' | 'mp4'>('hls');
  const [qualityId, setQualityId] = useState<'sd' | 'qsd' | 'ld'>('sd');
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [previewLockedWithEp1, setPreviewLockedWithEp1] = useState(false);
  const [autoDownloadNotice, setAutoDownloadNotice] = useState<string | null>(null);
  const [isManualDownloading, setIsManualDownloading] = useState(false);
  const [manualDownloadPercent, setManualDownloadPercent] = useState<number>(0);
  const [isCoverDownloading, setIsCoverDownloading] = useState(false);
  const [isAutoRepairing, setIsAutoRepairing] = useState(false);

  // Reset preview override and repair attempt counter when episode changes
  useEffect(() => {
    setPreviewLockedWithEp1(false);
    repairAttemptsRef.current = 0;
  }, [episodeNumber, seasonId]);

  const handleAutoRepair = async (triggerSource: 'manual' | 'watchdog' = 'manual') => {
    if (isAutoRepairing) return;
    setIsAutoRepairing(true);
    const targetSeason = streamData?.seasonId || seasonId;
    const isVipEp = episodeNumber > freeEpisodeCount || Boolean(streamData?.isVipEpisode);

    const decision = diagnoseAndPlanAutoRepair({
      streamMode,
      hasHlsMaster: Boolean(streamData?.hlsMasterUrl),
      errorCount: repairAttemptsRef.current + (triggerSource === 'watchdog' ? 1 : 0),
      isVipEpisode: isVipEp,
      autoUnlockVip,
      videoReadyState: videoRef.current?.readyState ?? 0,
    });
    repairAttemptsRef.current += 1;

    setAutoDownloadNotice(
      uiLang === 'km'
        ? triggerSource === 'watchdog'
          ? `ប្រព័ន្ធកំពុងជួសជុលវីដេអូដោយស្វ័យប្រវត្តិ (EP.${episodeNumber})...`
          : `កំពុងជួសជុលប្រព័ន្ធ និងវីដេអូដោយស្វ័យប្រវត្តិ (EP.${episodeNumber})...`
        : `Auto-repairing stream & cache for EP.${episodeNumber}...`
    );

    try {
      await fetch(
        `/api/vigloo/auto-repair?seasonId=${targetSeason}&episodeNumber=${episodeNumber}&vipMode=${vipSourceMode}`,
        { method: 'POST' }
      );
    } catch {
      // Even if network hiccups, apply client-side stream fallback
    }

    setStreamMode(decision.nextStreamMode);
    onAutoRepairComplete?.();

    const video = videoRef.current;
    if (video) {
      const mp4BustUrl = `/api/vigloo/mp4?seasonId=${targetSeason}&episodeNumber=${episodeNumber}&quality=${qualityId}&vipMode=${vipSourceMode}&repair=${Date.now()}`;
      if (decision.nextStreamMode === 'mp4') {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        video.src = mp4BustUrl;
        video.load();
        video
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }
    }

    setIsAutoRepairing(false);
    setAutoDownloadNotice(
      uiLang === 'km'
        ? `បានជួសជុលកូដ និងវីដេអូ EP.${episodeNumber} ដោយស្វ័យប្រវត្តិរួចរាល់!`
        : `Auto-repaired EP.${episodeNumber} stream & system successfully!`
    );

    setTimeout(() => {
      setAutoDownloadNotice(null);
    }, 4200);
  };

  const handleDownloadCurrentCover = async () => {
    if (isCoverDownloading) return;
    setIsCoverDownloading(true);
    const targetSeason = streamData?.seasonId || seasonId;
    const coverUrl =
      streamData?.posterUrl ||
      `/api/vigloo/thumbnail?seasonId=${targetSeason}&episodeNumber=${episodeNumber}&download=1`;
    const filename = buildEpisodeCoverFilename(targetSeason, episodeNumber);

    setAutoDownloadNotice(
      uiLang === 'km'
        ? `កំពុងទាញយករូបភាពគ្រប ភាគទី ${episodeNumber}...`
        : `Downloading EP.${episodeNumber} cover image...`
    );

    const res = await downloadImageBlobToDevice(coverUrl, filename);
    setIsCoverDownloading(false);

    if (res.ok) {
      setAutoDownloadNotice(
        uiLang === 'km'
          ? `បានរក្សាទុករូបភាពគ្រប EP.${episodeNumber} (${res.sizeFormatted})!`
          : `Saved EP.${episodeNumber} Cover (${res.sizeFormatted})!`
      );
    } else {
      setAutoDownloadNotice(
        uiLang === 'km'
          ? `បរាជ័យក្នុងការទាញយករូបភាពគ្រប៖ ${res.error || 'សូមព្យាយាមម្តងទៀត'}`
          : `Cover download failed: ${res.error || 'Please try again'}`
      );
    }

    setTimeout(() => {
      setAutoDownloadNotice(null);
    }, 3800);
  };

  const handleCaptureVideoFrameCover = async () => {
    const targetSeason = streamData?.seasonId || seasonId;
    const secStamp = Math.floor(currentTime || 0);
    const filename = `vigloo_s${targetSeason}_ep${String(episodeNumber).padStart(2, '0')}_frame_${secStamp}s_cover.jpg`;
    const fallbackPoster =
      streamData?.posterUrl ||
      `/api/vigloo/thumbnail?seasonId=${targetSeason}&episodeNumber=${episodeNumber}`;

    setAutoDownloadNotice(
      uiLang === 'km'
        ? `កំពុងថតរូបភាពគ្របពីវីដេអូ (EP.${episodeNumber})...`
        : `Capturing frame cover from EP.${episodeNumber}...`
    );

    const res = await captureVideoFrameToDevice(videoRef.current, filename, {
      fallbackPosterUrl: fallbackPoster,
      badgeText: `VIGLOO · EP.${String(episodeNumber).padStart(2, '0')} / ${totalEpisodes}`,
      subBadgeText: programTitle,
    });

    if (res.ok) {
      setAutoDownloadNotice(
        uiLang === 'km'
          ? `បានរក្សាទុករូបភាពគ្របពីវីដេអូ EP.${episodeNumber} (${res.sizeFormatted})!`
          : `Saved Frame Cover EP.${episodeNumber} (${res.sizeFormatted})!`
      );
    } else {
      setAutoDownloadNotice(
        uiLang === 'km'
          ? `បរាជ័យក្នុងការថតរូបភាពគ្រប៖ ${res.error}`
          : `Frame capture failed: ${res.error}`
      );
    }

    setTimeout(() => {
      setAutoDownloadNotice(null);
    }, 3800);
  };

  const handleManualDownloadCurrentEpisode = async () => {
    if (!streamData?.downloadUrl || isManualDownloading) return;
    setIsManualDownloading(true);
    setManualDownloadPercent(5);
    const filename = `vigloo_s${streamData.seasonId}_ep${String(streamData.episodeNumber).padStart(2, '0')}.mp4`;

    setAutoDownloadNotice(
      uiLang === 'km'
        ? `កំពុងទាញយក ភាគទី ${streamData.episodeNumber} (.MP4)...`
        : `Downloading EP.${streamData.episodeNumber} (.MP4)...`
    );

    const res = await downloadMp4BlobToDevice(streamData.downloadUrl, filename, (info) => {
      setManualDownloadPercent(info.percent);
      setAutoDownloadNotice(
        uiLang === 'km'
          ? `កំពុងទាញយក EP.${streamData.episodeNumber} (${info.percent}% · ${info.loadedMb})...`
          : `Downloading EP.${streamData.episodeNumber} (${info.percent}% · ${info.loadedMb})...`
      );
    });

    setIsManualDownloading(false);
    if (res.ok) {
      setAutoDownloadNotice(
        uiLang === 'km'
          ? `ទាញយករួចរាល់! EP.${streamData.episodeNumber} (${res.sizeFormatted})`
          : `Saved EP.${streamData.episodeNumber}.mp4 (${res.sizeFormatted})!`
      );
    } else {
      setAutoDownloadNotice(
        uiLang === 'km'
          ? `បរាជ័យក្នុងការទាញយក៖ ${res.error || 'សូមព្យាយាមម្តងទៀត'}`
          : `Download error: ${res.error || 'Please try again'}`
      );
    }
    setTimeout(() => {
      setAutoDownloadNotice(null);
    }, 4000);
  };

  // Trigger Automatic Download on Watch when enabled (using Blob download so iframe never blocks it)
  useEffect(() => {
    if (!autoDownloadOnWatch || !streamData || !streamData.playable || !streamData.downloadUrl) {
      return;
    }
    const epKey = `${streamData.seasonId}:${streamData.episodeNumber}:${streamData.vipMode || 'full-motion'}`;
    if (autoDownloadedSetRef.current.has(epKey)) {
      return;
    }
    autoDownloadedSetRef.current.add(epKey);

    let cancelled = false;
    const filename = `vigloo_s${streamData.seasonId}_ep${String(streamData.episodeNumber).padStart(2, '0')}.mp4`;

    (async () => {
      setAutoDownloadNotice(
        uiLang === 'km'
          ? `កំពុងទាញយកស្វ័យប្រវត្តិ ភាគទី ${streamData.episodeNumber} (.MP4)...`
          : `Auto-downloading EP.${streamData.episodeNumber} (.MP4)...`
      );
      const res = await downloadMp4BlobToDevice(streamData.downloadUrl!, filename, (info) => {
        if (!cancelled) {
          setAutoDownloadNotice(
            uiLang === 'km'
              ? `កំពុងទាញយកស្វ័យប្រវត្តិ EP.${streamData.episodeNumber} (${info.percent}% · ${info.loadedMb})`
              : `Auto-downloading EP.${streamData.episodeNumber} (${info.percent}% · ${info.loadedMb})`
          );
        }
      });
      if (!cancelled) {
        setAutoDownloadNotice(
          res.ok
            ? uiLang === 'km'
              ? `បានរក្សាទុកស្វ័យប្រវត្តិ EP.${streamData.episodeNumber} (${res.sizeFormatted})`
              : `Auto-saved EP.${streamData.episodeNumber} (${res.sizeFormatted})`
            : null
        );
        setTimeout(() => {
          if (!cancelled) setAutoDownloadNotice(null);
        }, 3500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoDownloadOnWatch, streamData, uiLang]);

  // Attach HLS or MP4 stream whenever streamData or streamMode changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamData) return;
    if (streamData.episodeNumber !== episodeNumber || streamData.seasonId !== seasonId) {
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const effectivePlayable = streamData.playable || previewLockedWithEp1;
    if (!effectivePlayable) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setIsPlaying(false);
      return;
    }

    const targetSeasonId = streamData.seasonId || seasonId;
    const targetEp = episodeNumber;
    const activeVipMode = streamData.vipMode || vipSourceMode;
    const hlsUrl =
      streamData.hlsMasterUrl ||
      `/api/vigloo/hls/master.m3u8?seasonId=${targetSeasonId}&episodeNumber=${targetEp}`;
    const mp4Url = `/api/vigloo/mp4?seasonId=${targetSeasonId}&episodeNumber=${targetEp}&quality=${qualityId}&vipMode=${activeVipMode}`;

    const useHls =
      streamMode === 'hls' &&
      Boolean(streamData.hlsMasterUrl) &&
      Hls.isSupported();

    if (useHls) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.playbackRate = playbackRate;
        video
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            video.muted = true;
            setIsMuted(true);
            video
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          hls.destroy();
          hlsRef.current = null;
          setStreamMode('mp4');
        }
      });
    } else {
      video.src = mp4Url;
      video.playbackRate = playbackRate;
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamData, streamMode, qualityId, seasonId, episodeNumber, previewLockedWithEp1, vipSourceMode]);

  // Handle external seek requests (e.g. from clicking a transcript cue or storyboard frame)
  useEffect(() => {
    if (!seekRequest || !videoRef.current) return;
    const video = videoRef.current;
    video.currentTime = seekRequest.time;
    onTimeUpdate(seekRequest.time);
    if (video.paused) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  }, [seekRequest]);

  // Keyboard navigation for Up/Down episodes and Space play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowUp' && episodeNumber > 1) {
        e.preventDefault();
        onSelectEpisode(episodeNumber - 1);
      } else if (e.key === 'ArrowDown' && episodeNumber < totalEpisodes) {
        e.preventDefault();
        onSelectEpisode(episodeNumber + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  const activeCueIdx = findActiveCueIndex(cues, currentTime);
  const activeCue = activeCueIdx >= 0 ? cues[activeCueIdx] : null;

  const isLockedScreen = Boolean(streamData?.locked && !previewLockedWithEp1);
  const isVipEpisode = episodeNumber > freeEpisodeCount || Boolean(streamData?.isVipEpisode);
  const effectiveDuration = duration > 0 ? duration : episodeDuration || 78;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  const cornerPositionClass =
    miniPlayerCorner === 'bottom-left'
      ? 'fixed bottom-5 left-5 z-50'
      : miniPlayerCorner === 'top-left'
        ? 'fixed top-18 left-5 z-50'
        : miniPlayerCorner === 'top-right'
          ? 'fixed top-18 right-5 z-50'
          : 'fixed bottom-5 right-5 z-50';

  const sectionClassName = isMiniPlayer
    ? isMiniPlayerDismissed
      ? 'sr-only pointer-events-none w-0 h-0 overflow-hidden'
      : `${cornerPositionClass} w-[220px] sm:w-[245px] aspect-[9/16] rounded-2xl overflow-hidden bg-black border-2 border-teal-400/50 shadow-[0_24px_60px_rgba(0,0,0,0.9)] transition-all duration-300 select-none`
    : 'relative flex-1 flex items-center justify-center bg-[#09090B] min-h-[540px] lg:h-[calc(100dvh-3.5rem)] select-none overflow-hidden px-4 py-3';

  const containerClassName = isMiniPlayer
    ? 'relative z-10 w-full h-full bg-black flex flex-col justify-between group overflow-hidden'
    : 'relative z-10 h-full max-h-[820px] aspect-[9/16] w-auto max-w-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl flex flex-col justify-between group';

  return (
    <>
      {/* Restore Mini-Player Pill when Mini-Player was manually closed while browsing other views */}
      {isMiniPlayer && isMiniPlayerDismissed && (
        <div
          data-testid="restore-mini-player-bar"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full bg-zinc-900/95 backdrop-blur-md border border-teal-400/40 shadow-2xl"
        >
          <button
            type="button"
            data-testid="restore-mini-player-btn"
            onClick={() => {
              onRestoreMiniPlayer();
              videoRef.current?.play().catch(() => {});
            }}
            className="flex items-center gap-2 text-xs font-semibold text-teal-300 hover:text-teal-200 cursor-pointer whitespace-nowrap"
          >
            <PictureInPicture2 className="w-4 h-4 text-teal-400" />
            <span>
              {uiLang === 'km'
                ? `បើក Mini-Player ឡើងវិញ · EP.${String(episodeNumber).padStart(2, '0')}`
                : `Resume Mini-Player · EP.${String(episodeNumber).padStart(2, '0')}`}
            </span>
          </button>
          <button
            type="button"
            onClick={onExpandFromMiniPlayer}
            className="px-2 py-0.5 rounded-full bg-teal-400 text-zinc-950 text-[11px] font-bold hover:bg-teal-300 cursor-pointer whitespace-nowrap"
          >
            {uiLang === 'km' ? 'អេក្រង់ធំ' : 'Expand'}
          </button>
        </div>
      )}

      <section
        aria-label={isMiniPlayer ? 'Corner Mini-Player' : 'Video Player Stage'}
        data-testid={isMiniPlayer ? 'mini-player-dock' : 'full-player-stage'}
        data-mini-corner={isMiniPlayer ? miniPlayerCorner : undefined}
        className={sectionClassName}
      >
        {/* Ambient subtle backdrop glow from episode thumbnail (Full Stage Only) */}
        {!isMiniPlayer && streamData?.posterUrl && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20 blur-3xl scale-110 bg-center bg-cover"
            style={{ backgroundImage: `url("${streamData.posterUrl}")` }}
          />
        )}

        {/* Top-Left Episode Indicator & Automatic VIP Controls Overlay (Full Stage Only) */}
        {!isMiniPlayer && (
          <div className="absolute top-4 left-6 right-6 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
              <div className="px-3 py-1.5 rounded-lg bg-zinc-900/85 backdrop-blur-md border border-white/10 text-xs font-medium text-zinc-200 flex items-center gap-2">
                <span className="font-mono-tabular font-semibold text-teal-400">
                  EP.{String(episodeNumber).padStart(2, '0')}
                </span>
                <span aria-hidden="true" className="text-zinc-600">
                  /
                </span>
                <span className="font-mono-tabular text-zinc-400">{totalEpisodes}</span>
                {isVipEpisode && (
                  <>
                    <span aria-hidden="true" className="text-zinc-600">
                      ·
                    </span>
                    <span
                      data-testid="vip-status-indicator"
                      className="text-amber-300 font-semibold whitespace-nowrap"
                    >
                      {uiLang === 'km' ? 'VIP ស្វ័យប្រវត្តិ' : 'VIP Auto-Unlocked'}
                    </span>
                  </>
                )}
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="truncate max-w-[160px] sm:max-w-[240px] text-zinc-300">
                  {programTitle}
                </span>
              </div>

              {/* VIP Stream Mode Selector (Full-Motion vs 10-Scene Storyboard) */}
              {isVipEpisode ? (
                <div
                  data-testid="vip-source-mode-selector"
                  className="flex items-center p-0.5 rounded-lg bg-zinc-900/85 backdrop-blur-md border border-amber-400/30"
                >
                  <button
                    type="button"
                    data-testid="vip-mode-full-motion-btn"
                    onClick={() => onChangeVipSourceMode('full-motion')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                      vipSourceMode === 'full-motion'
                        ? 'bg-amber-400 text-zinc-950 font-bold'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{uiLang === 'km' ? 'វីដេអូសកម្មភាពពេញ (24fps)' : 'Full-Motion VIP'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="vip-mode-storyboard-btn"
                    onClick={() => onChangeVipSourceMode('storyboard')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                      vipSourceMode === 'storyboard'
                        ? 'bg-teal-400 text-zinc-950 font-bold'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Film className="w-3 h-3" />
                    <span>{uiLang === 'km' ? 'ឈុតឆាក VIP (10 ឈុត + សំឡេង)' : '10-Scene + Audio'}</span>
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-zinc-900/85 backdrop-blur-md border border-white/10">
                  <button
                    type="button"
                    onClick={() => setStreamMode('hls')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      streamMode === 'hls'
                        ? 'bg-teal-400 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    HLS Stream
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamMode('mp4')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      streamMode === 'mp4'
                        ? 'bg-teal-400 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Direct MP4
                  </button>
                </div>
              )}

              {/* Direct One-Click MP4 Download Button with Live Progress */}
              {streamData?.downloadUrl && (
                <button
                  type="button"
                  onClick={handleManualDownloadCurrentEpisode}
                  disabled={isManualDownloading}
                  data-testid="top-download-mp4-btn"
                  className="px-2.5 py-1.5 rounded-lg bg-teal-400 hover:bg-teal-300 disabled:opacity-60 text-zinc-950 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
                >
                  {isManualDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {uiLang === 'km'
                          ? `កំពុងទាញយក ${manualDownloadPercent}%`
                          : `Saving ${manualDownloadPercent}%`}
                      </span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {uiLang === 'km'
                          ? `ទាញយក EP.${episodeNumber} MP4`
                          : `Download EP.${episodeNumber} MP4`}
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* Auto-Download on Watch Quick Toggle */}
              <button
                type="button"
                onClick={onToggleAutoDownloadOnWatch}
                data-testid="toggle-auto-download-watch"
                className={`px-2.5 py-1.5 rounded-lg backdrop-blur-md border text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  autoDownloadOnWatch
                    ? 'bg-teal-400/20 border-teal-400 text-teal-300 font-semibold'
                    : 'bg-zinc-900/85 border-white/10 text-zinc-300 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                <span>
                  {uiLang === 'km'
                    ? `ទាញយកស្វ័យប្រវត្តិ: ${autoDownloadOnWatch ? 'បើក' : 'បិទ'}`
                    : `Auto-Save MP4: ${autoDownloadOnWatch ? 'ON' : 'OFF'}`}
                </span>
              </button>

              {/* Direct One-Click Cover Image Download Button */}
              <button
                type="button"
                onClick={handleDownloadCurrentCover}
                disabled={isCoverDownloading}
                data-testid="top-download-cover-btn"
                title={uiLang === 'km' ? 'ទាញយករូបភាពគ្របវីដេអូ (Cover JPG)' : 'Download Video Cover Image'}
                className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
              >
                {isCoverDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImageIcon className="w-3.5 h-3.5" />
                )}
                <span>
                  {uiLang === 'km'
                    ? `ទាញយករូបភាពគ្រប EP.${episodeNumber}`
                    : `Download Cover EP.${episodeNumber}`}
                </span>
              </button>

              {/* Capture Live Video Frame as Cover Image Button */}
              <button
                type="button"
                onClick={handleCaptureVideoFrameCover}
                data-testid="top-capture-frame-btn"
                title={uiLang === 'km' ? 'ថតរូបភាពគ្របពីវីដេអូកំពុងចាក់' : 'Capture Current Video Frame as Cover'}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900/85 hover:bg-zinc-800 backdrop-blur-md border border-white/10 text-zinc-200 hover:text-amber-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Camera className="w-3.5 h-3.5 text-amber-300" />
                <span>{uiLang === 'km' ? 'ថតរូបភាពពីវីដេអូ' : 'Capture Frame'}</span>
              </button>

              {/* 1-Click Automatic Code & Stream Self-Repair Button */}
              <button
                type="button"
                onClick={() => handleAutoRepair('manual')}
                disabled={isAutoRepairing}
                data-testid="top-auto-repair-btn"
                title={uiLang === 'km' ? 'ជួសជុលកូដ និងវីដេអូដោយស្វ័យប្រវត្តិ (Auto-Repair)' : 'Auto-Repair Stream & System'}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900/85 hover:bg-zinc-800 disabled:opacity-60 backdrop-blur-md border border-teal-400/40 text-teal-300 hover:text-teal-200 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isAutoRepairing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                ) : (
                  <Wrench className="w-3.5 h-3.5 text-teal-400" />
                )}
                <span>
                  {uiLang === 'km'
                    ? isAutoRepairing
                      ? 'កំពុងជួសជុល...'
                      : 'ជួសជុលស្វ័យប្រវត្តិ'
                    : isAutoRepairing
                      ? 'Repairing...'
                      : 'Auto-Repair'}
                </span>
              </button>

              {/* Enter Corner Mini-Player Mode Button */}
              <button
                type="button"
                onClick={onEnterMiniPlayer}
                data-testid="enter-mini-player-top-btn"
                title={uiLang === 'km' ? 'បង្រួមវីដេអូទៅជ្រុងអេក្រង់ (Mini-Player)' : 'Switch to Corner Mini-Player'}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900/85 hover:bg-zinc-800 backdrop-blur-md border border-white/10 text-zinc-200 hover:text-teal-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <PictureInPicture2 className="w-3.5 h-3.5 text-teal-400" />
                <span>{uiLang === 'km' ? 'បង្រួមអេក្រង់ (Mini-Player)' : 'Mini-Player'}</span>
              </button>
            </div>

            {autoDownloadNotice && (
              <div
                data-testid="download-status-toast"
                className="pointer-events-auto px-3 py-1.5 rounded-lg bg-teal-950/95 border border-teal-400/50 text-teal-200 text-xs font-semibold shadow-lg"
              >
                {autoDownloadNotice}
              </div>
            )}
          </div>
        )}

        {/* Main 9:16 Vertical Video Frame (Shared across Full Stage & Corner Mini-Player) */}
        <div
          ref={containerRef}
          data-testid="vigloo-video-container"
          className={containerClassName}
        >
          {/* Video Element — NEVER unmounted when switching between Full Stage & Mini-Player */}
          <video
            ref={videoRef}
            id="vigloo-player-video"
            data-testid="vigloo-video-element"
            poster={streamData?.posterUrl}
            playsInline
            crossOrigin="anonymous"
            onClick={togglePlayPause}
            onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (e.currentTarget.duration && Number.isFinite(e.currentTarget.duration)) {
                setDuration(e.currentTarget.duration);
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => {
              if (repairAttemptsRef.current < 2) {
                handleAutoRepair('watchdog');
              }
            }}
            onEnded={() => {
              setIsPlaying(false);
              if (autoAdvance && episodeNumber < totalEpisodes) {
                onSelectEpisode(episodeNumber + 1);
              }
            }}
            className="w-full h-full object-contain bg-black cursor-pointer"
          />

          {/* MINI-PLAYER TOP HEADER OVERLAY */}
          {isMiniPlayer && (
            <div
              data-testid="mini-player-header"
              className="absolute top-0 left-0 right-0 z-30 p-2 bg-gradient-to-b from-black/90 via-black/65 to-transparent flex items-center justify-between gap-1"
            >
              <button
                type="button"
                onClick={onExpandFromMiniPlayer}
                title={uiLang === 'km' ? 'ពង្រីកទៅអេក្រង់ធំ' : 'Expand to Main Player'}
                className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer group/title"
              >
                <span className="px-1.5 py-0.5 rounded bg-teal-400 text-zinc-950 font-mono-tabular text-[10px] font-bold shrink-0">
                  EP.{String(episodeNumber).padStart(2, '0')}
                </span>
                {isVipEpisode && (
                  <span className="text-[10px] font-bold text-amber-300 shrink-0">VIP</span>
                )}
                <span className="text-[11px] font-semibold text-white group-hover/title:text-teal-300 truncate">
                  {programTitle}
                </span>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-testid="mini-player-corner-btn"
                  onClick={onCycleMiniPlayerCorner}
                  aria-label="Move mini-player to another corner"
                  title={uiLang === 'km' ? 'ប្តូរជ្រុងអេក្រង់' : 'Move Corner'}
                  className="w-6 h-6 rounded-md bg-black/65 hover:bg-white/20 text-zinc-200 flex items-center justify-center border border-white/10 cursor-pointer"
                >
                  <Move className="w-3 h-3" />
                </button>

                <button
                  type="button"
                  data-testid="mini-player-expand-btn"
                  onClick={onExpandFromMiniPlayer}
                  aria-label="Expand to main player"
                  title={uiLang === 'km' ? 'ពង្រីកទៅអេក្រង់ធំ' : 'Expand to Main Player'}
                  className="w-6 h-6 rounded-md bg-teal-400/20 hover:bg-teal-400 text-teal-300 hover:text-zinc-950 flex items-center justify-center border border-teal-400/40 cursor-pointer transition-colors"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>

                <button
                  type="button"
                  data-testid="mini-player-close-btn"
                  onClick={() => {
                    if (videoRef.current && !videoRef.current.paused) {
                      videoRef.current.pause();
                      setIsPlaying(false);
                    }
                    onDismissMiniPlayer();
                  }}
                  aria-label="Close mini-player"
                  title={uiLang === 'km' ? 'បិទ Mini-Player' : 'Close Mini-Player'}
                  className="w-6 h-6 rounded-md bg-black/65 hover:bg-rose-500/80 text-zinc-300 hover:text-white flex items-center justify-center border border-white/10 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Loading Spinner Overlay */}
          {isLoadingStream && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs">
              <div className="w-8 h-8 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
              <span className="mt-2 text-[11px] font-medium text-zinc-300 text-center px-2">
                {uiLang === 'km'
                  ? isVipEpisode
                    ? `កំពុងបើក VIP EP.${episodeNumber}...`
                    : 'កំពុងផ្ទុកវីដេអូ...'
                  : isVipEpisode
                    ? `Unlocking VIP EP.${episodeNumber}...`
                    : 'Loading stream...'}
              </span>
            </div>
          )}

          {/* Locked Episode Overlay (only shown if user manually disabled Auto-Unlock VIP) */}
          {isLockedScreen && (
            <div className="absolute inset-0 z-30 flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/80 to-black/50 text-center">
              {streamData?.posterUrl && (
                <img
                  src={streamData.posterUrl}
                  alt={`Episode ${episodeNumber} preview`}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover opacity-35 -z-10"
                />
              )}

              <div className="mt-4 flex justify-center">
                <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <Lock className="w-5 h-5" />
                </div>
              </div>

              <div className="my-auto space-y-2.5 px-1">
                <div className="text-[11px] font-semibold tracking-wider text-amber-300 uppercase">
                  Episode {episodeNumber} · Vigloo VIP
                </div>
                <h3 className="text-sm sm:text-lg font-bold text-white leading-snug">
                  {uiLang === 'km'
                    ? `បើកមើលវីដេអូ VIP ភាគទី ${episodeNumber} ដោយស្វ័យប្រវត្តិ`
                    : `Auto-Unlock & Watch VIP Episode ${episodeNumber}`}
                </h3>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={onToggleAutoUnlockVip}
                    className="w-full py-2 px-3 rounded-xl bg-teal-400 hover:bg-teal-300 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {uiLang === 'km'
                        ? 'បើកមើល VIP ស្វ័យប្រវត្តិ'
                        : 'Enable Auto-VIP Stream'}
                    </span>
                  </button>

                  {!isMiniPlayer && (
                    <button
                      type="button"
                      onClick={onOpenVipPanel}
                      className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      <span>
                        {uiLang === 'km'
                          ? 'បើកកម្មវិធីទាញយកភាគ VIP ទាំងអស់'
                          : 'Open Batch VIP Auto-Downloader'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectEpisode(1)}
                    className="w-full py-1.5 px-3 rounded-xl border border-white/15 hover:bg-white/5 text-zinc-300 text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>
                      {uiLang === 'km'
                        ? `ភាគឥតគិតថ្លៃ (1–${freeEpisodeCount})`
                        : `Free Episodes (1–${freeEpisodeCount})`}
                    </span>
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-zinc-400 font-mono-tabular">
                ID: {streamData?.programId} · S:{seasonId}
              </div>
            </div>
          )}

          {/* Center Play Button Overlay when paused */}
          {!isLockedScreen && !isPlaying && !isLoadingStream && (
            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={uiLang === 'km' ? 'លេងវីដេអូ' : 'Play video'}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rounded-full bg-black/65 hover:bg-teal-400 text-white hover:text-zinc-950 border border-white/20 flex items-center justify-center shadow-xl transition-all cursor-pointer ${
                isMiniPlayer ? 'w-11 h-11' : 'w-16 h-16'
              }`}
            >
              <Play className={`${isMiniPlayer ? 'w-5 h-5' : 'w-7 h-7'} fill-current ml-0.5`} />
            </button>
          )}

          {/* Synchronized Live Subtitle Overlay */}
          {!isLockedScreen && subtitlesEnabled && activeCue && (
            <div
              data-testid="live-subtitle-overlay"
              className={`pointer-events-none absolute left-2 right-2 z-20 flex justify-center ${
                isMiniPlayer ? 'bottom-14' : 'bottom-20 left-3 right-3'
              }`}
            >
              <div
                className={`max-w-[94%] rounded-xl bg-black/80 backdrop-blur-xs border border-white/10 text-center shadow-lg ${
                  isMiniPlayer ? 'px-2 py-1' : 'px-3.5 py-2'
                }`}
              >
                {activeCue.speaker && (
                  <span
                    className={`text-teal-300 font-semibold mr-1 ${
                      isMiniPlayer ? 'text-[10px]' : 'text-xs mr-1.5'
                    }`}
                  >
                    [{activeCue.speaker}]
                  </span>
                )}
                <span
                  className={`text-white font-medium leading-snug ${
                    isMiniPlayer ? 'text-[11px] line-clamp-2' : 'text-sm'
                  }`}
                >
                  {activeCue.text}
                </span>
              </div>
            </div>
          )}

          {/* Hover Time Preview Pill (Full Stage Only) */}
          {!isMiniPlayer && hoverTime !== null && !isLockedScreen && (
            <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 z-30 bg-black/85 border border-white/15 rounded-full px-3.5 py-1 flex items-center gap-2 text-xs font-mono-tabular">
              <span className="text-white font-semibold">{formatDuration(hoverTime)}</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">{formatDuration(effectiveDuration)}</span>
            </div>
          )}

          {/* MINI-PLAYER COMPACT BOTTOM CONTROLS */}
          {isMiniPlayer && !isLockedScreen && (
            <div
              data-testid="mini-player-controls"
              className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-5 pb-2 px-2.5 flex flex-col gap-1.5"
            >
              <input
                type="range"
                aria-label="Seek mini-player timeline"
                min={0}
                max={effectiveDuration}
                step={0.1}
                value={Math.min(currentTime, effectiveDuration)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onTimeUpdate(val);
                  if (videoRef.current) {
                    videoRef.current.currentTime = val;
                  }
                }}
                className="w-full h-1 bg-white/25 rounded-lg appearance-none cursor-pointer accent-teal-400"
                style={{
                  background: `linear-gradient(to right, #2DD4BF ${progressPercent}%, rgba(255,255,255,0.25) ${progressPercent}%)`,
                }}
              />

              <div className="flex items-center justify-between gap-1 text-[11px] text-white">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid="mini-player-play-pause"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="w-6 h-6 rounded hover:bg-white/15 flex items-center justify-center cursor-pointer"
                  >
                    {isPlaying ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    className="w-6 h-6 rounded hover:bg-white/15 flex items-center justify-center cursor-pointer"
                  >
                    {isMuted ? (
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <span className="font-mono-tabular text-[10px] text-zinc-300 whitespace-nowrap">
                    {formatDuration(currentTime)}/{formatDuration(effectiveDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={episodeNumber <= 1}
                    onClick={() => episodeNumber > 1 && onSelectEpisode(episodeNumber - 1)}
                    aria-label="Previous Episode"
                    title="Previous Episode"
                    className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center cursor-pointer"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={episodeNumber >= totalEpisodes}
                    onClick={() => episodeNumber < totalEpisodes && onSelectEpisode(episodeNumber + 1)}
                    aria-label="Next Episode"
                    title="Next Episode"
                    className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center cursor-pointer"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FULL STAGE BOTTOM PLAYER CONTROLS BAR */}
          {!isMiniPlayer && !isLockedScreen && (
            <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/95 via-black/75 to-transparent pt-8 pb-3 px-3.5 flex flex-col gap-2">
              {/* Scrubber / Range Input */}
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  aria-label="Seek video timeline"
                  min={0}
                  max={effectiveDuration}
                  step={0.1}
                  value={Math.min(currentTime, effectiveDuration)}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onTimeUpdate(val);
                    if (videoRef.current) {
                      videoRef.current.currentTime = val;
                    }
                  }}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                    setHoverTime(ratio * effectiveDuration);
                  }}
                  onMouseLeave={() => setHoverTime(null)}
                  className="w-full h-1.5 bg-white/25 rounded-lg appearance-none cursor-pointer accent-teal-400"
                  style={{
                    background: `linear-gradient(to right, #2DD4BF ${progressPercent}%, rgba(255,255,255,0.25) ${progressPercent}%)`,
                  }}
                />
              </div>

              {/* Transport Action Row */}
              <div className="flex items-center justify-between gap-2 text-xs text-white">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <span className="font-mono-tabular text-[11px] text-zinc-300 whitespace-nowrap">
                    {formatDuration(currentTime)} <span className="text-zinc-500">/</span>{' '}
                    {formatDuration(effectiveDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-1 relative">
                  {/* Quality Switch */}
                  <button
                    type="button"
                    onClick={() =>
                      setQualityId((prev) => (prev === 'sd' ? 'qsd' : prev === 'qsd' ? 'ld' : 'sd'))
                    }
                    aria-label="Toggle video quality"
                    className="px-2 py-1 rounded-md hover:bg-white/10 text-[11px] font-mono-tabular text-zinc-200 uppercase cursor-pointer"
                  >
                    {qualityId === 'sd' ? '854p SD' : qualityId === 'qsd' ? '480p' : '240p'}
                  </button>

                  {/* Playback Speed */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSpeedMenu((s) => !s);
                        setShowSubMenu(false);
                      }}
                      aria-label="Playback speed"
                      className="px-2 py-1 rounded-md hover:bg-white/10 text-[11px] font-mono-tabular text-zinc-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Gauge className="w-3.5 h-3.5 text-teal-400" />
                      <span>{playbackRate}x</span>
                    </button>

                    {showSpeedMenu && (
                      <div className="absolute bottom-9 right-0 w-24 rounded-xl bg-zinc-900/95 border border-white/15 py-1 shadow-xl z-40">
                        {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => handleSpeedChange(r)}
                            className={`w-full px-3 py-1.5 text-left text-xs font-mono-tabular hover:bg-white/10 cursor-pointer ${
                              playbackRate === r ? 'text-teal-400 font-semibold' : 'text-zinc-300'
                            }`}
                          >
                            {r}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Subtitle Menu Trigger */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubMenu((s) => !s);
                        setShowSpeedMenu(false);
                      }}
                      aria-label="Subtitle settings"
                      className={`w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer ${
                        subtitlesEnabled ? 'text-teal-400' : 'text-zinc-400'
                      }`}
                    >
                      <Subtitles className="w-4 h-4" />
                    </button>

                    {showSubMenu && (
                      <div className="absolute bottom-9 right-0 w-44 max-h-60 overflow-y-auto custom-scrollbar rounded-xl bg-zinc-900/95 border border-white/15 py-1.5 shadow-xl z-40">
                        <button
                          type="button"
                          onClick={() => {
                            onToggleSubtitles();
                            setShowSubMenu(false);
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-white/10 text-zinc-200 border-b border-white/10 cursor-pointer"
                        >
                          {subtitlesEnabled
                            ? uiLang === 'km'
                              ? 'បិទអក្សររត់ (Turn Off)'
                              : 'Turn Off Subtitles'
                            : uiLang === 'km'
                              ? 'បើកអក្សររត់ (Turn On)'
                              : 'Turn On Subtitles'}
                        </button>
                        {(streamData?.subtitles || [{ lang: 'eng', name: 'English' }]).map((sub) => (
                          <button
                            key={sub.lang}
                            type="button"
                            onClick={() => {
                              onSelectSubLang(sub.lang);
                              setShowSubMenu(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-white/10 cursor-pointer flex items-center justify-between ${
                              selectedSubLang === sub.lang && subtitlesEnabled
                                ? 'text-teal-400 font-semibold'
                                : 'text-zinc-300'
                            }`}
                          >
                            <span>{sub.name}</span>
                            <span className="text-[10px] text-zinc-500 uppercase font-mono-tabular">
                              {sub.lang}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Download Cover Image Button */}
                  <button
                    type="button"
                    data-testid="player-download-cover-btn"
                    onClick={handleDownloadCurrentCover}
                    disabled={isCoverDownloading}
                    aria-label="Download Video Cover Image"
                    title={uiLang === 'km' ? 'ទាញយករូបភាពគ្របវីដេអូ (Cover JPG)' : 'Download Cover Image'}
                    className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-zinc-200 hover:text-amber-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isCoverDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-amber-300" />
                    )}
                  </button>

                  {/* Download MP4 Button (Blob Download for Iframe Reliability) */}
                  {streamData?.downloadUrl && (
                    <button
                      type="button"
                      data-testid="player-download-mp4-btn"
                      onClick={handleManualDownloadCurrentEpisode}
                      disabled={isManualDownloading}
                      aria-label="Download MP4 video"
                      title={uiLang === 'km' ? 'ទាញយកវីដេអូ MP4' : 'Download MP4'}
                      className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-zinc-200 hover:text-teal-400 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isManualDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {/* Switch to Corner Mini-Player Mode */}
                  <button
                    type="button"
                    data-testid="enter-mini-player-btn"
                    onClick={onEnterMiniPlayer}
                    aria-label="Mini-Player Mode"
                    title={uiLang === 'km' ? 'បង្រួមទៅជ្រុងអេក្រង់ (Mini-Player)' : 'Mini-Player Mode'}
                    className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-zinc-200 hover:text-teal-400 transition-colors cursor-pointer"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>

                  {/* Fullscreen */}
                  <button
                    type="button"
                    onClick={handleFullscreen}
                    aria-label="Toggle fullscreen"
                    className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-zinc-200 transition-colors cursor-pointer"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right-Side Floating Up / Down Episode Navigation Buttons (Full Stage Only) */}
        {!isMiniPlayer && (
          <div className="hidden sm:flex flex-col gap-3 absolute right-6 bottom-8 z-20">
            <button
              type="button"
              disabled={episodeNumber <= 1}
              onClick={() => episodeNumber > 1 && onSelectEpisode(episodeNumber - 1)}
              aria-label="Previous Episode"
              className={`w-12 h-12 rounded-full flex items-center justify-center border border-white/10 transition-all ${
                episodeNumber <= 1
                  ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                  : 'bg-zinc-800/80 hover:bg-zinc-700 text-white cursor-pointer shadow-lg'
              }`}
            >
              <ChevronUp className="w-5 h-5" />
            </button>

            <button
              type="button"
              disabled={episodeNumber >= totalEpisodes}
              onClick={() => episodeNumber < totalEpisodes && onSelectEpisode(episodeNumber + 1)}
              aria-label="Next Episode"
              className={`w-12 h-12 rounded-full flex items-center justify-center border border-white/10 transition-all ${
                episodeNumber >= totalEpisodes
                  ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                  : 'bg-zinc-800/80 hover:bg-zinc-700 text-white cursor-pointer shadow-lg'
              }`}
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        )}
      </section>
    </>
  );
};

