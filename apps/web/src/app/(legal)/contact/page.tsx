import type { Metadata } from "next";
import { Mail, Shield, AlertTriangle, FileText, Building2, MessageSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us | Doable",
  description: "Get in touch with Doable Works LLC.",
};

const contacts = [
  {
    icon: MessageSquare,
    label: "General & support",
    email: "support@doable.me",
    description: "Questions about the Service, billing, or your account.",
  },
  {
    icon: Shield,
    label: "Security",
    email: "security@doable.me",
    description:
      "Report a security vulnerability. We respond within 48 hours and credit responsible disclosures.",
  },
  {
    icon: AlertTriangle,
    label: "Abuse",
    email: "abuse@doable.me",
    description: "Report violations of our Acceptable Use Policy.",
  },
  {
    icon: FileText,
    label: "Legal & DMCA",
    email: "legal@doable.me",
    description: "Legal notices, contracts, and copyright matters.",
  },
  {
    icon: Building2,
    label: "Privacy",
    email: "privacy@doable.me",
    description:
      "Privacy questions, data access, deletion, and GDPR/CCPA requests.",
  },
  {
    icon: Mail,
    label: "Press & partnerships",
    email: "hello@doable.me",
    description: "Media inquiries, partnership opportunities, and everything else.",
  },
];

export default function ContactPage() {
  return (
    <>
      <h1>Contact Us</h1>
      <p>
        We&rsquo;re a small team and we read every email. Please use the address
        that best fits your inquiry &mdash; it helps us route messages quickly.
      </p>

      <div className="not-prose mt-8 grid gap-4 sm:grid-cols-2">
        {contacts.map(({ icon: Icon, label, email, description }) => (
          <a
            key={email}
            href={`mailto:${email}`}
            className="group block rounded-xl border border-gray-800/70 bg-gray-900/30 p-5 transition-colors hover:border-brand-500/50 hover:bg-gray-900/60"
          >
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300">
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">{label}</h3>
            <p className="mt-1 font-mono text-sm text-brand-400 group-hover:underline">
              {email}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              {description}
            </p>
          </a>
        ))}
      </div>

      <h2>Company</h2>
      <p>
        <strong>Doable Works LLC</strong>
        <br />
        Operator of doable.me and dev.doable.me
      </p>

      <h2>Open source</h2>
      <p>
        For bugs, feature requests, or contributions to the open-source
        codebase, please use{" "}
        <a
          href="https://github.com/doable-me/doable"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub Issues
        </a>
        .
      </p>
    </>
  );
}
