import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';

export function ResultAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    if (stream)
      void audio
        .play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
    return () => {
      audio.srcObject = null;
    };
  }, [stream]);
  return (
    <>
      <audio ref={ref} autoPlay aria-label="Opponent audio" />
      {blocked && (
        <button
          className="text-link text-link-light"
          onClick={() => {
            void ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true));
          }}
        >
          <Volume2 size={16} /> Tap to hear your friend
        </button>
      )}
    </>
  );
}
