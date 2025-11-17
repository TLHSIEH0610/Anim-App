import type { Metadata } from "next";
import GoogleSignIn from "@/components/GoogleSignIn";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Login – Kid to Story",
  description:
    "Sign in with Google to create, save, and share personalized children’s storybooks with Kid to Story.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl md:text-3xl font-extrabold leading-snug text-gray-900">
          Sign in to start{" "}
          <span className="text-purple-600">your child&apos;s next story</span>
        </h1>
        <p className="mt-3 text-sm md:text-base text-gray-600">
          Use your Google account to create, save, and share magical storybooks
          that star your child as the hero.
        </p>
        <div className="card mt-8 p-8">
          <p className="text-xs text-gray-600">
            We&apos;ll use your Google account to create or connect your Kid to
            Story profile.
          </p>
          <div className="mt-5">
            <GoogleSignIn />
          </div>
          <p className="mt-5 text-[11px] leading-relaxed text-gray-500">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
