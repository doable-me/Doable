import { useState, useEffect } from "react";

interface Slide {
  title: string;
  body: string;
}

const slides: Slide[] = [
  {
    title: "Welcome to Doable",
    body: "Doable helps you transform your ideas into reality. Start building something amazing today.",
  },
  {
    title: "What is Doable",
    body: "Doable is a modern app builder that lets you create, iterate, and deploy web applications with ease.",
  },
  {
    title: "Features",
    body: "Drag-and-drop interface, real-time collaboration, instant deployment, and seamless integrations with your favorite tools.",
  },
  {
    title: "Pricing",
    body: "Start free, upgrade when you grow. Plans for individuals, teams, and enterprises available.",
  },
  {
    title: "Get Started",
    body: "Sign up in seconds and start building. No credit card required. Your first project is on us.",
  },
];

export default function App() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const goToPrevious = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentSlide((prev) => Math.max(0, prev - 1));
      setTimeout(() => setIsAnimating(false), 50);
    }, 150);
  };

  const goToNext = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1));
      setTimeout(() => setIsAnimating(false), 50);
    }, 150);
  };

  const goToFirst = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentSlide(0);
      setTimeout(() => setIsAnimating(false), 50);
    }, 150);
  };

  const goToLast = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentSlide(slides.length - 1);
      setTimeout(() => setIsAnimating(false), 50);
    }, 150);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        goToNext();
      } else if (e.key === "ArrowLeft") {
        goToPrevious();
      } else if (e.key === "Home") {
        goToFirst();
      } else if (e.key === "End") {
        goToLast();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnimating]);

  const canGoPrevious = currentSlide > 0;
  const canGoNext = currentSlide < slides.length - 1;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 min-h-[380px] flex flex-col">
          <div className="flex-1 flex flex-col justify-center text-center">
            <h1
              className={`text-3xl font-bold text-slate-900 mb-4 transition-all duration-300 ${
                isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}
            >
              {slides[currentSlide].title}
            </h1>
            <p
              className={`text-lg text-slate-600 leading-relaxed transition-all duration-300 delay-75 ${
                isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}
            >
              {slides[currentSlide].body}
            </p>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            <button
              onClick={goToPrevious}
              disabled={!canGoPrevious || isAnimating}
              className="px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Previous
            </button>

            <span className="text-slate-500 font-medium">
              Slide {currentSlide + 1} of {slides.length}
            </span>

            <button
              onClick={goToNext}
              disabled={!canGoNext || isAnimating}
              className="px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500 text-white hover:bg-orange-600"
            >
              Next
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-4 justify-center">
          {slides.map((slide, index) => (
            <button
              key={index}
              onClick={() => {
                if (isAnimating || index === currentSlide) return;
                setIsAnimating(true);
                setTimeout(() => {
                  setCurrentSlide(index);
                  setTimeout(() => setIsAnimating(false), 50);
                }, 150);
              }}
              className={`w-20 h-14 rounded-lg p-1.5 text-left transition-all cursor-pointer ${
                index === currentSlide
                  ? "bg-orange-500 ring-2 ring-orange-500 ring-offset-2"
                  : "bg-white hover:bg-slate-100"
              }`}
            >
              <div
                className={`text-[8px] font-bold leading-tight truncate ${
                  index === currentSlide ? "text-white" : "text-slate-700"
                }`}
              >
                {slide.title}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}