import { useEffect, useMemo, useRef, useState } from "react";

type RadioBrowserStation = {
  stationuuid: string;
  name: string;
  tags: string;
  url_resolved: string;
  codec: string;
  bitrate: number;
  votes?: number;
};

type Station = {
  id: string;
  name: string;
  genre: string;
  streamUrl: string;
  bitrate: number;
};

const STATIONS_BG_API_URL =
  "https://de1.api.radio-browser.info/json/stations/search?countrycode=BG&hidebroken=true&order=votes&reverse=true&limit=500";

const STATIONS_BG_LANGUAGE_API_URL =
  "https://de1.api.radio-browser.info/json/stations/bylanguageexact/Bulgarian?hidebroken=true&order=votes&reverse=true&limit=500";

const EXCLUDED_STREAM_URLS = new Set([
  "https://play.euronews.bg/stream?1710950223133",
  "https://radio.jump.bg:7028/live",
  "https://radio.jump.bg:7049/live",
  "https://radiocp.jump.bg/proxy/stan1?mp=/live",
  "https://radio.jump.bg:7489/live",
  "https://radio.mitropolia-sofia.org:7610/stream",
  "https://stream-40.zeno.fm/hku46gxdexquv?zs=d8gnzJrzS0GpfjuXp_Lx_Q",
  "https://stream-64.zeno.fm/80qzq207rm0uv?zs=_xFVUn2nS3qDiPZ-lCCmIQ",
  "https://radio.jump.bg:7181/live",
]);

const FALLBACK_STATIONS: Station[] = [
  {
    id: "fallback-1",
    name: "BG Estrada",
    genre: "Българска музика",
    streamUrl: "https://play.global.audio/bgestrada",
    bitrate: 128,
  },
  {
    id: "fallback-2",
    name: "MAGIC FM",
    genre: "Поп",
    streamUrl: "https://bss1.neterra.tv/magicfm/magicfm.m3u8",
    bitrate: 105,
  },
  {
    id: "fallback-3",
    name: "Radio The Voice",
    genre: "Хитове",
    streamUrl: "https://bss1.neterra.tv/thevoicefm/thevoicefm.m3u8",
    bitrate: 105,
  },
  {
    id: "fallback-4",
    name: "Radio Vitosha",
    genre: "Поп",
    streamUrl: "https://bss1.neterra.tv/vitosha/vitosha.m3u8",
    bitrate: 105,
  },
  {
    id: "fallback-5",
    name: "BNR Horizont",
    genre: "Новини",
    streamUrl: "https://play.global.audio/testb.aac?dist=RADIOPLAY",
    bitrate: 48,
  },
  {
    id: "fallback-6",
    name: "Radio Nova Bulgaria",
    genre: "Музика",
    streamUrl: "https://play.global.audio/nova.opus",
    bitrate: 128,
  },
];

const PRIORITY_STATION_NAMES = [
  "magic",
  "the voice",
  "radio vitosha",
  "radio contact",
  "avto radio",
  "radio 1 bulgaria",
  "novanews bulgaria",
  "nrg",
  "n-joy",
  "zorana",
  "btv radio",
  "euronews bulgaria",
  "radio 1",
  "radio bgradio",
];

function mapToStation(station: RadioBrowserStation): Station {
  const genre = station.tags?.split(",")[0]?.trim() || station.codec || "Различни";
  return {
    id: station.stationuuid,
    name: station.name || "Без име",
    genre,
    streamUrl: station.url_resolved,
    bitrate: station.bitrate ?? 0,
  };
}

function stationNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
}

function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stationPriorityRank(name: string): number {
  const normalizedName = searchKey(name).replace(/^radio\s+/, "");
  const rankedIndex = PRIORITY_STATION_NAMES.findIndex((preferredName) => {
    const normalizedPreferred = searchKey(preferredName).replace(/^radio\s+/, "");
    return (
      normalizedName === normalizedPreferred ||
      normalizedName.includes(normalizedPreferred) ||
      normalizedPreferred.includes(normalizedName)
    );
  });

  return rankedIndex === -1 ? Number.POSITIVE_INFINITY : rankedIndex;
}

function prioritizeStations(stations: Station[]): Station[] {
  return stations
    .map((station, index) => ({ station, index, rank: stationPriorityRank(station.name) }))
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }

      return a.index - b.index;
    })
    .map((entry) => entry.station);
}

