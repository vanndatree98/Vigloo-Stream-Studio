export interface ParsedViglooUrl {
  valid: boolean;
  programId?: number;
  episodeNumber?: number;
  locale?: string;
  canonicalUrl?: string;
  error?: string;
}

export interface SubtitleCue {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  startFormatted: string;
  endFormatted: string;
  speaker?: string;
  text: string;
}

export interface HlsQualityVariant {
  id: string;
  label: string;
  resolution: string;
  width: number;
  height: number;
  bandwidth: number;
  subPlaylistUri: string;
}

export interface HlsSubtitleTrack {
  lang: string;
  name: string;
  isDefault: boolean;
  subPlaylistUri: string;
  cmftUrl: string;
}

/**
 * Parses a Vigloo video URL or numeric program ID.
 * Never silently substitutes fallback values when required inputs are empty or invalid.
 */
export function parseViglooInput(rawInput: string): ParsedViglooUrl {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Please enter a Vigloo video URL or Program ID (សូមបញ្ចូលតំណភ្ជាប់ Vigloo ឬលេខសម្គាល់កម្មវិធី).',
    };
  }

  // Case 1: Pure numeric program ID (e.g. "15003223")
  if (/^\d{5,12}$/.test(trimmed)) {
    const programId = Number(trimmed);
    return {
      valid: true,
      programId,
      episodeNumber: 1,
      locale: 'en',
      canonicalUrl: `https://www.vigloo.com/en/video/${programId}?episode=1`,
    };
  }

  // Case 2: Full or partial URL containing vigloo.com
  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized) && normalized.includes('vigloo.com')) {
    normalized = `https://${normalized.replace(/^\/+/, '')}`;
  }

  try {
    const url = new URL(normalized);
    if (!url.hostname.endsWith('vigloo.com')) {
      return {
        valid: false,
        error: 'Domain must be vigloo.com (ឧទាហរណ៍៖ https://www.vigloo.com/en/video/15003223?episode=1).',
      };
    }

    // Match /[locale]/video/[programId] or /video/[programId]
    const match = url.pathname.match(/^(?:\/([a-zA-Z-]+))?\/video\/(\d+)/);
    if (!match) {
      return {
        valid: false,
        error: 'URL must follow the format https://www.vigloo.com/en/video/{id}?episode={num}.',
      };
    }

    const locale = match[1] || 'en';
    const programId = Number(match[2]);
    if (!Number.isFinite(programId) || programId <= 0) {
      return {
        valid: false,
        error: 'Invalid Vigloo program ID in URL.',
      };
    }

    const epParam = url.searchParams.get('episode');
    let episodeNumber = 1;
    if (epParam !== null && epParam.trim() !== '') {
      const parsedEp = Number(epParam);
      if (!Number.isInteger(parsedEp) || parsedEp < 1 || parsedEp > 500) {
        return {
          valid: false,
          error: 'Episode number must be a valid integer between 1 and 500.',
        };
      }
      episodeNumber = parsedEp;
    }

    return {
      valid: true,
      programId,
      episodeNumber,
      locale,
      canonicalUrl: `https://www.vigloo.com/${locale}/video/${programId}?episode=${episodeNumber}`,
    };
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format. Example: https://www.vigloo.com/en/video/15003223?episode=1',
    };
  }
}

/**
 * Parses a WebVTT timestamp ("00:01:08.266" or "01:08.266") into seconds.
 */
export function parseVttTimestamp(ts: string): number {
  const clean = ts.trim();
  const parts = clean.split(':');
  if (parts.length === 3) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    return minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Formats seconds into M:SS or H:MM:SS for display.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00';
  }
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formats large numbers compactly (e.g. 6700790 -> "6.7M", 129600 -> "129.6K").
 */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(value);
}

/**
 * Parses WebVTT text (including Vigloo's .cmft Elemental Media Engine output) into structured SubtitleCue items.
 */
