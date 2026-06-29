import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Akal Ke Ghode',
  description: 'Privacy Policy for the Akal Ke Ghode game.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-10 px-4">
      <div className="w-full max-w-3xl mx-auto">
        <Link
          href="/audience/"
          className="inline-block mb-6 text-purple-300 hover:text-purple-200 text-sm"
        >
          ← Back
        </Link>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 sm:p-8 text-white/80 leading-relaxed">
          <h1 className="text-3xl font-bold text-white mb-1">Privacy Policy</h1>
          <p className="text-white/60 text-sm mb-6">
            <strong>Last Updated: 23 June, 2026</strong>
          </p>

          <p className="mb-4">
            Welcome to Akal Ke Ghode (&quot;Show&quot;, &quot;Game&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;).
          </p>
          <p className="mb-6">
            This Privacy Policy explains how we collect, use, and protect your information when
            you use our game and related services. By accessing or using the Game, you agree to
            this Privacy Policy. If you do not agree with our practices, please do not use the
            Game.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">1. Information We Collect</h2>
          <p className="mb-3">
            When you create an account or use the Game, we may collect:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>
              <strong>Account Information:</strong> Name or username, email address, profile
              information you choose to provide, and account creation/login details
            </li>
            <li>
              <strong>Device and Technical Information:</strong> Device type, operating system,
              approximate IP address, app version, device identifiers, and crash reports
            </li>
            <li>
              <strong>Gameplay Information:</strong> Scores, achievements, in-game progress,
              gameplay patterns, session duration, and user preferences
            </li>
            <li>
              <strong>Analytics Data:</strong> Information about how you interact with the Game
              (e.g., features used, time spent in different sections, performance metrics)
            </li>
            <li>
              <strong>Customer Support Communications:</strong> Any messages, feedback, or
              inquiries you send to our support team
            </li>
          </ul>
          <p className="mb-4">
            We do not collect information beyond what is necessary to operate the Game and
            provide you with an optimal experience. Information is collected automatically when
            you use the Game and may also be collected when you voluntarily provide it (e.g.,
            through account creation or support requests).
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">2. How We Use Your Information</h2>
          <p className="mb-3">We use your information to:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Create, manage, and secure your account</li>
            <li>Save game progress, preferences, and personalization settings</li>
            <li>Analyze gameplay patterns to improve Game features and user experience</li>
            <li>Provide customer support and respond to inquiries</li>
            <li>
              Detect, prevent, and address fraud, abuse, security vulnerabilities, or
              unauthorized activity
            </li>
            <li>Comply with applicable laws and legal obligations</li>
            <li>Send service-related updates or announcements (if applicable)</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">3. Data Sharing &amp; Disclosure</h2>
          <p className="mb-4">
            <strong>
              We do not share, sell, or disclose your personal information to third parties.
            </strong>{' '}
            All your data is processed and stored solely by us.
          </p>
          <p className="mb-4">
            We may disclose your information only if required by law, regulation, legal process,
            or court order, or to protect our legal rights, privacy, safety, or property.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">4. Data Security</h2>
          <p className="mb-4">
            We implement reasonable technical and organizational measures to protect your
            information from unauthorized access, misuse, loss, or disclosure. These measures
            include secure data transmission, encryption where appropriate, and restricted
            access to personal data.
          </p>
          <p className="mb-4">
            However, no online service can guarantee absolute security. We encourage you to use
            strong passwords and take reasonable precautions to protect your account.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">5. Data Retention</h2>
          <p className="mb-4">
            We retain your account information for as long as your account remains active or as
            necessary to provide our services and comply with legal obligations.
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>
              <strong>Active Accounts:</strong> Account data is retained while your account is
              active
            </li>
            <li>
              <strong>Deleted Accounts:</strong> Account data is retained for 90 days after
              account deletion, then securely removed
            </li>
            <li>
              <strong>Analytics Data:</strong> Aggregate, non-identifiable analytics data may be
              retained for up to 12 months for performance improvement purposes
            </li>
            <li>
              <strong>Support Records:</strong> Customer support communications are retained for
              2 years to address follow-up issues and resolve disputes
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">6. Children&apos;s Privacy</h2>
          <p className="mb-4">
            The Game is not intended for children under the age of 13. We do not knowingly
            collect personal information from children under 13. If we become aware that
            personal information has been collected from a child under 13 without appropriate
            consent, we will take immediate steps to delete such information and terminate the
            child&apos;s account.
          </p>
          <p className="mb-4">
            Parents or guardians who believe their child&apos;s information has been collected
            should contact us immediately at harry@playgroundcomedy.studio.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">7. Your Rights &amp; Data Requests</h2>
          <p className="mb-3">
            Subject to applicable laws, you may submit requests to:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Access your personal information</li>
            <li>Correct inaccurate information</li>
            <li>Delete your personal information</li>
            <li>Request a copy of your data in portable format</li>
          </ul>
          <p className="mb-2">
            <strong>How to Submit a Request:</strong>
          </p>
          <ol className="list-decimal pl-6 space-y-2 mb-4">
            <li>
              Email us at harry@playgroundcomedy.studio with &quot;Privacy Request&quot; in the subject
              line
            </li>
            <li>Clearly state your request (access, correction, deletion, or portability)</li>
            <li>Include your account username or email address</li>
            <li>
              We will respond within <strong>30 days</strong> of receiving your complete request
            </li>
          </ol>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">8. Cookies &amp; Tracking Technologies</h2>
          <p className="mb-3">
            The Game may use cookies, local storage, or similar technologies to:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Remember your preferences and account settings</li>
            <li>Maintain your session and login status</li>
            <li>Analyze usage patterns and improve features</li>
            <li>Detect suspicious activity or fraud</li>
          </ul>
          <p className="mb-4">
            Most devices allow you to control or disable cookies through settings. However,
            disabling cookies may affect your ability to use certain Game features.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">9. Account Deletion</h2>
          <p className="mb-4">
            You can delete your account by contacting us at harry@playgroundcomedy.studio with
            &quot;Account Deletion Request&quot; in the subject line, or through in-game settings (if
            available).
          </p>
          <p className="mb-2">
            <strong>Note:</strong> Account deletion will:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Remove your profile and personal data (after the 90-day retention period)</li>
            <li>Prevent you from accessing your game progress and achievements</li>
            <li>Be permanent and cannot be undone</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">10. Third-Party Links &amp; Services</h2>
          <p className="mb-4">
            The Game may contain links to third-party websites, applications, or services (e.g.,
            app stores, social media platforms). We are not responsible for their privacy
            practices, terms of service, or content. We encourage you to review their privacy
            policies before sharing any information.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">11. Changes to This Policy</h2>
          <p className="mb-4">
            We may update this Privacy Policy from time to time to reflect changes in our
            practices, technology, legal requirements, or other factors. Updated versions will
            be posted on this page with a revised &quot;Last Updated&quot; date. Your continued use of
            the Game after changes constitutes your acceptance of the updated Privacy Policy.
          </p>
          <p className="mb-4">
            We encourage you to review this policy periodically to stay informed about how we
            protect your information.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">12. Contact Us</h2>
          <p className="mb-4">
            For privacy-related questions, requests, concerns, or to report a privacy incident,
            please contact:
          </p>
          <p className="mb-6">
            <strong>PlayPause Studio</strong>
            <br />
            Email: harry@playgroundcomedy.studio
            <br />
            Response Time: We aim to respond to all inquiries within 30 days
          </p>

          <p className="text-white/60 text-sm italic">
            This Privacy Policy is effective as of 24th June, 2026 and was last updated on 23rd
            June, 2026.
          </p>
        </div>
      </div>
    </div>
  );
}
