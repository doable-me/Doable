import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | Doable",
  description: "Rules for using the Doable platform responsibly.",
};

export default function AcceptableUsePage() {
  return (
    <>
      <h1>Acceptable Use Policy</h1>
      <p className="text-sm text-gray-500">
        <strong>Last updated:</strong> April 27, 2026
      </p>

      <p>
        This Acceptable Use Policy (&ldquo;AUP&rdquo;) describes activities that
        are not permitted on Doable, operated by{" "}
        <strong>Doable Works LLC</strong>. It supplements our{" "}
        <a href="/terms">Terms of Service</a>. Violations may result in
        suspension or termination of your account without refund and, where
        appropriate, referral to law enforcement.
      </p>

      <h2>Prohibited content and behavior</h2>
      <p>You may not use Doable to create, deploy, host, or distribute:</p>
      <ul>
        <li>
          <strong>Illegal content</strong> &mdash; anything that violates
          applicable law in any jurisdiction where the content is accessed
        </li>
        <li>
          <strong>Malware</strong> &mdash; viruses, worms, trojans, ransomware,
          spyware, keyloggers, cryptojackers, or any code designed to harm or
          gain unauthorized access to systems
        </li>
        <li>
          <strong>Phishing or fraud</strong> &mdash; pages designed to
          impersonate other services, harvest credentials, or deceive users
          into transferring assets
        </li>
        <li>
          <strong>Child sexual abuse material (CSAM)</strong> &mdash; absolutely
          prohibited; reported to NCMEC and law enforcement
        </li>
        <li>
          <strong>Non-consensual intimate imagery</strong> or content that
          sexualizes minors in any form
        </li>
        <li>
          <strong>Targeted harassment</strong> &mdash; content directed at
          individuals with the intent to threaten, intimidate, dox, or stalk
        </li>
        <li>
          <strong>Hate speech and incitement</strong> &mdash; content promoting
          violence against people based on protected characteristics
        </li>
        <li>
          <strong>Terrorism and violent extremism</strong> &mdash; recruitment,
          glorification, or operational planning
        </li>
        <li>
          <strong>Counterfeit goods, controlled substances</strong>, or
          unlicensed financial services
        </li>
        <li>
          <strong>Spam</strong> &mdash; unsolicited bulk messaging, link
          farming, or SEO manipulation networks
        </li>
        <li>
          <strong>IP infringement</strong> &mdash; pirated software, media, or
          materials that infringe copyrights, trademarks, or patents
        </li>
      </ul>

      <h2>Prohibited technical activities</h2>
      <ul>
        <li>
          Scanning, probing, or testing the vulnerability of the Service or any
          system without express written permission
        </li>
        <li>
          Circumventing or attempting to circumvent rate limits, quotas, billing,
          authentication, or other access controls
        </li>
        <li>
          Reselling or proxying AI inference, credits, or compute capacity
          without our written agreement
        </li>
        <li>
          Automated mass account creation, credential stuffing, or scraping the
          Service
        </li>
        <li>
          Using the Service to mine cryptocurrency or perform unrelated compute
          workloads
        </li>
        <li>
          Distributing private API keys, internal tokens, or credentials
          belonging to Doable Works LLC or other users
        </li>
        <li>
          Interfering with the integrity, performance, or availability of the
          Service or other users&rsquo; experience
        </li>
      </ul>

      <h2>Responsible AI use</h2>
      <ul>
        <li>
          Do not generate Output designed to deceive in ways that cause harm
          (e.g., generating fake legal documents, impersonating real people, or
          producing political disinformation)
        </li>
        <li>
          Do not use the Service to generate content that defames identifiable
          people
        </li>
        <li>
          Always review and test AI-generated code before deploying to
          production. <em>You</em> are responsible for code you ship.
        </li>
        <li>
          Do not submit private personal data of others to AI prompts without a
          lawful basis
        </li>
      </ul>

      <h2>Reporting violations</h2>
      <p>
        If you become aware of a violation of this AUP, please report it to{" "}
        <a href="mailto:abuse@doable.me">abuse@doable.me</a>. For copyright
        complaints, see our <a href="/dmca">DMCA Policy</a>. For security
        vulnerabilities, see <a href="mailto:security@doable.me">security@doable.me</a>.
      </p>

      <h2>Enforcement</h2>
      <p>
        We may, at our sole discretion, investigate suspected violations,
        remove content, suspend or terminate accounts, and cooperate with law
        enforcement. We will, where reasonable and lawful, give you an
        opportunity to address the issue before taking action, except in cases
        of severe harm or legal risk.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this AUP from time to time. The current version is always
        posted at this URL.
      </p>
    </>
  );
}
