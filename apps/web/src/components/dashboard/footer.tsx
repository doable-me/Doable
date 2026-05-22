import Link from "next/link";

export function Footer() {
  return (
    <footer className="flex h-10 items-center justify-center gap-x-4 border-t border-border bg-card px-4 text-xs text-muted-foreground">
      <span>&copy; {new Date().getFullYear()} Doable Works LLC</span>
      <span className="text-border">·</span>
      <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
      <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
      <Link href="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
      <Link href="/acceptable-use" className="hover:text-foreground transition-colors">Acceptable Use</Link>
      <Link href="/dmca" className="hover:text-foreground transition-colors">DMCA</Link>
    </footer>
  );
}