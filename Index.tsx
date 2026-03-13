import { useState, useRef, useCallback } from "react";
import { stations, RadioStation } from "@/data/stations";
import HeroSection from "@/components/HeroSection";
import StationCard from "@/components/StationCard";
import GenreFilter from "@/components/GenreFilter";
import RadioPlayer from "@/components/RadioPlayer";
import { Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const Index = () => {
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeGenre, setActiveGenre] = useState("Всички");
  const [searchQuery, setSearchQuery] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null!);

  const playStation = useCallback(
    (station: RadioStation) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (currentStation?.id === station.id) {
        // Toggle play/pause for same station
        if (isPlaying) {
          audio.pause();
          setIsPlaying(false);
        } else {
          audio.play().catch(() => {});
          setIsPlaying(true);
        }
      } else {
        // Switch station
        setCurrentStation(station);
        audio.src = station.streamUrl;
        audio.load();
        audio.play().catch(() => {});
        setIsPlaying(true);
      }
    },
    [currentStation, isPlaying]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentStation) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, currentStation]);

  const closePlayer = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    setCurrentStation(null);
    setIsPlaying(false);
  }, []);

  const filteredStations = stations.filter((s) => {
    const matchesGenre = activeGenre === "Всички" || s.genre === activeGenre;
    const matchesSearch =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGenre && matchesSearch;
  });

  return (
    <div className={`min-h-screen bg-background ${currentStation ? "pb-24" : ""}`}>
      <audio ref={audioRef} preload="none" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <h2 className="font-display text-xl font-bold text-foreground">
            📻 RadioBG <span className="text-primary">Online</span>
          </h2>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Търсене..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-full border border-border bg-secondary py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary w-40 sm:w-56"
            />
          </div>
        </div>
      </header>

      {/* Hero */}
      <HeroSection
        station={currentStation}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
      />

      {/* Stations grid */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-2xl font-bold text-foreground">
            Радиостанции
          </h2>
          <GenreFilter activeGenre={activeGenre} onGenreChange={setActiveGenre} />
        </div>

        <motion.div
          layout
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        >
          <AnimatePresence mode="popLayout">
            {filteredStations.map((station) => (
              <motion.div
                key={station.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <StationCard
                  station={station}
                  isPlaying={isPlaying}
                  isActive={currentStation?.id === station.id}
                  onPlay={playStation}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {filteredStations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-lg">Няма намерени радиостанции</p>
            <p className="text-sm">Опитайте с друг филтър или търсене</p>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className={`border-t border-border py-8 text-center text-sm text-muted-foreground ${currentStation ? "mb-20" : ""}`}>
        <p>© 2026 RadioBG Online — Всички права запазени</p>
        <p className="mt-1 text-xs">Слушайте български радиостанции онлайн безплатно</p>
      </footer>

      {/* Player */}
      <RadioPlayer
        station={currentStation}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onClose={closePlayer}
        audioRef={audioRef}
      />
    </div>
  );
};

export default Index;
