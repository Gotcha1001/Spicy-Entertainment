"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Flame,
  CircleDashed,
  Music,
  Shirt,
  Lightbulb,
  PartyPopper,
  Video,
  CalendarCheck,
  Star,
  ShieldCheck,
  Sparkles,
  Wallet,
  Users,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

const APP_NAME = "FitGirls Live"; // change the brand in one place

/* ------------------------------ data ------------------------------ */

const ACTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Flame,
    title: "Fire blowing & dancing",
    text: "The showstopper at a braai or night party. Pros who know their flames.",
  },
  {
    icon: CircleDashed,
    title: "Hula hoop",
    text: "Glowing, spinning, mesmerising. Perfect for birthdays and festivals.",
  },
  {
    icon: Music,
    title: "Funky dance",
    text: "High-energy sets that get the whole yard off the couch and moving.",
  },
  {
    icon: Shirt,
    title: "Fancy dress shows",
    text: "Themed costumes and characters, dressed to impress for your theme.",
  },
  {
    icon: Lightbulb,
    title: "LED & light shows",
    text: "Neon, lights and props that turn any backyard into a club.",
  },
  {
    icon: PartyPopper,
    title: "Party host / MC",
    text: "A live host to keep the energy up and the guests involved.",
  },
];

const STEPS = [
  {
    icon: Users,
    title: "Pick your entertainers",
    text: "See who is active right now, filter by act, and check ratings out of 10.",
  },
  {
    icon: CalendarCheck,
    title: "Book 30-minute slots",
    text: "Choose a day and a start time, from 30 minutes up to 2 hours, and pay securely with Paystack.",
  },
  {
    icon: Video,
    title: "Put them on the big screen",
    text: "Join the live stream from your TV or laptop. Open up to 3 dancers at once.",
  },
];

const STATS = [
  { value: "30 min", label: "Book by the half hour" },
  { value: "Up to 3", label: "Dancers streaming at once" },
  { value: "/10", label: "Ratings after every show" },
  { value: "18+", label: "Adults only, always" },
];

/* ---------------------------- animation ---------------------------- */

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const PRIMARY_BUTTON =
  "accent-gradient-bg border-0 px-9 py-6 text-base font-semibold text-white " +
  "[text-shadow:0_1px_2px_rgba(0,0,0,0.4)] " +
  "shadow-[0_0_40px_-8px_var(--accent-500)] transition-all " +
  "hover:opacity-95 hover:shadow-[0_0_55px_-6px_var(--accent-400)]";

const GHOST_BUTTON =
  "border border-white/20 bg-white/5 px-9 py-6 text-base text-white backdrop-blur " +
  "hover:bg-white/10 hover:text-white";

const SERIF = { fontFamily: "Fraunces, ui-serif, Georgia, serif" };

/* ------------------------------ page ------------------------------ */

