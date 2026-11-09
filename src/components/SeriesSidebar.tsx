import React, { useState, useRef, useEffect } from 'react';
import {
  Bookmark,
  Share2,
  Lock,
  Crown,
  Check,
  Search,
  Play,
  Download,
  Globe,
  ExternalLink,
  Sparkles,
  Loader2,
  CheckCircle2,
  Square,
  Film,
  KeyRound,
  Image as ImageIcon,
  Camera,
  Wrench,
  ShieldCheck,
  Flame,
  Trophy,
  Compass,
  Layers,
} from 'lucide-react';
import {
  ViglooProgramDetails,
  ViglooRecommendedItem,
} from '../data/fallbackProgram';
import {
  SubtitleCue,
  formatCompactNumber,
  findActiveCueIndex,
  buildBatchDownloadPlan,
  VipStreamSourceMode,
  buildEpisodeCoverFilename,
  buildSeriesCoverAssets,
  CoverAssetItem,
  AutoRepairServerReport,
  ViglooCatalogItem,
  ViglooCatalogSectionId,
  filterAndSortCatalogBySection,
  extractCatalogCategories,
} from '../utils/viglooParser';
import {
  downloadMp4BlobToDevice,
  downloadImageBlobToDevice,
  captureVideoFrameToDevice,
} from '../utils/downloadHelper';
import { StreamData } from './VideoStage';

export type SidebarTab = 'episodes' | 'covers' | 'vip' | 'script' | 'recommended' | 'saved';

export interface PreparedMp4Info {
  episodeNumber: number;
  status: 'idle' | 'queued' | 'preparing' | 'downloading' | 'ready' | 'error';
  progressPercent?: number;
  sizeFormatted?: string;
  downloadUrl?: string;
  mp4Url?: string;
  isVipSynthesized?: boolean;
  error?: string;
}

interface SeriesSidebarProps {
  program: ViglooProgramDetails;
  activeEpisode: number;
  activeTab: SidebarTab;
  cues: SubtitleCue[];
  currentTime: number;
  streamData: StreamData | null;
  selectedSubLang: string;
  isBookmarked: boolean;
  savedPrograms: ViglooRecommendedItem[];
  autoAdvance: boolean;
  autoUnlockVip: boolean;
  autoDownloadOnWatch: boolean;
  vipSourceMode: VipStreamSourceMode;
  vipToken: string;
  isExpandedWorkspace: boolean;
  uiLang: 'km' | 'en';
  onChangeTab: (tab: SidebarTab) => void;
  onSelectEpisode: (episodeNumber: number) => void;
  onSeekToCue: (seconds: number) => void;
  onSelectSubLang: (lang: string) => void;
  onToggleBookmark: () => void;
  onSelectRecommendedProgram: (programId: number) => void;
  onOpenSeriesVipBatch?: (programId: number) => void;
  onToggleAutoAdvance: () => void;
  onToggleAutoUnlockVip: () => void;
  onToggleAutoDownloadOnWatch: () => void;
  onChangeVipSourceMode: (mode: VipStreamSourceMode) => void;
  onChangeVipToken: (token: string) => void;
  onToggleUiLang: () => void;
  onReturnToPlayer: () => void;
  onAutoRepairComplete?: () => void;
}

