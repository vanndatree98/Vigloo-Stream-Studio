/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { TopBar, ActiveNavSection } from './components/TopBar';
import { VideoStage, StreamData } from './components/VideoStage';
import { SeriesSidebar, SidebarTab } from './components/SeriesSidebar';
import { LoadUrlModal } from './components/LoadUrlModal';
import {
  FALLBACK_PROGRAM_15003223,
  DEFAULT_EP1_VTT,
  ViglooProgramDetails,
  ViglooRecommendedItem,
} from './data/fallbackProgram';
import {
  parseWebVtt,
  SubtitleCue,
  MiniPlayerCorner,
  getNextMiniPlayerCorner,
  resolveMiniPlayerState,
  VipStreamSourceMode,
} from './utils/viglooParser';

const SAVED_STORAGE_KEY = 'vigloo_saved_programs_v1';

export default function App() {
  const [programId, setProgramId] = useState<number>(() => {
    const params = new URLSearchParams(window.location.search);
    const p = Number(params.get('programId'));
    return Number.isFinite(p) && p > 0 ? p : 15003223;
  });

  const [episodeNumber, setEpisodeNumber] = useState<number>(() => {
    const params = new URLSearchParams(window.location.search);
    const ep = Number(params.get('episode'));
    return Number.isInteger(ep) && ep >= 1 ? ep : 1;
  });

  const [program, setProgram] = useState<ViglooProgramDetails>(FALLBACK_PROGRAM_15003223);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(true);
  const [cues, setCues] = useState<SubtitleCue[]>(() => parseWebVtt(DEFAULT_EP1_VTT));
  const [selectedSubLang, setSelectedSubLang] = useState<string>('eng');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [seekRequest, setSeekRequest] = useState<{ time: number; nonce: number } | null>(null);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [autoUnlockVip, setAutoUnlockVip] = useState<boolean>(true);
  const [autoDownloadOnWatch, setAutoDownloadOnWatch] = useState<boolean>(false);
  const [vipSourceMode, setVipSourceMode] = useState<VipStreamSourceMode>('full-motion');
  const [vipToken, setVipToken] = useState<string>('');
  const [uiLang, setUiLang] = useState<'km' | 'en'>('km');
  const [streamReloadNonce, setStreamReloadNonce] = useState<number>(0);

  const [activeNav, setActiveNav] = useState<ActiveNavSection>('player');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('episodes');
  const [manualMiniPlayer, setManualMiniPlayer] = useState<boolean>(false);
  const [dismissedMiniPlayer, setDismissedMiniPlayer] = useState<boolean>(false);
  const [miniPlayerCorner, setMiniPlayerCorner] = useState<MiniPlayerCorner>('bottom-right');
  const [isUrlModalOpen, setIsUrlModalOpen] = useState<boolean>(false);

  const [savedPrograms, setSavedPrograms] = useState<ViglooRecommendedItem[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Sync URL query parameters cleanly without page reload
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('programId', String(programId));
    url.searchParams.set('episode', String(episodeNumber));
    window.history.replaceState({}, '', url.toString());
  }, [programId, episodeNumber]);

  // Fetch Program details when programId changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/vigloo/program/${programId}`);
        if (!res.ok) return;
        const data: ViglooProgramDetails = await res.json();
        if (!cancelled && data?.id) {
          setProgram(data);
          document.title = `${data.title} (EP.${episodeNumber}) | Vigloo Stream Studio`;
        }
      } catch {
        // Fallback already initialized
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [programId]);

  // Update document title on episode change
  useEffect(() => {
    document.title = `${program.title} (EP.${episodeNumber}) | Vigloo Stream Studio`;
  }, [program.title, episodeNumber]);

  // Fetch Stream + Subtitles when program.seasonId, episodeNumber, autoUnlockVip, vipSourceMode, or streamReloadNonce changes
  useEffect(() => {
    let cancelled = false;
    setIsLoadingStream(true);
    setCurrentTime(0);

    (async () => {
      try {
        const tokenParam = vipToken.trim() ? `&token=${encodeURIComponent(vipToken.trim())}` : '';
        const repairParam = streamReloadNonce > 0 ? `&repairNonce=${streamReloadNonce}` : '';
        const res = await fetch(
          `/api/vigloo/stream?programId=${program.id}&seasonId=${program.seasonId}&episodeNumber=${episodeNumber}&autoVip=${autoUnlockVip}&vipMode=${vipSourceMode}&title=${encodeURIComponent(program.title)}${tokenParam}${repairParam}`
        );
        const data: StreamData = await res.json();
        if (cancelled) return;
        setStreamData(data);

        // Fetch subtitle track
        if (data.subtitles && data.subtitles.length > 0) {
          const matchingTrack =
            data.subtitles.find((s) => s.lang === selectedSubLang) ||
            data.subtitles.find((s) => s.isDefault) ||
            data.subtitles.find((s) => s.lang.startsWith('en')) ||
            data.subtitles[0];

          if (matchingTrack) {
            setSelectedSubLang(matchingTrack.lang);
            const subRes = await fetch(matchingTrack.apiUrl);
            if (subRes.ok) {
              const subJson = await subRes.json();
              if (!cancelled && Array.isArray(subJson.cues)) {
                setCues(subJson.cues);
              }
            }
          }
        } else if (program.id === 15003223 && episodeNumber === 1) {
          setCues(parseWebVtt(DEFAULT_EP1_VTT));
        } else {
          setCues([]);
        }
      } catch {
        if (!cancelled && program.id === 15003223 && episodeNumber === 1) {
          setCues(parseWebVtt(DEFAULT_EP1_VTT));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStream(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [program.id, program.seasonId, program.title, episodeNumber, autoUnlockVip, vipSourceMode, vipToken, streamReloadNonce]);

  // Handle switching subtitle language dynamically
  const handleSelectSubLang = useCallback(
    async (lang: string) => {
      setSelectedSubLang(lang);
      setSubtitlesEnabled(true);
      const track = streamData?.subtitles?.find((s) => s.lang === lang);
      if (!track) return;
      try {
        const res = await fetch(track.apiUrl);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.cues)) {
            setCues(json.cues);
          }
        }
      } catch {
        // Keep existing cues on transient network error
      }
    },
    [streamData]
  );

  const { isWorkspaceExpanded } = resolveMiniPlayerState({
    activeSection: activeNav,
    manualMiniPlayer,
    dismissedMiniPlayer,
  });

  const handleReturnToMainPlayer = useCallback(() => {
    setActiveNav('player');
    setManualMiniPlayer(false);
    setDismissedMiniPlayer(false);
  }, []);

  const handleEnterMiniPlayer = useCallback(() => {
    setManualMiniPlayer(true);
    setDismissedMiniPlayer(false);
    if (activeNav === 'player') {
      setActiveNav('discover');
      setSidebarTab('recommended');
    }
  }, [activeNav]);

  const handleSelectNavSection = (section: ActiveNavSection) => {
    setActiveNav(section);
    setDismissedMiniPlayer(false);
    if (section === 'player') {
      setManualMiniPlayer(false);
      return;
    }
    if (section === 'episodes') setSidebarTab('episodes');
    else if (section === 'vip') setSidebarTab('vip');
    else if (section === 'discover') setSidebarTab('recommended');
    else if (section === 'saved') setSidebarTab('saved');
  };

  const handleLoadProgram = (newProgramId: number, newEp: number) => {
    setProgramId(newProgramId);
    setEpisodeNumber(newEp);
    setSidebarTab('episodes');
    setActiveNav('player');
    setManualMiniPlayer(false);
    setDismissedMiniPlayer(false);
  };

  const isBookmarked = savedPrograms.some((item) => item.id === program.id);

  const handleToggleBookmark = () => {
    setSavedPrograms((prev) => {
      const exists = prev.some((item) => item.id === program.id);
      const next = exists
        ? prev.filter((item) => item.id !== program.id)
        : [
            {
              id: program.id,
              title: program.title,
              subTitle: program.subTitle,
              seasonId: program.seasonId,
              episodeCount: program.episodeCount,
              appFreeEpCount: program.appFreeEpCount,
              genres: program.genres,
              tags: program.metaTags,
              thumbnail: program.posterUrl,
              titleImage: program.titleImage,
              synopsis: program.synopsis,
              viewCount: program.viewCount,
            },
            ...prev,
          ];
      try {
        localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  const currentEpisodeObj = program.episodes.find((e) => e.episodeNumber === episodeNumber);
  const currentEpisodeDuration =
    streamData?.isVipAutoUnlocked && vipSourceMode === 'storyboard'
      ? 30
      : currentEpisodeObj?.duration || 78;

  return (
    <div className="min-h-dvh bg-[#09090B] text-white flex flex-col">
      <TopBar
        activeSection={activeNav}
        savedCount={savedPrograms.length}
        uiLang={uiLang}
        onSelectSection={handleSelectNavSection}
        onOpenUrlModal={() => setIsUrlModalOpen(true)}
      />

      <main className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden">
        <VideoStage
          programTitle={program.title}
          seasonId={program.seasonId}
          episodeNumber={episodeNumber}
          totalEpisodes={program.episodeCount}
          freeEpisodeCount={program.appFreeEpCount}
          episodeDuration={currentEpisodeDuration}
          streamData={streamData}
          isLoadingStream={isLoadingStream}
          cues={cues}
          selectedSubLang={selectedSubLang}
          subtitlesEnabled={subtitlesEnabled}
          autoAdvance={autoAdvance}
          autoUnlockVip={autoUnlockVip}
          autoDownloadOnWatch={autoDownloadOnWatch}
          vipSourceMode={vipSourceMode}
          uiLang={uiLang}
          currentTime={currentTime}
          seekRequest={seekRequest}
          isMiniPlayer={isWorkspaceExpanded}
          isMiniPlayerDismissed={dismissedMiniPlayer}
          miniPlayerCorner={miniPlayerCorner}
          onTimeUpdate={setCurrentTime}
          onSelectEpisode={(ep) => setEpisodeNumber(ep)}
          onSelectSubLang={handleSelectSubLang}
          onToggleSubtitles={() => setSubtitlesEnabled((s) => !s)}
          onToggleAutoUnlockVip={() => setAutoUnlockVip((v) => !v)}
          onToggleAutoDownloadOnWatch={() => setAutoDownloadOnWatch((d) => !d)}
          onChangeVipSourceMode={setVipSourceMode}
          onOpenVipPanel={() => {
            setSidebarTab('vip');
          }}
          onOpenCoversPanel={() => {
            setSidebarTab('covers');
          }}
          onEnterMiniPlayer={handleEnterMiniPlayer}
          onExpandFromMiniPlayer={handleReturnToMainPlayer}
          onDismissMiniPlayer={() => setDismissedMiniPlayer(true)}
          onRestoreMiniPlayer={() => setDismissedMiniPlayer(false)}
          onCycleMiniPlayerCorner={() => setMiniPlayerCorner((c) => getNextMiniPlayerCorner(c))}
          onAutoRepairComplete={() => {
            setAutoUnlockVip(true);
            setStreamReloadNonce((n) => n + 1);
          }}
        />

        <SeriesSidebar
          program={program}
          activeEpisode={episodeNumber}
          activeTab={sidebarTab}
          cues={cues}
          currentTime={currentTime}
          streamData={streamData}
          selectedSubLang={selectedSubLang}
          isBookmarked={isBookmarked}
          savedPrograms={savedPrograms}
          autoAdvance={autoAdvance}
          autoUnlockVip={autoUnlockVip}
          autoDownloadOnWatch={autoDownloadOnWatch}
          vipSourceMode={vipSourceMode}
          vipToken={vipToken}
          uiLang={uiLang}
          isExpandedWorkspace={isWorkspaceExpanded}
          onChangeTab={(tab) => {
            setSidebarTab(tab);
            if (isWorkspaceExpanded) {
              if (tab === 'vip') setActiveNav('vip');
              else if (tab === 'episodes') setActiveNav('episodes');
              else if (tab === 'recommended') setActiveNav('discover');
              else if (tab === 'saved') setActiveNav('saved');
            }
          }}
          onSelectEpisode={(ep) => setEpisodeNumber(ep)}
          onSeekToCue={(seconds) => setSeekRequest({ time: seconds, nonce: Date.now() })}
          onSelectSubLang={handleSelectSubLang}
          onToggleBookmark={handleToggleBookmark}
          onSelectRecommendedProgram={(newId) => handleLoadProgram(newId, 1)}
          onOpenSeriesVipBatch={(newId) => {
            setProgramId(newId);
            setEpisodeNumber(1);
            setSidebarTab('vip');
          }}
          onToggleAutoAdvance={() => setAutoAdvance((a) => !a)}
          onToggleAutoUnlockVip={() => setAutoUnlockVip((v) => !v)}
          onToggleAutoDownloadOnWatch={() => setAutoDownloadOnWatch((d) => !d)}
          onChangeVipSourceMode={setVipSourceMode}
          onChangeVipToken={setVipToken}
          onToggleUiLang={() => setUiLang((l) => (l === 'km' ? 'en' : 'km'))}
          onReturnToPlayer={handleReturnToMainPlayer}
          onAutoRepairComplete={() => {
            setAutoUnlockVip(true);
            setStreamReloadNonce((n) => n + 1);
          }}
        />
      </main>

      <LoadUrlModal
        isOpen={isUrlModalOpen}
        currentUrl={`https://www.vigloo.com/en/video/${program.id}?episode=${episodeNumber}`}
        uiLang={uiLang}
        onClose={() => setIsUrlModalOpen(false)}
        onLoadProgram={handleLoadProgram}
      />
    </div>
  );
}
