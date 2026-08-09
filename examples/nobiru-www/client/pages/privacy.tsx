import { useHead } from "@hushkey/howl-react/head";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";

const SECTIONS = [
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
    body: "There are none. No analytics SDKs, no advertising identifiers, no third-party trackers.",
  },
  {
    title: "Purchases",
    body:
      "The one-time unlock is processed by Apple through the App Store. We never see your payment details.",
  },
];

/** Privacy policy — plain language, matching what the app actually does. */
export default function Privacy() {
  useHead({ title: "Privacy — Nobiru" });

  return (
    <section className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <p className="text-sm font-medium text-primary">Privacy</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Your data does not leave your devices
      </h1>
      <p className="mt-4 text-muted-foreground">
        Nobiru is built without a backend, so there is very little to say — which is the point.
      </p>

      <div className="mt-10 grid gap-4">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Questions:{" "}
        <a href="mailto:support@nobiru.app" className="underline underline-offset-4">
          support@nobiru.app
        </a>
      </p>
    </section>
  );
}