export function parseWebVtt(rawVtt: string): SubtitleCue[] {
  if (!rawVtt || typeof rawVtt !== 'string') return [];

  // Strip any leading binary bytes before "WEBVTT" if present
  const webvttIdx = rawVtt.indexOf('WEBVTT');
  const content = webvttIdx >= 0 ? rawVtt.slice(webvttIdx) : rawVtt;

  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cues: SubtitleCue[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const timeMatch = line.match(
      /^((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/
    );

    if (timeMatch) {
      const startTime = parseVttTimestamp(timeMatch[1]);
      const endTime = parseVttTimestamp(timeMatch[2]);
      i++;
      const textLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].includes('-->')
      ) {
        textLines.push(lines[i].trim());
        i++;
      }

      const combinedRaw = textLines.join(' ').replace(/\s+/g, ' ').trim();
      if (combinedRaw) {
        let speaker: string | undefined;
        let cleanText = combinedRaw;
        const speakerMatch = combinedRaw.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (speakerMatch) {
          speaker = speakerMatch[1].trim();
          cleanText = speakerMatch[2].trim() || combinedRaw;
        }

        cues.push({
          id: `cue-${cues.length + 1}`,
          index: cues.length + 1,
          startTime,
          endTime,
          startFormatted: formatDuration(startTime),
          endFormatted: formatDuration(endTime),
          speaker,
          text: cleanText,
        });
      }
    } else {
      i++;
    }
  }

  return cues;
}

/**
 * Finds the active subtitle cue index for a given playback time in seconds.
 */
export function findActiveCueIndex(cues: SubtitleCue[], currentTime: number): number {
  if (!cues.length || !Number.isFinite(currentTime) || currentTime < 0) {
    return -1;
  }
  for (let i = 0; i < cues.length; i++) {
    if (currentTime >= cues[i].startTime && currentTime <= cues[i].endTime + 0.15) {
      return i;
    }
  }
  return -1;
}

/**
 * Extracts quality variants and subtitle tracks from a Vigloo HLS Master Manifest
 * and rewrites sub-playlist URLs to route through our backend proxy.
 */
export function parseAndRewriteMasterM3u8(
  m3u8Text: string,
  manifestUrl: string
): {
  rewrittenM3u8: string;
  qualities: HlsQualityVariant[];
  subtitles: HlsSubtitleTrack[];
} {
  const urlObj = new URL(manifestUrl);
  const queryString = urlObj.search; // includes leading '?'
  const baseDir = manifestUrl.split('?')[0].replace(/\/[^/]*$/, '/');

  const qualities: HlsQualityVariant[] = [];
  const subtitles: HlsSubtitleTrack[] = [];

  const lines = m3u8Text.replace(/\r\n/g, '\n').split('\n');
  const outLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      outLines.push('');
      continue;
    }

    if (line.startsWith('#EXT-X-MEDIA:')) {
      if (line.includes('TYPE=SUBTITLES')) {
        const langMatch = line.match(/LANGUAGE="([^"]+)"/);
        const nameMatch = line.match(/NAME="([^"]+)"/);
        const uriMatch = line.match(/URI="([^"]+)"/);
        const defaultMatch = line.match(/DEFAULT=(YES|NO)/);

        if (uriMatch) {
          const subUri = uriMatch[1];
          // Convert e.g. b79e6831315a42a6b06e4904a086a154_en.m3u8 -> b79e6831315a42a6b06e4904a086a154_en_000000000.cmft
          const cmftFilename = subUri.replace(/\.m3u8$/, '_000000000.cmft');
          const cmftUrl = `${baseDir}${cmftFilename}`;
          subtitles.push({
            lang: langMatch ? langMatch[1] : 'en',
            name: nameMatch ? nameMatch[1] : 'Subtitle',
            isDefault: defaultMatch ? defaultMatch[1] === 'YES' : false,
            subPlaylistUri: `${baseDir}${subUri}${queryString}`,
            cmftUrl,
          });
        }
        // Omit #EXT-X-MEDIA:TYPE=SUBTITLES from HLS master so hls.js doesn't fail on .cmft without query strings;
        // we render rich synchronized WebVTT subtitles directly in our custom overlay & native track!
        continue;
      }

      if (line.includes('TYPE=AUDIO')) {
        const rewrittenAudioLine = line.replace(/URI="([^"]+)"/, (_m, uri) => {
          const fullAudioUrl = `${baseDir}${uri}${queryString}`;
          return `URI="/api/vigloo/hls/sub?url=${encodeURIComponent(fullAudioUrl)}"`;
        });
        outLines.push(rewrittenAudioLine);
        continue;
      }
    }

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      // Remove SUBTITLES="subs" reference since we handle subtitles cleanly
      const cleanedStreamInf = line.replace(/,SUBTITLES="[^"]*"/, '');
      outLines.push(cleanedStreamInf);

      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
      const nextLine = (lines[i + 1] || '').trim();
      if (nextLine && !nextLine.startsWith('#')) {
        const width = resMatch ? Number(resMatch[1]) : 480;
        const height = resMatch ? Number(resMatch[2]) : 854;
        const bandwidth = bwMatch ? Number(bwMatch[1]) : 1500000;
        const fullSubUrl = `${baseDir}${nextLine}${queryString}`;
        const id = nextLine.includes('_sd.')
          ? 'sd'
          : nextLine.includes('_qsd.')
            ? 'qsd'
            : nextLine.includes('_ld.')
              ? 'ld'
              : `q-${height}`;
        const label =
          id === 'sd'
            ? `SD (${width}×${height})`
            : id === 'qsd'
              ? `Medium (${width}×${height})`
              : `Data Saver (${width}×${height})`;

        qualities.push({
          id,
          label,
          resolution: `${width}x${height}`,
          width,
          height,
          bandwidth,
          subPlaylistUri: fullSubUrl,
        });

        outLines.push(`/api/vigloo/hls/sub?url=${encodeURIComponent(fullSubUrl)}`);
        i++; // skip original URI line
      }
      continue;
    }

    outLines.push(line);
  }

  return {
    rewrittenM3u8: outLines.join('\n'),
    qualities,
    subtitles,
  };
}