function isAdBreakSensitiveStation(stationName: string): boolean {
  const key = searchKey(stationName);
  return (
    key.includes("city") ||
    key.includes("energy") ||
    key.includes("the voice") ||
    key.includes("vitosha") ||
    key.includes("magic")
  );
}

function isCityStation(stationName: string): boolean {
  return searchKey(stationName).includes("city");
}

function isMobileOptimizedFormat(station: RadioBrowserStation): boolean {
  const codec = String(station.codec || "").toLowerCase();
  const url = String(station.url_resolved || "").toLowerCase();

  return (
    codec.includes("aac") ||
    codec.includes("opus") ||
    url.includes(".m3u8") ||
    url.includes("hls")
  );
}

function mobileStreamPriority(station: RadioBrowserStation): number {
  const rawBitrate = station.bitrate ?? 0;
  const bitratePenalty =
    rawBitrate === 0 ? 1 : rawBitrate <= 96 ? 0 : rawBitrate <= 128 ? 1 : rawBitrate <= 192 ? 2 : 3;
  const formatPenalty = isMobileOptimizedFormat(station) ? 0 : 2;
  return bitratePenalty + formatPenalty;
}

function withCityFallbackEndpoints(streamPool: string[]): string[] {
  const fallbackCityUrls = ["https://stream.city.bg/city.mp3"];
  return [...streamPool, ...fallbackCityUrls].filter(
    (url, index, all) => all.indexOf(url) === index
  );
}

function isLikelyWebPlayable(station: RadioBrowserStation, requireHttps: boolean): boolean {
  const url = station.url_resolved?.trim();
  if (!url || EXCLUDED_STREAM_URLS.has(url)) {
    return false;
  }

  if (requireHttps && !url.startsWith("https://")) {
    return false;
  }

  return true;
}

function normalizeStations(
  stations: RadioBrowserStation[],
  requireHttps: boolean
): Station[] {
  const cleaned = stations
    .filter((item) => item.url_resolved && item.name)
    .filter((item) => !isCityStation(item.name || ""))
    .filter((item) => isLikelyWebPlayable(item, requireHttps))
    .filter((item) => item.bitrate === 0 || item.bitrate <= 320)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.url_resolved === item.url_resolved) === index)
    .sort((a, b) => {
      const voteSort = (b.votes ?? 0) - (a.votes ?? 0);
      if (voteSort !== 0) {
        return voteSort;
      }

      const aBitrate = a.bitrate === 0 ? 999 : a.bitrate;
      const bBitrate = b.bitrate === 0 ? 999 : b.bitrate;
      return aBitrate - bBitrate;
    })
    .slice(0, 80)
    .map(mapToStation);

  return prioritizeStations(cleaned);
}

function streamProxyUrl(rawStreamUrl: string): string {
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return rawStreamUrl;
  }
  return `/api/stream?url=${encodeURIComponent(rawStreamUrl)}`;
}

