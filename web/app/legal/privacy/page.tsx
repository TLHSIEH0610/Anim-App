import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – Kid to Story",
  description:
    "Read the Kid to Story Privacy Policy to understand how we collect, use, and protect personal data when creating personalized children’s books and cartoons.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-2">
        Kid to Story Privacy Policy
      </h1>
      <p className="text-xs text-gray-500 mb-6">
        Effective date: November 10, 2025
      </p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">1. Overview</h2>
        <p className="text-sm text-gray-700">
          Kid to Story helps caregivers turn family photos and prompts into
          personalized children&apos;s books. We respect the sensitivity of the
          information you share and are committed to handling it responsibly.
          This Privacy Policy explains the data we collect, how we use it, and
          the choices available to you when you use our mobile application,
          website, and related services (together, the &quot;Services&quot;).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          2. Information We Collect
        </h2>
        <p className="text-sm text-gray-700">
          We collect information that you provide directly, data that is
          generated while you use the Services, and limited information from
          third parties, including:
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>
            <strong>Account details:</strong> email address and basic profile
            information provided via Google Sign-In (such as name and profile
            photo, depending on your Google settings).
          </li>
          <li>
            <strong>Book inputs:</strong> names, pronouns, story preferences,
            captions, and uploaded reference images for the child featured in a
            book or childbook.
          </li>
          <li>
            <strong>Transaction data:</strong> purchase history, credit usage,
            payment status, and Stripe payment intent identifiers. Stripe
            processes card numbers and other sensitive card data on our behalf;
            we never store full card numbers.
          </li>
          <li>
            <strong>Usage data:</strong> device information (model, operating
            system, app version/build, and unique app identifiers such as a
            randomly generated install ID), crash logs, IP address, time zone,
            and in-app interactions needed to run the Services, send
            service-related communications (such as important security updates),
            troubleshoot issues, and protect against abuse.
          </li>
          <li>
            <strong>Support communications:</strong> messages you send to our
            team and related metadata.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          3. How We Use Information
        </h2>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>
            Provide, personalize, and maintain the Services, including
            generating child books and delivering media.
          </li>
          <li>
            Authenticate users and secure accounts, prevent fraud, and enforce
            our Terms of Service.
          </li>
          <li>
            Process payments, issue invoices or receipts, and manage credits or
            free trials.
          </li>
          <li>
            Improve product performance, develop new features, and troubleshoot
            operational issues.
          </li>
          <li>
            Communicate with you about updates, support, and important changes
            to the Services.
          </li>
          <li>
            Comply with legal obligations and respond to lawful requests or
            court orders.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          4. How We Share Information
        </h2>
        <p className="text-sm text-gray-700">
          We do not sell or rent personal information. We share information only
          as needed to run Kid to Story or when you direct us to do so, for
          example with:
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>
            <strong>Service providers:</strong> hosting, cloud storage,
            analytics, content delivery, and customer support partners who
            process data under our instructions.
          </li>
          <li>
            <strong>Payment processors:</strong> Stripe securely processes card
            payments and may collect personal data required to complete
            transactions.
          </li>
          <li>
            <strong>Image generation infrastructure:</strong> ComfyUI workloads
            receive the prompts and images you submit to render illustrations.
            Generated assets are stored in our managed storage to deliver books
            back to you.
          </li>
          <li>
            <strong>Legal and safety:</strong> we may disclose information if
            required by law, subpoena, or when we believe disclosure is
            necessary to protect the rights, property, or safety of Kid to
            Story, our users, or others.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">5. Data Retention</h2>
        <p className="text-sm text-gray-700">
          We retain personal information for as long as your account is active
          or as needed to provide the Services. Generated books, images, and
          related files are stored for your convenience; unless otherwise
          stated, we keep generated content and backups for up to 60 days, after
          which it may be deleted or archived. You can delete content at any
          time from within the app or by contacting us. We may retain certain
          records after account closure to comply with legal, tax, or accounting
          requirements.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          6. Your Rights and Choices
        </h2>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>
            Access, correct, or delete account information by contacting us or
            using in-app controls.
          </li>
          <li>
            Download book media or request that we delete stored uploads and
            generated assets.
          </li>
          <li>
            <strong>Delete your account:</strong> you can request deletion of
            your account and associated data by following the steps at{" "}
            <a className="underline" href="/legal/delete-account">
              /legal/delete-account
            </a>
            .
          </li>
          <li>
            Opt out of promotional emails by using unsubscribe links or
            contacting support.
          </li>
          <li>
            Residents of certain jurisdictions (including the EEA, UK, and
            California) may have additional rights such as data portability,
            restriction, or objection. We honor those requests in accordance
            with applicable law.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">7. Security</h2>
        <p className="text-sm text-gray-700">
          We implement administrative, technical, and physical safeguards
          designed to protect personal information, including encrypted
          transport, scoped employee access, and regular monitoring of our
          infrastructure. No online service can guarantee complete security, so
          please use unique passwords and notify us immediately if you suspect
          unauthorized access to your account.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          8. Children&apos;s Privacy
        </h2>
        <p className="text-sm text-gray-700">
          Kid to Story is intended for caregivers. We do not knowingly collect
          personal information from children under 13 without appropriate
          consent from a parent or guardian. If you believe a child has provided
          us personal information, please contact us and we will take steps to
          delete it.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          9. International Data Transfers
        </h2>
        <p className="text-sm text-gray-700">
          Kid to Story operates globally, and your information may be
          transferred to, stored, and processed in countries where we or our
          trusted service providers maintain operations. We take reasonable
          steps to ensure that such transfers comply with applicable data
          protection laws and that appropriate safeguards are in place to
          protect your personal information.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          10. Changes to This Policy
        </h2>
        <p className="text-sm text-gray-700">
          We may update this Privacy Policy to reflect changes in our practices
          or legal obligations. If we make material changes, we will provide
          notice in the app or by email before the changes take effect.
          Continued use of the Services after the effective date means you
          accept the revised policy.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">11. Contact Us</h2>
        <p className="text-sm text-gray-700">
          If you have any questions or requests regarding this Privacy Policy,
          please reach out to us at{" "}
          <span className="underline">arnie@back2.dev</span>.
        </p>
      </section>
    </main>
  );
}
