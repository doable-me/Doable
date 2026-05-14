import { useState, useEffect } from "react";

const phrases = [
  "Dream it. Build it.",
  "Ideas become reality here.",
  "Your canvas awaits.",
  "Let's create something amazing.",
  "From zero to wow.",
];

function DoableLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className}>
      <rect width="40" height="40" rx="10" className="fill-[#F97316]">
        <animate attributeName="rx" values="10;14;10" dur="3s" repeatCount="indefinite" />
      </rect>
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" className="fill-white" style={{ fontSize: "22px", fontWeight: 700, fontFamily: "system-ui" }}>
        D
      </text>
    </svg>
  );
}

export default function App() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity(0);
      setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % phrases.length);
        setOpacity(1);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-50 via-stone-100 to-white dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <DoableLogo className="w-16 h-16 drop-shadow-lg" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Doable
          </h1>
          <p
            className="text-lg text-[#F97316] font-medium transition-opacity duration-400"
            style={{ opacity, transitionDuration: "400ms" }}
          >
            {phrases[phraseIndex]}
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#F97316]"
                style={{
                  animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
