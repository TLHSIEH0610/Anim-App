import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50 via-violet-50 to-white">
      {/* Top nav */}
      {/* <header className="mx-auto max-w-6xl px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-600 text-white text-lg font-bold shadow-sm">
            K
          </span>
          <div className="flex flex-col">
            <span className="text-base font-semibold tracking-tight text-gray-900">
              Kid to Story
            </span>
            <span className="text-xs text-gray-500">
              Turn your kid into the hero
            </span>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-700">
          <Link href="/books" className="hover:text-purple-700">
            Story templates
          </Link>
          <Link href="/purchased" className="hover:text-purple-700">
            My books
          </Link>
          <Link href="/support" className="hover:text-purple-700">
            Help &amp; support
          </Link>
          <Link href="/login" className="btn ml-2">
            Continue with Google
          </Link>
        </nav>
        <div className="md:hidden">
          <Link href="/login" className="btn text-sm px-3 py-1.5">
            Sign in
          </Link>
        </div>
      </header> */}

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
        {/* Hero */}
        <section className="grid gap-10  md:items-center">
          <div>
            {/* <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm ring-1 ring-purple-100">
              ✨ New · Personalized children’s storybooks in minutes
            </p> */}
            <h1 className="mt-4 text-4xl md:text-5xl font-extrabold leading-tight text-gray-900">
              Turn Your Child Into the Hero
              <span className="block text-purple-600">of Their Own Story</span>
            </h1>
            <p className="mt-4 text-base md:text-lg text-gray-600 max-w-xl">
              Upload a photo, pick a magical adventure, and get a personalized
              storybook that looks like your child — ready to read, share, and
              print.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {/* <Link href="/login" className="btn">
                Continue with Google
              </Link> */}
              <Link
                href="/books"
                className="btn"
                // style={{
                //   background: "transparent",
                //   color: "inherit",
                //   borderColor: "hsl(var(--border))",
                // }}
              >
                Browse story templates
              </Link>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              By continuing you agree to our{" "}
              <Link className="underline" href="/legal/terms">
                Terms
              </Link>{" "}
              and{" "}
              <Link className="underline" href="/legal/privacy">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              <div className="flex-1 rounded-2xl overflow-hidden bg-purple-50 border border-purple-100 shadow-card">
                <img
                  src="/landing/banner_1.png"
                  alt="Phone preview showing a child avatar turning into a storybook character"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 rounded-2xl overflow-hidden bg-purple-50 border border-purple-100 shadow-card">
                <img
                  src="/landing/banner_2.png"
                  alt="Open glowing storybook with a child hero jumping out"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-16">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">
            How it works
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Three simple steps from photo to magical storybook.
          </p>
          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-stretch md:justify-between">
            {/* Card 1: Select Your Story */}
            <div className="card flex flex-col items-center text-center gap-3 md:flex-1">
              <h3 className="mt-1 text-sm font-semibold text-purple-900">
                Select Your Story
              </h3>
              <p className="text-xs text-gray-600 max-w-xs">
                Pick from fantasy castles, space missions, and forest
                adventures. Each template is written just for kids.
              </p>
              <div className="mt-4 flex items-center justify-center">
                <img
                  src="/how_it_work_1.png"
                  alt="Illustration of choosing a children’s story template"
                  className="h-36 w-36 object-contain rounded-2xl shadow-sm"
                />
              </div>
            </div>

            {/* Arrow between 1 and 2 */}
            <div className="hidden md:flex items-center justify-center px-1 md:flex-none">
              <span className="text-3xl text-purple-300">→</span>
            </div>

            {/* Card 2: Upload a Photo */}
            <div className="card flex flex-col items-center text-center gap-3 md:flex-1">
              <h3 className="mt-1 text-sm font-semibold text-purple-900">
                Upload a Photo
              </h3>
              <p className="text-xs text-gray-600 max-w-xs">
                Add a clear photo of your child. We turn it into a matching
                illustrated character inside the story.
              </p>
              <div className="mt-4 flex items-center justify-center">
                <img
                  src="/how_it_work_2.png"
                  alt="Illustration of uploading a child photo to personalize the story"
                  className="h-36 w-36 object-contain rounded-2xl shadow-sm"
                />
              </div>
            </div>

            {/* Arrow between 2 and 3 */}
            <div className="hidden md:flex items-center justify-center px-1 md:flex-none">
              <span className="text-3xl text-purple-300">→</span>
            </div>

            {/* Card 3: Get Your Customized Book */}
            <div className="card flex flex-col items-center text-center gap-3 md:flex-1">
              <h3 className="mt-1 text-sm font-semibold text-purple-900">
                Get Your Customized Book!
              </h3>
              <p className="text-xs text-gray-600 max-w-xs">
                In just a few minutes, your personalized PDF storybook is ready
                to download, share, or print for bedtime.
              </p>
              <div className="mt-4 flex items-center justify-center">
                <img
                  src="/how_it_work_3.png"
                  alt="Illustration of downloading the finished personalized storybook PDF"
                  className="h-36 w-36 object-contain rounded-2xl shadow-sm"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