export default function App() {
  const [stations, setStations] = useState<Station[]>(FALLBACK_STATIONS);
  const [allStations, setAllStations] = useState<RadioBrowserStation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState(FALLBACK_STATIONS[0].id);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioSecondaryRef = useRef<HTMLAudioElement>(null);
  const activeAudioIndexRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const pauseRecoveryTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const lastProgressPositionRef = useRef(0);
  const lastRequestedStationRef = useRef<Station | null>(FALLBACK_STATIONS[0]);
  const selectedStreamIndexByStationRef = useRef<Record<string, number>>({});
  const reconnectRefreshPhaseByStationRef = useRef<Record<string, number>>({});
  const currentStreamUrlByStationRef = useRef<Record<string, string>>({});
  const badStreamUntilRef = useRef<Record<string, number>>({});
  const hasUserInitiatedPlaybackRef = useRef(false);
  const userStoppedRef = useRef(false);
  const shouldAutoResumeRef = useRef(false);
  const [isMobileDataConnection, setIsMobileDataConnection] = useState(false);
  const [connectionEffectiveType, setConnectionEffectiveType] = useState("");
  const requireHttps =
    typeof window !== "undefined" && window.location.hostname.endsWith("github.io");

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }

    const connection = (navigator as any).connection;
    if (!connection) {
      return;
    }

    const updateConnectionFlags = () => {
      const effectiveType = String(connection.effectiveType || "");
      const isCellularLike = ["slow-2g", "2g", "3g", "4g", "5g"].includes(effectiveType);

      setIsMobileDataConnection(isCellularLike);
      setConnectionEffectiveType(effectiveType);
    };

    updateConnectionFlags();
    connection.addEventListener?.("change", updateConnectionFlags);

    return () => {
      connection.removeEventListener?.("change", updateConnectionFlags);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadStations() {
      try {
        const [byCountryResponse, byLanguageResponse] = await Promise.all([
          fetch(STATIONS_BG_API_URL),
          fetch(STATIONS_BG_LANGUAGE_API_URL),
        ]);

        if (!byCountryResponse.ok && !byLanguageResponse.ok) {
          throw new Error("Failed to fetch station lists");
        }

        const byCountryPayload = byCountryResponse.ok
          ? ((await byCountryResponse.json()) as RadioBrowserStation[])
          : [];
        const byLanguagePayload = byLanguageResponse.ok
          ? ((await byLanguageResponse.json()) as RadioBrowserStation[])
          : [];

        const merged = [...byCountryPayload, ...byLanguagePayload];

        if (!disposed) {
          setAllStations(merged);
          setLoadError(null);
        }
      } catch {
        if (!disposed) {
          setLoadError("Неуспешно зареждане на списъка. Показани са резервни станции.");
        }
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    }

    loadStations();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const clean = normalizeStations(allStations, requireHttps);

    if (clean.length > 0) {
      setStations(clean);
      return;
    }

    setStations(FALLBACK_STATIONS);
  }, [allStations, requireHttps]);

  const stationStreamPools = useMemo(() => {
    const isSlowMobileConnection =
      isMobileDataConnection &&
      ["slow-2g", "2g", "3g", "4g"].includes(connectionEffectiveType);
    const entries = allStations
      .filter((item) => item.url_resolved && item.name)
      .filter((item) => !isCityStation(item.name || ""))
      .filter((item) => isLikelyWebPlayable(item, requireHttps))
      .filter((item) => {
        if (item.bitrate === 0) {
          return true;
        }

        const stationIsCity = isCityStation(item.name || "");
        const poolMaxBitrate = isMobileDataConnection
          ? stationIsCity || isSlowMobileConnection
            ? 128
            : 192
          : 320;
        return item.bitrate <= poolMaxBitrate;
      })
      .slice()
      .sort((a, b) => {
        if (isMobileDataConnection) {
          const mobileSort = mobileStreamPriority(a) - mobileStreamPriority(b);
          if (mobileSort !== 0) {
            return mobileSort;
          }
        }

        const aBitrate = a.bitrate === 0 ? 999 : a.bitrate;
        const bBitrate = b.bitrate === 0 ? 999 : b.bitrate;
        if (aBitrate !== bBitrate) {
          return aBitrate - bBitrate;
        }

        return (b.votes ?? 0) - (a.votes ?? 0);
      });

    const grouped = new Map<string, string[]>();
    for (const station of entries) {
      const key = stationNameKey(station.name || "");
      if (!key) {
        continue;
      }

      const nextUrl = station.url_resolved.trim();
      if (!nextUrl) {
        continue;
      }

      const current = grouped.get(key) ?? [];
      if (!current.includes(nextUrl)) {
        current.push(nextUrl);
        grouped.set(key, current);
      }
    }

    return grouped;
  }, [allStations, requireHttps, isMobileDataConnection, connectionEffectiveType]);

  useEffect(() => {
    if (stations.some((station) => station.id === selectedId)) {
      return;
    }

    if (stations[0]) {
      setSelectedId(stations[0].id);
    }
  }, [stations, selectedId]);

  const currentStation = useMemo(
    () => stations.find((station) => station.id === selectedId) ?? stations[0],
    [selectedId, stations]
  );

  const nowPlayingName = useMemo(() => {
    if (!playingId) {
      return null;
    }
    return stations.find((station) => station.id === playingId)?.name ?? null;
  }, [playingId, stations]);

  const playingStation = useMemo(() => {
    if (!playingId) {
      return null;
    }
    return stations.find((station) => station.id === playingId) ?? null;
  }, [playingId, stations]);

  const normalizedSearchQuery = useMemo(() => searchKey(searchQuery), [searchQuery]);

  const matchingStations = useMemo(() => {
    if (!normalizedSearchQuery) {
      return stations;
    }

    return stations.filter((station) => searchKey(station.name).includes(normalizedSearchQuery));
  }, [normalizedSearchQuery, stations]);

  const suggestedStations = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return matchingStations.slice(0, 6);
  }, [matchingStations, normalizedSearchQuery]);

  const visibleStations = useMemo(() => {
    if (!normalizedSearchQuery) {
      return stations;
    }

    return matchingStations;
  }, [matchingStations, normalizedSearchQuery, stations]);

  const handleSuggestionPick = (station: Station) => {
    setSearchQuery(station.name);
    setSelectedId(station.id);
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  const getRecoveryStation = () => {
    return playingStation ?? lastRequestedStationRef.current ?? currentStation ?? null;
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const clearStallTimer = () => {
    if (stallTimerRef.current) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  const clearPauseRecoveryTimer = () => {
    if (pauseRecoveryTimerRef.current) {
      window.clearTimeout(pauseRecoveryTimerRef.current);
      pauseRecoveryTimerRef.current = null;
    }
  };

  const resetAudioElement = (audio: HTMLAudioElement, shouldLoad = true) => {
    audio.pause();
    audio.removeAttribute("src");
    if (shouldLoad) {
      audio.load();
    }
  };

  const stopPlayback = () => {
    const primaryAudio = audioRef.current;
    const secondaryAudio = audioSecondaryRef.current;
    if (!primaryAudio || !secondaryAudio) {
      return;
    }

    userStoppedRef.current = true;
    hasUserInitiatedPlaybackRef.current = false;
    shouldAutoResumeRef.current = false;
    clearReconnectTimer();
    clearStallTimer();
    clearPauseRecoveryTimer();
    resetAudioElement(primaryAudio);
    resetAudioElement(secondaryAudio);
    setPlayingId(null);
    setPlaybackError(null);
  };

  const markCurrentStreamAsTemporarilyBad = (station: Station) => {
    if (isAdBreakSensitiveStation(station.name)) {
      return;
    }

    const currentUrl = currentStreamUrlByStationRef.current[station.id];
    if (!currentUrl) {
      return;
    }

    // Ad transition failures are often endpoint-specific and short-lived.
    badStreamUntilRef.current[currentUrl] = Date.now() + 2 * 60 * 1000;
  };

  const playStation = async (station: Station, isReconnect = false) => {
    const primaryAudio = audioRef.current;
    const secondaryAudio = audioSecondaryRef.current;
    if (!primaryAudio || !secondaryAudio) {
      return;
    }

    // For manual station changes, we must halt everything.
    // For reconnects, we only stop if needed to avoid double-audio.
    if (!isReconnect) {
      resetAudioElement(primaryAudio);
      resetAudioElement(secondaryAudio);
      
      reconnectAttemptsRef.current = 0;
      clearReconnectTimer();
      clearStallTimer();
      clearPauseRecoveryTimer();
      selectedStreamIndexByStationRef.current[station.id] = 0;
      reconnectRefreshPhaseByStationRef.current[station.id] = 0;
    } else {
      // During reconnect, just ensure the OTHER player is clear
      const otherAudio = activeAudioIndexRef.current === 0 ? secondaryAudio : primaryAudio;
      resetAudioElement(otherAudio, false);
    }
    
    // Choose which player to use - if reconnecting, flip it for a fresh buffer.
    const audio = activeAudioIndexRef.current === 0 ? secondaryAudio : primaryAudio;
    const nextIndex = audio === primaryAudio ? 0 : 1;

    setSelectedId(station.id);
    lastRequestedStationRef.current = station;
    setPlaybackError(null);

    const streamPoolKey = stationNameKey(station.name);
    let streamPool = stationStreamPools.get(streamPoolKey) ?? [station.streamUrl];
    
    const isCity = isCityStation(station.name);
    if (isCity) {
      streamPool = withCityFallbackEndpoints(streamPool);

      // Mobile data is more sensitive to endpoint hopping.
      // Keep a small, stable pool for City to reduce reconnect churn.
      if (isMobileDataConnection) {
        streamPool = streamPool.slice(0, 2);
      }
    }

    const now = Date.now();
    const healthyStreamPool = streamPool.filter((url) => {
      const badUntil = badStreamUntilRef.current[url];
      return !badUntil || badUntil <= now;
    });
    if (healthyStreamPool.length > 0) {
      streamPool = healthyStreamPool;
    }

    const currentPoolIndex = selectedStreamIndexByStationRef.current[station.id] ?? 0;
    let nextPoolIndex = currentPoolIndex;
    let shouldRotateOnReconnect = isReconnect;

    if (isReconnect && streamPool.length > 1) {
      const reconnectPhase = reconnectRefreshPhaseByStationRef.current[station.id] ?? 0;
      if (reconnectPhase === 0) {
        shouldRotateOnReconnect = false;
        reconnectRefreshPhaseByStationRef.current[station.id] = 1;
      } else {
        shouldRotateOnReconnect = true;
        reconnectRefreshPhaseByStationRef.current[station.id] = 0;
      }
    }

    if (shouldRotateOnReconnect) {
      nextPoolIndex = (currentPoolIndex + 1) % Math.max(streamPool.length, 1);
    }

    selectedStreamIndexByStationRef.current[station.id] = nextPoolIndex;

    const chosenStreamUrl = streamPool[nextPoolIndex] ?? station.streamUrl;
    currentStreamUrlByStationRef.current[station.id] = chosenStreamUrl;
    
    const baseSrc = streamProxyUrl(chosenStreamUrl);
    const nextSrc = isReconnect
      ? `${baseSrc}${baseSrc.includes("?") ? "&" : "?"}retry=${Date.now()}`
      : baseSrc;
    
    audio.src = nextSrc;
    audio.load();

    try {
      activeAudioIndexRef.current = nextIndex;
      await audio.play();
      
      setPlayingId(station.id);
      setPlaybackError(null);
      shouldAutoResumeRef.current = false;
      reconnectRefreshPhaseByStationRef.current[station.id] = 0;
    } catch {
      // If the user already switched to another station, abort this old play promise
      if (lastRequestedStationRef.current?.id !== station.id) {
        return;
      }
      
      if (!userStoppedRef.current) {
        scheduleReconnect(station);
        return;
      }
      setPlayingId(null);
      setPlaybackError("Тази станция в момента не може да бъде стартирана.");
    }
  };

  const scheduleReconnect = (station: Station) => {
    if (userStoppedRef.current || lastRequestedStationRef.current?.id !== station.id) {
      return;
    }

    markCurrentStreamAsTemporarilyBad(station);
    clearStallTimer();

    const isAdSensitive = isAdBreakSensitiveStation(station.name);
    const isCity = isCityStation(station.name);
    // CRITICAL: Never stop trying for City and other ad-sensitive stations or on mobile data.
    // We remove the hard limit and replace it with a continuous cycle.
    const maxRetries = isAdSensitive ? 9999 : (isMobileDataConnection ? 9999 : 6);
    
    if (reconnectAttemptsRef.current >= maxRetries) {
      setPlaybackError("Връзката е прекъсната. Опитайте друга станция.");
      setPlayingId(null);
      return;
    }

    reconnectAttemptsRef.current += 1;

    const attempt = reconnectAttemptsRef.current;
    // CRITICAL FIX: Do NOT use 'attempt' in the delay calculation for ad-sensitive/mobile.
    // We want a CONSTANT, fast retry cycle (e.g. 2-3 seconds) to avoid the 15-20s gaps you observed.
    const delay =
      isCity && isMobileDataConnection
        ? 1200
        : isAdSensitive
          ? 2000
          : isMobileDataConnection
            ? 2500
            : Math.min(1500 * attempt, 6000);
    
    if (attempt > 3) {
        setPlaybackError(`Пренасочване на потока...`);
    } else {
        setPlaybackError(`Възстановяване...`);
    }
    clearReconnectTimer();
    reconnectTimerRef.current = window.setTimeout(() => {
      playStation(station, true);
    }, delay);
  };

  const scheduleReconnectAfterBuffering = (station: Station) => {
    if (userStoppedRef.current || stallTimerRef.current || lastRequestedStationRef.current?.id !== station.id) {
      return;
    }

    // For ad-sensitive stations (City, Energy, etc.), recovery should be near-instant 
    // when they break during ad insertion transitions.
    const isAdSensitive = isAdBreakSensitiveStation(station.name);
    const isCity = isCityStation(station.name);
    if (isCity && isMobileDataConnection) {
      scheduleReconnect(station);
      return;
    }

    const stallDelayMs = isCity && isMobileDataConnection
      ? 3000
      : isAdSensitive
        ? (isMobileDataConnection ? 2000 : 3000)
        : (isMobileDataConnection ? 4000 : 6000);
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null;

      const audio = activeAudioIndexRef.current === 0 ? audioRef.current : audioSecondaryRef.current;
      if (audio && !audio.paused) {
        const minRecentProgressMs = isCity && isMobileDataConnection ? 7000 : (isMobileDataConnection ? 6000 : 4000);
        const progressedRecently =
          audio.currentTime > lastProgressPositionRef.current + 0.15 ||
          Date.now() - lastProgressAtRef.current < minRecentProgressMs;

        if (progressedRecently) {
          return;
        }
      }

      scheduleReconnect(station);
    }, stallDelayMs);
  };

  const handlePlayToggle = async (station: Station) => {
    const primaryAudio = audioRef.current;
    const secondaryAudio = audioSecondaryRef.current;
    if (!primaryAudio || !secondaryAudio) {
      return;
    }

    userStoppedRef.current = false;

    if (playingId === station.id) {
      stopPlayback();
      return;
    }

    hasUserInitiatedPlaybackRef.current = true;
    await playStation(station);
  };

  useEffect(() => {
    return () => {
      clearReconnectTimer();
      clearStallTimer();
      clearPauseRecoveryTimer();
    };
  }, []);

  useEffect(() => {
    if (!hasUserInitiatedPlaybackRef.current) {
      return;
    }

    const isAdSensitive = playingStation ? isAdBreakSensitiveStation(playingStation.name) : false;
    const isCity = playingStation ? isCityStation(playingStation.name) : false;
    const intervalMs = isCity && isMobileDataConnection ? 2500 : (isAdSensitive ? 4000 : (isMobileDataConnection ? 8000 : 12000));
    const staleProgressMs = isCity && isMobileDataConnection
      ? 5000
      : isAdSensitive
        ? 6000
        : (isMobileDataConnection ? 15000 : 18000);

    const id = window.setInterval(() => {
      if (userStoppedRef.current) {
        return;
      }

      const audio = audioRef.current;
      const audioSecondary = audioSecondaryRef.current;
      if (!audio || !audioSecondary) {
        return;
      }

      if (reconnectTimerRef.current || stallTimerRef.current || pauseRecoveryTimerRef.current) {
        return;
      }

      const recoveryStation = getRecoveryStation();
      if (!recoveryStation) {
        return;
      }

      const activeAudio = activeAudioIndexRef.current === 0 ? audio : audioSecondary;

      if (activeAudio.paused) {
        scheduleReconnect(recoveryStation);
        return;
      }

      if (Date.now() - lastProgressAtRef.current > staleProgressMs) {
        scheduleReconnectAfterBuffering(recoveryStation);
      }
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [playingStation, currentStation, isMobileDataConnection]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        shouldAutoResumeRef.current &&
        playingStation &&
        !userStoppedRef.current
      ) {
        playStation(playingStation, true);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [playingStation]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;

    if (!playingStation) {
      mediaSession.playbackState = "none";
      return;
    }

    mediaSession.metadata = new MediaMetadata({
      title: playingStation.name,
      artist: "RadioBG Online",
      album: playingStation.genre,
      artwork: [
        { src: "./pwa-192.svg", sizes: "192x192", type: "image/svg+xml" },
        { src: "./pwa-512.svg", sizes: "512x512", type: "image/svg+xml" },
      ],
    });

    mediaSession.playbackState = playingId ? "playing" : "paused";

    mediaSession.setActionHandler("play", () => {
      playStation(playingStation, true);
    });

    mediaSession.setActionHandler("pause", stopPlayback);

    mediaSession.setActionHandler("stop", stopPlayback);

    return () => {
      mediaSession.setActionHandler("play", null);
      mediaSession.setActionHandler("pause", null);
      mediaSession.setActionHandler("stop", null);
    };
  }, [playingStation, playingId]);

  return (
    <main className="app-shell">
      <audio
        ref={audioRef}
        preload="none"
        onPause={() => {
          const recoveryStation = getRecoveryStation();
          if (!userStoppedRef.current && recoveryStation && activeAudioIndexRef.current === 0) {
            const pauseRecoveryDelayMs =
              isCityStation(recoveryStation.name) && isMobileDataConnection
                ? 1000
                : (isMobileDataConnection ? 800 : 1800);
            shouldAutoResumeRef.current = true;
            clearPauseRecoveryTimer();
            pauseRecoveryTimerRef.current = window.setTimeout(() => {
              pauseRecoveryTimerRef.current = null;
              if (audioRef.current?.paused && !userStoppedRef.current) {
                scheduleReconnect(recoveryStation);
              }
            }, pauseRecoveryDelayMs);
          }
        }}
        onPlaying={() => {
          if (activeAudioIndexRef.current === 0) {
            reconnectAttemptsRef.current = 0;
            setPlaybackError(null);
            shouldAutoResumeRef.current = false;
            clearReconnectTimer();
            clearStallTimer();
            clearPauseRecoveryTimer();
            lastProgressAtRef.current = Date.now();
            lastProgressPositionRef.current = audioRef.current?.currentTime || 0;
          }
        }}
        onTimeUpdate={() => {
          if (activeAudioIndexRef.current === 0 && audioRef.current) {
            if (audioRef.current.currentTime > lastProgressPositionRef.current + 0.15) {
              lastProgressPositionRef.current = audioRef.current.currentTime;
              lastProgressAtRef.current = Date.now();
            }
          }
        }}
        onProgress={() => {
          if (activeAudioIndexRef.current === 0) {
            lastProgressAtRef.current = Date.now();
            clearPauseRecoveryTimer();
            if (stallTimerRef.current) {
              clearStallTimer();
              setPlaybackError(null);
            }
          }
        }}
        onWaiting={() => {
          if (activeAudioIndexRef.current === 0 && !userStoppedRef.current) {
            const recoveryStation = getRecoveryStation();
            if (recoveryStation) scheduleReconnectAfterBuffering(recoveryStation);
          }
        }}
        onEnded={() => {
          if (activeAudioIndexRef.current === 0 && !userStoppedRef.current) {
            const recoveryStation = getRecoveryStation();
            if (recoveryStation) scheduleReconnect(recoveryStation);
          }
        }}
        onStalled={() => {
          if (activeAudioIndexRef.current === 0 && !userStoppedRef.current) {
            const recoveryStation = getRecoveryStation();
            if (recoveryStation) scheduleReconnectAfterBuffering(recoveryStation);
          }
        }}
        onError={() => {
          if (activeAudioIndexRef.current === 0 && !userStoppedRef.current) {
            const recoveryStation = getRecoveryStation();
            if (recoveryStation) scheduleReconnect(recoveryStation);
          }
        }}
      />

      <audio
        ref={audioSecondaryRef}
        preload="none"
        onPause={() => {
          const recoveryStation = getRecoveryStation();
          if (!userStoppedRef.current && recoveryStation && activeAudioIndexRef.current === 1) {
            if (isCityStation(recoveryStation.name) && isMobileDataConnection) {
              scheduleReconnect(recoveryStation);
              return;
            }
            
            const pauseRecoveryDelayMs = isMobileDataConnection ? 800 : 1800;
            shouldAutoResumeRef.current = true;
            clearPauseRecoveryTimer();
            pauseRecoveryTimerRef.current = window.setTimeout(() => {
              pauseRecoveryTimerRef.current = null;
              if (audioSecondaryRef.current?.paused && !userStoppedRef.current) {
                scheduleReconnect(recoveryStation);
              }
            }, pauseRecoveryDelayMs);
          }
        }}
        onPlaying={() => {
          if (activeAudioIndexRef.current === 1) {
            reconnectAttemptsRef.current = 0;
            setPlaybackError(null);
            shouldAutoResumeRef.current = false;
            clearReconnectTimer();
            clearStallTimer();
            clearPauseRecoveryTimer();
            lastProgressAtRef.current = Date.now();
            lastProgressPositionRef.current = audioSecondaryRef.current?.currentTime || 0;
          }
        }}
        onTimeUpdate={() => {
          if (activeAudioIndexRef.current === 1 && audioSecondaryRef.current) {
            if (audioSecondaryRef.current.currentTime > lastProgressPositionRef.current + 0.15) {
              lastProgressPositionRef.current = audioSecondaryRef.current.currentTime;
              lastProgressAtRef.current = Date.now();
            }
          }
        }}
        onProgress={() => {
          if (activeAudioIndexRef.current === 1) {
            lastProgressAtRef.current = Date.now();
            clearPauseRecoveryTimer();
            if (stallTimerRef.current) {
              clearStallTimer();
              setPlaybackError(null);
            }
          }
        }}
        onWaiting={() => {
          if (activeAudioIndexRef.current === 1 && !userStoppedRef.current) {
            const recoveryStation = getRecoveryStation();
            if (recoveryStation) scheduleReconnectAfterBuffering(recoveryStation);
          }
        }}
        onEnded={() => {
          if (activeAudioIndexRef.current === 1 && !userStoppedRef.current) {
            const recoveryStation = getRecoveryStation();
            if (recoveryStation) scheduleReconnect(recoveryStation);
          }
        }}
        onStalled={() => {
          if (activeAudioIndexRef.current === 1 && !userStoppedRef.current) {
            const recoveryStation = getRecoveryStation();
            if (recoveryStation) scheduleReconnectAfterBuffering(recoveryStation);
          }
        }}
        onError={() => {
          if (activeAudioIndexRef.current === 1 && !userStoppedRef.current) {
            const recoveryStation = getRecoveryStation();
            if (recoveryStation) scheduleReconnect(recoveryStation);
          }
        }}
      />

      <section className="app-panel">
        <header className="hero-header">
          <p className="hero-chip">LIVE RADIO DIRECTORY</p>
          <h1>RadioBG Online</h1>
          <p className="hero-subtitle">
          Слушайте български радиостанции на живо.
          </p>
          <div className="toolbar-row">
            <label className="search-box" htmlFor="station-search">
              <span className="search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" role="img" aria-label="">
                  <path
                    fill="currentColor"
                    d="M10 2a8 8 0 1 0 4.9 14.32l4.38 4.39a1 1 0 1 0 1.42-1.42l-4.39-4.38A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12a6 6 0 0 1 0-12Z"
                  />
                </svg>
              </span>
              <input
                id="station-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && suggestedStations[0]) {
                    event.preventDefault();
                    handleSuggestionPick(suggestedStations[0]);
                  }
                }}
                placeholder="Търси радиостанция..."
                aria-label="Търсене на радиостанция"
                autoComplete="off"
              />
            </label>
            {normalizedSearchQuery && (
              <div className="search-suggestions" role="listbox" aria-label="Предложени станции">
                {suggestedStations.length > 0 ? (
                  suggestedStations.map((station) => (
                    <button
                      key={station.id}
                      type="button"
                      className="search-suggestion-btn"
                      onClick={() => handleSuggestionPick(station)}
                    >
                      {station.name}
                    </button>
                  ))
                ) : (
                  <p className="state-note">Няма съвпадения за това търсене.</p>
                )}
              </div>
            )}
          </div>
          <div className="status-row" role="status" aria-live="polite">
            <span className="status-dot" />
            <span>
              {nowPlayingName
                ? `Сега свири: ${nowPlayingName}`
                : currentStation
                  ? `Готово за пускане: ${currentStation.name}`
                  : "Изберете станция"}
            </span>
          </div>
          {isLoading && <p className="state-note">Зареждане на станции...</p>}
          {loadError && <p className="state-note state-note-error">{loadError}</p>}
          {playbackError && <p className="state-note state-note-error">{playbackError}</p>}
        </header>

        <section aria-label="Станции" className="station-grid">
          {visibleStations.map((station) => {
            const isCurrent = selectedId === station.id;
            const isPlaying = playingId === station.id;
            return (
              <article
                key={station.id}
                className={`station-card ${isCurrent ? "station-card-current" : ""} ${isPlaying ? "station-card-playing" : ""}`}
              >
                <div>
                  <h2>{station.name}</h2>
                  <p>{station.genre}</p>
                </div>
                <button
                  type="button"
                  className="play-btn"
                  onClick={() => handlePlayToggle(station)}
                  aria-label={isPlaying ? `Спри ${station.name}` : `Пусни ${station.name}`}
                >
                  <span>{isPlaying ? "PAUSE" : "PLAY"}</span>
                </button>
              </article>
            );
          })}
        </section>
        {normalizedSearchQuery && visibleStations.length === 0 && (
          <p className="state-note">Няма станции, които да съвпадат с въведеното.</p>
        )}

      </section>
    </main>
  );
}