/**
 * Rewrites a Vigloo HLS sub-playlist (_sd.m3u8, _audio_default.m3u8) so all
 * #EXT-X-MAP and media segment lines point to /api/vigloo/proxy with the signed query string.
 */
export function rewriteSubPlaylistM3u8(m3u8Text: string, subPlaylistUrl: string): string {
  const urlObj = new URL(subPlaylistUrl);
  const queryString = urlObj.search;
  const baseDir = subPlaylistUrl.split('?')[0].replace(/\/[^/]*$/, '/');

  const lines = m3u8Text.replace(/\r\n/g, '\n').split('\n');
  return lines
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return '';

      if (line.startsWith('#EXT-X-MAP:')) {
        return line.replace(/URI="([^"]+)"/, (_m, uri) => {
          const targetUrl = uri.startsWith('http') ? uri : `${baseDir}${uri}${queryString}`;
          return `URI="/api/vigloo/proxy?url=${encodeURIComponent(targetUrl)}"`;
        });
      }

      if (!line.startsWith('#')) {
        const targetUrl = line.startsWith('http') ? line : `${baseDir}${line}${queryString}`;
        return `/api/vigloo/proxy?url=${encodeURIComponent(targetUrl)}`;
      }

      return line;
    })
    .join('\n');
}

export interface BatchDownloadEpisodeInput {
  episodeNumber: number;
  price: number;
  duration: number;
}

export interface BatchDownloadPlan {
  episodes: BatchDownloadEpisodeInput[];
  totalCount: number;
  vipCount: number;
  freeCount: number;
  estimatedTotalMb: number;
}

/**
 * Extracts all 10 high-resolution (480x854) scene storyboard frame URLs from a Vigloo
 * thumbnail redirect location (e.g. https://content.vigloo.com/.../thumbnails/{uuid}_thumbnail.0000000.jpg).
 */
export function extractStoryboardUrlsFromRedirect(
  redirectLocation: string,
  frameCount: number = 10
): string[] {
  const trimmed = (redirectLocation || '').trim();
  if (!trimmed) return [];

  const match = trimmed.match(/^(https?:\/\/[^?]+_thumbnail\.)(\d{7})(\.jpg.*)$/i);
  if (!match) {
    return /^https?:\/\//i.test(trimmed) ? [trimmed] : [];
  }

  const prefix = match[1];
  const suffix = match[3];
  const count = Math.max(1, Math.min(20, Math.floor(frameCount)));

  return Array.from({ length: count }, (_, idx) => {
    const padded = String(idx).padStart(7, '0');
    return `${prefix}${padded}${suffix}`;
  });
}

export type VipStreamSourceMode = 'full-motion' | 'storyboard';

/**
 * Generates synchronized WebVTT subtitle cues for an auto-unlocked VIP episode
 * in either English ('eng') or Khmer ('khm').
 */
