import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DMCA & Copyright Policy | Doable",
  description: "How to report copyright infringement on Doable.",
};

export default function DMCAPage() {
  return (
    <>
      <h1>DMCA &amp; Copyright Policy</h1>
      <p className="text-sm text-gray-500">
        <strong>Last updated:</strong> April 27, 2026
      </p>

      <p>
        <strong>Doable Works LLC</strong> respects the intellectual property
        rights of others and expects users of the Service to do the same. We
        respond to clear notices of alleged copyright infringement that comply
        with the U.S. Digital Millennium Copyright Act (&ldquo;DMCA&rdquo;).
      </p>

      <h2>Filing a DMCA notice</h2>
      <p>
        If you believe content hosted on the Service infringes your copyright,
        send a written notice to our designated agent that includes all of the
        following:
      </p>
      <ol>
        <li>
          A physical or electronic signature of the copyright owner or a person
          authorized to act on their behalf
        </li>
        <li>
          Identification of the copyrighted work claimed to be infringed
        </li>
        <li>
          Identification of the material that is claimed to be infringing,
          including a URL or other location where it appears on the Service
        </li>
        <li>
          Your contact information (name, address, phone number, email)
        </li>
        <li>
          A statement that you have a good-faith belief that the use is not
          authorized by the copyright owner, its agent, or the law
        </li>
        <li>
          A statement, under penalty of perjury, that the information in the
          notice is accurate and that you are the copyright owner or authorized
          to act on the owner&rsquo;s behalf
        </li>
      </ol>

      <h2>Designated DMCA agent</h2>
      <p>
        Send DMCA notices to:
        <br />
        <strong>Doable Works LLC &mdash; DMCA Agent</strong>
        <br />
        Email: <a href="mailto:dmca@doable.me">dmca@doable.me</a>
      </p>

      <h2>Counter-notice</h2>
      <p>
        If your content was removed and you believe the removal was a mistake or
        misidentification, you may file a counter-notice that includes:
      </p>
      <ol>
        <li>Your physical or electronic signature</li>
        <li>
          Identification of the material that has been removed and its prior
          location
        </li>
        <li>
          A statement, under penalty of perjury, that you have a good-faith
          belief the material was removed as a result of mistake or
          misidentification
        </li>
        <li>
          Your name, address, phone number, and a statement consenting to the
          jurisdiction of the federal court for your district (or the District
          of Delaware if outside the U.S.) and that you will accept service of
          process from the complaining party
        </li>
      </ol>

      <h2>Repeat infringers</h2>
      <p>
        We will, in appropriate circumstances and at our discretion, terminate
        the accounts of users who are repeat infringers.
      </p>

      <h2>Misrepresentations</h2>
      <p>
        Knowingly misrepresenting in a DMCA notice that material is infringing,
        or in a counter-notice that material was removed by mistake, may result
        in liability for damages under 17 U.S.C. &sect; 512(f).
      </p>
    </>
  );
}
