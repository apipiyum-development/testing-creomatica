import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const CosmicSoundToggle = () => {
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Инициализация аудио
    const audio = new Audio('/assets/hero/sample.mp3');
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;

    // Функция для обхода блокировки автоплея
    const initAudioContext = () => {
      if (audioRef.current) {
        // "Прогрев" аудио-движка
        audioRef.current.play().then(() => {
          if (isMuted) audioRef.current.pause();
        }).catch(() => {});
      }
      window.removeEventListener('click', initAudioContext);
    };

    window.addEventListener('click', initAudioContext);

    return () => {
      window.removeEventListener('click', initAudioContext);
      if (audioRef.current) {
        audioRef.current.pause();
        if (fadeInterval.current) {
          clearInterval(fadeInterval.current);
        }
      }
    };
  }, []);

  const fade = (targetVolume: number) => {
    if (fadeInterval.current) clearInterval(fadeInterval.current);

    fadeInterval.current = setInterval(() => {
      const a = audioRef.current;
      if (!a) return;

      const step = 0.05;
      if (Math.abs(a.volume - targetVolume) < step) {
        a.volume = targetVolume;
        clearInterval(fadeInterval.current);
        if (targetVolume === 0) a.pause();
      } else {
        a.volume += (a.volume < targetVolume ? step : -step);
      }
    }, 50);
  };

  const handleToggle = () => {
    if (isMuted && audioRef.current) {
      audioRef.current.play();
      fade(0.5); // Плавный подъем до 50%
    } else {
      fade(0); // Плавный уход в 0
    }
    setIsMuted(!isMuted);
  };

  return (
    <button
      onClick={handleToggle}
      className={`fixed bottom-6 left-6 z-50 p-3 rounded-full border transition-all duration-500 ${
        !isMuted
          ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
          : 'bg-black/40 border-white/10 hover:border-white/30'
      }`}
    >
      {!isMuted ? (
        <Volume2 className="w-6 h-6 text-cyan-400 animate-pulse" />
      ) : (
        <VolumeX className="w-6 h-6 text-gray-400" />
      )}
    </button>
  );
};

export default CosmicSoundToggle;