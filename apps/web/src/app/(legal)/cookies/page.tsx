import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy | Doable",
  description: "How Doable uses cookies and similar technologies.",
};

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <p className="text-sm text-gray-500">
        <strong>Last updated:</strong> April 27, 2026
      </p>

      <p>
        This Cookie Policy explains how <strong>Doable Works LLC</strong> uses
        cookies and similar technologies on doable.me, dev.doable.me, and
        related services (the &ldquo;Service&rdquo;).
      </p>

      <h2>What are cookies?</h2>
      <p>
        Cookies are small text files stored on your device when you visit a
        website. They are widely used to make websites work, or work more
        efficiently, and to provide information to site owners.
      </p>

      <h2>Cookies and storage we use</h2>

      <h3>Strictly necessary (always on)</h3>
      <p>
        Required for core functionality. Cannot be disabled without breaking the
        Service.
      </p>
      <ul>
        <li>
          <code>doable_access_token</code> &mdash; short-lived authentication
          token (localStorage)
        </li>
        <li>
          <code>doable_refresh_token</code> &mdash; refresh token for renewing
          your session (localStorage)
        </li>
        <li>
          <code>doable_theme</code> &mdash; remembers your light/dark theme
          preference (localStorage)
        </li>
        <li>
          <code>doable_brand_theme</code> &mdash; remembers your brand color
          preference (localStorage)
        </li>
        <li>OAuth state nonce &mdash; CSRF protection during OAuth login</li>
      </ul>

      <h3>Functional</h3>
      <ul>
        <li>UI preferences (sidebar collapsed, panel layout)</li>
        <li>Recently opened projects</li>
        <li>Editor settings (font size, key bindings)</li>
      </ul>

      <h3>Analytics</h3>
      <p>
        We may use first-party analytics to understand how the Service is used
        and to improve it. We do not use third-party advertising trackers.
      </p>

      <h3>Payment</h3>
      <p>
        Stripe sets cookies on its own checkout pages for fraud prevention and
        session management. See{" "}
        <a
          href="https://stripe.com/cookie-settings"
          target="_blank"
          rel="noopener noreferrer"
        >
          Stripe&rsquo;s cookie settings
        </a>
        .
      </p>

      <h2>Managing cookies</h2>
      <p>
        Most browsers allow you to view, delete, or block cookies. Blocking
        strictly necessary cookies will prevent the Service from functioning
        (you will not be able to sign in). You can clear locally stored data at
        any time via your browser settings.
      </p>

      <h2>Do Not Track</h2>
      <p>
        We do not currently respond to Do Not Track signals because no consistent
        industry standard exists. We do, however, honor opt-out requests
        described in our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this Cookie Policy from time to time. We will post the
        updated version on this page and update the &ldquo;Last updated&rdquo;
        date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email{" "}
        <a href="mailto:privacy@doable.me">privacy@doable.me</a>.
      </p>
    </>
  );
}
