import { useHead } from "@hushkey/howl-react/head";
import type { ReactNode } from "react";
import {
  BarChart3,
  Check,
  CloudOff,
  Droplet,
  Dumbbell,
  Repeat2,
  ScanLine,
  UtensilsCrossed,
  Watch,
} from "lucide-react";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { AppleLogo } from "@/components/ui/apple-logo.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { FaqItem } from "@/components/ui/faq-item.tsx";
import { PhoneMock } from "@/components/phone.tsx";
import { WatchLive } from "@/components/watch.tsx";
import { LabelScan } from "@/components/label-scan.tsx";
import { WeekChart } from "@/components/week-chart.tsx";
import {
  APP_STORE_URL,
  EXERCISE_CLAIM,
  FOOD_COUNT,
  GYM_PRESETS,
  IOS_MIN,
  PRICE,
  WATCHOS_MIN,
} from "../../shared/facts.ts";

const FEATURES = [
  {
    icon: Dumbbell,
    title: `${EXERCISE_CLAIM} exercises`,
    body:
      "Each one tagged with its muscle group, equipment and difficulty, with step-by-step instructions and a rest timer.",
    tint: "bg-primary/10 text-primary",
  },
  {
    icon: Repeat2,
    title: "Swap mid-workout",
    body:
      "Bench taken? Swap for an alternative that hits the same muscle, filtered by the equipment your gym has.",
    tint: "bg-chart-2/15 text-ink-2",
  },
  {
    icon: UtensilsCrossed,
    title: `${FOOD_COUNT.toLocaleString("en-US")} foods, offline`,
    body:
      "Calories, protein, carbs, fat, fibre and sugar. Add your own foods and set daily ranges rather than hard rules.",
    tint: "bg-chart-4/25 text-ink-4",
  },
  {
    icon: ScanLine,
    title: "Nutrition label scanning",
    body:
      "Point the camera at a panel. Text recognition runs on device and fills in a draft entry for you to check.",
    tint: "bg-chart-5/15 text-ink-5",
  },
  {
    icon: Watch,
    title: "Apple Watch session",
    body:
      "Live heart rate and active energy while you lift, a Live Activity on the Lock Screen, and the workout written to Health.",
    tint: "bg-chart-1/15 text-ink-1",
  },
  {
    icon: BarChart3,
    title: "Reports",
    body:
      "Weekly volume and calories, best weight per exercise, and every session you have finished — by year.",
    tint: "bg-chart-3/20 text-ink-3",
  },
];

const WATCH_POINTS = [
  "Heart rate straight from the live workout session, not a summary written afterwards.",
  "Active energy in kilojoules, updating while the set is still going.",
  "Live Activity on the Lock Screen and Dynamic Island for the rest timer.",
  "Finished workouts written to the Health app as strength training.",
];

const REPORT_STATS = [
  { label: "Sessions this week", value: "4", color: "text-primary" },
  { label: "Calories burnt", value: "1,940", color: "text-ink-3" },
  { label: "Best bench set", value: "60 kg", color: "text-ink-1" },
  { label: "Weeks logged", value: "12", color: "text-ink-2" },
];

const NUTRITION_POINTS = [
  {
    icon: UtensilsCrossed,
    title: "Search or scan",
    body: `${FOOD_COUNT.toLocaleString("en-US")} foods bundled, plus the ones you add yourself.`,
    tint: "bg-chart-4/25 text-ink-4",
  },
  {
    icon: Droplet,
    title: "Water included",
    body: "Hydration is logged next to the macros, not in a second app.",
    tint: "bg-chart-2/15 text-ink-2",
  },
  {
    icon: BarChart3,
    title: "Ranges, not rules",
    body: "Daily minimums and maximums for carbs, protein, fat and sugar.",
    tint: "bg-chart-3/20 text-ink-3",
  },
];

const INCLUDED = [
  "The full exercise library",
  "Unlimited routines and gyms",
  "Full nutrition and hydration log",
  "Nutrition label scanning",
  "Apple Watch live session",
  "Reports and all-time history",
  "iCloud sync across devices",
  "Every future update",
];

