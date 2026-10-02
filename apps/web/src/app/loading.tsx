import { useUiText } from "@/i18n/use-ui-text";
export default function Loading() {
  const ui = useUiText();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="text-sm text-zinc-500">{ui("Loading...")}</p>
      </div>
    </div>
  );
}
