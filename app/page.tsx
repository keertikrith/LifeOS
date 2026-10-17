import Link from "next/link";

const FEATURES = [
  { title: "Say what you ate", body: "“2 dose and filter coffee”, “ಬೆಳಿಗ್ಗೆ 3 ಇಡ್ಲಿ”, “lunch mein 2 roti dal” — English, हिन्दी, ಕನ್ನಡ, తెలుగు." },
  { title: "Built for Indian plates", body: "Idli, dosa, ragi mudde, biryani, chai — with katori, bowl, plate and piece." },
  { title: "Honest numbers", body: "Database values are labelled. AI estimates are marked “≈ estimated”." },
  { title: "Coach", body: "Enter your current and goal weight. Get a daily calorie target and a weekly workout plan." },
  { title: "Insights", body: "Calories, macros, weight trend, weekday patterns and habits — as plain charts." },
  { title: "Yours alone", body: "Row-level security on every table." },
];

export default function Home() {
  return (
    <div>
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-6">
        <span className="font-display text-xl">Life OS</span>
        <Link href="/login" className="text-sm underline underline-offset-4">Sign in</Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-4xl items-center gap-12 px-5 pb-20 pt-12 md:grid-cols-2 md:pt-20">
          <div className="rise">
            <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">Know your day.</h1>
            <p className="mt-6 max-w-md text-lg text-ink-soft">
              Tell a Telegram bot what you ate, the way you&apos;d tell a friend. Life OS turns it into calories, trends and a plan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="btn-primary">Get started</Link>
              <a href="#how" className="btn-ghost">How it works</a>
            </div>
          </div>

          <div className="card rise mx-auto w-full max-w-sm p-4" style={{ animationDelay: "0.12s" }} aria-label="Example Telegram conversation">
            <p className="mb-3 border-b border-line pb-3 text-sm font-semibold">Life OS bot</p>
            <div className="space-y-3 text-sm">
              <div className="ml-auto w-fit max-w-[80%] bg-ink px-3.5 py-2 text-bg">2 dose and filter coffee</div>
              <div className="w-fit max-w-[92%] border border-line px-3.5 py-2.5">
                <p className="font-semibold">Breakfast</p>
                <p>2 piece Masala dosa — <b>500</b> kcal</p>
                <p>1 cup Filter coffee — <b>90</b> kcal</p>
                <p className="mt-1.5 font-semibold">Total 590 kcal</p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs font-semibold">
                  <span className="col-span-2 bg-ink py-1.5 text-center text-bg">Confirm</span>
                  <span className="border border-line py-1.5 text-center">Quantity</span>
                  <span className="border border-line py-1.5 text-center">Variant</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-4xl px-5 pb-24">
          <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="bg-bg p-6">
                <h3 className="mb-2 font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-ink-soft">{f.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-sm text-ink-soft">Life OS</footer>
    </div>
  );
}
