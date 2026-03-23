import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Atlas",
  description: "Privacy Policy for Atlas by InterRivus Systems",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-geist-sans)" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0d2616 0%, #123b1f 100%)" }}>
        <div className="max-w-3xl mx-auto px-6 py-8 flex items-center gap-4">
          <Link href="/">
            <Image src="/atlas-logo-transparent.png" alt="Atlas" width={120} height={40} style={{ objectFit: "contain" }} />
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-gray-700 text-sm leading-relaxed">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-400 text-xs">Effective date: March 23, 2026 &nbsp;·&nbsp; Last updated: March 23, 2026</p>
        </div>

        <p>
          This Privacy Policy describes how <strong>InterRivus Systems</strong> ("InterRivus," "we," "us," or "our")
          collects, uses, and protects information in connection with <strong>Atlas</strong>
          — our operational intelligence platform available at{" "}
          <a href="https://atlas.interrivus.com" className="text-emerald-700 hover:underline">atlas.interrivus.com</a>{" "}
          ("the Service").
        </p>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">1. Information We Collect</h2>
          <p>
            When you sign in to Atlas using your Google account, we receive the following information from Google:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Your name</li>
            <li>Your email address</li>
            <li>Your Google profile picture (if available)</li>
            <li>A unique Google account identifier</li>
          </ul>
          <p>
            We do not collect passwords. Authentication is handled entirely by Google's secure OAuth 2.0 service.
          </p>
          <p>
            Within the Service, we also collect business operational data you enter — such as bids, tasks, labor
            records, materials, and other information related to your organization's use of Atlas.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Verify your identity and grant access to the Service</li>
            <li>Display your name within the platform</li>
            <li>Associate your activity with your account</li>
            <li>Provide, maintain, and improve the Service</li>
            <li>Communicate with you about your account or the Service</li>
          </ul>
          <p>
            We do not use your Google account data for advertising purposes, and we do not sell your personal information.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">3. How We Share Your Information</h2>
          <p>We do not sell, rent, or share your personal information with third parties except in the following limited circumstances:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>
              <strong>Service providers:</strong> We use Supabase (database and authentication infrastructure) to store and
              process your data. These providers are bound by contractual obligations to protect your information.
            </li>
            <li>
              <strong>Legal requirements:</strong> We may disclose information if required to do so by law or in response
              to valid legal process.
            </li>
            <li>
              <strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets, your
              information may be transferred as part of that transaction.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">4. Data Retention</h2>
          <p>
            We retain your account information for as long as your account is active or as needed to provide the Service.
            You may request deletion of your account and associated data at any time by contacting us at the email below.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">5. Security</h2>
          <p>
            We take reasonable technical and organizational measures to protect your information against unauthorized
            access, loss, or misuse. Data is stored using Supabase, which employs industry-standard security practices
            including encryption at rest and in transit.
          </p>
          <p>
            Access to Atlas is restricted to authorized users only. Accounts are provisioned by administrators and
            protected by Google's authentication system.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your account and personal data</li>
            <li>Revoke Google OAuth access at any time via your Google Account settings</li>
          </ul>
          <p>To exercise any of these rights, contact us at the email address below.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">7. Children's Privacy</h2>
          <p>
            Atlas is not intended for use by individuals under the age of 18. We do not knowingly collect personal
            information from children.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date at
            the top of this page. Continued use of the Service after changes constitutes acceptance of the revised policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">9. Contact Us</h2>
          <p>If you have questions or concerns about this Privacy Policy, please contact us:</p>
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
