export interface ViglooEpisodeItem {
  id: number;
  seasonId: number;
  episodeNumber: number;
  duration: number;
  releaseDate: string;
  price: number;
}

export interface ViglooRecommendedItem {
  id: number;
  title: string;
  subTitle?: string;
  seasonId: number;
  episodeCount: number;
  appFreeEpCount: number;
  genres: string[];
  tags: string[];
  thumbnail: string;
  titleImage: string;
  synopsis: string;
  viewCount?: number;
}

export interface ViglooProgramDetails {
  id: number;
  seasonId: number;
  programCode: string;
  title: string;
  subTitle: string;
  titleImage: string;
  posterUrl: string;
  thumbnailExpanded: string;
  synopsis: string;
  logLine: string;
  genres: string[];
  metaTags: string[];
  episodeCount: number;
  appFreeEpCount: number;
  viewCount: number;
  likeCount: number;
  bookmarkCount: number;
  rating: number;
  releaseDate: string;
  certificateNumber: string;
  isOriginal: boolean;
  captionLanguages: string[];
  episodes: ViglooEpisodeItem[];
  recommended: ViglooRecommendedItem[];
}

export const DEFAULT_EP1_VTT = `WEBVTT\t#Elemental Media Engine(TM) 2.18.0.0
00:00:00.133 --> 00:00:00.913
[Hayley] Tell me again

00:00:00.997 --> 00:00:03.262
how being dragged into the woods

00:00:03.346 --> 00:00:03.946
is supposed to

00:00:04.030 --> 00:00:05.047
fix our dysfunction

00:00:06.660 --> 00:00:08.033
You're going to be a part of this family

00:00:08.166 --> 00:00:09.150
Whether you like it or not

00:00:09.233 --> 00:00:10.316
no distractions

00:00:10.400 --> 00:00:12.293
no complaining, Hayley

00:00:15.113 --> 00:00:16.513
You forgot no escape

00:00:20.240 --> 00:00:20.762
Wait a minute

00:00:20.846 --> 00:00:21.720
Where's my horse?

00:00:21.866 --> 00:00:23.326
You'll ride with Cole

00:00:26.570 --> 00:00:27.593
Stepbrother who bullied me

00:00:27.676 --> 00:00:28.700
all through high school?

00:00:28.966 --> 00:00:29.737
No way

00:00:30.507 --> 00:00:31.783
[Cole] Trust me, Princess

00:00:31.866 --> 00:00:33.466
I'm not excited about it either

00:00:35.766 --> 00:00:37.250
Still an asshole, I see

00:00:37.333 --> 00:00:38.633
Still a drama queen

00:00:39.133 --> 00:00:41.537
Hurry up before it gets dark, you two

00:00:42.187 --> 00:00:42.786
Here

00:00:45.159 --> 00:00:46.126
In your dreams

00:00:46.679 --> 00:00:48.479
I'd like to stay as far from you as possible

00:00:49.733 --> 00:00:50.358
Grow up

00:00:50.441 --> 00:00:51.313
You're too old to be acting

00:00:51.397 --> 00:00:52.500
like a whiny little girl

00:00:53.193 --> 00:00:54.306
And I thought you were too cool

00:00:54.390 --> 00:00:55.382
for family vacations

00:00:55.605 --> 00:00:56.672
You know how to bark

00:00:57.339 --> 00:00:58.733
But do you know how to bite?

00:00:59.967 --> 00:01:00.489
Whatever

00:01:00.573 --> 00:01:01.606
I'll walk the rest of the way

00:01:08.266 --> 00:01:09.900
Cole! Put me down!`;

const EPISODE_DURATIONS = [
  78, 66, 62, 54, 88, 60, 69, 64, 58, 72,
  65, 61, 70, 57, 63, 68, 74, 59, 66, 62,
  71, 64, 58, 67, 73, 60, 65, 69, 61, 63,
  70, 56, 68, 64, 72, 62, 67, 71, 75, 84,
];

