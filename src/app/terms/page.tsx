import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Atlas",
  description: "Terms of Service for Atlas by InterRivus Systems",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-geist-sans)" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 100%)" }}>
        <div className="max-w-3xl mx-auto px-6 py-8 flex items-center gap-4">
          <Link href="/">
            <Image src="/atlas-logo.png" alt="Atlas" width={120} height={40} style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-gray-700 text-sm leading-relaxed">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-gray-400 text-xs">Effective date: March 23, 2026 &nbsp;·&nbsp; Last updated: March 23, 2026</p>
        </div>

        <p>
          These Terms of Service ("Terms") govern your access to and use of <strong>Atlas</strong>, the operational
          intelligence platform provided by <strong>InterRivus Systems</strong> ("we," "us," or "our") at{" "}
          <a href="https://atlas.interrivus.com" className="text-emerald-700 hover:underline">atlas.interrivus.com</a>{" "}
          ("the Service"). By accessing or using the Service, you agree to be bound by these Terms.
        </p>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">1. Access & Accounts</h2>
          <p>
            Access to Atlas is by invitation only. Your organization's administrator is responsible for provisioning
            and managing user accounts. You are responsible for maintaining the confidentiality of your account
            credentials and for all activity that occurs under your account.
          </p>
          <p>
            You must not share your account with others or allow unauthorized access to the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">2. Acceptable Use</h2>
          <p>You agree to use the Service only for lawful business purposes. You must not:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Use the Service to violate any applicable law or regulation</li>
            <li>Attempt to gain unauthorized access to any part of the Service or its infrastructure</li>
            <li>Interfere with or disrupt the integrity or performance of the Service</li>
            <li>Reverse engineer, decompile, or attempt to extract the source code of the Service</li>
            <li>Use the Service to transmit harmful, offensive, or fraudulent content</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">3. Your Data</h2>
          <p>
            You retain ownership of all data and content you enter into the Service ("Your Data"). By using the Service,
            you grant InterRivus Systems a limited license to store, process, and display Your Data solely as necessary
            to provide the Service.
          </p>
          <p>
            We do not sell Your Data to third parties. See our{" "}
            <Link href="/privacy" className="text-emerald-700 hover:underline">Privacy Policy</Link> for full details
            on how we handle your information.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">4. Intellectual Property</h2>
          <p>
            The Service, including its design, features, and underlying technology, is owned by InterRivus Systems and
            protected by applicable intellectual property laws. Nothing in these Terms transfers any ownership of the
            Service to you.
          </p>
          <p>
            You may not copy, reproduce, distribute, or create derivative works from the Service without our express
            written permission.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">5. Service Availability</h2>
          <p>
            We strive to provide a reliable service but do not guarantee uninterrupted or error-free access. We may
            perform maintenance, updates, or modifications to the Service at any time, with or without prior notice.
          </p>
          <p>
            We reserve the right to suspend or terminate access to the Service for any user or organization that
            violates these Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">6. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind, either express or
            implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or
            non-infringement. We do not warrant that the Service will meet your specific requirements or that any
            errors will be corrected.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, InterRivus Systems shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages arising out of or related to your use of the
            Service, even if advised of the possibility of such damages.
          </p>
          <p>
            Our total liability for any claim arising from your use of the Service shall not exceed the amount you
            paid us in the twelve months preceding the claim, or $100, whichever is greater.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">8. Termination</h2>
          <p>
            Either party may terminate access to the Service at any time. Upon termination, your right to access the
            Service ceases immediately. You may request export or deletion of Your Data by contacting us within 30 days
            of termination.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes by updating the
            "Last updated" date above. Continued use of the Service after changes constitutes your acceptance of the
            revised Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">10. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the State of Michigan,
            without regard to its conflict of law provisions.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">11. Contact</h2>
          <div className="bg-gray-50 rounded-xl px-5 py-4 space-y-1">
            <div className="font-semibold text-gray-900">InterRivus Systems</div>
            <div>
              Email:{" "}
              <a href="mailto:matthew@garpielgroup.com" className="text-emerald-700 hover:underline">
                matthew@garpielgroup.com
              </a>
            </div>
            <div>
              Website:{" "}
              <a href="https://interrivus.com" className="text-emerald-700 hover:underline" target="_blank" rel="noopener noreferrer">
                interrivus.com
              </a>
            </div>
          </div>
        </section>

        <div className="pt-8 border-t border-gray-100 text-xs text-gray-400 text-center">
          © {new Date().getFullYear()} InterRivus Systems. All rights reserved.
        </div>
      </div>
    </div>
  );
}
