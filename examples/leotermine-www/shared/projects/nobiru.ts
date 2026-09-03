import type { Project } from "./types.ts";

/** Nobiru — iPhone/Apple Watch gym and nutrition tracker, sold once. */
export const nobiru: Project = {
  slug: "nobiru",
  name: "Nobiru",
  tagline: "Gym and nutrition tracking, bought once",
  summary:
    "Gym and nutrition tracking for iPhone and Apple Watch, with no server behind it. Offline food database, on-device label scanning, live heart rate from the Watch. One purchase, no account.",
  year: "2026",
  status: "live",
  hue: 296,
  languages: ["Swift"],
  icon: "/projects/nobiru-icon.png",
  featured: true,
  links: [
    {
      label: "App Store",
      href: "https://apps.apple.com/au/app/nobiru/id6796767552",
      icon: "apple",
      primary: true,
    },
  ],
  support: {
    platforms: ["iPhone", "Apple Watch"],
    version: "1.0",
    requires: "iOS 26.5 · watchOS 10",
    price: "$9.99 once",
    contactEmail: "help@leotermine.com",
    responseTime: "within two business days",
    privacyUpdated: "2026-08-04",
    privacy: [
      {
        title: "What is collected",
        body:
          "Nothing is collected by us. Nobiru has no server and no account system. Your profile, routines, workout logs, food entries and hydration records are created on your device and stay there.",
      },
      {
        title: "iCloud sync",
        body:
          "If you are signed into iCloud, your data syncs through your own private CloudKit database so it appears on your other devices. Apple stores it under your Apple Account; we cannot read it. Turn iCloud off and the app keeps working with local-only storage.",
      },
      {
        title: "Health data",
        body:
          "With your permission the app writes finished workouts to the Health app and reads height and weight to prefill onboarding. Health data is never copied off the device by Nobiru.",
      },
      {
        title: "Camera",
        body:
          "The camera is used only when you scan a nutrition label. Text recognition runs on device; the photo is not uploaded and is not kept after the draft entry is created.",
      },
      {
        title: "Analytics and advertising",
        body:
          "There are none. No analytics SDKs, no advertising identifiers, no third-party trackers.",
      },
      {
        title: "Purchases",
        body:
          "The one-time unlock is processed by Apple through the App Store. We never see your payment details.",
      },
      {
        title: "Children",
        body:
          "Nobiru is not directed at children under 13 and collects no data from anyone, of any age, on our systems.",
      },
      {
        title: "Changes to this policy",
        body:
          "If the app ever starts doing something this page does not describe, this page changes first and the date above moves with it.",
      },
    ],
    faq: [
      {
        question: "Is it really not a subscription?",
        answer:
          "A one-time $9.99 purchase on the App Store. No monthly plan, no higher tier, no paid add-ons — future updates are part of what you bought.",
      },
      {
        question: "Do I need an account?",
        answer:
          "No sign-up, no email, no password. The app opens straight into onboarding and your data belongs to your device and your iCloud.",
      },
      {
        question: "What if I do not use iCloud?",
        answer:
          "Everything still works. The app falls back to local-only storage and tells you sync is off instead of failing quietly.",
      },
      {
        question: "Do I need an Apple Watch?",
        answer:
          "No. The Watch adds live heart rate and energy during a workout, but the iPhone app handles workouts, food and reports on its own. It requires watchOS 10 or later.",
      },
      {
        question: "Where does my data go?",
        answer:
          "Onto your device, and into your own private iCloud database if sync is on. There is no Nobiru server and no analytics.",
      },
      {
        question: "How accurate is the label scanner?",
        answer:
          "It reads the panel on device and pre-fills a draft. You review and correct every number before it is logged.",
      },
    ],
    guides: [
      {
        title: "My data is missing on a second device",
        body:
          "Check that both devices are signed into the same Apple Account and that iCloud Drive is on for Nobiru in Settings. Sync runs in the background and can take a minute after a large import — open the app on both devices and leave it in the foreground once.",
      },
      {
        title: "The Watch is not showing heart rate",
        body:
          "Start the workout from the Watch, not the phone, and allow the heart rate permission when prompted. If it was declined earlier, re-enable it under Watch → Privacy → Health.",
      },
      {
        title: "Getting your data out",
        body:
          "Everything lives in your own iCloud database, so removing the app does not delete it. If you want a copy outside the app, export from the Reports screen — the file is plain, readable and yours.",
      },
      {
        title: "Refunds",
        body:
          "Purchases run through the App Store, so refunds are requested from Apple at reportaproblem.apple.com. If the app is misbehaving, email first and it may be fixable in a release.",
      },
    ],
  },
};