export const FALLBACK_PROGRAM_15003223: ViglooProgramDetails = {
  id: 15003223,
  seasonId: 15002949,
  programCode: 'US000P87S01',
  title: 'Riding with My Bully Stepbrother',
  subTitle: "I hated him... until I didn't.",
  titleImage: '/api/vigloo/proxy?url=' + encodeURIComponent('https://asset.vigloo.com/US000P87S01/asset/title/en.png'),
  posterUrl: '/api/vigloo/proxy?url=' + encodeURIComponent('https://asset.vigloo.com/US000P87S01/asset/thumbnails/default/en.png'),
  thumbnailExpanded: '/api/vigloo/proxy?url=' + encodeURIComponent('https://asset.vigloo.com/US000P87S01/asset/thumbnail_expanded/en.png'),
  synopsis:
    'After her mother remarries, Hayley is forced to spend a family vacation with her bully stepbrother, Cole. As old wounds give way to undeniable attraction, forbidden feelings and long-buried secrets threaten to change their relationship forever.',
  logLine:
    "Forced to share a horse with her bully stepbrother, a college freshman falls for the one man she can't have.",
  genres: ['Romance', 'Teen'],
  metaTags: ['Young Adult', 'Step Siblings', 'Steamy', 'Forbidden Love'],
  episodeCount: 40,
  appFreeEpCount: 5,
  viewCount: 6700790,
  likeCount: 129600,
  bookmarkCount: 311078,
  rating: 15,
  releaseDate: '2026-09-09',
  certificateNumber: '2026-VK04954',
  isOriginal: true,
  captionLanguages: ['en', 'ko', 'ja', 'zh-Hant', 'es', 'th', 'id'],
  episodes: EPISODE_DURATIONS.map((duration, idx) => ({
    id: 15035520 + idx,
    seasonId: 15002949,
    episodeNumber: idx + 1,
    duration,
    releaseDate: '2026-09-09',
    price: idx < 5 ? 0 : 50,
  })),
  recommended: [
    {
      id: 15003049,
      title: "Forbidden Tides : Don't Tell My Stepson",
      subTitle: 'Summer secrets refuse to stay buried',
      seasonId: 15002808,
      episodeCount: 50,
      appFreeEpCount: 4,
      genres: ['Romance', 'Drama'],
      tags: ['Forbidden Love', 'Love Affair'],
      thumbnail:
        '/api/vigloo/proxy?url=' +
        encodeURIComponent('https://asset.vigloo.com/US000PA0S01/asset/thumbnails/default/en.png'),
      titleImage:
        '/api/vigloo/proxy?url=' +
        encodeURIComponent('https://asset.vigloo.com/US000PA0S01/asset/title/en.png'),
      synopsis:
        'A coastal getaway turns complicated when unexpected sparks fly across family lines.',
      viewCount: 4820100,
    },
    {
      id: 15003526,
      title: 'One Night with My Stepfather',
      subTitle: 'One mistake changes everything',
      seasonId: 15003216,
      episodeCount: 44,
      appFreeEpCount: 5,
      genres: ['Romance', 'Drama'],
      tags: ['Secret Relationship', 'High Tension'],
      thumbnail:
        '/api/vigloo/proxy?url=' +
        encodeURIComponent('https://asset.vigloo.com/US000PB2S01/asset/thumbnails/default/en.png'),
      titleImage:
        '/api/vigloo/proxy?url=' +
        encodeURIComponent('https://asset.vigloo.com/US000PB2S01/asset/title/en.png'),
      synopsis:
        'A mysterious stranger from a fateful evening turns out to be closer to home than she ever imagined.',
      viewCount: 5190400,
    },
    {
      id: 15003454,
      title: 'Good Vibrations with the Pleasure King',
      subTitle: 'Business meets undeniable chemistry',
      seasonId: 15003177,
      episodeCount: 48,
      appFreeEpCount: 7,
      genres: ['Romance', 'Comedy'],
      tags: ['CEO', 'Office Romance'],
      thumbnail:
        '/api/vigloo/proxy?url=' +
        encodeURIComponent('https://asset.vigloo.com/US000P85S01/asset/thumbnails/default/en.png'),
      titleImage:
        '/api/vigloo/proxy?url=' +
        encodeURIComponent('https://asset.vigloo.com/US000P85S01/asset/title/en.png'),
      synopsis:
        'An ambitious product designer clashes with a demanding founder as they test a bold new line.',
      viewCount: 3940000,
    },
    {
      id: 15003639,
      title: 'Through the Wall',
      subTitle: 'Every secret has an echo',
      seasonId: 15003326,
      episodeCount: 44,
      appFreeEpCount: 4,
      genres: ['Romance', 'Mystery'],
      tags: ['Neighbors', 'Suspense'],
      thumbnail:
        '/api/vigloo/proxy?url=' +
        encodeURIComponent('https://asset.vigloo.com/US000P98S01/asset/thumbnails/default/en.png'),
      titleImage:
        '/api/vigloo/proxy?url=' +
        encodeURIComponent('https://asset.vigloo.com/US000P98S01/asset/title/en.png'),
      synopsis:
        'Thin apartment walls draw two guarded neighbors into an intense game of curiosity and desire.',
      viewCount: 2890500,
    },
  ],
};
