export function BrandLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      aria-label="Doable"
      className={`inline-flex items-center justify-center rounded-lg bg-brand-100 text-brand-700 font-bold ${className}`}
    >
      D<span className="text-violet-700">.</span>
    </span>
  );
}
export function BrandWordmark() {
  return <span className="font-semibold">Doable</span>;
}
