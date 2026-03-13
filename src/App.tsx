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
  "https://de1.api.radio-browser.info/json/stations/search?countrycode=BG&hidebroken=false&order=votes&reverse=true&limit=500";

const STATIONS_BG_LANGUAGE_API_URL =
  "https://de1.api.radio-browser.info/json/stations/bylanguageexact/Bulgarian?hidebroken=false&order=votes&reverse=true&limit=500";

const FALLBACK_STATIONS: Station[] = [
  {
    id: "fallback-1",
    name: "БНР Хоризонт",
    genre: "Новини",
    streamUrl: "https://stream.bnr.bg/horizont.mp3",
    bitrate: 128,
  },
  {
    id: "fallback-2",
    name: "БНР Христо Ботев",
    genre: "Култура",
    streamUrl: "https://stream.bnr.bg/botev.mp3",
    bitrate: 128,
  },
  {
    id: "fallback-3",
    name: "Дарик Радио",
    genre: "Talk",
    streamUrl: "https://darikradio.by.host.bg:8000/S2-128",
    bitrate: 128,
  },
  {
    id: "fallback-4",
    name: "N-JOY",
    genre: "Поп",
    streamUrl: "https://live-radio.btv.bg:8001/njoy.mp3",
    bitrate: 128,
  },
  {
    id: "fallback-5",
    name: "Z-Rock",
    genre: "Рок",
    streamUrl: "https://live-radio.btv.bg:8001/zrock.mp3",
    bitrate: 128,
  },
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

function isLikelyWebPlayable(station: RadioBrowserStation, requireHttps: boolean): boolean {
  const url = station.url_resolved?.trim();
  if (!url) {
    return false;
  }

  if (requireHttps && !url.startsWith("https://")) {
    return false;
  }

  // On GitHub Pages we can only play secure streams due to browser mixed-content rules.
  // Codec metadata in the API is often missing/inconsistent, so we avoid strict codec filtering.
  return true;
}

function normalizeStations(
  stations: RadioBrowserStation[],
  requireHttps: boolean,
  dataSaverMode: boolean
): Station[] {
  const maxBitrate = dataSaverMode ? 128 : 320;
  return stations
    .filter((item) => item.url_resolved && item.name)
    .filter((item) => isLikelyWebPlayable(item, requireHttps))
    .filter((item) => item.bitrate === 0 || item.bitrate <= maxBitrate)
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
  const [dataSaverMode, setDataSaverMode] = useState(false);
  const [selectedId, setSelectedId] = useState(FALLBACK_STATIONS[0].id);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const userStoppedRef = useRef(false);
  const shouldAutoResumeRef = useRef(false);
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

    const prefersDataSaving =
      Boolean(connection.saveData) ||
      ["slow-2g", "2g", "3g"].includes(String(connection.effectiveType || ""));

    if (prefersDataSaving) {
      setDataSaverMode(true);
    }
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
    const clean = normalizeStations(allStations, requireHttps, dataSaverMode);

    if (clean.length > 0) {
      setStations(clean);
      return;
    }

    setStations(FALLBACK_STATIONS);
  }, [allStations, dataSaverMode, requireHttps]);

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

  const playStation = async (station: Station, isReconnect = false) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    setSelectedId(station.id);
    setPlaybackError(null);

    if (!isReconnect) {
      reconnectAttemptsRef.current = 0;
      clearReconnectTimer();
      clearStallTimer();
    }

    const retrySuffix = isReconnect ? `&retry=${Date.now()}` : "";
    const nextSrc = `${streamProxyUrl(station.streamUrl)}${retrySuffix}`;
    audio.src = nextSrc;

    try {
      await audio.play();
      setPlayingId(station.id);
      setPlaybackError(null);
      shouldAutoResumeRef.current = false;
    } catch {
      setPlayingId(null);
      setPlaybackError("Тази станция в момента не може да бъде стартирана.");
    }
  };

  const scheduleReconnect = (station: Station) => {
    if (userStoppedRef.current) {
      return;
    }

    clearStallTimer();

    const maxRetries = 4;
    if (reconnectAttemptsRef.current >= maxRetries) {
      setPlaybackError("Връзката към станцията е нестабилна. Опитайте друга станция.");
      setPlayingId(null);
      return;
    }

    reconnectAttemptsRef.current += 1;
    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(1600 * attempt, 6000);
    setPlaybackError(`Възстановяване на потока... (${attempt}/${maxRetries})`);
    clearReconnectTimer();
    reconnectTimerRef.current = window.setTimeout(() => {
      playStation(station, true);
    }, delay);
  };

  const scheduleReconnectAfterBuffering = (station: Station) => {
    if (userStoppedRef.current || stallTimerRef.current) {
      return;
    }

    // Give mobile networks a short window to recover before forcing a reconnect.
    const stallDelayMs = 9000;
    setPlaybackError("Буфериране... Опит за стабилизиране на връзката.");
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null;
      scheduleReconnect(station);
    }, stallDelayMs);
  };

  const handlePlayToggle = async (station: Station) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    userStoppedRef.current = false;

    if (playingId === station.id) {
      userStoppedRef.current = true;
      shouldAutoResumeRef.current = false;
      clearReconnectTimer();
      clearStallTimer();
      audio.pause();
      setPlayingId(null);
      setPlaybackError(null);
      return;
    }

    await playStation(station);
  };

  useEffect(() => {
    return () => {
      clearReconnectTimer();
      clearStallTimer();
    };
  }, []);

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

    mediaSession.setActionHandler("pause", () => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      userStoppedRef.current = true;
      shouldAutoResumeRef.current = false;
      clearReconnectTimer();
      clearStallTimer();
      audio.pause();
      setPlayingId(null);
    });

    mediaSession.setActionHandler("stop", () => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      userStoppedRef.current = true;
      shouldAutoResumeRef.current = false;
      clearReconnectTimer();
      clearStallTimer();
      audio.pause();
      setPlayingId(null);
    });

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
          if (!userStoppedRef.current && playingStation) {
            shouldAutoResumeRef.current = true;
          }
        }}
        onPlaying={() => {
          reconnectAttemptsRef.current = 0;
          setPlaybackError(null);
          shouldAutoResumeRef.current = false;
          clearStallTimer();
        }}
        onProgress={() => {
          if (stallTimerRef.current) {
            clearStallTimer();
            setPlaybackError(null);
          }
        }}
        onWaiting={() => {
          if (playingStation && !userStoppedRef.current) {
            scheduleReconnectAfterBuffering(playingStation);
          }
        }}
        onEnded={() => {
          if (playingStation && !userStoppedRef.current) {
            scheduleReconnect(playingStation);
            return;
          }
          setPlayingId(null);
        }}
        onStalled={() => {
          if (playingStation && !userStoppedRef.current) {
            scheduleReconnectAfterBuffering(playingStation);
          }
        }}
        onError={() => {
          if (playingStation && !userStoppedRef.current) {
            scheduleReconnect(playingStation);
            return;
          }
          setPlayingId(null);
          setPlaybackError("Проблем при възпроизвеждане на радио потока.");
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
            <button
              type="button"
              className={`toggle-chip ${dataSaverMode ? "toggle-chip-on" : ""}`}
              onClick={() => setDataSaverMode((prev) => !prev)}
              aria-pressed={dataSaverMode}
            >
              {dataSaverMode ? "Пестене на данни: ВКЛ." : "Пестене на данни: ИЗКЛ."}
            </button>
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
          {dataSaverMode && <p className="state-note">Режимът за пестене на мобилни данни е активен (по-нисък битрейт).</p>}
          {loadError && <p className="state-note state-note-error">{loadError}</p>}
          {playbackError && <p className="state-note state-note-error">{playbackError}</p>}
        </header>

        <section aria-label="Станции" className="station-grid">
          {stations.map((station) => {
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

      </section>
    </main>
  );
}
