import React from 'react';

export type ActiveNavSection = 'player' | 'episodes' | 'vip' | 'discover' | 'saved';

interface TopBarProps {
  activeSection: ActiveNavSection;
  savedCount: number;
  uiLang: 'km' | 'en';
  onSelectSection: (section: ActiveNavSection) => void;
  onOpenUrlModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  savedCount,
  uiLang,
  onSelectSection,
  onOpenUrlModal,
}) => {
  const navItems: { id: ActiveNavSection; labelKm: string; labelEn: string }[] = [
    { id: 'player', labelKm: 'កម្មវិធីចាក់វីដេអូ', labelEn: 'Player' },
    { id: 'episodes', labelKm: 'បញ្ជីភាគ (1-40)', labelEn: 'Episodes' },
    { id: 'vip', labelKm: 'ទាញយក & មើល VIP', labelEn: 'VIP Auto-Downloader' },
    {
      id: 'discover',
      labelKm: 'កាតាឡុក (Hot · New · Picks · Ranking · Asian · Categories)',
      labelEn: 'Catalog (Hot · New · Picks · Ranking · Asian · Categories)',
    },
    {
      id: 'saved',
      labelKm: savedCount > 0 ? `បញ្ជីរក្សាទុក (${savedCount})` : 'បញ្ជីរក្សាទុក',
      labelEn: savedCount > 0 ? `Saved (${savedCount})` : 'Saved List',
    },
  ];

  return (
    <header className="flex items-center justify-between gap-8 px-6 h-14 bg-[#09090B]/95 backdrop-blur-md border-b border-white/10 shrink-0 z-30">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#player"
        onClick={(e) => {
          e.preventDefault();
          onSelectSection('player');
        }}
        className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-400"
      >
        VIGLOO STUDIO
      </a>

      {/* Zone 2: 4 clean single-line text navigation links */}
      <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                onSelectSection(item.id);
              }}
              className={`whitespace-nowrap shrink-0 transition-colors py-1 border-b-2 ${
                isActive
                  ? 'text-teal-400 border-teal-400'
                  : 'text-zinc-400 border-transparent hover:text-white hover:border-white/30'
              }`}
            >
              {uiLang === 'km' ? item.labelKm : item.labelEn}
            </a>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenUrlModal}
          className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-teal-400 rounded-lg hover:bg-teal-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
        >
          {uiLang === 'km' ? 'បញ្ចូលតំណ Vigloo' : 'Load Vigloo URL'}
        </button>
      </div>
    </header>
  );
};