const FAQ = [
  {
    q: "Is it really not a subscription?",
    a: `A one-time ${PRICE} purchase on the App Store. No monthly plan, no higher tier, no paid add-ons — future updates are part of what you bought.`,
  },
  {
    q: "Do I need an account?",
    a: "No sign-up, no email, no password. The app opens straight into onboarding and your data belongs to your device and your iCloud.",
  },
  {
    q: "What if I do not use iCloud?",
    a: "Everything still works. The app falls back to local-only storage and tells you sync is off instead of failing quietly.",
  },
  {
    q: "Do I need an Apple Watch?",
    a: `No. The Watch adds live heart rate and energy during a workout, but the iPhone app handles workouts, food and reports on its own. Requires ${WATCHOS_MIN} or later.`,
  },
  {
    q: "Where does my data go?",
    a: "Onto your device, and into your own private iCloud database if sync is on. There is no Nobiru server and no analytics.",
  },
  {
    q: "How accurate is the label scanner?",
    a: "It reads the panel on device and pre-fills a draft. You review and correct every number before it is logged.",
  },
];

/** The Nobiru landing page. */
export default function Home(props: ReactPageProps<unknown, State>) {
  const price = props.state.client?.price ?? PRICE;
  const storeUrl = props.state.client?.appStoreUrl ?? APP_STORE_URL;

  useHead({
    title: "Nobiru — gym and nutrition tracking, bought once",
    meta: [
      {
        name: "description",
        content:
          `Gym and nutrition tracker for iPhone and Apple Watch: ${EXERCISE_CLAIM.toLowerCase()} exercises, nutrition-label scanning, live heart rate and calories. Everything included for ${price} once — no subscription.`,
      },
      { property: "og:title", content: "Nobiru — gym and nutrition tracking, bought once" },
      {
        property: "og:description",
        content:
          `iOS gym and nutrition tracker with Apple Watch live metrics. ${price}, yours forever.`,
      },
      { property: "og:image", content: "/logo-512.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  });

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_auto]">
          <div>
            <Badge className="border-transparent bg-primary/10 text-primary">
              One-time purchase · no subscription
            </Badge>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Track the training and the eating. <span className="text-primary">Pay once.</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Nobiru is a gym and nutrition tracker for iPhone and Apple Watch:{" "}
              {EXERCISE_CLAIM.toLowerCase()} exercises with equipment-aware swaps,{" "}
              {FOOD_COUNT.toLocaleString("en-US")}{" "}
              foods you can log offline, nutrition labels read by the camera, and live heart rate
              and calories from your wrist.
            </p>

            {/* The whole offer, before anyone has to scroll for it. */}
            <div className="mt-8 rounded-xl border border-primary/25 bg-tint-violet p-5">
              <p className="text-sm font-medium">
                <span className="text-primary">{price} once.</span>{" "}
                Everything below is included — nothing is held back for a higher tier.
              </p>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="size-4 shrink-0 text-ink-4" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href={storeUrl} target="_blank" rel="noreferrer">
                  <AppleLogo />
                  Download for {price}
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#features">See what's inside</a>
              </Button>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              {IOS_MIN}+ · Apple Watch optional · no subscription, no account, no ads
            </p>
          </div>

          <div className="flex justify-center rounded-3xl bg-tint-violet p-6 sm:p-10 lg:justify-end">
            <PhoneMock />
          </div>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Screens are illustrative. Sample data shown.
        </p>
      </section>

      {/* Numbers */}
      <section className="border-y">
        <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-y px-5 sm:grid-cols-4 sm:divide-y-0">
          <Stat value={EXERCISE_CLAIM} label="Exercises" color="text-primary" />
          <Stat
            value={FOOD_COUNT.toLocaleString("en-US")}
            label="Foods offline"
            color="text-ink-2"
          />
          <Stat value={String(GYM_PRESETS.length)} label="Gym presets" color="text-ink-3" />
          <Stat value={price} label="Once, not monthly" color="text-ink-4" />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-16 sm:py-20">
        <SectionHead
          eyebrow="Features"
          title="Everything a tracker owes you"
          body="Workouts, food and the numbers that come out of both — in one app, with nothing held back for a higher tier."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <span
                  className={`flex size-10 items-center justify-center rounded-lg ${feature.tint}`}
                >
                  <feature.icon className="size-5" />
                </span>
                <CardTitle className="mt-3">{feature.title}</CardTitle>
                <CardDescription>{feature.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="mt-4">
          <CardHeader>
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CloudOff className="size-5" />
            </span>
            <CardTitle className="mt-3">No server, so nothing to leak</CardTitle>
            <CardDescription className="max-w-2xl">
              Workouts, food logs and your profile live on the device and sync through your own
              private iCloud database. Without iCloud the app runs local-only and says so, rather
              than pretending to sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="outline">No tracking</Badge>
            <Badge variant="outline">No analytics</Badge>
            <Badge variant="outline">No ads</Badge>
          </CardContent>
        </Card>
      </section>

      {/* Apple Watch */}
      <section id="watch" className="border-t bg-tint-violet">
        <div className="mx-auto max-w-5xl scroll-mt-20 px-5 py-16 sm:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionHead
                eyebrow="Apple Watch"
                title="Live numbers while you lift"
                body="Start on either device and the Watch takes over the session. Everything it reads goes to the phone as it happens."
              />
              <ul className="mt-8 space-y-3">
                {WATCH_POINTS.map((point) => (
                  <li key={point} className="flex gap-3 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col items-center gap-4">
              <WatchLive />
              <div className="w-full max-w-xs rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <img src="/logo-192.png" alt="" className="size-8" />
                  <div className="flex-1">
                    <p className="text-sm">Push day · set 3 of 4</p>
                    <p className="text-xs text-muted-foreground">Live Activity</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">01:12</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/3 rounded-full bg-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Nutrition */}
      <section id="nutrition" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-16 sm:py-20">
        <SectionHead
          eyebrow="Nutrition"
          title="Log a food in a photo"
          body="Photograph a nutrition panel and the numbers land in a draft entry — read on device, never uploaded. Fix anything that looks off, then save it against your day."
        />

        <div className="mt-10">
          <LabelScan />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {NUTRITION_POINTS.map((point) => (
            <Card key={point.title}>
              <CardHeader>
                <span
                  className={`flex size-9 items-center justify-center rounded-lg ${point.tint}`}
                >
                  <point.icon className="size-4.5" />
                </span>
                <CardTitle className="mt-3 text-base">{point.title}</CardTitle>
                <CardDescription>{point.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Reports */}
      <section id="reports" className="border-t bg-tint-sky">
        <div className="mx-auto max-w-5xl scroll-mt-20 px-5 py-16 sm:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <SectionHead
                eyebrow="Reports"
                title="Proof you got stronger"
                body="Every finished session is kept — by year, by exercise, by best weight. The dashboard shows the week; the report screen goes all the way back."
              />
              <div className="mt-8 grid grid-cols-2 gap-4">
                {REPORT_STATS.map((stat) => (
                  <div key={stat.label} className="rounded-xl border bg-card p-4">
                    <p className={`text-xl font-semibold tabular-nums ${stat.color}`}>
                      {stat.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <Card>
              <CardContent>
                <WeekChart />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-16 sm:py-20">
        <SectionHead eyebrow="FAQ" title="Straight answers" align="center" />
        <div className="mt-8 rounded-xl border px-5">
          {FAQ.map((item) => <FaqItem key={item.q} question={item.q}>{item.a}</FaqItem>)}
        </div>
      </section>

      {/* Closer */}
      <section className="border-t bg-tint-lime">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-5 py-16 text-center sm:py-20">
          <img src="/logo-512.png" alt="Nobiru app icon" className="size-20" />
          <h2 className="text-3xl font-semibold tracking-tight">Train today, own it forever</h2>
          <p className="max-w-lg text-muted-foreground">
            Buy it once and it keeps working — offline, on your wrist, in your kitchen — for as long
            as your phone does.
          </p>
          <Button asChild size="lg">
            <a href={storeUrl} target="_blank" rel="noreferrer">
              <AppleLogo />
              Download for {price}
            </a>
          </Button>
        </div>
      </section>
    </>
  );
}

function SectionHead({
  eyebrow,
  title,
  body,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
      {body && (
        <p
          className={`mt-3 max-w-2xl text-muted-foreground ${align === "center" ? "mx-auto" : ""}`}
        >
          {body}
        </p>
      )}
    </div>
  );
}

function Stat(
  { value, label, color }: { value: string; label: string; color: string },
): ReactNode {
  return (
    <div className="px-5 py-8 text-center">
      <p className={`text-2xl font-semibold tabular-nums sm:text-3xl ${color}`}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
