import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseViglooInput,
  parseVttTimestamp,
  formatDuration,
  formatCompactNumber,
  parseWebVtt,
  findActiveCueIndex,
  parseAndRewriteMasterM3u8,
  rewriteSubPlaylistM3u8,
  extractStoryboardUrlsFromRedirect,
  generateVipEpisodeVtt,
  buildBatchDownloadPlan,
  getNextMiniPlayerCorner,
  resolveMiniPlayerState,
  buildEpisodeCoverFilename,
  buildSeriesCoverAssets,
} from './viglooParser';

test('parseViglooInput parses standard Vigloo video URL with episode query param', () => {
  const res = parseViglooInput('https://www.vigloo.com/en/video/15003223?episode=1');
  assert.equal(res.valid, true);
  assert.equal(res.programId, 15003223);
  assert.equal(res.episodeNumber, 1);
  assert.equal(res.locale, 'en');
  assert.equal(res.canonicalUrl, 'https://www.vigloo.com/en/video/15003223?episode=1');
});

test('parseViglooInput parses different locales, episodes, and numeric program IDs', () => {
  const koRes = parseViglooInput('https://www.vigloo.com/ko/video/15003049?episode=4');
  assert.equal(koRes.valid, true);
  assert.equal(koRes.programId, 15003049);
  assert.equal(koRes.episodeNumber, 4);
  assert.equal(koRes.locale, 'ko');

  const idRes = parseViglooInput('15003526');
  assert.equal(idRes.valid, true);
  assert.equal(idRes.programId, 15003526);
  assert.equal(idRes.episodeNumber, 1);
});

test('parseViglooInput rejects empty or invalid URLs without silent fallback', () => {
  const emptyRes = parseViglooInput('   ');
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.error);

  const wrongDomain = parseViglooInput('https://example.com/en/video/15003223?episode=1');
  assert.equal(wrongDomain.valid, false);

  const badEpisode = parseViglooInput('https://www.vigloo.com/en/video/15003223?episode=0');
  assert.equal(badEpisode.valid, false);
});

test('parseWebVtt parses Elemental Media Engine WebVTT with speakers and timestamps', () => {
  const sampleVtt = `WEBVTT\t#Elemental Media Engine(TM) 2.18.0.0
00:00:00.133 --> 00:00:00.913
[Hayley] Tell me again

00:00:00.997 --> 00:00:03.262
how being dragged
into the woods

00:00:30.507 --> 00:00:31.783
[Cole]
Trust me, Princess`;

  const cues = parseWebVtt(sampleVtt);
  assert.equal(cues.length, 3);
  assert.equal(cues[0].speaker, 'Hayley');
  assert.equal(cues[0].text, 'Tell me again');
  assert.ok(Math.abs(cues[0].startTime - 0.133) < 0.001);

  assert.equal(cues[1].speaker, undefined);
  assert.equal(cues[1].text, 'how being dragged into the woods');

  assert.equal(cues[2].speaker, 'Cole');
  assert.equal(cues[2].text, 'Trust me, Princess');
  assert.equal(findActiveCueIndex(cues, 0.5), 0);
  assert.equal(findActiveCueIndex(cues, 2.0), 1);
  assert.equal(findActiveCueIndex(cues, 15.0), -1);
  assert.equal(findActiveCueIndex(cues, 31.0), 2);
});

