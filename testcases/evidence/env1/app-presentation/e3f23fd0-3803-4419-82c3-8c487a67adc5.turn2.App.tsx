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

  const goToPrevious = () => {
    setCurrentSlide((prev) => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1));
  };

  const goToFirst = () => {
    setCurrentSlide(0);
  };

  const goToLast = () => {
    setCurrentSlide(slides.length - 1);
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
  }, []);

  const canGoPrevious = currentSlide > 0;
  const canGoNext = currentSlide < slides.length - 1;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-2xl mx-auto px-6">
        <div className="bg-white rounded-2xl shadow-xl p-12 min-h-[400px] flex flex-col">
          <div className="flex-1 flex flex-col justify-center text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              {slides[currentSlide].title}
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              {slides[currentSlide].body}
            </p>
          </div>

          <div className="flex items-center justify-between pt-8 border-t border-slate-100">
            <button
              onClick={goToPrevious}
              disabled={!canGoPrevious}
              className="px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Previous
            </button>

            <span className="text-slate-500 font-medium">
              Slide {currentSlide + 1} of {slides.length}
            </span>

            <button
              onClick={goToNext}
              disabled={!canGoNext}
              className="px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500 text-white hover:bg-orange-600"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}