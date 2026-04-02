"use client";

import { useEffect, useRef, useState } from "react";

type GameScore = {
  id: string; league: string; leagueLabel: string;
  awayAbbr: string; awayScore: string;
  homeAbbr: string; homeScore: string;
  status: string; isLive: boolean; isComplete: boolean;
};
type NewsItem = { headline: string; link: string; sport: string };

const LEAGUES = [
  { key: "sportsNFL",   id: "nfl",                     sport: "football",   label: "NFL"   },
  { key: "sportsNBA",   id: "nba",                     sport: "basketball", label: "NBA"   },
  { key: "sportsNHL",   id: "nhl",                     sport: "hockey",     label: "NHL"   },
  { key: "sportsMLB",   id: "mlb",                     sport: "baseball",   label: "MLB"   },
  { key: "sportsNCAAB", id: "mens-college-basketball", sport: "basketball", label: "NCAAB" },
  { key: "sportsCFB",   id: "college-football",        sport: "football",   label: "CFB"   },
] as const;

type Config = {
  showSports: boolean; showSportsNews: boolean;
  sportsNFL: boolean; sportsNBA: boolean; sportsNHL: boolean;
  sportsMLB: boolean; sportsNCAAB: boolean; sportsCFB: boolean;
};
const DEFAULT: Config = {
  showSports: true, showSportsNews: true,
  sportsNFL: true, sportsNBA: true, sportsNHL: true,
  sportsMLB: true, sportsNCAAB: true, sportsCFB: true,
};

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem("dashboard-config");
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT;
}

async function fetchScores(sport: string, id: string, label: string): Promise<GameScore[]> {
  try {
    const res  = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${id}/scoreboard`, { cache: "no-store" });
    const json = await res.json();
    return (json.events ?? []).map((ev: any) => {
      const comp = ev.competitions?.[0];
      const away = comp?.competitors?.find((c: any) => c.homeAway === "away");
      const home = comp?.competitors?.find((c: any) => c.homeAway === "home");
      return {
        id: ev.id, league: id, leagueLabel: label,
        awayAbbr: away?.team?.abbreviation ?? "AWY", awayScore: away?.score ?? "",
        homeAbbr: home?.team?.abbreviation ?? "HME", homeScore: home?.score ?? "",
        status: comp?.status?.type?.shortDetail ?? "",
        isLive: comp?.status?.type?.state === "in",
        isComplete: comp?.status?.type?.completed ?? false,
      };
    });
  } catch { return []; }
}

async function fetchNews(sport: string, id: string, label: string): Promise<NewsItem[]> {
  try {
    const res  = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${id}/news?limit=5`, { cache: "no-store" });
    const json = await res.json();
    return (json.articles ?? []).map((a: any) => ({ headline: a.headline ?? "", link: a.links?.web?.href ?? "#", sport: label }));
  } catch { return []; }
}

const SESSION_KEY = "sports-ticker-start";

export default function GlobalSportsTicker() {
  const [games,  setGames]  = useState<GameScore[]>([]);
  const [news,   setNews]   = useState<NewsItem[]>([]);
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [animDelay, setAnimDelay] = useState(0);
  const initialized = useRef(false);

  useEffect(() => {
    const cfg = loadConfig();
    setConfig(cfg);
  }, []);

  useEffect(() => {
    if (!config.showSports) return;
    const active = LEAGUES.filter(l => config[l.key]);
    Promise.all(active.map(l => fetchScores(l.sport, l.id, l.label)))
      .then(results => setGames(results.flat()));
    if (config.showSportsNews) {
      Promise.all(active.map(l => fetchNews(l.sport, l.id, l.label)))
        .then(results => setNews(results.flat()));
    }
  }, [config.showSports, config.showSportsNews,
      config.sportsNFL, config.sportsNBA, config.sportsNHL,
      config.sportsMLB, config.sportsNCAAB, config.sportsCFB]);

  const active = LEAGUES.filter(l => config[l.key]);
  const visibleGames = games.filter(g => active.some(l => l.label === g.leagueLabel));

  const items: string[] = [];
  for (const league of active) {
    visibleGames.filter(g => g.leagueLabel === league.label).forEach(g => {
      const score = g.isComplete || g.isLive
        ? `${g.awayAbbr} ${g.awayScore} - ${g.homeScore} ${g.homeAbbr}`
        : `${g.awayAbbr} vs ${g.homeAbbr}`;
      const status = g.isLive ? `🔴 ${g.status}` : g.status;
      items.push(`[${league.label}] ${score}  ${status}`);
    });
  }
  if (config.showSportsNews) {
    news.forEach(n => items.push(`📰 [${n.sport}] ${n.headline}`));
  }

  const duration = Math.max(30, items.length * 8);

  useEffect(() => {
    if (initialized.current || items.length === 0) return;
    initialized.current = true;
    try {
      let start = Number(sessionStorage.getItem(SESSION_KEY) || 0);
      if (!start) { start = Date.now(); sessionStorage.setItem(SESSION_KEY, String(start)); }
      setAnimDelay(-(((Date.now() - start) / 1000) % duration));
    } catch {}
  }, [items.length, duration]);

  if (!config.showSports || items.length === 0) return null;

  const ticker = [...items, ...items].join("   ·   ");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center overflow-hidden no-print"
      style={{ background: "#0a1a0e", borderTop: "1px solid rgba(255,255,255,0.08)", height: 32 }}>
      <div className="shrink-0 px-3 text-[10px] font-bold text-green-400 tracking-widest uppercase border-r border-white/10 h-full flex items-center">
        SCORES
      </div>
      <div className="flex-1 overflow-hidden relative h-full">
        <div
          className="absolute top-0 whitespace-nowrap flex items-center h-full text-[11px] font-medium text-white/80 tracking-wide"
          style={{ animation: `ticker ${duration}s linear infinite`, animationDelay: `${animDelay}s` }}
        >
          {ticker}
        </div>
      </div>
      <style>{`@keyframes ticker { 0% { transform: translateX(100vw); } 100% { transform: translateX(-100%); } }`}</style>
    </div>
  );
}