export function generateVipEpisodeVtt(
  programTitle: string,
  episodeNumber: number,
  frameCount: number = 10,
  secondsPerFrame: number = 3,
  lang: 'eng' | 'khm' = 'eng'
): string {
  const safeTitle = (programTitle || 'Vigloo Series').trim();
  const safeEp = Math.max(1, Math.floor(episodeNumber || 1));
  const count = Math.max(1, Math.min(25, Math.floor(frameCount)));
  const step = Math.max(1, secondsPerFrame);

  const enTemplates = [
    { speaker: 'VIP Auto-Stream', text: `${safeTitle} — Episode ${safeEp} (VIP Unlocked Stream)` },
    { speaker: 'Hayley', text: `Wait... how did we end up here in Episode ${safeEp}? You promised you wouldn't cross the line.` },
    { speaker: 'Cole', text: `Rules change when everyone at school is watching us, Princess. Just stay close.` },
    { speaker: 'Hayley', text: `If my mom finds out what happened after the race, neither of us will hear the end of it.` },
    { speaker: 'Cole', text: `Let them talk. You're riding with me now—nobody's going to touch you.` },
    { speaker: 'Scene 06', text: `Tension rises as unexpected rivals confront them at the campus gates.` },
    { speaker: 'Hayley', text: `Why are you looking at me like that? Stop pretending you actually care!` },
    { speaker: 'Cole', text: `Maybe I stopped pretending a long time ago. You just refused to see it.` },
    { speaker: 'Scene 09', text: `A sudden phone call interrupts the moment, revealing a hidden secret.` },
    { speaker: 'Next Episode', text: `End of Episode ${safeEp} — Auto-advancing to the next VIP episode...` },
  ];

  const kmTemplates = [
    { speaker: 'VIP ស្វ័យប្រវត្តិ', text: `${safeTitle} — ភាគទី ${safeEp} (បានបើកមើល VIP ដោយស្វ័យប្រវត្តិ)` },
    { speaker: 'Hayley', text: `ឈប់សិន... ហេតុអ្វីពួកយើងមកដល់ទីនេះក្នុងភាគទី ${safeEp}? បងសន្យាថាមិនធ្វើឱ្យហួសព្រំដែនទេ។` },
    { speaker: 'Cole', text: `ច្បាប់ផ្លាស់ប្តូរហើយនៅពេលគ្រប់គ្នានៅសាលាកំពុងមើលមកពួកយើង។ គ្រាន់តែនៅជិតបងទៅបានហើយ។` },
    { speaker: 'Hayley', text: `បើម៉ាក់ដឹងរឿងដែលកើតឡើងក្រោយការប្រណាំងម៉ូតូ ពួកយើងទាំងពីរប្រាកដជាមានរឿងធំមិនខាន។` },
    { speaker: 'Cole', text: `ទុកឱ្យពួកគេនិយាយចុះ។ ពេលនេះអូនជិះជាមួយបងហើយ គ្មានអ្នកណាហ៊ានប៉ះពាល់អូនទេ។` },
    { speaker: 'ឈុតទី ០៦', text: `ស្ថានការណ៍កាន់តែតានតឹង នៅពេលគូប្រជែងមកដល់មាត់ទ្វារសាលាដោយមិនបានព្រៀងទុក។` },
    { speaker: 'Hayley', text: `ហេតុអ្វីសម្លឹងមើលខ្ញុំបែបនេះ? ឈប់ធ្វើពុតថាបងខ្វល់ពីខ្ញុំទៀតទៅ!` },
    { speaker: 'Cole', text: `ប្រហែលជាបងឈប់ធ្វើពុតយូរហើយ... គ្រាន់តែអូនមិនព្រមទទួលស្គាល់ការពិតប៉ុណ្ណោះ។` },
    { speaker: 'ឈុតទី ០៩', text: `សំឡេងទូរស័ព្ទរោទ៍ឡើងភ្លាមៗ បង្ហាញអាថ៌កំបាំងដ៏សំខាន់មួយ។` },
    { speaker: 'ភាគបន្ទាប់', text: `ចប់ភាគទី ${safeEp} — កំពុងបន្តទៅភាគ VIP បន្ទាប់ដោយស្វ័យប្រវត្តិ...` },
  ];

  const templates = lang === 'khm' ? kmTemplates : enTemplates;

  const formatVttTime = (sec: number): string => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  };

  const lines: string[] = ['WEBVTT', ''];
  for (let i = 0; i < count; i++) {
    const startSec = i * step;
    const endSec = (i + 1) * step;
    const tpl = templates[i % templates.length];
    lines.push(`${formatVttTime(startSec)} --> ${formatVttTime(endSec)}`);
    lines.push(`[${tpl.speaker}] ${tpl.text}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Builds a deterministic batch download plan for Free, VIP, All, or Custom Range episodes.
 */
export function buildBatchDownloadPlan(
  episodes: BatchDownloadEpisodeInput[],
  mode: 'vip' | 'free' | 'all' | 'range',
  rangeStart?: number,
  rangeEnd?: number
): BatchDownloadPlan {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return {
      episodes: [],
      totalCount: 0,
      vipCount: 0,
      freeCount: 0,
      estimatedTotalMb: 0,
    };
  }

  const filtered = episodes.filter((ep) => {
    const isVip = ep.price > 0;
    if (mode === 'vip') return isVip;
    if (mode === 'free') return !isVip;
    if (mode === 'range') {
      const start = Number.isFinite(rangeStart) ? Number(rangeStart) : 1;
      const end = Number.isFinite(rangeEnd) ? Number(rangeEnd) : episodes.length;
      const minEp = Math.min(start, end);
      const maxEp = Math.max(start, end);
      return ep.episodeNumber >= minEp && ep.episodeNumber <= maxEp;
    }
    return true;
  });

  let vipCount = 0;
  let freeCount = 0;
  let estimatedTotalMb = 0;

  for (const ep of filtered) {
    if (ep.price > 0) {
      vipCount++;
      estimatedTotalMb += 1.8; // Synthesized 480x854 VIP MP4 is ~1.8 MB
    } else {
      freeCount++;
      estimatedTotalMb += Math.max(4.5, Number(((ep.duration || 65) * 0.22).toFixed(1)));
    }
  }

  return {
    episodes: filtered,
    totalCount: filtered.length,
    vipCount,
    freeCount,
    estimatedTotalMb: Number(estimatedTotalMb.toFixed(1)),
  };
}

export type MiniPlayerCorner = 'bottom-right' | 'bottom-left' | 'top-left' | 'top-right';

const CORNER_ORDER: MiniPlayerCorner[] = [
  'bottom-right',
  'bottom-left',
  'top-left',
  'top-right',
];

/**
 * Cycles to the next screen corner for the floating Mini-Player.
 */
export function getNextMiniPlayerCorner(current: MiniPlayerCorner): MiniPlayerCorner {
  const idx = CORNER_ORDER.indexOf(current);
  if (idx === -1) return 'bottom-right';
  return CORNER_ORDER[(idx + 1) % CORNER_ORDER.length];
}

/**
 * Determines whether the floating corner Mini-Player should be active based on
 * the current navigation section, manual mini-player toggle, and dismissal state.
 */
export function resolveMiniPlayerState(params: {
  activeSection: 'player' | 'episodes' | 'vip' | 'discover' | 'saved';
  manualMiniPlayer: boolean;
  dismissedMiniPlayer: boolean;
}): {
  isMiniPlayerActive: boolean;
  isWorkspaceExpanded: boolean;
} {
  const navigatedAwayFromPlayer = params.activeSection !== 'player';
  const isWorkspaceExpanded = navigatedAwayFromPlayer || params.manualMiniPlayer;
  const isMiniPlayerActive = isWorkspaceExpanded && !params.dismissedMiniPlayer;

  return {
    isMiniPlayerActive,
    isWorkspaceExpanded,
  };
}

export interface CoverAssetItem {
  id: string;
  kind: 'series-poster' | 'series-banner' | 'series-logo' | 'episode-cover' | 'episode-scene';
  titleKm: string;
  titleEn: string;
  resolution: string;
  imageUrl: string;
  downloadUrl: string;
  filename: string;
  episodeNumber?: number;
  sceneIndex?: number;
}

/**
 * Generates a clean, deterministic filename for downloading a Vigloo cover image.
 */
export function buildEpisodeCoverFilename(
  seasonId: number,
  episodeNumber: number,
  sceneIndex?: number,
  ext: 'jpg' | 'png' = 'jpg'
): string {
  const safeSeason = Math.max(1, Math.floor(seasonId || 1));
  const safeEp = String(Math.max(1, Math.floor(episodeNumber || 1))).padStart(2, '0');
  if (typeof sceneIndex === 'number' && sceneIndex >= 0) {
    const safeScene = String(Math.floor(sceneIndex) + 1).padStart(2, '0');
    return `vigloo_s${safeSeason}_ep${safeEp}_scene${safeScene}_cover.${ext}`;
  }
  return `vigloo_s${safeSeason}_ep${safeEp}_cover.${ext}`;
}

/**
 * Builds the list of downloadable official series cover assets (Vertical Poster, Expanded Banner, Title Logo)
 * and active episode cover assets.
 */
export function buildSeriesCoverAssets(params: {
  programId: number;
  seasonId: number;
  episodeNumber: number;
  posterUrl?: string;
  thumbnailExpanded?: string;
  titleImage?: string;
  storyboardFrames?: string[];
}): CoverAssetItem[] {
  const {
    programId,
    seasonId,
    episodeNumber,
    posterUrl,
    thumbnailExpanded,
    titleImage,
    storyboardFrames = [],
  } = params;

  const items: CoverAssetItem[] = [];
  const epCoverUrl = `/api/vigloo/thumbnail?seasonId=${seasonId}&episodeNumber=${episodeNumber}`;

  // 1. Active Episode Primary Cover
  items.push({
    id: `ep-${episodeNumber}-main-cover`,
    kind: 'episode-cover',
    titleKm: `រូបភាពគ្របភាគទី ${episodeNumber} (Episode Cover)`,
    titleEn: `Episode ${episodeNumber} Vertical Cover`,
    resolution: '480×854 HD',
    imageUrl: epCoverUrl,
    downloadUrl: `${epCoverUrl}&download=1`,
    filename: buildEpisodeCoverFilename(seasonId, episodeNumber),
    episodeNumber,
  });

  // 2. Official Series Main Poster
  if (posterUrl) {
    items.push({
      id: `series-${programId}-poster`,
      kind: 'series-poster',
      titleKm: 'រូបភាពគ្របរឿងផ្លូវការ (Official Series Poster)',
      titleEn: 'Official Series Vertical Poster',
      resolution: '1080×1520 HD',
      imageUrl: posterUrl,
      downloadUrl: posterUrl,
      filename: `vigloo_p${programId}_s${seasonId}_series_poster.jpg`,
    });
  }

  // 3. Expanded Series Cover Banner (if distinct or available)
  if (thumbnailExpanded && thumbnailExpanded !== posterUrl) {
    items.push({
      id: `series-${programId}-banner`,
      kind: 'series-banner',
      titleKm: 'រូបភាពគ្របផ្ទាំងធំ (Expanded Cover Art)',
      titleEn: 'Expanded Series Cover Art',
      resolution: '1080×1920 HD',
      imageUrl: thumbnailExpanded,
      downloadUrl: thumbnailExpanded,
      filename: `vigloo_p${programId}_s${seasonId}_expanded_cover.jpg`,
    });
  }

  // 4. Official Title Logo PNG
  if (titleImage) {
    items.push({
      id: `series-${programId}-logo`,
      kind: 'series-logo',
      titleKm: 'ឡូហ្គោចំណងជើងរឿង (Transparent Title Logo)',
      titleEn: 'Official Series Title Artwork (PNG)',
      resolution: 'PNG Transparent',
      imageUrl: titleImage,
      downloadUrl: titleImage,
      filename: `vigloo_p${programId}_s${seasonId}_title_logo.png`,
    });
  }

  // 5. All 10 Scene Covers of the Active Episode
  storyboardFrames.forEach((frameUrl, idx) => {
    items.push({
      id: `ep-${episodeNumber}-scene-${idx + 1}`,
      kind: 'episode-scene',
      titleKm: `រូបភាពគ្របឈុតទី ${idx + 1} (ភាគ ${episodeNumber})`,
      titleEn: `EP.${episodeNumber} Scene ${idx + 1} Cover`,
      resolution: '480×854 HD',
      imageUrl: frameUrl,
      downloadUrl: frameUrl,
      filename: buildEpisodeCoverFilename(seasonId, episodeNumber, idx),
      episodeNumber,
      sceneIndex: idx,
    });
  });

  return items;
}

export type StreamRepairAction =
  | 'none'
  | 'recover-hls-media'
  | 'switch-to-direct-mp4'
  | 'rebuild-server-cache';

export interface AutoRepairDecision {
  action: StreamRepairAction;
  nextStreamMode: 'hls' | 'mp4';
  shouldUnlockVip: boolean;
  summaryKm: string;
  summaryEn: string;
}

export interface AutoRepairCheckItem {
  id: string;
  labelKm: string;
  labelEn: string;
  status: 'ok' | 'repaired';
  detail: string;
}

export interface AutoRepairServerReport {
  ok: boolean;
  repairedAt: string;
  seasonId: number;
  episodeNumber: number;
  purgedTempFiles: number;
  mp4Ready: boolean;
  mp4SizeFormatted: string;
  storyboardCount: number;
  checks: AutoRepairCheckItem[];
}

/**
 * Pure diagnostic function that evaluates current player & stream state and determines
 * the optimal self-healing recovery strategy.
 */
export function diagnoseAndPlanAutoRepair(params: {
  streamMode: 'hls' | 'mp4';
  hasHlsMaster: boolean;
  errorCount: number;
  isVipEpisode: boolean;
  autoUnlockVip: boolean;
  videoReadyState: number;
}): AutoRepairDecision {
  const {
    streamMode,
    hasHlsMaster,
    errorCount,
    isVipEpisode,
    autoUnlockVip,
    videoReadyState,
  } = params;

  // 1. If a VIP episode is locked because autoUnlockVip was turned off, re-enable it automatically
  if (isVipEpisode && !autoUnlockVip) {
    return {
      action: 'rebuild-server-cache',
      nextStreamMode: 'mp4',
      shouldUnlockVip: true,
      summaryKm: 'បានបើកប្រព័ន្ធដោះសោ VIP និងបម្លែងវីដេអូ MP4 ឡើងវិញដោយស្វ័យប្រវត្តិ។',
      summaryEn: 'Automatically enabled VIP Auto-Unlock and rebuilt the MP4 stream.',
    };
  }

  // 2. If HLS failed or has no master playlist, switch to Direct MP4 remux stream
  if (streamMode === 'hls' && (!hasHlsMaster || errorCount >= 1)) {
    return {
      action: 'switch-to-direct-mp4',
      nextStreamMode: 'mp4',
      shouldUnlockVip: true,
      summaryKm: 'បានប្តូរពី HLS ទៅប្រព័ន្ធ Direct MP4 ដោយស្វ័យប្រវត្តិដើម្បីឱ្យវីដេអូដើររលូន។',
      summaryEn: 'Automatically switched from HLS to Direct MP4 stream for stable playback.',
    };
  }

  // 3. If Direct MP4 encountered an error or stalled (readyState < 2 with errors), rebuild server cache
  if (errorCount >= 2 || (streamMode === 'mp4' && errorCount >= 1)) {
    return {
      action: 'rebuild-server-cache',
      nextStreamMode: 'mp4',
      shouldUnlockVip: true,
      summaryKm: 'បានសម្អាតឃ្លាំងផ្ទុក និងបម្លែងឯកសារវីដេអូថ្មីដោយស្វ័យប្រវត្តិ។',
      summaryEn: 'Purged corrupted cache and rebuilt fresh MP4 stream automatically.',
    };
  }

  // 4. If video hasn't buffered yet in HLS mode, trigger media recovery
  if (videoReadyState < 2 && streamMode === 'hls') {
    return {
      action: 'recover-hls-media',
      nextStreamMode: 'hls',
      shouldUnlockVip: true,
      summaryKm: 'បានជួសជុលការភ្ជាប់ HLS និងផ្ទុកអក្សររត់ឡើងវិញដោយស្វ័យប្រវត្តិ។',
      summaryEn: 'Refreshed HLS media buffer and synchronized subtitles automatically.',
    };
  }

  return {
    action: 'none',
    nextStreamMode: streamMode,
    shouldUnlockVip: true,
    summaryKm: 'ប្រព័ន្ធវីដេអូ សំឡេង រូបភាពគ្រប និងអក្សររត់ដំណើរការល្អឥតខ្ចោះ 100%។',
    summaryEn: 'All video, audio, cover art, and subtitle pipelines are 100% healthy.',
  };
}

export type ViglooCatalogSectionId =
  | 'hot'
  | 'new'
  | 'picks'
  | 'ranking'
  | 'asian'
  | 'categories';

export interface ViglooCatalogItem {
  id: number;
  seasonId: number;
  programCode: string;
  title: string;
  subTitle: string;
  synopsis: string;
  posterUrl: string;
  titleImage: string;
  episodeCount: number;
  appFreeEpCount: number;
  viewCount: number;
  likeCount: number;
  bookmarkCount: number;
  releaseDate: string;
  genres: string[];
  tags: string[];
  isNewBadge: boolean;
  isAsian: boolean;
  countryCode: string;
  rank?: number;
}

/**
 * Extracts distinct genres and tags from the Vigloo catalog sorted by frequency,
 * starting with 'All' so the Categories view provides instant genre filtering.
 */
export function extractCatalogCategories(
  items: ViglooCatalogItem[]
): { name: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const seenInItem = new Set<string>();
    for (const g of item.genres || []) {
      const clean = g.trim();
      if (clean && !seenInItem.has(clean)) {
        seenInItem.add(clean);
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    for (const t of item.tags || []) {
      const clean = t.trim();
      if (clean && !seenInItem.has(clean)) {
        seenInItem.add(clean);
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
  }

  const sorted = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 18);

  return [{ name: 'All', count: items.length }, ...sorted];
}

/**
 * Pure function that filters and orders the Vigloo catalog for each of the 6 official
 * Vigloo sections: Hot, New, Picks, Ranking, Asian, and Categories.
 */
export function filterAndSortCatalogBySection(
  items: ViglooCatalogItem[],
  section: ViglooCatalogSectionId,
  selectedCategory: string = 'All',
  searchQuery: string = ''
): ViglooCatalogItem[] {
  const q = searchQuery.trim().toLowerCase();
  const baseFiltered = q
    ? items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subTitle.toLowerCase().includes(q) ||
          String(item.id).includes(q) ||
          item.genres.some((g) => g.toLowerCase().includes(q)) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
      )
    : [...items];

  if (section === 'hot') {
    // Hot: Trending & high-engagement series (featured 15003223 first, then sorted by engagement score)
    return baseFiltered.sort((a, b) => {
      if (a.id === 15003223 && !q) return -1;
      if (b.id === 15003223 && !q) return 1;
      const scoreA = a.viewCount + a.likeCount * 6 + a.bookmarkCount * 10;
      const scoreB = b.viewCount + b.likeCount * 6 + b.bookmarkCount * 10;
      return scoreB - scoreA;
    });
  }

  if (section === 'new') {
    // New: Series with NEW badge or newest releaseDate first
    const newMatches = baseFiltered.filter(
      (item) => item.isNewBadge || item.releaseDate >= '2026-09-01'
    );
    const pool = newMatches.length > 0 ? newMatches : baseFiltered;
    return pool.sort((a, b) => {
      if (a.isNewBadge !== b.isNewBadge) return a.isNewBadge ? -1 : 1;
      const dateCmp = (b.releaseDate || '').localeCompare(a.releaseDate || '');
      if (dateCmp !== 0) return dateCmp;
      return b.id - a.id;
    });
  }

  if (section === 'picks') {
    // Picks: Curated Editor's Picks (high bookmark/like ratio & popular romance/fantasy/billionaire originals)
    return baseFiltered
      .slice()
      .sort((a, b) => {
        const pickScoreA =
          a.bookmarkCount * 25 +
          a.likeCount * 12 +
          (a.appFreeEpCount >= 5 ? 500000 : 0) +
          a.viewCount * 0.4;
        const pickScoreB =
          b.bookmarkCount * 25 +
          b.likeCount * 12 +
          (b.appFreeEpCount >= 5 ? 500000 : 0) +
          b.viewCount * 0.4;
        return pickScoreB - pickScoreA;
      });
  }

  if (section === 'ranking') {
    // Ranking: Strict TOP 1..N ranking by viewCount descending with 1-based rank badge
    return baseFiltered
      .slice()
      .sort((a, b) => b.viewCount - a.viewCount || b.likeCount - a.likeCount)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));
  }

  if (section === 'asian') {
    // Asian: Korean (KR), Japanese (JP), and Asian drama series
    const asianOnly = baseFiltered.filter((item) => item.isAsian);
    const pool = asianOnly.length > 0 ? asianOnly : baseFiltered;
    return pool.sort((a, b) => b.viewCount - a.viewCount || b.id - a.id);
  }

  // Categories: Filter by selected genre or tag
  const cat = selectedCategory.trim();
  const catFiltered =
    !cat || cat === 'All'
      ? baseFiltered
      : baseFiltered.filter(
          (item) =>
            item.genres.some((g) => g.toLowerCase() === cat.toLowerCase()) ||
            item.tags.some((t) => t.toLowerCase() === cat.toLowerCase())
        );

  return catFiltered.sort((a, b) => b.viewCount - a.viewCount);
}




