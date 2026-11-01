import Link from "next/link";
import Feed from "@/components/Feed";

const steps = [
  {
    title: "Tutors publish lessons",
    body: "A tutor records a lesson, writes a description and links the video. It stays a draft until they say otherwise.",
  },
  {
    title: "Students watch and respond",
    body: "Published lessons appear in the library. Anyone signed in can like a lesson, save it for later and join the discussion.",
  },
  {
    title: "The library stays live",
    body: "Every lesson, like and comment is stored in Convex, so a new upload shows up in everyone's feed without a refresh.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-rule">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
          <p className="eyebrow">The NorthEd library</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Lessons from people who teach,
            <span className="italic text-forest-deep"> taught properly.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            A quiet, well-made home for recorded lessons. Tutors publish what
            they know; students take what they need and talk about it in the
            comments.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#library" className="button-primary">
              Browse the library
            </a>
            <Link href="/sign-in" className="button-secondary">
              Create an account
            </Link>
          </div>
        </div>
      </section>

      <section
        id="library"
        aria-labelledby="library-heading"
        className="mx-auto w-full max-w-6xl px-5 py-14"
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-rule-strong pb-4">
          <h2
            id="library-heading"
            className="font-display text-3xl font-semibold tracking-tight"
          >
            All lessons
          </h2>
          <p className="max-w-sm text-sm text-ink-faint">
            Only published lessons appear here. Drafts and archived lessons stay
            with their author.
          </p>
        </div>

        <Feed />
      </section>

      <section
        aria-labelledby="how-heading"
        className="border-t border-rule bg-paper-deep/60"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-16">
          <h2
            id="how-heading"
            className="font-display text-3xl font-semibold tracking-tight"
          >
            How NorthEd works
          </h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="border-t-2 border-forest pt-4">
                <span className="font-display text-sm italic text-sienna">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-display text-xl font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