test('parseAndRewriteMasterM3u8 and rewriteSubPlaylistM3u8 rewrite CMAF endpoints with Policy query', () => {
  const master = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-STREAM-INF:BANDWIDTH=2126532,RESOLUTION=480x854,AUDIO="audio",SUBTITLES="subs"
b79e68_sd.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Alternate Audio",URI="b79e68_audio_default.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=YES,LANGUAGE="eng",URI="b79e68_en.m3u8"`;

  const manifestUrl =
    'https://secure-content.vigloo.com/media/us000/p87/s01/e001/b79e68.m3u8?Policy=ABC&Signature=DEF&Key-Pair-Id=XYZ';

  const parsed = parseAndRewriteMasterM3u8(master, manifestUrl);
  assert.equal(parsed.qualities.length, 1);
  assert.equal(parsed.qualities[0].id, 'sd');
  assert.equal(parsed.qualities[0].width, 480);
  assert.equal(parsed.qualities[0].height, 854);
  assert.equal(parsed.subtitles.length, 1);
  assert.equal(parsed.subtitles[0].name, 'English');
  assert.equal(
    parsed.subtitles[0].cmftUrl,
    'https://secure-content.vigloo.com/media/us000/p87/s01/e001/b79e68_en_000000000.cmft'
  );
  assert.ok(parsed.rewrittenM3u8.includes('/api/vigloo/hls/sub?url='));
  assert.ok(!parsed.rewrittenM3u8.includes('SUBTITLES="subs"'));

  const subM3u8 = `#EXTM3U
#EXT-X-MAP:URI="b79e68_sd.cmfv",BYTERANGE="1281@0"
#EXTINF:4,
#EXT-X-BYTERANGE:802311@1281
b79e68_sd.cmfv`;
  const rewrittenSub = rewriteSubPlaylistM3u8(
    subM3u8,
    'https://secure-content.vigloo.com/media/us000/p87/s01/e001/b79e68_sd.m3u8?Policy=ABC'
  );
  assert.ok(rewrittenSub.includes('URI="/api/vigloo/proxy?url='));
  assert.ok(rewrittenSub.includes('Policy%3DABC'));
});

test('formatDuration and formatCompactNumber format values accurately', () => {
  assert.equal(parseVttTimestamp('00:01:18.250'), 78.25);
  assert.equal(formatDuration(78), '1:18');
  assert.equal(formatDuration(3665), '1:01:05');
  assert.equal(formatCompactNumber(6700790), '6.7M');
  assert.equal(formatCompactNumber(129600), '129.6K');
});

test('extractStoryboardUrlsFromRedirect expands Vigloo thumbnail redirect into 10 scene frames', () => {
  const redirectUrl =
    'https://content.vigloo.com/media/us000/p87/s01/e006/thumbnails/cb9d60453b5c422cadc6b41d3ac370cf_thumbnail.0000000.jpg';
  const frames = extractStoryboardUrlsFromRedirect(redirectUrl, 10);
  assert.equal(frames.length, 10);
  assert.equal(
    frames[0],
    'https://content.vigloo.com/media/us000/p87/s01/e006/thumbnails/cb9d60453b5c422cadc6b41d3ac370cf_thumbnail.0000000.jpg'
  );
  assert.equal(
    frames[9],
    'https://content.vigloo.com/media/us000/p87/s01/e006/thumbnails/cb9d60453b5c422cadc6b41d3ac370cf_thumbnail.0000009.jpg'
  );
  assert.deepEqual(extractStoryboardUrlsFromRedirect(''), []);
});

test('generateVipEpisodeVtt creates valid WebVTT cues for VIP episodes in English and Khmer', () => {
  const vttEn = generateVipEpisodeVtt('Riding with My Bully Stepbrother', 6, 10, 3, 'eng');
  const cuesEn = parseWebVtt(vttEn);
  assert.equal(cuesEn.length, 10);
  assert.equal(cuesEn[0].startTime, 0);
  assert.equal(cuesEn[0].endTime, 3);
  assert.ok(cuesEn[0].text.includes('Episode 6'));
  assert.equal(cuesEn[9].startTime, 27);
  assert.equal(cuesEn[9].endTime, 30);

  const vttKm = generateVipEpisodeVtt('Riding with My Bully Stepbrother', 6, 10, 3, 'khm');
  const cuesKm = parseWebVtt(vttKm);
  assert.equal(cuesKm.length, 10);
  assert.ok(cuesKm[0].text.includes('ភាគទី 6'));
});

test('buildBatchDownloadPlan filters Free, VIP, All, and Custom Range episodes accurately', () => {
  const sampleEpisodes = Array.from({ length: 10 }, (_, idx) => ({
    episodeNumber: idx + 1,
    price: idx < 5 ? 0 : 50,
    duration: 60,
  }));

  const vipPlan = buildBatchDownloadPlan(sampleEpisodes, 'vip');
  assert.equal(vipPlan.totalCount, 5);
  assert.equal(vipPlan.vipCount, 5);
  assert.equal(vipPlan.freeCount, 0);
  assert.equal(vipPlan.episodes[0].episodeNumber, 6);

  const freePlan = buildBatchDownloadPlan(sampleEpisodes, 'free');
  assert.equal(freePlan.totalCount, 5);
  assert.equal(freePlan.freeCount, 5);
  assert.equal(freePlan.vipCount, 0);

  const rangePlan = buildBatchDownloadPlan(sampleEpisodes, 'range', 4, 7);
  assert.equal(rangePlan.totalCount, 4);
  assert.equal(rangePlan.freeCount, 2);
  assert.equal(rangePlan.vipCount, 2);
});

test('getNextMiniPlayerCorner and resolveMiniPlayerState manage mini-player transitions', () => {
  assert.equal(getNextMiniPlayerCorner('bottom-right'), 'bottom-left');
  assert.equal(getNextMiniPlayerCorner('bottom-left'), 'top-left');
  assert.equal(getNextMiniPlayerCorner('top-left'), 'top-right');
  assert.equal(getNextMiniPlayerCorner('top-right'), 'bottom-right');

  // Main player view with manualMiniPlayer=false -> full stage, not mini-player
  const mainState = resolveMiniPlayerState({
    activeSection: 'player',
    manualMiniPlayer: false,
    dismissedMiniPlayer: false,
  });
  assert.equal(mainState.isMiniPlayerActive, false);
  assert.equal(mainState.isWorkspaceExpanded, false);

  // Navigating to 'discover' or 'vip' activates corner mini-player automatically
  const discoverState = resolveMiniPlayerState({
    activeSection: 'discover',
    manualMiniPlayer: false,
    dismissedMiniPlayer: false,
  });
  assert.equal(discoverState.isMiniPlayerActive, true);
  assert.equal(discoverState.isWorkspaceExpanded, true);

  // Dismissing the mini-player while navigated away keeps workspace expanded but hides mini-player
  const dismissedState = resolveMiniPlayerState({
    activeSection: 'vip',
    manualMiniPlayer: false,
    dismissedMiniPlayer: true,
  });
  assert.equal(dismissedState.isMiniPlayerActive, false);
  assert.equal(dismissedState.isWorkspaceExpanded, true);
});

test('buildEpisodeCoverFilename and buildSeriesCoverAssets build downloadable cover items accurately', () => {
  assert.equal(
    buildEpisodeCoverFilename(15002949, 1),
    'vigloo_s15002949_ep01_cover.jpg'
  );
  assert.equal(
    buildEpisodeCoverFilename(15002949, 6, 0),
    'vigloo_s15002949_ep06_scene01_cover.jpg'
  );
  assert.equal(
    buildEpisodeCoverFilename(15002949, 12, 9, 'png'),
    'vigloo_s15002949_ep12_scene10_cover.png'
  );

  const assets = buildSeriesCoverAssets({
    programId: 15003223,
    seasonId: 15002949,
    episodeNumber: 6,
    posterUrl: '/api/vigloo/proxy?url=poster.jpg',
    thumbnailExpanded: '/api/vigloo/proxy?url=banner.jpg',
    titleImage: '/api/vigloo/proxy?url=logo.png',
    storyboardFrames: [
      '/api/vigloo/proxy?url=scene1.jpg',
      '/api/vigloo/proxy?url=scene2.jpg',
    ],
  });

  // 1 episode cover + 1 series poster + 1 expanded banner + 1 title logo + 2 scenes = 6 items
  assert.equal(assets.length, 6);
  assert.equal(assets[0].kind, 'episode-cover');
  assert.equal(assets[0].filename, 'vigloo_s15002949_ep06_cover.jpg');
  assert.equal(assets[1].kind, 'series-poster');
  assert.equal(assets[2].kind, 'series-banner');
  assert.equal(assets[3].kind, 'series-logo');
  assert.equal(assets[4].kind, 'episode-scene');
  assert.equal(assets[4].filename, 'vigloo_s15002949_ep06_scene01_cover.jpg');
});

test('diagnoseAndPlanAutoRepair selects optimal self-healing strategy for HLS, MP4, and VIP states', async () => {
  const { diagnoseAndPlanAutoRepair } = await import('./viglooParser');

  // Locked VIP episode with autoUnlockVip=false -> automatically unlocks VIP and switches to MP4
  const vipLocked = diagnoseAndPlanAutoRepair({
    streamMode: 'hls',
    hasHlsMaster: false,
    errorCount: 0,
    isVipEpisode: true,
    autoUnlockVip: false,
    videoReadyState: 0,
  });
  assert.equal(vipLocked.action, 'rebuild-server-cache');
  assert.equal(vipLocked.shouldUnlockVip, true);
  assert.equal(vipLocked.nextStreamMode, 'mp4');

  // HLS error -> switches to Direct MP4
  const hlsErr = diagnoseAndPlanAutoRepair({
    streamMode: 'hls',
    hasHlsMaster: true,
    errorCount: 1,
    isVipEpisode: false,
    autoUnlockVip: true,
    videoReadyState: 1,
  });
  assert.equal(hlsErr.action, 'switch-to-direct-mp4');
  assert.equal(hlsErr.nextStreamMode, 'mp4');

  // Healthy stream -> action 'none'
  const healthy = diagnoseAndPlanAutoRepair({
    streamMode: 'hls',
    hasHlsMaster: true,
    errorCount: 0,
    isVipEpisode: false,
    autoUnlockVip: true,
    videoReadyState: 4,
  });
  assert.equal(healthy.action, 'none');
});

test('filterAndSortCatalogBySection and extractCatalogCategories handle Hot, New, Picks, Ranking, Asian, and Categories', async () => {
  const {
    filterAndSortCatalogBySection,
    extractCatalogCategories,
  } = await import('./viglooParser');

  const sampleCatalog = [
    {
      id: 15003223,
      seasonId: 15002949,
      programCode: 'US000P87S01',
      title: 'Riding with My Bully Stepbrother',
      subTitle: 'Stepbrother romance',
      synopsis: 'After her mother remarries...',
      posterUrl: '/poster1.jpg',
      titleImage: '/logo1.png',
      episodeCount: 40,
      appFreeEpCount: 5,
      viewCount: 6700790,
      likeCount: 129600,
      bookmarkCount: 311078,
      releaseDate: '2026-09-09',
      genres: ['Romance', 'Teen'],
      tags: ['Step Siblings', 'Forbidden Love'],
      isNewBadge: false,
      isAsian: false,
      countryCode: 'US',
    },
    {
      id: 15004057,
      seasonId: 15003573,
      programCode: 'US000P45S01',
      title: 'Runaway Bride',
      subTitle: 'Romantasy revenge',
      synopsis: 'Abandoned in the countryside...',
      posterUrl: '/poster2.jpg',
      titleImage: '/logo2.png',
      episodeCount: 58,
      appFreeEpCount: 12,
      viewCount: 70581,
      likeCount: 27142,
      bookmarkCount: 1114,
      releaseDate: '2026-11-09',
      genres: ['Romance', 'Romantasy'],
      tags: ['Revenge'],
      isNewBadge: true,
      isAsian: false,
      countryCode: 'US',
    },
    {
      id: 15003866,
      seasonId: 15003492,
      programCode: 'KR011P04S01',
      title: 'Married the Driver, Got a Billionaire',
      subTitle: 'Korean billionaire drama',
      synopsis: 'Yoon Ari escapes on her wedding day...',
      posterUrl: '/poster3.jpg',
      titleImage: '/logo3.png',
      episodeCount: 55,
      appFreeEpCount: 6,
      viewCount: 8400000,
      likeCount: 210000,
      bookmarkCount: 420000,
      releaseDate: '2026-10-15',
      genres: ['Romance', 'Billionaire'],
      tags: ['Secret Identity'],
      isNewBadge: false,
      isAsian: true,
      countryCode: 'KR',
    },
  ];

  const hotList = filterAndSortCatalogBySection(sampleCatalog, 'hot');
  assert.equal(hotList[0].id, 15003223);

  const newList = filterAndSortCatalogBySection(sampleCatalog, 'new');
  assert.equal(newList[0].id, 15004057);
  assert.equal(newList[0].isNewBadge, true);

  const rankingList = filterAndSortCatalogBySection(sampleCatalog, 'ranking');
  assert.equal(rankingList[0].id, 15003866);
  assert.equal(rankingList[0].rank, 1);
  assert.equal(rankingList[1].rank, 2);

  const asianList = filterAndSortCatalogBySection(sampleCatalog, 'asian');
  assert.equal(asianList.length, 1);
  assert.equal(asianList[0].countryCode, 'KR');

  const catList = filterAndSortCatalogBySection(sampleCatalog, 'categories', 'Romantasy');
  assert.equal(catList.length, 1);
  assert.equal(catList[0].id, 15004057);

  const categories = extractCatalogCategories(sampleCatalog);
  assert.equal(categories[0].name, 'All');
  assert.equal(categories[0].count, 3);
  assert.ok(categories.some((c) => c.name === 'Romance' && c.count === 3));
});




