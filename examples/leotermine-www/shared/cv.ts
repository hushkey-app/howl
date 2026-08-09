/**
 * Work history — the version that is fine to leave on the open internet.
 *
 * Deliberately shorter than the PDF: outcomes and scale, not every bullet, and
 * no contact details beyond the public address in `profile.ts`. Anyone who
 * wants the full document asks by email.
 */

/** One position on the timeline. */
export interface Role {
  /** Employer or trading name. */
  company: string;
  /** Position held. */
  title: string;
  /** Human-readable span, e.g. "2022 — 2026". */
  period: string;
  /** City / region. */
  location: string;
  /** Company site, when there is a public one. */
  href?: string;
  /** Two to four outcomes — scale and ownership, not task lists. */
  highlights: string[];
  /** Primary stack. */
  stack: string[];
  /** True while the role is ongoing. */
  current?: boolean;
}

/** Work history, newest first. */
export const ROLES: Role[] = [
  {
    company: "Hushkey",
    title: "Software Engineer",
    period: "Nov 2025 — now",
    location: "Perth, WA",
    href: "https://hushkey.app",
    current: true,
    stack: ["TypeScript", "Rust", "Deno", "React", "React Native", "MongoDB", "Redis", "MLX"],
    highlights: [
      "Architected a unified ~180 MB binary on Fly.io bundling API, SSR client and job workers, with Redis-based locking for consistent horizontal scaling.",
      "Built a first-party auth system — MFA, passkeys, device trust, SSO — with no third-party identity provider in the path.",
      "Launched PACK, a realtime B2B facilitation platform, on a Deno monorepo: Cloudflare Realtime for comms, WebGPU/WebGL2 for the whiteboard.",
      "Fine-tuned open models on Apple Silicon with MLX for low-latency Japanese ↔ English translation, removing cloud inference cost entirely.",
      "Led a team of three, embedding AI agents into the review and test loop to lift delivery velocity.",
    ],
  },
  {
    company: "SpaceToCo",
    title: "Software Engineer",
    period: "Nov 2022 — Mar 2026",
    location: "Perth, WA",
    href: "https://spacetoco.com",
    stack: ["Vue", "TypeScript", "Node.js", "Deno", "Python", "Postgres", "MongoDB", "AWS CDK"],
    highlights: [
      "Led the technical expansion into the UK market, owning architecture, CI/CD and the testing strategy end to end.",
      "Migrated 500k users off Cognito to Auth0 and Logto behind a custom low-latency identity layer built to absorb the traffic.",
      "Shipped SSO and role-based multi-tenant integrations for 80+ local council clients across Australia and the UK.",
      "Created a contract-driven API framework that generates docs and typed frontend clients, ending API drift.",
      "Designed an end-to-end encrypted document system to stop unauthorised internal access, and mentored the BI team.",
    ],
  },
  {
    company: "Gnocchi Boys",
    title: "Software Engineer",
    period: "Dec 2021 — Nov 2022",
    location: "Perth, WA",
    stack: ["TypeScript", "Node.js", "Flutter", "SQLite"],
    highlights: [
      "Led development of a native Android POS app in Flutter for in-store orders and payments.",
      "Built unified event-streaming integrations aggregating Uber, DoorDash and MenuLog webhooks into realtime alerts.",
      "Established automated build and deploy pipelines on GitHub Actions and Amazon ECR.",
    ],
  },
  {
    company: "Freelance",
    title: "Software Developer",
    period: "Mar 2019 — Dec 2021",
    location: "Perth, WA",
    stack: ["TypeScript", "Node.js", "Vue", "React", "SQL", "NoSQL"],
    highlights: [
      "Delivered server-rendered web applications and custom CRMs for a rotating client base, on Node/Express and Laravel.",
      "Ran the infrastructure behind them too — server setup, DNS, deployments and transactional email flows.",
    ],
  },
  {
    company: "bet365",
    title: "Software Developer",
    period: "Dec 2014 — Jan 2016",
    location: "Malta",
    href: "https://www.bet365.com",
    stack: ["PHP", "Python", "JavaScript", "HTML5"],
    highlights: [
      "Frontend and backend work across the betting platform, plus automation scripts and cron jobs for background operations.",
      "Reworked betting interface UIs to maximise score visibility and engagement.",
    ],
  },
  {
    company: "Infinity Games",
    title: "Software Developer · Data Centre",
    period: "Feb 2011 — May 2014",
    location: "Sciacca, Sicily",
    stack: ["PHP", "Python", "Django", "MySQL", "Linux"],
    highlights: [
      "Ran Linux servers, hosting and VM provisioning for the data centre floor.",
      "Wrote the APIs that automated VM deployment, and co-built the internal hosting management platform.",
    ],
  },
];