export default function Home(): React.JSX.Element {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const reduce = useReducedMotion();

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const heroFade = useTransform(scrollYProgress, [0, 0.9], [1, 0]);

  const drift = (d: number) =>
    reduce
      ? undefined
      : { y: [0, d, 0], x: [0, d / 2, 0], scale: [1, 1.08, 1] };

  const cta = isSignedIn ? (
    <Button
      size="lg"
      className={PRIMARY_BUTTON}
      onClick={() => router.push("/dancers")}
    >
      See who&apos;s live now <ArrowRight className="ml-2 h-5 w-5" />
    </Button>
  ) : (
    <SignInButton mode="modal" forceRedirectUrl="/choose-role">
      <Button size="lg" className={PRIMARY_BUTTON}>
        Book entertainment <ArrowRight className="ml-2 h-5 w-5" />
      </Button>
    </SignInButton>
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07040a] text-white">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <motion.div
          className="absolute -left-48 -top-48 h-[640px] w-[640px] rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--accent-from)" }}
          animate={drift(40)}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-48 top-[30%] h-[700px] w-[700px] rounded-full opacity-25 blur-3xl"
          style={{ background: "var(--accent-to)" }}
          animate={drift(-40)}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-1/3 h-[500px] w-[500px] rounded-full opacity-20 blur-3xl"
          style={{ background: "var(--accent-via)" }}
          animate={drift(30)}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#07040a_85%)]" />
      </div>

      {/* ------------------------------ HERO ------------------------------ */}
      <section
        ref={heroRef}
        className="relative z-10 flex min-h-[92vh] flex-col items-center justify-center px-6 pb-20 pt-28 text-center"
      >
        <motion.div
          style={{ y: heroY, opacity: heroFade }}
          className="flex flex-col items-center"
        >
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col items-center"
          >
            <motion.span
              variants={rise}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white/80 backdrop-blur"
            >
              <Sparkles
                className="h-3.5 w-3.5"
                style={{ color: "var(--accent-400)" }}
              />
              Live entertainment · 18+
            </motion.span>

            <motion.h1
              variants={rise}
              className="max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl"
              style={SERIF}
            >
              Book a live show for{" "}
              <span
                className="accent-gradient-text italic"
                style={{ filter: "drop-shadow(0 0 28px var(--accent-500))" }}
              >
                your next party.
              </span>
            </motion.h1>

            <motion.p
              variants={rise}
              className="mt-6 max-w-2xl text-lg text-white/70"
            >
              Fire blowers, hula hoop dancers, funky performers and fancy dress
              acts, streaming live to your party or braai. Pick who&apos;s
              active right now, book by the half hour, and pay securely.
            </motion.p>

            <motion.div
              variants={rise}
              className="mt-10 flex flex-wrap items-center justify-center gap-4"
            >
              {cta}
              <Link href="/choose-role">
                <Button variant="ghost" size="lg" className={GHOST_BUTTON}>
                  I&apos;m a dancer
                </Button>
              </Link>
            </motion.div>

            <motion.p
              variants={rise}
              className="mt-5 flex items-center gap-2 text-sm text-white/50"
            >
              <ShieldCheck className="h-4 w-4" /> No nudity, no porn · Secure
              Paystack payments · Rated out of 10
            </motion.p>
          </motion.div>
        </motion.div>
      </section>

      {/* ------------------------------ STATS ------------------------------ */}
      <section className="relative z-10 mx-auto max-w-5xl px-6">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-2 gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md md:grid-cols-4"
        >
          {STATS.map((s) => (
            <motion.div key={s.label} variants={rise} className="text-center">
              <div className="accent-gradient-text text-3xl font-semibold">
                {s.value}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/55">
                {s.label}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ------------------------------ ACTS ------------------------------ */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-28">
        <SectionHeading
          eyebrow="The acts"
          title="Entertainment for every kind of party"
        />
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {ACTS.map((a) => (
            <motion.div
              key={a.title}
              variants={rise}
              whileHover={reduce ? undefined : { scale: 1.02 }}
              className="accent-card rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-left backdrop-blur-md"
            >
              <span className="accent-gradient-bg mb-5 flex h-12 w-12 items-center justify-center rounded-2xl shadow-[0_0_28px_-6px_var(--accent-500)]">
                <a.icon size={22} />
              </span>
              <h3 className="mb-2 text-xl font-semibold">{a.title}</h3>
              <p className="text-white/65">{a.text}</p>
            </motion.div>
          ))}
        </motion.div>
        <p className="mt-8 text-center text-sm text-white/50">
          Braais, birthdays, corporate events and house parties. Dressed fancy
          or funky, always keeping it fun and family-friendly.
        </p>
      </section>

      {/* --------------------------- HOW IT WORKS --------------------------- */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-28">
        <SectionHeading
          eyebrow="How it works"
          title="Three steps to a live show"
        />
        <motion.ol
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 grid gap-8 md:grid-cols-3"
        >
          {STEPS.map((s, i) => (
            <motion.li
              key={s.title}
              variants={rise}
              className="relative text-left"
            >
              <div className="accent-gradient-text mb-3 text-6xl font-semibold opacity-80">
                {String(i + 1).padStart(2, "0")}
              </div>
              <s.icon
                className="mb-3 h-6 w-6"
                style={{ color: "var(--accent-400)" }}
              />
              <h3 className="mb-1 text-lg font-semibold">{s.title}</h3>
              <p className="text-sm text-white/65">{s.text}</p>
            </motion.li>
          ))}
        </motion.ol>
      </section>

      {/* --------------------------- FOR DANCERS --------------------------- */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="grid items-center gap-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-md md:grid-cols-[1.4fr_1fr] md:p-12"
        >
          <div className="text-left">
            <p
              className="mb-3 text-xs font-medium uppercase tracking-[0.25em]"
              style={{ color: "var(--accent-400)" }}
            >
              For performers
            </p>
            <h2 className="text-3xl font-semibold md:text-4xl" style={SERIF}>
              Get paid to do what you love.
            </h2>
            <p className="mt-4 text-white/70">
              Set up your profile, list your acts, set your price per half hour
              and choose when you&apos;re available. Switch on &ldquo;I&apos;m
              available&rdquo; to show as active, perform from home, and get
              paid straight to your bank. No invoicing, no chasing.
            </p>
            <Link href="/choose-role" className="mt-6 inline-block">
              <Button size="lg" className={PRIMARY_BUTTON}>
                Start performing <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
          <ul className="space-y-4 text-left text-sm text-white/75">
            <li className="flex items-start gap-3">
              <Wallet
                className="mt-0.5 h-5 w-5 shrink-0"
                style={{ color: "var(--accent-400)" }}
              />
              Automatic payouts to your bank via Paystack
            </li>
            <li className="flex items-start gap-3">
              <CalendarCheck
                className="mt-0.5 h-5 w-5 shrink-0"
                style={{ color: "var(--accent-400)" }}
              />
              Weekly hours in 30-minute slots, plus day overrides
            </li>
            <li className="flex items-start gap-3">
              <Star
                className="mt-0.5 h-5 w-5 shrink-0"
                style={{ color: "var(--accent-400)" }}
              />
              Ratings out of 10 build your reputation
            </li>
          </ul>
        </motion.div>
      </section>

      {/* ------------------------------- CTA ------------------------------- */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-[2rem] border border-white/15 p-12 text-center"
        >
          <div className="accent-gradient-bg absolute inset-0 opacity-30" />
          <div className="absolute inset-0 backdrop-blur-xl" />
          <div className="relative">
            <PartyPopper
              className="mx-auto mb-4 h-8 w-8"
              style={{ color: "var(--accent-400)" }}
            />
            <h2 className="text-4xl font-semibold md:text-5xl" style={SERIF}>
              Make the party unforgettable.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-white/75">
              Create your account in a minute and book your first live act
              tonight.
            </p>
            <div className="mt-8 flex justify-center">{cta}</div>
          </div>
        </motion.div>
      </section>

      {/* ------------------------------ FOOTER ------------------------------ */}
      <footer className="relative z-10 border-t border-white/10 px-6 py-10 text-center text-xs text-white/45">
        <p>
          {APP_NAME} is for adults aged 18 and over. House rules: no nudity and
          no pornography. Guys may perform shirtless.
        </p>
        <p className="mt-2">
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline">
            Privacy
          </Link>{" "}
          · © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
        </p>
      </footer>
    </main>
  );
}

/* --------------------------- small component --------------------------- */

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6 }}
      className="text-center"
    >
      <p
        className="mb-3 text-xs font-medium uppercase tracking-[0.25em]"
        style={{ color: "var(--accent-400)" }}
      >
        {eyebrow}
      </p>
      <h2 className="text-3xl font-semibold md:text-5xl" style={SERIF}>
        {title}
      </h2>
    </motion.div>
  );
}
