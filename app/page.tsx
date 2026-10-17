import Link from "next/link";

const FEATURES = [
  { emoji: "💬", title: "Just say what you ate", body: "“2 dose and filter coffee”, “ಬೆಳಿಗ್ಗೆ 3 ಇಡ್ಲಿ”, “lunch mein 2 roti dal” — in English, हिन्दी, ಕನ್ನಡ or తెలుగు." },
  { emoji: "🍛", title: "Built for Indian plates", body: "Idli, dosa, ragi mudde, biryani, chai — 150+ dishes with Indian serving sizes: katori, bowl, plate, piece." },
  { emoji: "✅", title: "Honest numbers", body: "Database values are labelled. Any AI estimate is clearly marked “≈ estimated” — never passed off as fact." },
  { emoji: "🧠", title: "Learns your usual", body: "Tell it once that your dosa is masala, 2 pieces. Next time, “dosa” just works." },
  { emoji: "⌚", title: "Weekly averages, not daily guilt", body: "Apple Watch data arrives soon. We headline the weekly average — kinder and more accurate than any single day." },
  { emoji: "🔒", title: "Your data, yours alone", body: "Row-level security on every table. Built to be safe for many users from day one." },
];

export default function Home() {
  return (
    <div className="kolam">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 font-display text-xl font-bold text-maroon"><span aria-hidden>🪔</span> Life OS</span>
        <Link href="/login" className="btn-ghost !py-2 text-sm">Sign in</Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-2 md:pt-16">
          <div className="rise">
            <p className="mb-4 inline-block rounded-full bg-leaf-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-leaf">Namaste · नमस्ते · ನಮಸ್ಕಾರ · నమస్కారం</p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.1] sm:text-5xl">
              Know your day.<br /><span className="bg-gradient-to-r from-saffron to-maroon bg-clip-text text-transparent">Eat, log, smile.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-ink-soft">
              Message a Telegram bot what you ate — the way you&apos;d tell a friend. Life OS turns it into calories and trends, made for Indian food.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/login" className="btn-primary">Start for free →</Link>
              <a href="#how" className="btn-ghost">See how it works</a>
            </div>
          </div>

          {/* Telegram mock-up */}
          <div className="card rise mx-auto w-full max-w-sm bg-surface-warm p-4" style={{ animationDelay: "0.12s" }} aria-label="Example Telegram conversation">
            <div className="mb-3 flex items-center gap-2 border-b border-line pb-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-saffron to-turmeric text-lg">🪔</span>
              <div><p className="text-sm font-bold">Life OS bot</p><p className="text-xs text-leaf">online</p></div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-saffron/90 px-3.5 py-2 font-medium text-[#3b1d12]">2 dose and filter coffee</div>
              <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-sm border border-line bg-surface px-3.5 py-2.5">
                <p className="font-semibold">🌅 Breakfast</p>
                <p>• 2 piece Masala dosa — <b>500</b> kcal</p>
                <p>• 1 cup Filter coffee — <b>90</b> kcal</p>
                <p className="mt-1.5 font-bold">Total: 590 kcal</p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs font-semibold">
                  <span className="col-span-2 rounded-lg bg-leaf-soft py-1.5 text-center text-leaf">✅ Confirm</span>
                  <span className="rounded-lg bg-bg-soft py-1.5 text-center">✏️ Quantity</span>
                  <span className="rounded-lg bg-bg-soft py-1.5 text-center">🔄 Variant</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-5xl px-5 pb-20">
          <h2 className="mb-8 font-display text-3xl font-extrabold">Everything a thali-loving tracker needs</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <article key={f.title} className="card rise p-6" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-bg-soft text-2xl" aria-hidden>{f.emoji}</div>
                <h3 className="mb-1.5 font-display text-lg font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-ink-soft">{f.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8 text-center text-sm text-ink-soft">Made with 🧡 in India · Life OS</footer>
    </div>
  );
}
