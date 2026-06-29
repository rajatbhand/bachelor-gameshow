import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms & Conditions — Akal Ke Ghode',
  description: 'Terms and Conditions for the Akal Ke Ghode game.',
};

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-white mb-1">Terms and Conditions</h1>
          <p className="text-white/60 text-sm mb-6">
            <strong>Last Updated: June 24, 2026</strong>
          </p>

          <p className="mb-4">
            Welcome to Akal Ke Ghode (&quot;Show&quot;, &quot;Game&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;).
          </p>
          <p className="mb-6">
            By creating an account, accessing, or using the Game, you agree to be bound by
            these Terms and Conditions. If you do not agree with any part of these Terms, you
            may not use the Game.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">1. Eligibility</h2>
          <p className="mb-4">
            You must be at least 13 years old, or the minimum age required in your
            jurisdiction, to create an account and use the Game. By using the Game, you
            represent and warrant that you meet this age requirement. If you are under 13, you
            may not use the Game.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">2. User Accounts</h2>
          <p className="mb-2">
            <strong>Account Responsibility:</strong>
          </p>
          <p className="mb-4">
            You are responsible for maintaining the confidentiality of your account
            credentials (username, password, email address, and any authentication details).
          </p>
          <p className="mb-2">
            <strong>Accurate Information:</strong>
          </p>
          <p className="mb-4">
            You agree to provide accurate, complete, and truthful information during account
            creation and to keep your account information updated. You are solely responsible
            for any activity that occurs under your account.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">3. Acceptable Use</h2>
          <p className="mb-3">You agree not to:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>
              <strong>Cheat or Exploit:</strong> Use cheats, hacks, exploits, or bugs to gain
              unauthorized gameplay advantages
            </li>
            <li>
              <strong>Unauthorized Software:</strong> Use bots, scripts, macros, or any
              unauthorized third-party software that interferes with or modifies the Game
            </li>
            <li>
              <strong>Harassment or Abuse:</strong> Harass, threaten, bully, defame, or abuse
              other users, including through in-game chat or external platforms
            </li>
            <li>
              <strong>Unauthorized Access:</strong> Attempt to gain unauthorized access to the
              Game&apos;s systems, accounts, or infrastructure
            </li>
            <li>
              <strong>Illegal Activity:</strong> Violate any applicable laws, regulations, or
              third-party rights
            </li>
            <li>
              <strong>Account Trading:</strong> Buy, sell, trade, or transfer accounts or
              in-game assets (if applicable)
            </li>
            <li>
              <strong>Spam or Manipulation:</strong> Spam, flood, or manipulate in-game systems
              or communications
            </li>
          </ul>
          <p className="mb-4">
            Violation of these rules may result in immediate account suspension or termination.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">4. Intellectual Property</h2>
          <p className="mb-2">
            <strong>Ownership:</strong>
          </p>
          <p className="mb-4">
            All game content, including but not limited to artwork, graphics, logos, designs,
            animations, text, audio, sound effects, music, software code, gameplay mechanics,
            and user interface elements, is owned by or licensed to us and is protected by
            applicable intellectual property laws, including copyright, trademark, and patent
            laws.
          </p>
          <p className="mb-2">
            <strong>Restricted Use:</strong>
          </p>
          <p className="mb-4">
            You may not reproduce, distribute, modify, adapt, translate, decompile, reverse
            engineer, or commercially exploit any part of the Game without our prior written
            consent. You are granted a limited, non-exclusive, non-transferable license to
            access and play the Game for your personal, non-commercial use only.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">5. Suspension and Termination</h2>
          <p className="mb-3">
            We reserve the right to suspend or terminate your account if you:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Violate these Terms and Conditions</li>
            <li>Engage in conduct that harms the Game, its community, or our services</li>
            <li>Use unauthorized software or exploits</li>
            <li>Violate applicable laws</li>
            <li>Demonstrate abusive behavior toward other users</li>
          </ul>
          <p className="mb-2">
            <strong>Suspension vs. Termination:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>
              <strong>Suspension:</strong> Temporary restriction from accessing your account
              (typically 24 hours to 30 days)
            </li>
            <li>
              <strong>Termination:</strong> Permanent closure of your account and deletion of
              associated data
            </li>
          </ul>
          <p className="mb-4">
            We will make reasonable efforts to notify you of violations and provide an
            opportunity to correct them, except in cases of severe abuse or repeated
            violations. Termination decisions are final.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">6. Disclaimer of Warranties</h2>
          <p className="mb-2">
            <strong>&quot;As Is&quot; Basis:</strong>
          </p>
          <p className="mb-4">
            The Game is provided on an &quot;as is&quot; and &quot;as available&quot; basis without any
            warranties, express or implied.
          </p>
          <p className="mb-3">We do not guarantee:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Uninterrupted or error-free operation of the Game</li>
            <li>Availability or accessibility at all times</li>
            <li>That all bugs or errors will be fixed</li>
            <li>Specific gameplay outcomes, achievements, or rewards</li>
            <li>Compatibility with all devices or operating systems</li>
            <li>That your game data or progress will be preserved indefinitely</li>
          </ul>
          <p className="mb-2">
            <strong>Game Updates:</strong>
          </p>
          <p className="mb-4">
            We reserve the right to update, patch, modify, or discontinue the Game or any
            features at any time without prior notice. Updates may affect gameplay, balance, or
            your existing progress.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">7. Limitation of Liability</h2>
          <p className="mb-3">
            <strong>To the maximum extent permitted by applicable law</strong>, we shall not be
            liable for:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Any indirect, incidental, special, consequential, or punitive damages</li>
            <li>Loss of data, loss of profits, loss of revenue, or business interruption</li>
            <li>Loss of gameplay progress, achievements, or in-game rewards</li>
            <li>Any damage to your device or software caused by the Game</li>
            <li>Downtime, service interruptions, or data loss</li>
          </ul>
          <p className="mb-4">
            This limitation applies even if we have been advised of the possibility of such
            damages. Some jurisdictions do not allow the exclusion of certain warranties or
            limitation of liability, so some of these limitations may not apply to you.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">8. Indemnification</h2>
          <p className="mb-3">
            You agree to indemnify, defend, and hold harmless us, our affiliates, officers,
            directors, employees, and agents from any claims, damages, losses, liabilities, and
            expenses (including legal fees) arising from:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Your use of the Game</li>
            <li>Your violation of these Terms and Conditions</li>
            <li>Your violation of applicable laws</li>
            <li>Your infringement of third-party rights</li>
            <li>Your harassment, abuse, or harm to other users</li>
          </ul>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">9. Third-Party Links and Services</h2>
          <p className="mb-4">
            The Game may contain links to third-party websites, applications, or services. We
            are not responsible for the content, accuracy, privacy practices, or services of
            these third-party platforms. Your use of third-party services is subject to their
            terms and conditions, not ours.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">10. Modifications to Terms</h2>
          <p className="mb-4">
            We reserve the right to modify these Terms and Conditions at any time. If we make
            material changes, we will notify you by posting the updated Terms in the Game or via
            email. Your continued use of the Game after changes become effective constitutes
            your acceptance of the revised Terms.
          </p>
          <p className="mb-4">
            We encourage you to review these Terms periodically to stay informed of any updates.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">11. Privacy Policy</h2>
          <p className="mb-4">
            Your use of the Game is also governed by our <strong>Privacy Policy</strong>, which
            explains how we collect, use, and protect your information. Please review our{' '}
            <Link href="/privacy/" className="text-purple-300 underline hover:text-purple-200">
              Privacy Policy
            </Link>{' '}
            in conjunction with these Terms.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">12. Governing Law &amp; Jurisdiction</h2>
          <p className="mb-2">
            <strong>Governing Law:</strong>
          </p>
          <p className="mb-4">
            These Terms and Conditions shall be governed by and interpreted in accordance with
            the laws of India, without regard to its conflict of law principles.
          </p>
          <p className="mb-2">
            <strong>Dispute Resolution:</strong>
          </p>
          <p className="mb-4">
            Any disputes, claims, or legal proceedings arising out of or relating to these
            Terms, the Game, or your use thereof shall be subject to the exclusive jurisdiction
            of the competent courts in Delhi, India. You agree to submit to the personal
            jurisdiction of these courts and waive any objections to jurisdiction or venue.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">13. Severability</h2>
          <p className="mb-4">
            If any provision of these Terms is found to be invalid, illegal, or unenforceable
            by a court of competent jurisdiction, that provision shall be severed, and the
            remaining provisions shall continue in full force and effect.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">14. Entire Agreement</h2>
          <p className="mb-4">
            These Terms and Conditions, together with our Privacy Policy, constitute the entire
            agreement between you and us regarding your use of the Game and supersede all prior
            and contemporaneous agreements, understandings, and negotiations.
          </p>

          <h2 className="text-xl font-semibold text-white mt-8 mb-3">15. Contact Us</h2>
          <p className="mb-4">
            For questions, concerns, or disputes regarding these Terms and Conditions, please
            contact:
          </p>
          <p className="mb-6">
            <strong>Play Pause Studios</strong>
            <br />
            Email: harry@playgroundcomedy.studio
            <br />
            Response Time: We aim to respond to all inquiries within 30 days
          </p>

          <p className="text-white/60 text-sm italic">
            These Terms and Conditions are effective as of June 24, 2026.
          </p>
        </div>
      </div>
    </div>
  );
}
