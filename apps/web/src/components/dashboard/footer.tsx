import { useUiText } from "@/i18n/use-ui-text";
import Link from "next/link";

export function Footer() {
  const ui = useUiText();

  return (
    <footer className="flex h-10 items-center justify-center gap-x-4 border-t border-border bg-card px-4 text-xs text-muted-foreground">
      <span>
        &copy; {new Date().getFullYear()} {ui("Doable")}
      </span>
      <span className="text-border">·</span>
      <Link href="/terms" className="hover:text-foreground transition-colors">
        {ui("Terms")}
      </Link>
      <Link href="/privacy" className="hover:text-foreground transition-colors">
        {ui("Privacy")}
      </Link>
      <Link href="/cookies" className="hover:text-foreground transition-colors">
        {ui("Cookies")}
      </Link>
      <Link
        href="/acceptable-use"
        className="hover:text-foreground transition-colors"
      >
        {ui("Acceptable Use")}
      </Link>
      <Link href="/dmca" className="hover:text-foreground transition-colors">
        {ui("DMCA")}
      </Link>
    </footer>
  );
}