export const SeriesSidebar: React.FC<SeriesSidebarProps> = ({
  program,
  activeEpisode,
  activeTab,
  cues,
  currentTime,
  streamData,
  selectedSubLang,
  isBookmarked,
  savedPrograms,
  autoAdvance,
  autoUnlockVip,
  autoDownloadOnWatch,
  vipSourceMode,
  vipToken,
  isExpandedWorkspace,
  uiLang,
  onChangeTab,
  onSelectEpisode,
  onSeekToCue,
  onSelectSubLang,
  onToggleBookmark,
  onSelectRecommendedProgram,
  onOpenSeriesVipBatch,
  onToggleAutoAdvance,
  onToggleAutoUnlockVip,
  onToggleAutoDownloadOnWatch,
  onChangeVipSourceMode,
  onChangeVipToken,
  onToggleUiLang,
  onReturnToPlayer,
  onAutoRepairComplete,
}) => {
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [episodeFilter, setEpisodeFilter] = useState<'all' | 'free' | 'vip'>('all');
  const [scriptSearch, setScriptSearch] = useState('');
  const [copiedShare, setCopiedShare] = useState(false);
  const [titleImgError, setTitleImgError] = useState(false);

  // Batch VIP Auto-Downloader State
  const [batchMode, setBatchMode] = useState<'vip' | 'free' | 'all' | 'range'>('vip');
  const [rangeStart, setRangeStart] = useState<number>(6);
  const [rangeEnd, setRangeEnd] = useState<number>(12);
  const [autoSaveBrowserFiles, setAutoSaveBrowserFiles] = useState<boolean>(true);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [preparedMap, setPreparedMap] = useState<Record<number, PreparedMp4Info>>({});
  const [showTokenInput, setShowTokenInput] = useState<boolean>(false);
  const [activeEpDownloading, setActiveEpDownloading] = useState<boolean>(false);
  const [activeEpDownloadPercent, setActiveEpDownloadPercent] = useState<number>(0);
  const [activeEpDownloadDone, setActiveEpDownloadDone] = useState<string | null>(null);
  const abortBatchRef = useRef<boolean>(false);

  // Cover Image Downloader State
  const [activeCoverDownloading, setActiveCoverDownloading] = useState<boolean>(false);
  const [activeCoverDone, setActiveCoverDone] = useState<string | null>(null);
  const [coverStatusMap, setCoverStatusMap] = useState<
    Record<string, { status: 'downloading' | 'saved' | 'error'; size?: string }>
  >({});
  const [isDownloadingAllScenes, setIsDownloadingAllScenes] = useState<boolean>(false);
  const [isBatchCoverRunning, setIsBatchCoverRunning] = useState<boolean>(false);
  const [batchCoverDoneCount, setBatchCoverDoneCount] = useState<number>(0);
  const [coverEpisodeFilter, setCoverEpisodeFilter] = useState<'all' | 'free' | 'vip'>('all');
  const [frameCaptureStatus, setFrameCaptureStatus] = useState<string | null>(null);
  const abortCoverBatchRef = useRef<boolean>(false);

  // Automatic Code & Stream Self-Repair State
  const [isAutoRepairing, setIsAutoRepairing] = useState<boolean>(false);
  const [autoRepairReport, setAutoRepairReport] = useState<AutoRepairServerReport | null>(null);

  // Vigloo All-Section Catalog (Hot, New, Picks, Ranking, Asian, Categories) State
  const [catalogItems, setCatalogItems] = useState<ViglooCatalogItem[]>(() => [
    {
      id: program.id,
      seasonId: program.seasonId,
      programCode: program.programCode || 'US000P87S01',
      title: program.title,
      subTitle: program.subTitle,
      synopsis: program.synopsis,
      posterUrl: program.posterUrl,
      titleImage: program.titleImage,
      episodeCount: program.episodeCount,
      appFreeEpCount: program.appFreeEpCount,
      viewCount: program.viewCount,
      likeCount: program.likeCount,
      bookmarkCount: program.bookmarkCount,
      releaseDate: program.releaseDate,
      genres: program.genres,
      tags: program.metaTags,
      isNewBadge: false,
      isAsian: false,
      countryCode: 'US',
    },
    ...program.recommended.map((rec, idx) => ({
      id: rec.id,
      seasonId: rec.seasonId,
      programCode: idx % 2 === 0 ? `US00${idx}` : `KR00${idx}`,
      title: rec.title,
      subTitle: rec.subTitle || '',
      synopsis: rec.synopsis,
      posterUrl: rec.thumbnail,
      titleImage: rec.titleImage,
      episodeCount: rec.episodeCount,
      appFreeEpCount: rec.appFreeEpCount,
      viewCount: rec.viewCount || 3500000,
      likeCount: 95000,
      bookmarkCount: 180000,
      releaseDate: '2026-10-15',
      genres: rec.genres,
      tags: rec.tags,
      isNewBadge: idx < 2,
      isAsian: idx % 2 === 1,
      countryCode: idx % 2 === 0 ? 'US' : 'KR',
    })),
  ]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);
  const [catalogSection, setCatalogSection] = useState<ViglooCatalogSectionId>('hot');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('All');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [catalogBatchLimit, setCatalogBatchLimit] = useState<number>(5);
  const [isCatalogBatchRunning, setIsCatalogBatchRunning] = useState<boolean>(false);
  const [catalogBatchDoneCount, setCatalogBatchDoneCount] = useState<number>(0);
  const [catalogDownloadMap, setCatalogDownloadMap] = useState<
    Record<
      number,
      {
        status: 'idle' | 'preparing' | 'downloading' | 'saved' | 'error';
        percent?: number;
        size?: string;
      }
    >
  >({});
  const abortCatalogBatchRef = useRef<boolean>(false);

  // Load full 199-series Vigloo catalog from /api/vigloo/catalog on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoadingCatalog(true);
    (async () => {
      try {
        const res = await fetch('/api/vigloo/catalog');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && Array.isArray(json?.items) && json.items.length > 0) {
          setCatalogItems(json.items);
        }
      } catch {
        // Keep seeded catalog items
      } finally {
        if (!cancelled) {
          setIsLoadingCatalog(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownloadCatalogSeriesMp4 = async (item: ViglooCatalogItem) => {
    const cur = catalogDownloadMap[item.id];
    if (cur?.status === 'preparing' || cur?.status === 'downloading') return false;

    setCatalogDownloadMap((prev) => ({
      ...prev,
      [item.id]: { status: 'preparing', percent: 10 },
    }));

    try {
      const res = await fetch(
        `/api/vigloo/prepare-mp4?seasonId=${item.seasonId}&episodeNumber=1&quality=sd&vipMode=${vipSourceMode}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok || !data.downloadUrl) {
        throw new Error(data?.error || 'Failed to prepare MP4');
      }

      setCatalogDownloadMap((prev) => ({
        ...prev,
        [item.id]: { status: 'downloading', percent: 25, size: data.sizeFormatted },
      }));

      const safeSlug = item.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 28);
      const filename = `vigloo_${safeSlug || item.id}_s${item.seasonId}_ep01.mp4`;

      const dlRes = await downloadMp4BlobToDevice(data.downloadUrl, filename, (prog) => {
        setCatalogDownloadMap((prev) => ({
          ...prev,
          [item.id]: { status: 'downloading', percent: prog.percent, size: prog.loadedMb },
        }));
      });

      if (!dlRes.ok) {
        throw new Error(dlRes.error || 'Download failed');
      }

      setCatalogDownloadMap((prev) => ({
        ...prev,
        [item.id]: { status: 'saved', percent: 100, size: dlRes.sizeFormatted },
      }));
      return true;
    } catch {
      setCatalogDownloadMap((prev) => ({
        ...prev,
        [item.id]: { status: 'error' },
      }));
      return false;
    }
  };

  const displayedCatalogItems = filterAndSortCatalogBySection(
    catalogItems,
    catalogSection,
    selectedCategoryName,
    catalogSearch
  );
  const catalogCategoryChips = extractCatalogCategories(catalogItems);

  const handleBatchDownloadCatalogSection = async () => {
    if (isCatalogBatchRunning) {
      abortCatalogBatchRef.current = true;
      setIsCatalogBatchRunning(false);
      return;
    }

    const targets =
      catalogBatchLimit > 0
        ? displayedCatalogItems.slice(0, catalogBatchLimit)
        : displayedCatalogItems;
    if (targets.length === 0) return;

    abortCatalogBatchRef.current = false;
    setIsCatalogBatchRunning(true);
    setCatalogBatchDoneCount(0);

    let done = 0;
    for (const item of targets) {
      if (abortCatalogBatchRef.current) break;
      await handleDownloadCatalogSeriesMp4(item);
      done += 1;
      setCatalogBatchDoneCount(done);
    }

    setIsCatalogBatchRunning(false);
  };

  const handleRunSystemAutoRepair = async () => {
    if (isAutoRepairing) return;
    setIsAutoRepairing(true);
    try {
      const res = await fetch(
        `/api/vigloo/auto-repair?seasonId=${program.seasonId}&episodeNumber=${activeEpisode}&vipMode=${vipSourceMode}`,
        { method: 'POST' }
      );
      if (res.ok) {
        const report: AutoRepairServerReport = await res.json();
        setAutoRepairReport(report);
      }
      onAutoRepairComplete?.();
    } catch {
      onAutoRepairComplete?.();
    } finally {
      setIsAutoRepairing(false);
    }
  };

  // Reset title image error when program changes
  useEffect(() => {
    setTitleImgError(false);
  }, [program.id]);

  const activeCueIndex = findActiveCueIndex(cues, currentTime);

  const handleCopyShareLink = () => {
    const shareUrl = `https://www.vigloo.com/en/video/${program.id}?episode=${activeEpisode}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const handleDownloadActiveCover = async () => {
    if (activeCoverDownloading) return;
    setActiveCoverDownloading(true);
    setActiveCoverDone(null);

    const coverUrl =
      streamData?.posterUrl ||
      `/api/vigloo/thumbnail?seasonId=${program.seasonId}&episodeNumber=${activeEpisode}&download=1`;
    const filename = buildEpisodeCoverFilename(program.seasonId, activeEpisode);

    const res = await downloadImageBlobToDevice(coverUrl, filename);
    setActiveCoverDownloading(false);

    if (res.ok) {
      setActiveCoverDone(res.sizeFormatted);
      setCoverStatusMap((prev) => ({
        ...prev,
        [`ep-${activeEpisode}-main-cover`]: { status: 'saved', size: res.sizeFormatted },
      }));
      setTimeout(() => setActiveCoverDone(null), 4000);
    }
  };

  const handleDownloadCoverAsset = async (item: CoverAssetItem) => {
    if (coverStatusMap[item.id]?.status === 'downloading') return;
    setCoverStatusMap((prev) => ({
      ...prev,
      [item.id]: { status: 'downloading' },
    }));

    const res = await downloadImageBlobToDevice(item.downloadUrl, item.filename);
    setCoverStatusMap((prev) => ({
      ...prev,
      [item.id]: res.ok
        ? { status: 'saved', size: res.sizeFormatted }
        : { status: 'error' },
    }));
  };

  const handleDownloadSingleEpisodeCover = async (epNum: number) => {
    const itemId = `ep-grid-cover-${epNum}`;
    if (coverStatusMap[itemId]?.status === 'downloading') return;
    setCoverStatusMap((prev) => ({
      ...prev,
      [itemId]: { status: 'downloading' },
    }));

    const coverUrl = `/api/vigloo/thumbnail?seasonId=${program.seasonId}&episodeNumber=${epNum}&download=1`;
    const filename = buildEpisodeCoverFilename(program.seasonId, epNum);
    const res = await downloadImageBlobToDevice(coverUrl, filename);
    setCoverStatusMap((prev) => ({
      ...prev,
      [itemId]: res.ok ? { status: 'saved', size: res.sizeFormatted } : { status: 'error' },
    }));
    return res.ok;
  };

  const handleCaptureLiveVideoFrameCover = async () => {
    const videoEl = document.getElementById('vigloo-player-video') as HTMLVideoElement | null;
    const secStamp = Math.floor(currentTime || 0);
    const filename = `vigloo_s${program.seasonId}_ep${String(activeEpisode).padStart(2, '0')}_frame_${secStamp}s_cover.jpg`;
    const fallbackPoster =
      streamData?.posterUrl ||
      `/api/vigloo/thumbnail?seasonId=${program.seasonId}&episodeNumber=${activeEpisode}`;

    setFrameCaptureStatus(
      uiLang === 'km' ? 'កំពុងថតរូបភាពគ្របពីវីដេអូ...' : 'Capturing frame...'
    );

    const res = await captureVideoFrameToDevice(videoEl, filename, {
      fallbackPosterUrl: fallbackPoster,
      badgeText: `VIGLOO · EP.${String(activeEpisode).padStart(2, '0')} / ${program.episodeCount}`,
      subBadgeText: program.title,
    });

    if (res.ok) {
      setFrameCaptureStatus(
        uiLang === 'km'
          ? `បានរក្សាទុក (${res.resolution} · ${res.sizeFormatted})!`
          : `Saved (${res.resolution} · ${res.sizeFormatted})!`
      );
    } else {
      setFrameCaptureStatus(
        uiLang === 'km' ? 'បរាជ័យក្នុងការថតរូបភាព' : 'Capture failed'
      );
    }
    setTimeout(() => setFrameCaptureStatus(null), 4000);
  };

  const coverAssets = buildSeriesCoverAssets({
    programId: program.id,
    seasonId: program.seasonId,
    episodeNumber: activeEpisode,
    posterUrl: program.posterUrl,
    thumbnailExpanded: program.thumbnailExpanded,
    titleImage: program.titleImage,
    storyboardFrames: streamData?.storyboardFrames || [],
  });

  const primarySeriesCovers = coverAssets.filter((a) => a.kind !== 'episode-scene');
  const sceneCoverAssets = coverAssets.filter((a) => a.kind === 'episode-scene');

  const handleDownloadAllSceneCovers = async () => {
    if (isDownloadingAllScenes || sceneCoverAssets.length === 0) return;
    setIsDownloadingAllScenes(true);
    for (const sceneItem of sceneCoverAssets) {
      await handleDownloadCoverAsset(sceneItem);
    }
    setIsDownloadingAllScenes(false);
  };

  const filteredCoverEpisodes = program.episodes.filter((ep) => {
    const isFree = ep.price === 0 || ep.episodeNumber <= program.appFreeEpCount;
    if (coverEpisodeFilter === 'free') return isFree;
    if (coverEpisodeFilter === 'vip') return !isFree;
    return true;
  });

  const handleBatchDownloadEpisodeCovers = async () => {
    if (isBatchCoverRunning) {
      abortCoverBatchRef.current = true;
      setIsBatchCoverRunning(false);
      return;
    }

    abortCoverBatchRef.current = false;
    setIsBatchCoverRunning(true);
    setBatchCoverDoneCount(0);

    let done = 0;
    for (const ep of filteredCoverEpisodes) {
      if (abortCoverBatchRef.current) break;
      await handleDownloadSingleEpisodeCover(ep.episodeNumber);
      done++;
      setBatchCoverDoneCount(done);
    }

    setIsBatchCoverRunning(false);
  };

  const handleDownloadActiveEpisode = async () => {
    if (!streamData?.downloadUrl || activeEpDownloading) return;
    setActiveEpDownloading(true);
    setActiveEpDownloadPercent(5);
    setActiveEpDownloadDone(null);

    const filename = `vigloo_s${program.seasonId}_ep${String(activeEpisode).padStart(2, '0')}_sd.mp4`;
    const res = await downloadMp4BlobToDevice(streamData.downloadUrl, filename, (prog) => {
      setActiveEpDownloadPercent(prog.percent);
    });

    setActiveEpDownloading(false);
    if (res.ok) {
      setActiveEpDownloadDone(res.sizeFormatted);
      setPreparedMap((prev) => ({
        ...prev,
        [activeEpisode]: {
          episodeNumber: activeEpisode,
          status: 'ready',
          progressPercent: 100,
          sizeFormatted: res.sizeFormatted,
          downloadUrl: streamData.downloadUrl,
          mp4Url: streamData.mp4Url,
        },
      }));
      setTimeout(() => setActiveEpDownloadDone(null), 4000);
    }
  };

  const filteredEpisodes = program.episodes.filter((ep) => {
    const isFree = ep.price === 0 || ep.episodeNumber <= program.appFreeEpCount;
    if (episodeFilter === 'free') return isFree;
    if (episodeFilter === 'vip') return !isFree;
    return true;
  });

  const filteredCues = scriptSearch.trim()
    ? cues.filter(
        (c) =>
          c.text.toLowerCase().includes(scriptSearch.toLowerCase()) ||
          (c.speaker && c.speaker.toLowerCase().includes(scriptSearch.toLowerCase()))
      )
    : cues;

  const batchPlan = buildBatchDownloadPlan(
    program.episodes.map((e) => ({
      episodeNumber: e.episodeNumber,
      price: e.episodeNumber <= program.appFreeEpCount ? 0 : e.price || 50,
      duration: e.duration,
    })),
    batchMode,
    rangeStart,
    rangeEnd
  );

  const prepareSingleEpisodeMp4 = async (epNum: number, autoTriggerSave: boolean) => {
    setPreparedMap((prev) => ({
      ...prev,
      [epNum]: { episodeNumber: epNum, status: 'preparing', progressPercent: 10 },
    }));

    try {
      const tokenParam = vipToken.trim() ? `&token=${encodeURIComponent(vipToken.trim())}` : '';
      const res = await fetch(
        `/api/vigloo/prepare-mp4?seasonId=${program.seasonId}&episodeNumber=${epNum}&quality=sd&vipMode=${vipSourceMode}${tokenParam}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to prepare MP4');
      }

      if (autoTriggerSave && data.downloadUrl) {
        setPreparedMap((prev) => ({
          ...prev,
          [epNum]: {
            episodeNumber: epNum,
            status: 'downloading',
            progressPercent: 25,
            sizeFormatted: data.sizeFormatted,
            downloadUrl: data.downloadUrl,
            mp4Url: data.mp4Url,
            isVipSynthesized: data.isVipSynthesized,
          },
        }));

        const filename =
          data.filename || `vigloo_s${program.seasonId}_ep${String(epNum).padStart(2, '0')}_sd.mp4`;
        await downloadMp4BlobToDevice(data.downloadUrl, filename, (prog) => {
          setPreparedMap((prev) => ({
            ...prev,
            [epNum]: {
              ...prev[epNum],
              episodeNumber: epNum,
              status: 'downloading',
              progressPercent: prog.percent,
              sizeFormatted: prog.loadedMb,
            },
          }));
        });
      }

      const info: PreparedMp4Info = {
        episodeNumber: epNum,
        status: 'ready',
        progressPercent: 100,
        sizeFormatted: data.sizeFormatted,
        downloadUrl: data.downloadUrl,
        mp4Url: data.mp4Url,
        isVipSynthesized: data.isVipSynthesized,
      };

      setPreparedMap((prev) => ({
        ...prev,
        [epNum]: info,
      }));

      return info;
    } catch (err: any) {
      setPreparedMap((prev) => ({
        ...prev,
        [epNum]: {
          episodeNumber: epNum,
          status: 'error',
          error: err?.message || 'Error',
        },
      }));
      return null;
    }
  };

  const handleStartBatchDownload = async () => {
    if (isBatchRunning) {
      abortBatchRef.current = true;
      setIsBatchRunning(false);
      return;
    }

    const targetEps = batchPlan.episodes.map((e) => e.episodeNumber);
    if (targetEps.length === 0) return;

    abortBatchRef.current = false;
    setIsBatchRunning(true);

    // Mark target episodes as queued if not already ready
    setPreparedMap((prev) => {
      const next = { ...prev };
      for (const epNum of targetEps) {
        if (next[epNum]?.status !== 'ready') {
          next[epNum] = { episodeNumber: epNum, status: 'queued' };
        }
      }
      return next;
    });

    for (const epNum of targetEps) {
      if (abortBatchRef.current) break;
      await prepareSingleEpisodeMp4(epNum, autoSaveBrowserFiles);
    }

    setIsBatchRunning(false);
  };

  const readyCountInPlan = batchPlan.episodes.filter(
    (e) => preparedMap[e.episodeNumber]?.status === 'ready'
  ).length;

  return (
    <aside
      aria-label="Series Details and Episode Selector"
      data-testid="series-workspace-panel"
      data-expanded={isExpandedWorkspace ? 'true' : 'false'}
      className={
        isExpandedWorkspace
          ? 'w-full flex-1 lg:h-[calc(100dvh-3.5rem)] bg-[#09090B] flex flex-col overflow-y-auto custom-scrollbar pb-24'
          : 'w-full lg:w-[460px] xl:w-[480px] lg:h-[calc(100dvh-3.5rem)] bg-[#0E0E12] border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col shrink-0 overflow-y-auto custom-scrollbar'
      }
    >
      <div className={isExpandedWorkspace ? 'w-full max-w-5xl mx-auto flex flex-col flex-1' : 'w-full flex flex-col flex-1'}>
        {/* Top Series Header Block (matching Vigloo reference) */}
        <div className="px-6 pt-5 pb-4 flex flex-col items-center text-center">
          {/* Toolbar row: Vigloo Original mark + Return to Main Player + UI Language Toggle */}
          <div className="w-full flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-teal-400 uppercase">
                <span>V</span>
                <span className="text-white">ORIGINAL</span>
              </div>

              {isExpandedWorkspace && (
                <button
                  type="button"
                  data-testid="workspace-return-to-player-btn"
                  onClick={onReturnToPlayer}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-teal-400 text-zinc-950 hover:bg-teal-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {uiLang === 'km' ? 'ត្រឡប់ទៅអេក្រង់ធំ (Main Player)' : 'Back to Main Player'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleAutoAdvance}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  autoAdvance
                    ? 'bg-teal-400/15 border-teal-400/40 text-teal-300'
                    : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                {uiLang === 'km'
                  ? `បន្តភាគស្វ័យប្រវត្តិ: ${autoAdvance ? 'បើក' : 'បិទ'}`
                  : `Auto-Next: ${autoAdvance ? 'ON' : 'OFF'}`}
              </button>

              <button
                type="button"
                onClick={onToggleUiLang}
                aria-label="Switch Interface Language"
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Globe className="w-3 h-3 text-teal-400" />
                <span>{uiLang === 'km' ? 'ខ្មែរ / EN' : 'EN / ខ្មែរ'}</span>
              </button>
            </div>
          </div>

        {/* Official Title Artwork or Fallback Typography */}
        {program.titleImage && !titleImgError ? (
          <div className="h-16 flex items-center justify-center my-1">
            <img
              src={program.titleImage}
              alt={program.title}
              referrerPolicy="no-referrer"
              onError={() => setTitleImgError(true)}
              className="max-h-16 w-auto object-contain"
            />
          </div>
        ) : null}

        <h1 className="text-lg font-bold text-white tracking-tight mt-1 text-balance">
          {program.title}
        </h1>

        {/* Clean Unboxed Metadata with Typographic Separators (Zero-Pill Discipline) */}
        <div className="mt-2 flex items-center justify-center flex-wrap gap-1.5 text-xs text-zinc-400">
          {[...program.genres, ...program.metaTags.slice(0, 2)].map((label, idx, arr) => (
            <React.Fragment key={label}>
              <span>{label}</span>
              {idx < arr.length - 1 && <span aria-hidden="true">·</span>}
            </React.Fragment>
          ))}
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular text-zinc-300">
            {formatCompactNumber(program.viewCount)} views
          </span>
        </div>

        {/* Expandable Synopsis */}
        <div className="mt-3 w-full text-left">
          <p className="text-xs text-zinc-300 leading-relaxed">
            {isSynopsisExpanded || program.synopsis.length <= 120
              ? program.synopsis
              : `${program.synopsis.slice(0, 120).replace(/\s+\S*$/, '')}... `}
            {program.synopsis.length > 120 && (
              <button
                type="button"
                onClick={() => setIsSynopsisExpanded((prev) => !prev)}
                className="font-semibold text-white hover:text-teal-300 ml-1 cursor-pointer"
              >
                {isSynopsisExpanded
                  ? uiLang === 'km'
                    ? 'បង្រួម'
                    : 'Less'
                  : uiLang === 'km'
                    ? 'អានបន្ថែម'
                    : 'More'}
              </button>
            )}
          </p>
        </div>

        {/* Circular Bookmark, Share, and Download Action Row */}
        <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onToggleBookmark}
            aria-pressed={isBookmarked}
            aria-label={isBookmarked ? 'Remove from Saved List' : 'Save to Library'}
            className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
              isBookmarked
                ? 'bg-teal-400/20 border-teal-400 text-teal-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-200'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleCopyShareLink}
            aria-label="Copy Vigloo Episode Link"
            className="w-11 h-11 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            {copiedShare ? <Check className="w-4 h-4 text-teal-400" /> : <Share2 className="w-4 h-4" />}
          </button>

          {streamData?.downloadUrl && (
            <button
              type="button"
              data-testid="sidebar-download-active-ep-btn"
              onClick={handleDownloadActiveEpisode}
              disabled={activeEpDownloading}
              aria-label="Download Episode MP4"
              className="px-4 h-11 rounded-full bg-teal-400 hover:bg-teal-300 disabled:opacity-60 text-zinc-950 text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
            >
              {activeEpDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {uiLang === 'km'
                      ? `កំពុងទាញយក EP.${activeEpisode} (${activeEpDownloadPercent}%)`
                      : `Saving EP.${activeEpisode} (${activeEpDownloadPercent}%)`}
                  </span>
                </>
              ) : activeEpDownloadDone ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {uiLang === 'km'
                      ? `បានរក្សាទុក EP.${activeEpisode} (${activeEpDownloadDone})`
                      : `Saved EP.${activeEpisode} (${activeEpDownloadDone})`}
                  </span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>
                    {uiLang === 'km'
                      ? `ទាញយក EP.${activeEpisode} MP4`
                      : `Download EP.${activeEpisode} MP4`}
                  </span>
                </>
              )}
            </button>
          )}

          {/* Direct One-Click Video Cover Image Download Button */}
          <button
            type="button"
            data-testid="sidebar-download-cover-btn"
            onClick={handleDownloadActiveCover}
            disabled={activeCoverDownloading}
            aria-label="Download Video Cover Image"
            className="px-4 h-11 rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
          >
            {activeCoverDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {uiLang === 'km'
                    ? `កំពុងទាញយករូបភាពគ្រប...`
                    : `Saving Cover...`}
                </span>
              </>
            ) : activeCoverDone ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {uiLang === 'km'
                    ? `បានរក្សាទុករូបភាពគ្រប (${activeCoverDone})`
                    : `Saved Cover (${activeCoverDone})`}
                </span>
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                <span>
                  {uiLang === 'km'
                    ? `ទាញយករូបភាពគ្រប EP.${activeEpisode}`
                    : `Download Cover EP.${activeEpisode}`}
                </span>
              </>
            )}
          </button>

          {/* 1-Click Automatic Code & Stream Self-Repair Button */}
          <button
            type="button"
            data-testid="sidebar-auto-repair-btn"
            onClick={() => {
              onChangeTab('vip');
              handleRunSystemAutoRepair();
            }}
            disabled={isAutoRepairing}
            aria-label="Auto-Repair System and Video Stream"
            className="px-4 h-11 rounded-full bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 border border-teal-400/40 text-teal-300 text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
          >
            {isAutoRepairing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
                <span>{uiLang === 'km' ? 'កំពុងជួសជុលស្វ័យប្រវត្តិ...' : 'Auto-Repairing...'}</span>
              </>
            ) : autoRepairReport?.ok ? (
              <>
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                <span>{uiLang === 'km' ? 'បានជួសជុលរួចរាល់' : 'System Repaired'}</span>
              </>
            ) : (
              <>
                <Wrench className="w-4 h-4 text-teal-400" />
                <span>{uiLang === 'km' ? 'ជួសជុលស្វ័យប្រវត្តិ' : 'Auto-Repair'}</span>
              </>
            )}
          </button>
        </div>

        {/* VIP Auto-Watch & Auto-Download Status Banner */}
        <div className="mt-4 w-full px-4 py-2.5 rounded-xl bg-[#1A2421] border border-teal-400/30 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-teal-300 font-semibold whitespace-nowrap">
            <Crown className="w-4 h-4 fill-current text-amber-300 shrink-0" />
            <span>
              {uiLang === 'km'
                ? `VIP ស្វ័យប្រវត្តិ (ភាគ 1–${program.episodeCount}): ${autoUnlockVip ? 'បើករួចរាល់' : 'បិទ'}`
                : `VIP Auto-Stream (EP 1–${program.episodeCount}): ${autoUnlockVip ? 'ACTIVE' : 'PAUSED'}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onChangeTab('vip');
              if (!isBatchRunning) {
                prepareSingleEpisodeMp4(activeEpisode > program.appFreeEpCount ? activeEpisode : program.appFreeEpCount + 1, true);
              }
            }}
            data-testid="open-vip-downloader-banner-btn"
            className="text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{uiLang === 'km' ? 'ទាញយក VIP ទាំងអស់' : 'Batch VIP Download'}</span>
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Quick-Jump Bar for Vigloo All-Section Video Downloader (Hot · New · Picks · Ranking · Asian · Categories) */}
        <div
          data-testid="quick-catalog-sections-bar"
          className="mt-2.5 w-full px-3 py-2 rounded-xl bg-zinc-900/90 border border-white/10 flex items-center justify-between gap-1.5 flex-wrap"
        >
          <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1 whitespace-nowrap">
            <Compass className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>{uiLang === 'km' ? 'ទាញយកវីដេអូពី៖' : 'Download From:'}</span>
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                { id: 'hot', label: 'Hot' },
                { id: 'new', label: 'New' },
                { id: 'picks', label: 'Picks' },
                { id: 'ranking', label: 'Ranking' },
                { id: 'asian', label: 'Asian' },
                { id: 'categories', label: 'Categories' },
              ] as const
            ).map((sec) => (
              <button
                key={sec.id}
                type="button"
                data-testid={`quick-jump-${sec.id}`}
                onClick={() => {
                  setCatalogSection(sec.id);
                  onChangeTab('recommended');
                }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                  activeTab === 'recommended' && catalogSection === sec.id
                    ? 'bg-teal-400 text-zinc-950'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-teal-300 border border-white/10'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hairline Divider */}
      <div className="w-full h-px bg-white/10 shrink-0" />

      {/* Segmented Content Tabs */}
      <div className="px-6 pt-3 pb-2 flex items-center justify-between gap-2 shrink-0">
        <div
          role="tablist"
          aria-label="Content Panel Tabs"
          className="flex items-center gap-4 text-sm font-semibold overflow-x-auto custom-scrollbar"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'episodes'}
            onClick={() => onChangeTab('episodes')}
            className={`pb-2 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'episodes'
                ? 'text-white border-teal-400'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            1-{program.episodeCount} ({uiLang === 'km' ? 'គ្រប់ភាគ' : 'All EP'})
          </button>

          <button
            type="button"
            role="tab"
            data-testid="tab-covers"
            aria-selected={activeTab === 'covers'}
            onClick={() => onChangeTab('covers')}
            className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'covers'
                ? 'text-amber-300 border-amber-400'
                : 'text-zinc-400 border-transparent hover:text-amber-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-amber-300" />
            <span>{uiLang === 'km' ? 'រូបភាពគ្រប (Covers)' : 'Covers'}</span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="tab-vip-auto"
            aria-selected={activeTab === 'vip'}
            onClick={() => onChangeTab('vip')}
            className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'vip'
                ? 'text-amber-300 border-amber-400'
                : 'text-zinc-400 border-transparent hover:text-amber-200'
            }`}
          >
            <Crown className="w-3.5 h-3.5 text-amber-300" />
            <span>{uiLang === 'km' ? 'VIP ស្វ័យប្រវត្តិ' : 'VIP Auto'}</span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="tab-catalog"
            aria-selected={activeTab === 'recommended'}
            onClick={() => onChangeTab('recommended')}
            className={`pb-2 border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'recommended'
                ? 'text-teal-300 border-teal-400'
                : 'text-zinc-400 border-transparent hover:text-teal-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-teal-400" />
            <span>
              {uiLang === 'km'
                ? `កាតាឡុក (${catalogItems.length})`
                : `Catalog (${catalogItems.length})`}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'script'}
            onClick={() => onChangeTab('script')}
            className={`pb-2 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'script'
                ? 'text-white border-teal-400'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {uiLang === 'km' ? `អក្សររត់ (${cues.length})` : `Subtitles (${cues.length})`}
          </button>
        </div>
      </div>

      {/* TAB 1: 6-Column Episode Selector Grid */}
      {activeTab === 'episodes' && (
        <div className="px-6 py-3 flex-1 flex flex-col gap-3">
          {/* Interactive Filter Controls */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-zinc-400 font-mono-tabular">
              {uiLang === 'km' ? `កំពុងចាក់ ភាគទី ${activeEpisode}` : `Playing Episode ${activeEpisode}`}
            </span>
            <div className="flex items-center gap-1 p-0.5 bg-zinc-900 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setEpisodeFilter('all')}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  episodeFilter === 'all'
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {uiLang === 'km' ? `ទាំងអស់ (${program.episodeCount})` : `All (${program.episodeCount})`}
              </button>
              <button
                type="button"
                onClick={() => setEpisodeFilter('free')}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  episodeFilter === 'free'
                    ? 'bg-teal-400 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {uiLang === 'km'
                  ? `ឥតគិតថ្លៃ (1–${program.appFreeEpCount})`
                  : `Free (1–${program.appFreeEpCount})`}
              </button>
              <button
                type="button"
                onClick={() => setEpisodeFilter('vip')}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  episodeFilter === 'vip'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                VIP ({program.appFreeEpCount + 1}–{program.episodeCount})
              </button>
            </div>
          </div>

          {/* Episode Grid */}
          <div
            data-testid="episode-grid"
            className={
              isExpandedWorkspace
                ? 'grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2.5 pb-6'
                : 'grid grid-cols-6 gap-2 pb-6'
            }
          >
            {filteredEpisodes.map((ep) => {
              const isCurrent = ep.episodeNumber === activeEpisode;
              const isVip = ep.price > 0 && ep.episodeNumber > program.appFreeEpCount;
              const isPrepared = preparedMap[ep.episodeNumber]?.status === 'ready';

              return (
                <button
                  key={ep.episodeNumber}
                  type="button"
                  data-testid={`episode-btn-${ep.episodeNumber}`}
                  onClick={() => onSelectEpisode(ep.episodeNumber)}
                  aria-label={`Episode ${ep.episodeNumber}${isVip ? (autoUnlockVip ? ' (VIP Auto-Unlocked)' : ' (VIP Locked)') : ' (Free)'}`}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`relative h-11 rounded-md flex items-center justify-center font-mono-tabular text-sm font-semibold transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-[#112625] border border-teal-400 text-teal-300 shadow-sm'
                      : 'bg-[#1E1F24] hover:bg-[#2A2B32] border border-transparent text-zinc-200'
                  }`}
                >
                  {isCurrent ? (
                    <span
                      aria-hidden="true"
                      className="flex items-end gap-0.5 h-4"
                      title={`Playing Episode ${ep.episodeNumber}`}
                    >
                      <span className="w-0.5 bg-teal-400 rounded-full animate-eq-1" />
                      <span className="w-0.5 bg-teal-400 rounded-full animate-eq-2" />
                      <span className="w-0.5 bg-teal-400 rounded-full animate-eq-3" />
                    </span>
                  ) : (
                    <span>{ep.episodeNumber}</span>
                  )}

                  {isVip && (
                    autoUnlockVip ? (
                      <Crown
                        aria-hidden="true"
                        className="w-2.5 h-2.5 text-amber-300 absolute top-1 right-1"
                      />
                    ) : (
                      <Lock
                        aria-hidden="true"
                        className="w-2.5 h-2.5 text-zinc-400 absolute top-1 right-1"
                      />
                    )
                  )}

                  {isPrepared && (
                    <CheckCircle2
                      aria-hidden="true"
                      className="w-2.5 h-2.5 text-teal-400 absolute bottom-1 right-1"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 1B: Video Cover Image & Poster Downloader Studio (រូបភាពគ្របវីដេអូ) */}
      {activeTab === 'covers' && (
        <div
          data-testid="covers-gallery-panel"
          className="px-6 py-3 flex-1 flex flex-col gap-4 pb-8"
        >
          {/* Section 1: Official Series Posters & Current Episode Cover */}
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-amber-300" />
                  <span>
                    {uiLang === 'km'
                      ? `រូបភាពគ្របផ្លូវការ & ភាគទី ${activeEpisode} (Official Covers)`
                      : `Official Series & Episode ${activeEpisode} Cover Art`}
                  </span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {uiLang === 'km'
                    ? 'ទាញយករូបភាពគ្របរឿង រូបភាពគ្របភាគ និងឡូហ្គោចំណងជើងកម្រិតច្បាស់ HD។'
                    : 'Download high-resolution series posters, episode covers, and title artwork.'}
                </p>
              </div>

              <button
                type="button"
                data-testid="capture-live-frame-btn"
                onClick={handleCaptureLiveVideoFrameCover}
                className="px-3 py-1.5 rounded-lg bg-teal-400 hover:bg-teal-300 text-zinc-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>
                  {frameCaptureStatus ||
                    (uiLang === 'km'
                      ? 'ថតរូបភាពគ្របពីវីដេអូកំពុងចាក់'
                      : 'Capture Live Video Frame')}
                </span>
              </button>
            </div>

            <div
              className={
                isExpandedWorkspace
                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1'
                  : 'grid grid-cols-1 gap-2.5 pt-1'
              }
            >
              {primarySeriesCovers.map((asset) => {
                const st = coverStatusMap[asset.id];
                const isLogo = asset.kind === 'series-logo';

                return (
                  <div
                    key={asset.id}
                    data-testid={`cover-card-${asset.id}`}
                    className="p-3 rounded-xl bg-zinc-950/90 border border-white/10 flex items-center gap-3"
                  >
                    <div
                      className={`w-14 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-zinc-900 flex items-center justify-center ${
                        isLogo ? 'h-14 p-1.5' : 'aspect-[9/16]'
                      }`}
                    >
                      <img
                        src={asset.imageUrl}
                        alt={uiLang === 'km' ? asset.titleKm : asset.titleEn}
                        referrerPolicy="no-referrer"
                        className={
                          isLogo
                            ? 'max-w-full max-h-full object-contain'
                            : 'w-full h-full object-cover'
                        }
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white leading-snug truncate">
                          {uiLang === 'km' ? asset.titleKm : asset.titleEn}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-zinc-400 mt-0.5">
                          {asset.resolution}
                          {st?.size ? ` · ${st.size}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        data-testid={`download-cover-asset-${asset.id}`}
                        disabled={st?.status === 'downloading'}
                        onClick={() => handleDownloadCoverAsset(asset)}
                        className="py-1.5 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {st?.status === 'downloading' ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{uiLang === 'km' ? 'កំពុងទាញយក...' : 'Saving...'}</span>
                          </>
                        ) : st?.status === 'saved' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {uiLang === 'km'
                                ? `រក្សាទុក (${st.size || 'JPG'})`
                                : `Saved (${st.size || 'JPG'})`}
                            </span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>
                              {uiLang === 'km' ? 'ទាញយកគ្រប' : 'Download'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Active Episode 10 Scene Covers (480x854 HD) */}
          {sceneCoverAssets.length > 0 && (
            <div className="p-4 rounded-xl bg-zinc-900/90 border border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-teal-400" />
                    <span>
                      {uiLang === 'km'
                        ? `រូបភាពគ្របឈុតឆាកទាំង ${sceneCoverAssets.length} នៃភាគទី ${activeEpisode}`
                        : `Episode ${activeEpisode} HD Scene Covers (${sceneCoverAssets.length} Scenes)`}
                    </span>
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {uiLang === 'km'
                      ? 'ចុចលើរូបភាពដើម្បីទាញយករូបភាពគ្របតាមឈុតនីមួយៗ ឬទាញយកទាំង ១០ ឈុតតែម្តង។'
                      : 'Download individual scene covers or save all 10 episode scene covers at once.'}
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="download-all-scene-covers-btn"
                  disabled={isDownloadingAllScenes}
                  onClick={handleDownloadAllSceneCovers}
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isDownloadingAllScenes ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {uiLang === 'km' ? 'កំពុងទាញយកទាំង ១០ ឈុត...' : 'Saving 10 Scenes...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {uiLang === 'km'
                          ? `ទាញយករូបភាពទាំង ${sceneCoverAssets.length} ឈុត`
                          : `Download All ${sceneCoverAssets.length} Scene Covers`}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {sceneCoverAssets.map((sceneItem, idx) => {
                  const st = coverStatusMap[sceneItem.id];
                  return (
                    <div
                      key={sceneItem.id}
                      className="rounded-xl bg-zinc-950 border border-white/10 overflow-hidden flex flex-col"
                    >
                      <div className="relative aspect-[9/16] w-full bg-black overflow-hidden">
                        <img
                          src={sceneItem.imageUrl}
                          alt={sceneItem.titleEn}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono-tabular font-semibold text-teal-300">
                          #{idx + 1}
                        </span>
                      </div>

                      <button
                        type="button"
                        data-testid={`download-scene-cover-${idx + 1}`}
                        disabled={st?.status === 'downloading'}
                        onClick={() => handleDownloadCoverAsset(sceneItem)}
                        className="w-full py-1.5 px-1 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-semibold text-amber-300 flex items-center justify-center gap-1 border-t border-white/10 cursor-pointer whitespace-nowrap"
                      >
                        {st?.status === 'downloading' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : st?.status === 'saved' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-teal-400 shrink-0" />
                            <span className="text-teal-300">
                              {uiLang === 'km' ? 'រួចរាល់' : 'Saved'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Download className="w-2.5 h-2.5 shrink-0" />
                            <span>{uiLang === 'km' ? `ឈុត ${idx + 1}` : `#${idx + 1}`}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: All 40 Episodes Cover Gallery & Batch Cover Downloader */}
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  {uiLang === 'km'
                    ? `រូបភាពគ្របគ្រប់ភាគទាំងអស់ (EP 1–${program.episodeCount})`
                    : `All Episode Covers Gallery (EP 1–${program.episodeCount})`}
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {uiLang === 'km'
                    ? 'ទាញយករូបភាពគ្របតាមភាគនីមួយៗ ឬទាញយករូបភាពគ្របគ្រប់ភាគដោយស្វ័យប្រវត្តិ។'
                    : 'Download any episode cover individually or batch-save all episode covers.'}
                </p>
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-zinc-950 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => setCoverEpisodeFilter('all')}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md cursor-pointer ${
                    coverEpisodeFilter === 'all'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {uiLang === 'km' ? `ទាំងអស់ (${program.episodeCount})` : `All (${program.episodeCount})`}
                </button>
                <button
                  type="button"
                  onClick={() => setCoverEpisodeFilter('free')}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md cursor-pointer ${
                    coverEpisodeFilter === 'free'
                      ? 'bg-teal-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Free (1–{program.appFreeEpCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCoverEpisodeFilter('vip')}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md cursor-pointer ${
                    coverEpisodeFilter === 'vip'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  VIP ({program.appFreeEpCount + 1}–{program.episodeCount})
                </button>
              </div>
            </div>

            <button
              type="button"
              data-testid="batch-download-episode-covers-btn"
              onClick={handleBatchDownloadEpisodeCovers}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                isBatchCoverRunning
                  ? 'bg-rose-500 hover:bg-rose-400 text-white'
                  : 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
              }`}
            >
              {isBatchCoverRunning ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {uiLang === 'km'
                      ? `បញ្ឈប់ការទាញយករូបភាពគ្រប (${batchCoverDoneCount}/${filteredCoverEpisodes.length})`
                      : `Stop Cover Batch (${batchCoverDoneCount}/${filteredCoverEpisodes.length})`}
                  </span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>
                    {uiLang === 'km'
                      ? `ទាញយករូបភាពគ្របស្វ័យប្រវត្តិ (${filteredCoverEpisodes.length} ភាគ)`
                      : `Batch Download Episode Covers (${filteredCoverEpisodes.length} Episodes)`}
                  </span>
                </>
              )}
            </button>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-80 overflow-y-auto custom-scrollbar pt-1 pr-1">
              {filteredCoverEpisodes.map((ep) => {
                const itemId = `ep-grid-cover-${ep.episodeNumber}`;
                const st = coverStatusMap[itemId];
                const isVip = ep.price > 0 && ep.episodeNumber > program.appFreeEpCount;
                const thumbSrc = `/api/vigloo/thumbnail?seasonId=${program.seasonId}&episodeNumber=${ep.episodeNumber}`;

                return (
                  <div
                    key={ep.episodeNumber}
                    className="rounded-xl bg-zinc-950 border border-white/10 overflow-hidden flex flex-col"
                  >
                    <div
                      onClick={() => onSelectEpisode(ep.episodeNumber)}
                      className="relative aspect-[9/16] w-full bg-zinc-900 overflow-hidden cursor-pointer group"
                    >
                      <img
                        src={thumbSrc}
                        alt={`EP.${ep.episodeNumber} Cover`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-1.5 flex items-center justify-between text-[10px] font-mono-tabular">
                        <span className="font-bold text-white">
                          EP.{String(ep.episodeNumber).padStart(2, '0')}
                        </span>
                        {isVip && <span className="text-amber-300 font-bold">VIP</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`download-ep-cover-${ep.episodeNumber}`}
                      disabled={st?.status === 'downloading'}
                      onClick={() => handleDownloadSingleEpisodeCover(ep.episodeNumber)}
                      className="w-full py-1.5 px-2 bg-zinc-900 hover:bg-zinc-800 text-[11px] font-semibold text-zinc-200 hover:text-amber-300 flex items-center justify-center gap-1 border-t border-white/10 cursor-pointer"
                    >
                      {st?.status === 'downloading' ? (
                        <Loader2 className="w-3 h-3 animate-spin text-amber-300" />
                      ) : st?.status === 'saved' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-teal-400" />
                          <span className="text-teal-300">
                            {uiLang === 'km' ? 'បានរក្សាទុក' : 'Saved'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3 text-amber-300" />
                          <span>{uiLang === 'km' ? 'ទាញយកគ្រប' : 'Cover'}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Automatic VIP Watch & Batch Downloader Manager */}
      {activeTab === 'vip' && (
        <div
          data-testid="vip-auto-panel"
          className="px-6 py-3 flex-1 flex flex-col gap-4 pb-8"
        >
          {/* Section 0: Automatic Code & Video Self-Repair Engine (ប្រព័ន្ធជួសជុលកូដ និងវីដេអូដោយស្វ័យប្រវត្តិ) */}
          <div
            data-testid="auto-repair-diagnostic-card"
            className="p-4 rounded-xl bg-zinc-900/95 border border-teal-400/35 space-y-3"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-400" />
                  <span>
                    {uiLang === 'km'
                      ? 'ប្រព័ន្ធជួសជុលកូដ និងវីដេអូដោយស្វ័យប្រវត្តិ (Auto Self-Healing Engine)'
                      : 'Automatic Code & Stream Self-Healing Engine'}
                  </span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  {uiLang === 'km'
                    ? 'ពិនិត្យ និងជួសជុលស្ទ្រីម HLS/MP4, ឯកសារខូចក្នុង Cache, VIP Unlock, និងរូបភាពគ្របដោយស្វ័យប្រវត្តិ។'
                    : 'Automatically diagnoses and repairs HLS/MP4 streams, corrupted cache files, VIP unlock, and covers.'}
                </p>
              </div>

              <button
                type="button"
                data-testid="run-auto-repair-engine-btn"
                onClick={handleRunSystemAutoRepair}
                disabled={isAutoRepairing}
                className="px-3.5 py-2 rounded-lg bg-teal-400 hover:bg-teal-300 disabled:opacity-60 text-zinc-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isAutoRepairing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{uiLang === 'km' ? 'កំពុងជួសជុល...' : 'Repairing...'}</span>
                  </>
                ) : (
                  <>
                    <Wrench className="w-3.5 h-3.5" />
                    <span>
                      {uiLang === 'km' ? 'ជួសជុលកូដ និងវីដេអូឥឡូវនេះ' : 'Run Auto-Repair Now'}
                    </span>
                  </>
                )}
              </button>
            </div>

            {autoRepairReport && (
              <div
                data-testid="auto-repair-checks-list"
                className="pt-1 space-y-1.5 border-t border-white/10"
              >
                {autoRepairReport.checks.map((chk) => (
                  <div
                    key={chk.id}
                    data-testid={`repair-check-${chk.id}`}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-950/90 border border-white/5 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span className="font-semibold text-white truncate">
                        {uiLang === 'km' ? chk.labelKm : chk.labelEn}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-teal-300 shrink-0">{chk.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 1: Automatic VIP Streaming & Auto-Download Switches */}
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    {uiLang === 'km'
                      ? 'មើលវីដេអូ VIP ដោយស្វ័យប្រវត្តិ (EP 6–40)'
                      : 'Auto-Unlock & Watch VIP Videos (EP 6–40)'}
                  </span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  {uiLang === 'km'
                    ? 'បម្លែង និងចាក់វីដេអូ VIP ដោយស្វ័យប្រវត្តិពី Vigloo CDN រួមជាមួយអក្សររត់។'
                    : 'Automatically synthesizes & plays VIP episodes from Vigloo CDN with subtitles.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoUnlockVip}
                data-testid="switch-auto-unlock-vip"
                onClick={onToggleAutoUnlockVip}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  autoUnlockVip
                    ? 'bg-teal-400 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 border border-white/10'
                }`}
              >
                {autoUnlockVip
                  ? uiLang === 'km'
                    ? 'កំពុងបើក (ON)'
                    : 'ACTIVE (ON)'
                  : uiLang === 'km'
                    ? 'បានបិទ (OFF)'
                    : 'PAUSED (OFF)'}
              </button>
            </div>

            <div className="w-full h-px bg-white/10" />

            {/* VIP Stream Source Mode Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300">
                  {uiLang === 'km'
                    ? 'ប្រភេទវីដេអូសម្រាប់ភាគ VIP (EP 6–40):'
                    : 'VIP Video Playback & Download Mode (EP 6–40):'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="sidebar-vip-mode-full-motion"
                  onClick={() => onChangeVipSourceMode('full-motion')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    vipSourceMode === 'full-motion'
                      ? 'bg-amber-400/15 border-amber-400 text-white'
                      : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {uiLang === 'km'
                        ? 'ម៉ូដ ១៖ វីដេអូសកម្មភាពពេញ (24fps + សំឡេងពិត)'
                        : 'Mode 1: Full-Motion 24fps Drama Reel'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                    {uiLang === 'km'
                      ? 'ចាក់ និងទាញយកវីដេអូសកម្មភាពពិត 24fps ពី Master Stream របស់រឿង រួមជាមួយអក្សររត់ខ្មែរ/អង់គ្លេស។'
                      : 'Streams & downloads full-motion 24fps H.264 video + real audio from the series master reel.'}
                  </p>
                </button>

                <button
                  type="button"
                  data-testid="sidebar-vip-mode-storyboard"
                  onClick={() => onChangeVipSourceMode('storyboard')}
                  className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    vipSourceMode === 'storyboard'
                      ? 'bg-teal-400/15 border-teal-400 text-white'
                      : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  <div className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5" />
                    <span>
                      {uiLang === 'km'
                        ? 'ម៉ូដ ២៖ វីដេអូឈុតឆាក VIP (10 ឈុត + សំឡេងពិត)'
                        : 'Mode 2: 10-Scene VIP Storyboard + Real Audio'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                    {uiLang === 'km'
                      ? 'បម្លែងឈុតឆាកផ្លូវការទាំង ១០ នៃភាគ VIP នីមួយៗ ជាមួយសំឡេងពិតរបស់រឿង និងអក្សររត់ខ្មែរ។'
                      : 'Synthesizes the 10 authentic CDN scene frames of that VIP episode with real series audio.'}
                  </p>
                </button>
              </div>
            </div>

            <div className="w-full h-px bg-white/10" />

            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span>
                    {uiLang === 'km'
                      ? 'ទាញយកវីដេអូស្វ័យប្រវត្តិពេលកំពុងមើល'
                      : 'Auto-Download MP4 While Watching'}
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  {uiLang === 'km'
                    ? 'រក្សាទុកឯកសារវីដេអូ .MP4 ដោយស្វ័យប្រវត្តិរាល់ពេលអ្នកប្តូរទៅភាគថ្មី។'
                    : 'Automatically downloads each episode as an .MP4 file when playback starts.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoDownloadOnWatch}
                data-testid="switch-auto-download-on-watch"
                onClick={onToggleAutoDownloadOnWatch}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  autoDownloadOnWatch
                    ? 'bg-amber-400 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 border border-white/10'
                }`}
              >
                {autoDownloadOnWatch
                  ? uiLang === 'km'
                    ? 'កំពុងបើក (ON)'
                    : 'ACTIVE (ON)'
                  : uiLang === 'km'
                    ? 'បានបិទ (OFF)'
                    : 'OFF'}
              </button>
            </div>
          </div>

          {/* Section 2: Active Episode 10-Frame CDN Scene Storyboard */}
          {streamData?.storyboardFrames && streamData.storyboardFrames.length > 0 && (
            <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    {uiLang === 'km'
                      ? `ឈុតឆាកវីដេអូភាគទី ${activeEpisode} (${streamData.storyboardFrames.length} ឈុត)`
                      : `Episode ${activeEpisode} CDN Scene Frames (${streamData.storyboardFrames.length})`}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="vip-download-scene-covers-btn"
                    disabled={isDownloadingAllScenes}
                    onClick={handleDownloadAllSceneCovers}
                    className="px-2.5 py-1 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>
                      {isDownloadingAllScenes
                        ? uiLang === 'km'
                          ? 'កំពុងទាញយក...'
                          : 'Saving...'
                        : uiLang === 'km'
                          ? 'ទាញយករូបភាពគ្របទាំង ១០ ឈុត'
                          : 'Save All 10 Covers'}
                    </span>
                  </button>
                  <span className="text-[11px] font-mono-tabular text-zinc-400">480×854 HD</span>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1.5 custom-scrollbar">
                {streamData.storyboardFrames.map((frameUrl, idx) => {
                  const targetSec = idx * 3;
                  return (
                    <button
                      key={frameUrl}
                      type="button"
                      onClick={() => onSeekToCue(targetSec)}
                      className="group relative w-16 aspect-[9/16] rounded-lg overflow-hidden border border-white/10 hover:border-teal-400 shrink-0 bg-black cursor-pointer"
                      title={`Jump to 0:${String(targetSec).padStart(2, '0')}`}
                    >
                      <img
                        src={frameUrl}
                        alt={`Episode ${activeEpisode} Scene ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[9px] font-mono-tabular text-white">
                        0:{String(targetSec).padStart(2, '0')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 3: Automated Batch VIP Downloader Queue */}
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-white/10 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {uiLang === 'km'
                  ? 'កម្មវិធីទាញយកវីដេអូ VIP ទាំងអស់ដោយស្វ័យប្រវត្តិ'
                  : 'Automated Batch VIP MP4 Downloader'}
              </h3>
              <span className="text-[11px] font-mono-tabular text-teal-400">
                ~{batchPlan.estimatedTotalMb} MB
              </span>
            </div>

            {/* Filter Mode Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(
                [
                  {
                    id: 'vip',
                    labelKm: `VIP (${program.appFreeEpCount + 1}–${program.episodeCount})`,
                    labelEn: `VIP (${program.appFreeEpCount + 1}–${program.episodeCount})`,
                  },
                  {
                    id: 'free',
                    labelKm: `Free (1–${program.appFreeEpCount})`,
                    labelEn: `Free (1–${program.appFreeEpCount})`,
                  },
                  {
                    id: 'all',
                    labelKm: `ទាំងអស់ (1–${program.episodeCount})`,
                    labelEn: `All (1–${program.episodeCount})`,
                  },
                  {
                    id: 'range',
                    labelKm: 'ចន្លោះភាគ',
                    labelEn: 'Custom Range',
                  },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setBatchMode(m.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    batchMode === m.id
                      ? 'bg-teal-400/15 border-teal-400 text-teal-300 font-semibold'
                      : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {uiLang === 'km' ? m.labelKm : m.labelEn}
                </button>
              ))}
            </div>

            {/* Custom Range Inputs */}
            {batchMode === 'range' && (
              <div className="flex items-center gap-2 pt-1 text-xs">
                <label className="text-zinc-400">
                  {uiLang === 'km' ? 'ពីភាគទី:' : 'From EP:'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={program.episodeCount}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 px-2 py-1 rounded bg-zinc-950 border border-white/15 text-white font-mono-tabular text-center"
                />
                <label className="text-zinc-400">
                  {uiLang === 'km' ? 'ដល់ភាគទី:' : 'To EP:'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={program.episodeCount}
                  value={rangeEnd}
                  onChange={(e) =>
                    setRangeEnd(Math.min(program.episodeCount, Number(e.target.value) || program.episodeCount))
                  }
                  className="w-16 px-2 py-1 rounded bg-zinc-950 border border-white/15 text-white font-mono-tabular text-center"
                />
              </div>
            )}

            {/* Auto-trigger browser file save checkbox */}
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoSaveBrowserFiles}
                onChange={(e) => setAutoSaveBrowserFiles(e.target.checked)}
                className="rounded accent-teal-400 w-3.5 h-3.5"
              />
              <span>
                {uiLang === 'km'
                  ? 'រក្សាទុកឯកសារ .MP4 ចូលឧបករណ៍ដោយស្វ័យប្រវត្តិពេលបម្លែងរួច'
                  : 'Automatically save .MP4 files to device as each episode finishes'}
              </span>
            </label>

            {/* Primary Batch Action Button */}
            <button
              type="button"
              data-testid="start-batch-vip-download-btn"
              onClick={handleStartBatchDownload}
              className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                isBatchRunning
                  ? 'bg-rose-500 hover:bg-rose-400 text-white'
                  : 'bg-teal-400 hover:bg-teal-300 text-zinc-950'
              }`}
            >
              {isBatchRunning ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {uiLang === 'km'
                      ? `បញ្ឈប់ការទាញយក (${readyCountInPlan}/${batchPlan.totalCount})`
                      : `Stop Auto-Download Queue (${readyCountInPlan}/${batchPlan.totalCount})`}
                  </span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>
                    {uiLang === 'km'
                      ? `ចាប់ផ្តើមទាញយកស្វ័យប្រវត្តិ (${batchPlan.totalCount} ភាគ)`
                      : `Start Auto-Download Queue (${batchPlan.totalCount} Episodes)`}
                  </span>
                </>
              )}
            </button>

            {/* Optional Vigloo Account Token Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowTokenInput((s) => !s)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
              >
                <KeyRound className="w-3 h-3 text-amber-300" />
                <span>
                  {uiLang === 'km'
                    ? 'ជម្រើសបន្ថែម៖ បញ្ចូល Vigloo VIP Bearer Token (មិនចាំបាច់)'
                    : 'Optional: Custom Vigloo Account Bearer Token'}
                </span>
              </button>
              {showTokenInput && (
                <input
                  type="text"
                  value={vipToken}
                  onChange={(e) => onChangeVipToken(e.target.value)}
                  placeholder="Bearer eyJhbGciOi..."
                  className="mt-2 w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-white/10 text-xs text-white placeholder-zinc-600 font-mono-tabular focus:outline-none focus:border-teal-400"
                />
              )}
            </div>

            {/* Episode Queue List */}
            <div
              data-testid="vip-download-queue-list"
              className="max-h-64 overflow-y-auto custom-scrollbar space-y-1.5 pt-1"
            >
              {batchPlan.episodes.map((ep) => {
                const info = preparedMap[ep.episodeNumber];
                const isVip = ep.price > 0;
                const isCurrent = ep.episodeNumber === activeEpisode;

                return (
                  <div
                    key={ep.episodeNumber}
                    data-testid={`queue-item-ep-${ep.episodeNumber}`}
                    className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                      isCurrent
                        ? 'bg-teal-950/40 border-teal-400/40'
                        : 'bg-zinc-950/80 border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-tabular font-semibold text-white">
                        EP.{String(ep.episodeNumber).padStart(2, '0')}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase ${
                          isVip ? 'text-amber-300' : 'text-teal-300'
                        }`}
                      >
                        {isVip ? 'VIP' : 'FREE'}
                      </span>
                      {info?.status === 'preparing' && (
                        <span className="text-[11px] text-amber-300 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{uiLang === 'km' ? 'កំពុងបម្លែង MP4...' : 'Preparing MP4...'}</span>
                        </span>
                      )}
                      {info?.status === 'downloading' && (
                        <span className="text-[11px] text-teal-300 font-mono-tabular flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>
                            {uiLang === 'km'
                              ? `កំពុងទាញយក ${info.progressPercent || 0}%`
                              : `Saving ${info.progressPercent || 0}%`}
                          </span>
                        </span>
                      )}
                      {info?.status === 'ready' && (
                        <span className="text-[11px] text-teal-300 font-mono-tabular flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{info.sizeFormatted}</span>
                        </span>
                      )}
                      {info?.status === 'queued' && (
                        <span className="text-[11px] text-zinc-500">
                          {uiLang === 'km' ? 'រង់ចាំ...' : 'Queued'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectEpisode(ep.episodeNumber)}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>{uiLang === 'km' ? 'មើល' : 'Watch'}</span>
                      </button>

                      {info?.status === 'ready' && info.downloadUrl ? (
                        <button
                          type="button"
                          data-testid={`download-ready-ep-${ep.episodeNumber}`}
                          onClick={() => prepareSingleEpisodeMp4(ep.episodeNumber, true)}
                          className="px-2.5 py-1 rounded bg-teal-400 hover:bg-teal-300 text-zinc-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>{uiLang === 'km' ? 'រក្សាទុក MP4' : 'Save MP4'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={info?.status === 'preparing' || info?.status === 'downloading'}
                          data-testid={`prepare-ep-${ep.episodeNumber}`}
                          onClick={() => prepareSingleEpisodeMp4(ep.episodeNumber, true)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Download className="w-3 h-3 text-teal-400" />
                          <span>{uiLang === 'km' ? 'ទាញយក MP4' : 'Get MP4'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Live Synchronized Subtitles & Interactive Transcript */}
      {activeTab === 'script' && (
        <div className="px-6 py-3 flex-1 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={scriptSearch}
                onChange={(e) => setScriptSearch(e.target.value)}
                placeholder={
                  uiLang === 'km' ? 'ស្វែងរកពាក្យសន្ទនា...' : 'Filter dialogue lines...'
                }
                aria-label="Filter subtitle dialogue"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-400"
              />
            </div>

            <select
              aria-label="Subtitle Language"
              value={selectedSubLang}
              onChange={(e) => onSelectSubLang(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-teal-400 cursor-pointer"
            >
              {(streamData?.subtitles?.length
                ? streamData.subtitles
                : [{ lang: 'eng', name: 'English' }]
              ).map((s) => (
                <option key={s.lang} value={s.lang}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 pb-6 max-h-[420px] overflow-y-auto custom-scrollbar">
            {filteredCues.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                {uiLang === 'km'
                  ? 'មិនមានអក្សររត់ត្រូវនឹងការស្វែងរកទេ។'
                  : 'No matching subtitle cues found.'}
              </div>
            ) : (
              filteredCues.map((cue) => {
                const isActive = cues[activeCueIndex]?.id === cue.id;
                return (
                  <button
                    key={cue.id}
                    type="button"
                    onClick={() => onSeekToCue(cue.startTime)}
                    className={`w-full text-left px-3 py-2 rounded-xl border transition-colors flex items-start gap-3 cursor-pointer ${
                      isActive
                        ? 'bg-teal-400/15 border-teal-400/40 text-white'
                        : 'bg-zinc-900/60 hover:bg-zinc-900 border-white/5 text-zinc-300'
                    }`}
                  >
                    <span className="font-mono-tabular text-[11px] text-teal-400 shrink-0 mt-0.5">
                      {cue.startFormatted}
                    </span>
                    <div className="text-xs leading-relaxed">
                      {cue.speaker && (
                        <span className="font-semibold text-teal-300 mr-1.5">
                          [{cue.speaker}]
                        </span>
                      )}
                      <span>{cue.text}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Vigloo All-Section Video Catalog & Batch Downloader (Hot · New · Picks · Ranking · Asian · Categories) */}
      {activeTab === 'recommended' && (
        <div
          data-testid="vigloo-catalog-hub"
          className="px-6 py-3 flex-1 flex flex-col gap-3.5 pb-8"
        >
          {/* 6 Official Vigloo Section Tabs: Hot, New, Picks, Ranking, Asian, Categories */}
          <div
            role="tablist"
            aria-label="Vigloo Catalog Sections"
            className="grid grid-cols-3 sm:grid-cols-6 gap-1.5"
          >
            {(
              [
                {
                  id: 'hot',
                  labelEn: 'Hot',
                  labelKm: 'Hot · ពេញនិយម',
                  icon: Flame,
                },
                {
                  id: 'new',
                  labelEn: 'New',
                  labelKm: 'New · រឿងថ្មី',
                  icon: Sparkles,
                },
                {
                  id: 'picks',
                  labelEn: 'Picks',
                  labelKm: 'Picks · ជ្រើសរើស',
                  icon: Crown,
                },
                {
                  id: 'ranking',
                  labelEn: 'Ranking',
                  labelKm: 'Ranking · ចំណាត់ថ្នាក់',
                  icon: Trophy,
                },
                {
                  id: 'asian',
                  labelEn: 'Asian',
                  labelKm: 'Asian · រឿងអាស៊ី',
                  icon: Globe,
                },
                {
                  id: 'categories',
                  labelEn: 'Categories',
                  labelKm: 'Categories · ប្រភេទ',
                  icon: Layers,
                },
              ] as const
            ).map((sec) => {
              const Icon = sec.icon;
              const isSelected = catalogSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`catalog-section-${sec.id}`}
                  onClick={() => setCatalogSection(sec.id)}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-teal-400 text-zinc-950 border-teal-400 shadow-sm'
                      : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{uiLang === 'km' ? sec.labelKm : sec.labelEn}</span>
                </button>
              );
            })}
          </div>

          {/* Categories Sub-Filter Bar (Shown when Categories tab is active) */}
          {catalogSection === 'categories' && (
            <div
              data-testid="catalog-category-chips"
              className="flex items-center gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar"
            >
              {catalogCategoryChips.map((cat) => {
                const isSelected = selectedCategoryName === cat.name;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    data-testid={`category-chip-${cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    onClick={() => setSelectedCategoryName(cat.name)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-zinc-950 border-amber-400'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-white/10'
                    }`}
                  >
                    {cat.name} ({cat.count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Search & Automated Section Video Batch Downloader Bar */}
          <div
            data-testid="catalog-batch-downloader-bar"
            className="p-3.5 rounded-xl bg-zinc-900/95 border border-teal-400/35 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    {uiLang === 'km'
                      ? `ទាញយកវីដេអូទាំងអស់ពីផ្នែក «${catalogSection.toUpperCase()}» (${displayedCatalogItems.length} រឿង)`
                      : `Download All Videos from "${catalogSection.toUpperCase()}" (${displayedCatalogItems.length} Series)`}
                  </span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {uiLang === 'km'
                    ? 'ទាញយកវីដេអូ .MP4 តាមរឿងនីមួយៗ ឬទាញយកវីដេអូគ្រប់រឿងក្នុងផ្នែកនេះដោយស្វ័យប្រវត្តិ។'
                    : 'Download individual series .MP4 videos or batch-save all videos in this section automatically.'}
                </p>
              </div>

              {/* Batch Count Limit Selector */}
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-white/10 text-[11px]">
                {[
                  { limit: 5, labelKm: 'Top 5 រឿង', labelEn: 'Top 5' },
                  { limit: 10, labelKm: 'Top 10 រឿង', labelEn: 'Top 10' },
                  { limit: 0, labelKm: `ទាំងអស់ (${displayedCatalogItems.length})`, labelEn: `All (${displayedCatalogItems.length})` },
                ].map((opt) => (
                  <button
                    key={opt.limit}
                    type="button"
                    onClick={() => setCatalogBatchLimit(opt.limit)}
                    className={`px-2 py-1 rounded-md font-semibold cursor-pointer whitespace-nowrap ${
                      catalogBatchLimit === opt.limit
                        ? 'bg-teal-400 text-zinc-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {uiLang === 'km' ? opt.labelKm : opt.labelEn}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-testid="catalog-search-input"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder={
                    uiLang === 'km'
                      ? 'ស្វែងរកចំណងជើងរឿង ប្រភេទ ឬលេខសម្គាល់...'
                      : 'Search series title, genre, or ID...'
                  }
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-zinc-950 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-400"
                />
              </div>

              <button
                type="button"
                data-testid="batch-download-catalog-section-btn"
                onClick={handleBatchDownloadCatalogSection}
                className={`py-2 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isCatalogBatchRunning
                    ? 'bg-rose-500 hover:bg-rose-400 text-white'
                    : 'bg-teal-400 hover:bg-teal-300 text-zinc-950'
                }`}
              >
                {isCatalogBatchRunning ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {uiLang === 'km'
                        ? `បញ្ឈប់ការទាញយក (${catalogBatchDoneCount}/${
                            catalogBatchLimit > 0
                              ? Math.min(catalogBatchLimit, displayedCatalogItems.length)
                              : displayedCatalogItems.length
                          })`
                        : `Stop Batch (${catalogBatchDoneCount}/${
                            catalogBatchLimit > 0
                              ? Math.min(catalogBatchLimit, displayedCatalogItems.length)
                              : displayedCatalogItems.length
                          })`}
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>
                      {uiLang === 'km'
                        ? `ទាញយកវីដេអូទាំងអស់ពី ${catalogSection.toUpperCase()} (${
                            catalogBatchLimit > 0
                              ? Math.min(catalogBatchLimit, displayedCatalogItems.length)
                              : displayedCatalogItems.length
                          } រឿង)`
                        : `Download All ${catalogSection.toUpperCase()} Videos (${
                            catalogBatchLimit > 0
                              ? Math.min(catalogBatchLimit, displayedCatalogItems.length)
                              : displayedCatalogItems.length
                          })`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isLoadingCatalog && catalogItems.length <= 5 && (
            <div className="py-4 flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
              <span>
                {uiLang === 'km'
                  ? 'កំពុងទាញយកបញ្ជីរឿងទាំងអស់ពី Vigloo...'
                  : 'Loading full Vigloo catalog...'}
              </span>
            </div>
          )}

          {/* Catalog Series Grid */}
          <div
            data-testid="catalog-series-grid"
            className={
              isExpandedWorkspace
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-6'
                : 'grid grid-cols-2 gap-3 pb-6'
            }
          >
            {displayedCatalogItems.map((item) => {
              const dlState = catalogDownloadMap[item.id];
              const isCurrentSeries = item.id === program.id;

              return (
                <div
                  key={item.id}
                  data-testid={`catalog-card-${item.id}`}
                  className={`group rounded-xl bg-zinc-900/80 hover:bg-zinc-900 border overflow-hidden flex flex-col justify-between transition-all ${
                    isCurrentSeries ? 'border-teal-400' : 'border-white/10'
                  }`}
                >
                  <div>
                    <div
                      onClick={() => onSelectRecommendedProgram(item.id)}
                      className="relative aspect-[3/4] w-full bg-zinc-800 overflow-hidden cursor-pointer"
                    >
                      {item.posterUrl ? (
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500 p-3 text-center">
                          {item.title}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

                      {/* Top Badges: Rank / NEW / Country */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          {typeof item.rank === 'number' && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-400 text-zinc-950 font-mono-tabular text-[11px] font-black shadow">
                              TOP #{item.rank}
                            </span>
                          )}
                          {item.isNewBadge && (
                            <span className="px-1.5 py-0.5 rounded bg-teal-400 text-zinc-950 text-[10px] font-bold">
                              NEW
                            </span>
                          )}
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-black/75 border border-white/15 text-[10px] font-mono-tabular font-semibold text-zinc-200">
                          {item.countryCode}
                        </span>
                      </div>

                      {/* Bottom Overlay Stats */}
                      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-zinc-200 font-mono-tabular">
                        <span>{item.episodeCount} EP</span>
                        <span className="text-teal-300">{item.appFreeEpCount} Free</span>
                      </div>
                    </div>

                    <div className="p-2.5">
                      <div
                        onClick={() => onSelectRecommendedProgram(item.id)}
                        className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-1 cursor-pointer"
                        title={item.title}
                      >
                        {item.title}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">
                        {item.genres.join(' · ') || 'Romance · Drama'}
                      </div>
                      <div className="text-[10px] font-mono-tabular text-zinc-500 mt-0.5">
                        {formatCompactNumber(item.viewCount)} views · ID {item.id}
                      </div>
                    </div>
                  </div>

                  {/* Direct Watch & Download Action Buttons */}
                  <div className="p-2 pt-0 flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        data-testid={`catalog-watch-series-${item.id}`}
                        onClick={() => onSelectRecommendedProgram(item.id)}
                        className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3 h-3 fill-current text-teal-400 shrink-0" />
                        <span>{uiLang === 'km' ? 'មើលរឿង' : 'Watch'}</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`catalog-download-mp4-${item.id}`}
                        disabled={
                          dlState?.status === 'preparing' || dlState?.status === 'downloading'
                        }
                        onClick={() => handleDownloadCatalogSeriesMp4(item)}
                        className="py-1.5 px-2 rounded-lg bg-teal-400 hover:bg-teal-300 disabled:opacity-60 text-zinc-950 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        {dlState?.status === 'preparing' || dlState?.status === 'downloading' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span>{dlState.percent ? `${dlState.percent}%` : '...'}</span>
                          </>
                        ) : dlState?.status === 'saved' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>{uiLang === 'km' ? 'រួចរាល់' : 'Saved'}</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3 shrink-0" />
                            <span>{uiLang === 'km' ? 'ទាញយក MP4' : 'Get MP4'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      data-testid={`catalog-open-vip-batch-${item.id}`}
                      onClick={() => {
                        if (onOpenSeriesVipBatch) {
                          onOpenSeriesVipBatch(item.id);
                        } else {
                          onSelectRecommendedProgram(item.id);
                          onChangeTab('vip');
                        }
                      }}
                      className="w-full py-1 px-2 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/30 text-amber-300 text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Crown className="w-3 h-3 shrink-0" />
                      <span>
                        {uiLang === 'km'
                          ? `ទាញយកគ្រប់ភាគ VIP (1–${item.episodeCount})`
                          : `Batch Download All ${item.episodeCount} EP`}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: Saved List */}
      {activeTab === 'saved' && (
        <div className="px-6 py-3 flex-1">
          {savedPrograms.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-medium text-zinc-300">
                {uiLang === 'km'
                  ? 'មិនទាន់មានរឿងដែលបានរក្សាទុកទេ'
                  : 'No saved series yet'}
              </p>
              <p className="text-xs text-zinc-500">
                {uiLang === 'km'
                  ? 'ចុចប៊ូតុងរក្សាទុក (Bookmark) ដើម្បីរក្សាទុករឿងដែលអ្នកចូលចិត្ត។'
                  : 'Click the Bookmark button above to save series for quick access.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 pb-6">
              {savedPrograms.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectRecommendedProgram(item.id)}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-left transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-zinc-400 font-mono-tabular mt-0.5">
                      ID: {item.id} · {item.episodeCount} Episodes ({item.appFreeEpCount} Free)
                    </div>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-teal-400/15 text-teal-300 flex items-center justify-center shrink-0">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </aside>
  );
};


