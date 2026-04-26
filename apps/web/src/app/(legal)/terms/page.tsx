import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Doable",
  description:
    "Terms of Service for Doable, an AI-powered web development platform operated by Doable Works LLC.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-sm text-gray-500">
        <strong>Last updated:</strong> April 27, 2026
      </p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use
        of the Doable platform and any related websites, applications, APIs, and
        services (collectively, the &ldquo;Service&rdquo;) operated by{" "}
        <strong>Doable Works LLC</strong> (&ldquo;Doable,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By accessing or using the
        Service, you agree to be bound by these Terms. If you do not agree, do
        not use the Service.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 13 years old to use the Service. If you are under
        the age of majority in your jurisdiction, you must have your parent or
        legal guardian&rsquo;s permission. By using the Service, you represent
        that you meet these requirements and that you are not prohibited from
        using the Service under any applicable law.
      </p>

      <h2>2. Accounts</h2>
      <p>
        To access most features, you must create an account. You agree to provide
        accurate, current, and complete information and to keep your account
        credentials confidential. You are responsible for all activity that
        occurs under your account. Notify us immediately of any unauthorized
        access at{" "}
        <a href="mailto:security@doable.me">security@doable.me</a>.
      </p>

      <h2>3. Subscriptions and Billing</h2>
      <p>
        Doable offers free and paid plans. Paid plans are billed in advance on a
        recurring basis (monthly or annually) until you cancel. Charges are
        non-refundable except as required by law or as expressly stated in these
        Terms. You authorize us and our payment processor (Stripe) to charge your
        chosen payment method for all fees.
      </p>
      <p>
        We may change pricing at any time. Price changes will take effect at the
        start of your next billing cycle and we will give you at least 30 days
        advance notice for material changes.
      </p>

      <h2>4. User Content</h2>
      <p>
        You retain all rights to the code, prompts, designs, and other materials
        you create or upload using the Service (&ldquo;User Content&rdquo;). You
        grant Doable a worldwide, non-exclusive, royalty-free license to host,
        store, reproduce, and display User Content solely as necessary to operate
        and improve the Service.
      </p>
      <p>
        You represent and warrant that you own or have the necessary rights to
        all User Content, and that it does not infringe any third party rights or
        violate any law.
      </p>

      <h2>5. AI-Generated Output</h2>
      <p>
        The Service uses third-party AI models (such as Anthropic Claude, OpenAI,
        and GitHub Copilot) to generate code, text, and other output
        (&ldquo;Output&rdquo;). To the extent we have the right to do so, we
        assign to you all rights, title, and interest in Output you generate. You
        are responsible for evaluating Output for accuracy, security, and
        compliance before deploying it.
      </p>
      <p>
        AI Output is provided &ldquo;as is.&rdquo; AI models can make mistakes,
        produce insecure code, hallucinate facts, or generate content similar to
        training data. <strong>Do not deploy AI-generated code to production
        without independent review and testing.</strong>
      </p>

      <h2>6. Acceptable Use</h2>
      <p>
        You agree to use the Service only for lawful purposes and in accordance
        with our{" "}
        <a href="/acceptable-use">Acceptable Use Policy</a>. You will not:
      </p>
      <ul>
        <li>Use the Service to violate any law or third-party right</li>
        <li>
          Generate or distribute malware, phishing pages, ransomware, exploits,
          or content that facilitates unauthorized access to systems
        </li>
        <li>
          Attempt to reverse-engineer, decompile, or extract source code beyond
          what is permitted by the open-source license
        </li>
        <li>Interfere with the integrity, security, or performance of the Service</li>
        <li>Use the Service to send spam or unsolicited messages</li>
        <li>
          Generate content that is illegal, deceptive, harassing, hateful, or
          sexually exploits minors
        </li>
        <li>
          Resell, sublicense, or proxy the Service for AI inference without our
          written permission
        </li>
      </ul>

      <h2>7. Open Source</h2>
      <p>
        The Doable software is also available as open source under the MIT
        License at{" "}
        <a
          href="https://github.com/doable-me/doable"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/doable-me/doable
        </a>
        . Use of the open-source codebase is governed by the MIT License, not
        these Terms. These Terms apply to your use of the hosted Service at
        doable.me and dev.doable.me.
      </p>

      <h2>8. Third-Party Services</h2>
      <p>
        The Service integrates with third-party providers (including but not
        limited to GitHub, Google, Stripe, Anthropic, OpenAI, and 500+
        integration partners via Activepieces). Your use of those services is
        governed by their respective terms. We are not responsible for the
        availability, accuracy, or security of third-party services.
      </p>

      <h2>9. Intellectual Property</h2>
      <p>
        The Service, including its branding, logos, and trademarks (&ldquo;Doable&rdquo;
        and the Doable logo), are owned by Doable Works LLC. Except for the
        rights expressly granted under these Terms or the MIT License for the
        open-source codebase, no rights are granted to you.
      </p>

      <h2>10. Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time. We
        may suspend or terminate your access if you violate these Terms, fail to
        pay fees, or for any other reason at our discretion. On termination, your
        right to use the Service ceases immediately. We may delete your account
        and User Content after a reasonable retention period.
      </p>

      <h2>11. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo;
        WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
        LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
        SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
      </p>

      <h2>12. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, DOABLE WORKS LLC AND ITS
        AFFILIATES, OFFICERS, EMPLOYEES, AGENTS, AND PARTNERS WILL NOT BE LIABLE
        FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
        DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT
        OF OR RELATED TO YOUR USE OF THE SERVICE.
      </p>
      <p>
        OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATED TO THESE
        TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU
        PAID US IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE
        CLAIM, OR (B) USD $100.
      </p>

      <h2>13. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Doable Works LLC from any
        claims, damages, liabilities, and expenses (including reasonable
        attorneys&rsquo; fees) arising out of your use of the Service, your User
        Content, or your violation of these Terms.
      </p>

      <h2>14. Governing Law and Disputes</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, USA,
        without regard to conflict-of-laws principles. Any dispute arising out of
        or relating to these Terms or the Service will be resolved exclusively in
        the state or federal courts located in Delaware, and you consent to the
        personal jurisdiction of those courts.
      </p>

      <h2>15. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. We will post the updated
        Terms on this page and update the &ldquo;Last updated&rdquo; date. For
        material changes, we will provide additional notice (such as by email).
        Your continued use of the Service after the changes take effect
        constitutes your acceptance of the revised Terms.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these Terms? Contact us at{" "}
        <a href="mailto:legal@doable.me">legal@doable.me</a> or via our{" "}
        <a href="/contact">contact page</a>.
      </p>
      <p>
        <strong>Doable Works LLC</strong>
        <br />
        Email: <a href="mailto:legal@doable.me">legal@doable.me</a>
      </p>
    </>
  );
}
