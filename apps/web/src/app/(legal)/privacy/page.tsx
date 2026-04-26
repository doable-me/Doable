import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Doable",
  description:
    "How Doable Works LLC collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-gray-500">
        <strong>Last updated:</strong> April 27, 2026
      </p>

      <p>
        This Privacy Policy explains how <strong>Doable Works LLC</strong>{" "}
        (&ldquo;Doable,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;) collects, uses, and protects information when you use
        the Doable platform at doable.me, dev.doable.me, and related services
        (the &ldquo;Service&rdquo;).
      </p>

      <h2>1. Information We Collect</h2>

      <h3>Information you provide</h3>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, password
          (hashed with Argon2id), and optionally a profile photo
        </li>
        <li>
          <strong>OAuth identity:</strong> if you sign in with GitHub or Google,
          we receive your basic profile (name, email, avatar)
        </li>
        <li>
          <strong>User Content:</strong> projects, prompts, code, files, chat
          messages, and other content you create or upload
        </li>
        <li>
          <strong>Payment information:</strong> processed by Stripe; we receive
          billing metadata but never your full card number
        </li>
        <li>
          <strong>Communications:</strong> support requests, feedback, and any
          other messages you send us
        </li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Usage data:</strong> pages visited, features used, AI prompts
          and responses, errors encountered, timestamps
        </li>
        <li>
          <strong>Device and connection:</strong> IP address, browser type,
          operating system, device identifiers
        </li>
        <li>
          <strong>Cookies and similar:</strong> see our{" "}
          <a href="/cookies">Cookie Policy</a>
        </li>
      </ul>

      <h3>Information from third parties</h3>
      <ul>
        <li>
          OAuth providers (GitHub, Google) when you connect those accounts
        </li>
        <li>Stripe for billing and subscription status</li>
        <li>
          Integration partners that you authorize Doable to connect with on your
          behalf
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To provide, operate, and maintain the Service</li>
        <li>
          To process AI requests by sending prompts and context to AI providers
          (Anthropic, OpenAI, GitHub Copilot) you have selected
        </li>
        <li>To process payments and manage subscriptions</li>
        <li>To communicate with you about the Service, billing, and support</li>
        <li>
          To detect, investigate, and prevent fraud, abuse, and security
          incidents
        </li>
        <li>To improve the Service and develop new features</li>
        <li>To comply with legal obligations</li>
      </ul>

      <h2>3. AI Providers and Your Prompts</h2>
      <p>
        When you use AI features, your prompts and project context are sent to
        the AI provider you have configured (Anthropic, OpenAI, or GitHub
        Copilot). Each provider has its own data-handling practices:
      </p>
      <ul>
        <li>
          <strong>Anthropic:</strong>{" "}
          <a
            href="https://www.anthropic.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
        </li>
        <li>
          <strong>OpenAI:</strong>{" "}
          <a
            href="https://openai.com/policies/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
        </li>
        <li>
          <strong>GitHub Copilot:</strong>{" "}
          <a
            href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Statement
          </a>
        </li>
      </ul>
      <p>
        We do not use your prompts or generated code to train our own AI models.
      </p>

      <h2>4. Information Sharing</h2>
      <p>We do not sell your personal information. We share information only:</p>
      <ul>
        <li>
          <strong>With service providers</strong> who help us operate the
          Service (hosting, payment processing, analytics, error monitoring,
          email delivery), under contractual confidentiality and security
          obligations
        </li>
        <li>
          <strong>With AI providers</strong> as necessary to fulfil your
          requests
        </li>
        <li>
          <strong>With integration partners</strong> you explicitly authorize
        </li>
        <li>
          <strong>For legal reasons</strong> when required by law, subpoena, or
          to protect rights, property, or safety
        </li>
        <li>
          <strong>In a business transfer</strong> if Doable Works LLC is
          acquired, merged, or sells assets, in which case we will provide
          notice
        </li>
      </ul>

      <h2>5. Data Retention</h2>
      <p>
        We retain your personal information for as long as your account is
        active and as needed to provide the Service. After you delete your
        account, we will delete or anonymize your data within 90 days, except
        where retention is required by law (e.g., billing records) or for
        legitimate security purposes (e.g., fraud prevention logs).
      </p>

      <h2>6. Security</h2>
      <p>We use industry-standard security measures, including:</p>
      <ul>
        <li>Argon2id password hashing</li>
        <li>JWT-based authentication with short-lived access tokens</li>
        <li>TLS encryption for data in transit</li>
        <li>Encryption at rest for sensitive credentials (AES-GCM)</li>
        <li>Network isolation with services bound to localhost only</li>
        <li>Rate limiting on authentication endpoints</li>
        <li>Regular security audits</li>
      </ul>
      <p>
        No system is 100% secure. If you suspect a security issue, please
        contact{" "}
        <a href="mailto:security@doable.me">security@doable.me</a>.
      </p>

      <h2>7. Your Rights</h2>
      <p>Depending on your jurisdiction, you may have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you</li>
        <li>Correct inaccurate information</li>
        <li>Delete your information (right to be forgotten)</li>
        <li>Export your information in a portable format</li>
        <li>Object to or restrict certain processing</li>
        <li>Withdraw consent</li>
        <li>Lodge a complaint with a supervisory authority</li>
      </ul>
      <p>
        To exercise these rights, email{" "}
        <a href="mailto:privacy@doable.me">privacy@doable.me</a>. We will respond
        within 30 days.
      </p>

      <h2>8. International Transfers</h2>
      <p>
        Doable Works LLC is based in the United States. If you access the
        Service from outside the U.S., your information may be transferred to,
        stored, and processed in the U.S. or other countries where our service
        providers operate. Where required, we use Standard Contractual Clauses
        or other lawful transfer mechanisms.
      </p>

      <h2>9. Children&rsquo;s Privacy</h2>
      <p>
        The Service is not intended for children under 13. We do not knowingly
        collect personal information from children under 13. If you believe a
        child has provided us with personal information, please contact{" "}
        <a href="mailto:privacy@doable.me">privacy@doable.me</a> and we will
        delete it.
      </p>

      <h2>10. California Privacy Rights (CCPA/CPRA)</h2>
      <p>
        California residents have additional rights under the California
        Consumer Privacy Act, including the right to know, delete, correct, and
        opt out of &ldquo;sales&rdquo; or &ldquo;sharing&rdquo; of personal
        information. We do not sell personal information. To exercise California
        rights, email{" "}
        <a href="mailto:privacy@doable.me">privacy@doable.me</a>.
      </p>

      <h2>11. European Economic Area Rights (GDPR)</h2>
      <p>
        If you are in the EEA, UK, or Switzerland, our legal bases for
        processing your information are: (a) performance of our contract with
        you, (b) your consent (which you may withdraw at any time), (c) our
        legitimate interests in operating and improving the Service, and (d)
        compliance with legal obligations.
      </p>

      <h2>12. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the
        updated version on this page and update the &ldquo;Last updated&rdquo;
        date. For material changes, we will notify you by email or through the
        Service.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions or requests about this Privacy Policy? Contact our privacy
        team at{" "}
        <a href="mailto:privacy@doable.me">privacy@doable.me</a>.
      </p>
      <p>
        <strong>Doable Works LLC</strong>
        <br />
        Email: <a href="mailto:privacy@doable.me">privacy@doable.me</a>
      </p>
    </>
  );
}
