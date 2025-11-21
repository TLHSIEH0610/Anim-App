import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – Kid to Story",
  description:
    "Read the Kid to Story Terms of Service covering eligibility, accounts, payments, generated content, and your responsibilities when creating personalized children’s books.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-2">
        Kid to Story Terms of Service
      </h1>
      <p className="text-xs text-gray-500 mb-6">
        Effective date: November 10, 2025
      </p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          1. Agreement to These Terms
        </h2>
        <p className="text-sm text-gray-700">
          These Terms of Service (&quot;Terms&quot;) govern your access to and
          use of the Kid to Story mobile application, website, and related
          services (collectively, the &quot;Services&quot;). By creating an
          account, purchasing credits, or otherwise using the Services you agree
          to be bound by these Terms and our Privacy Policy. If you do not
          agree, do not use the Services.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">2. Eligibility</h2>
        <p className="text-sm text-gray-700">
          The Services are intended for parents, guardians, and educators who
          are at least 18 years old or the age of majority in their
          jurisdiction. By using Kid to Story, you represent that you meet these
          requirements and that you will obtain any permissions needed to submit
          personal information about children.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          3. Accounts and Security
        </h2>
        <p className="text-sm text-gray-700">
          You are responsible for maintaining the confidentiality of your login
          credentials and for all activities that occur under your account.
          Notify us immediately at{" "}
          <span className="underline">arnie@back2.dev</span> if you suspect
          unauthorized access. We reserve the right to suspend or terminate
          accounts that violate these Terms or pose a security risk.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          4. Purchases, Credits, and Free Trials
        </h2>
        <p className="text-sm text-gray-700">
          Kid to Story offers per-book purchases, credit redemptions, and
          limited free-trial promotions. Prices and eligibility are shown in the
          app before checkout. Payments are processed by Stripe or other
          authorized processors; you agree to their terms and authorize us to
          share necessary billing information. Because our stories and images
          are generated on demand and delivered immediately, all completed
          generations are final and non-refundable, except where a refund is
          required by applicable law. If you are dissatisfied with a specific
          generated result, you may contact us and we may, at our discretion,
          attempt to re-generate it as a courtesy, but this is not a guarantee
          of a refund or additional free content.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          5. License to the Services
        </h2>
        <p className="text-sm text-gray-700">
          We grant you a limited, non-exclusive, non-transferable, revocable
          license to use the Services for personal, non-commercial storytelling
          and educational purposes. You must not copy, distribute, modify, host,
          reverse engineer, or create derivative works from the Services except
          as permitted by law or with our prior written consent.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">6. Your Content</h2>
        <p className="text-sm text-gray-700">
          You retain ownership of photos, text, and other materials you submit
          (&quot;User Content&quot;). You grant Kid to Story a worldwide,
          royalty-free license to host, process, adapt, reproduce, and display
          User Content solely to operate the Services, fulfill book generation
          requests, and support your account. You represent that you have the
          rights to upload User Content and that it does not infringe the rights
          of any third party. You are responsible for obtaining appropriate
          consent from any individual depicted in your uploads.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">7. Generated Output</h2>
        <p className="text-sm text-gray-700">
          Books, illustrations, and PDFs generated by the Services (&quot;Output&quot;)
          are provided for your personal use. You may download, share with
          family and students, and print Output for non-commercial use. You
          must not resell or commercially exploit Output without our prior
          written consent or a separate license agreement.
        </p>
      </section>

      {/* For brevity, only key sections are surfaced here; the full mobile copy can be mirrored if needed */}

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          8. Changes to These Terms
        </h2>
        <p className="text-sm text-gray-700">
          We may update these Terms from time to time. We will notify you by
          posting the revised Terms in the app and updating the effective date.
          Continued use of the Services after changes become effective
          constitutes your acceptance of the revised Terms.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">9. Contact Us</h2>
        <p className="text-sm text-gray-700">
          Questions about these Terms can be directed to{" "}
          <span className="underline">arnie@back2.dev</span>.
        </p>
      </section>
    </main>
  );
}

