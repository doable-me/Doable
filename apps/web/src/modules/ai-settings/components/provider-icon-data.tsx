import React from "react";

// ─── Brand color map (hex) — exported for card backgrounds ──
export const PROVIDER_COLORS: Record<string, string> = {
  openai: "#000000",
  anthropic: "#D97757",
  "google-ai-studio": "#4285F4",
  "azure-openai": "#0078D4",
  "aws-bedrock": "#FF9900",
  "google-vertex": "#4285F4",
  openrouter: "#6366F1",
  "together-ai": "#2563EB",
  "fireworks-ai": "#F97316",
  "unify-ai": "#14B8A6",
  groq: "#F04438",
  mistral: "#0066FF",
  cohere: "#7C3AED",
  xai: "#FFFFFF",
  deepseek: "#4D6BFE",
  perplexity: "#20808D",
  sambanova: "#F97316",
  "novita-ai": "#8B5CF6",
  ppio: "#3B82F6",
  moonshot: "#6366F1",
  dashscope: "#FF6A00",
  "doubao-ai": "#3B82F6",
  "lm-studio": "#F5F5F5",
  ollama: "#FFFFFF",
  copilot: "#0066FF",
  "huggingface-inference": "#FFD21E",
  opencode: "#10B981",
  byok: "#64748B",
  custom: "#64748B",
};

// ─── Long SVG paths stored as constants ─────────────────────

export const OLLAMA_PATH =
  "M12.002 1.574c-2.094 0-4.078.748-5.43 2.545-.063.085-.453.68-.632.98-.178-.075-.418-.156-.576-.198a4.615 4.615 0 0 0-1.275-.183c-2.456 0-4.089 2.15-4.089 4.42 0 1.552.614 2.705 1.022 3.373-.126.559-.192 1.156-.192 1.788 0 2.291.894 4.181 2.468 5.459 1.556 1.262 3.688 1.968 6.053 1.968h1.348c2.366 0 4.497-.706 6.053-1.968 1.574-1.278 2.468-3.168 2.468-5.459 0-.632-.066-1.229-.192-1.788.408-.668 1.022-1.821 1.022-3.373 0-2.27-1.633-4.42-4.089-4.42-.425 0-.878.066-1.275.183-.158.042-.398.123-.576.198-.18-.3-.57-.895-.633-.98-1.351-1.797-3.335-2.545-5.43-2.545Zm0 1.092c1.762 0 3.436.614 4.534 2.073.279.369.45.72.45.72s-.696-.245-1.059-.245c-1.455 0-2.414.997-3.006 1.907-.353-.274-.88-.486-1.568-.486-.688 0-1.215.212-1.568.486-.592-.91-1.55-1.907-3.006-1.907-.362 0-1.06.245-1.06.245s.172-.351.45-.72c1.1-1.459 2.773-2.073 4.535-2.073h-.002ZM5.99 6.67c1.093 0 1.923.728 2.502 1.662-.596.76-.955 1.73-.955 2.879 0 1.257.57 2.175 1.33 2.783-.47.26-1.032.432-1.582.503-.895.115-1.797-.004-2.41-.325-1.104-.579-1.804-1.685-1.804-3.675 0-1.88 1.327-3.827 2.919-3.827Zm12.02 0c1.592 0 2.918 1.947 2.918 3.827 0 1.99-.7 3.096-1.804 3.675-.612.321-1.514.44-2.41.325-.549-.07-1.11-.242-1.581-.503.76-.608 1.33-1.526 1.33-2.783 0-1.149-.36-2.119-.956-2.879.58-.934 1.41-1.662 2.503-1.662Zm-6.008 1.85c.845 0 1.484.384 1.484 1.075 0 1.535-.393 2.803-1.484 3.533-1.09-.73-1.484-1.998-1.484-3.533 0-.691.639-1.075 1.484-1.075Zm-2.81 5.439c.336.1.696.172 1.068.22 1.2.154 2.284-.075 3.093-.58.147-.093.29-.197.42-.312.13.115.272.22.42.312.808.505 1.893.734 3.092.58.373-.048.733-.12 1.068-.22.058.291.092.604.092.94 0 1.823-.72 3.376-2.024 4.435-1.302 1.056-3.118 1.67-5.278 1.67h-1.266c-2.16 0-3.976-.614-5.278-1.67-1.304-1.059-2.024-2.612-2.024-4.435 0-.336.034-.649.091-.94Z";

export const HUGGINGFACE_PATH =
  "M12.025 1.13c-5.77 0-10.592 4.252-11.416 9.818-.225 1.522-.17 2.907.137 4.239C1.935 20.107 6.572 23.87 12.025 23.87c5.453 0 10.09-3.763 11.279-8.683.307-1.332.363-2.717.137-4.239-.824-5.566-5.646-9.818-11.416-9.818Zm-4.8 7.343c.934 0 1.691.826 1.691 1.844 0 1.018-.757 1.843-1.69 1.843-.934 0-1.691-.825-1.691-1.843 0-1.018.757-1.844 1.69-1.844Zm9.6 0c.934 0 1.691.826 1.691 1.844 0 1.018-.757 1.843-1.69 1.843-.934 0-1.691-.825-1.691-1.843 0-1.018.757-1.844 1.69-1.844Zm-9.62 1.1a.573.573 0 0 1 .573.573.573.573 0 0 1-.573.572.573.573 0 0 1-.573-.572.573.573 0 0 1 .573-.573Zm9.59 0a.573.573 0 0 1 .573.573.573.573 0 0 1-.573.572.573.573 0 0 1-.573-.572.573.573 0 0 1 .573-.573Zm-8.89 4.142h8.19c.257 0 .466.271.466.606 0 1.725-2.047 4.255-4.561 4.255-2.515 0-4.561-2.53-4.561-4.255 0-.335.208-.606.466-.606Z";

// ─── Helper: wrap a single path in an SVG ──────────────────
export function P({ d, size, fill }: { d: string; size: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d={d} fill={fill ?? "currentColor"} />
    </svg>
  );
}

// ─── Fallback: bold text abbreviation ───────────────────────
export function TextIcon({
  text,
  size,
  fill,
}: {
  text: string;
  size: number;
  fill: string;
}) {
  const fontSize = text.length <= 1 ? 15 : text.length <= 2 ? 13 : 10;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fill={fill}
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        {text}
      </text>
    </svg>
  );
}

// ─── Fallback: colored rounded rect with initials ──────────
export function FallbackIcon({
  providerId,
  size,
}: {
  providerId: string;
  size: number;
}) {
  const parts = providerId.split("-").filter(Boolean);
  const initials =
    parts.length >= 2
      ? ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()
      : providerId.substring(0, 2).toUpperCase();

  let hash = 0;
  for (let i = 0; i < providerId.length; i++) {
    hash = providerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const bg = `hsl(${hue}, 55%, 45%)`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="22" height="22" rx="6" fill={bg} />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fill="white"
        fontSize="11"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        {initials}
      </text>
    </svg>
  );
}
