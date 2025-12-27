import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete Account – Kid to Story",
  description:
    "How to request deletion of your Kid to Story account and associated data.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function DeleteAccountPage() {
  return (
    <main className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-2">
        Delete your Kid to Story account
      </h1>
      <p className="text-sm text-gray-700 mb-6">
        This page applies to the Kid to Story app by Arnie.Hsieh (package:
        com.arnie.kidtostory).
      </p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          Option 1: Delete inside the app (recommended)
        </h2>
        <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
          <li>Open Kid to Story.</li>
          <li>Go to the Account tab.</li>
          <li>Select “Delete account”.</li>
          <li>Confirm deletion.</li>
        </ol>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">
          Option 2: Request deletion by email
        </h2>
        <p className="text-sm text-gray-700">
          If you can’t access the app, email{" "}
          <a className="underline" href="mailto:arnie@back2.dev">
            arnie@back2.dev
          </a>{" "}
          from the email address associated with your account and include the
          subject “Delete my Kid to Story account”.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">What will be deleted</h2>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>Your user profile (account record).</li>
          <li>Uploaded photos used to create books.</li>
          <li>Generated books, pages, images, thumbnails, and PDFs.</li>
          <li>Background job records and device attestation records.</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">What may be retained</h2>
        <p className="text-sm text-gray-700">
          We may retain limited records required for legal, tax, accounting, or
          security purposes. When retained, these records are detached from your
          account and stored in an anonymized form (for example, transaction
          records needed for accounting, and support ticket history).
        </p>
      </section>
    </main>
  );
}
