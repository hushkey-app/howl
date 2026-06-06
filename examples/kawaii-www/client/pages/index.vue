<template>
  <div ref="root" class="overflow-x-clip">
    <!-- ============================ NAV ============================ -->
    <header
      class="sticky top-0 z-40 border-b border-base-300/80 backdrop-blur-md"
      style="background: color-mix(in srgb, var(--bg) 82%, transparent)"
    >
      <div class="mx-auto flex h-[66px] w-full max-w-[1240px] items-center justify-between px-[var(--pad)]">
        <a href="#hero" class="mono inline-flex items-baseline text-[18px] font-bold tracking-tight">
          kawaii<span class="text-primary">(x,y)</span>
        </a>
        <nav class="mono hidden gap-[26px] text-[13.5px] text-base-content/60 md:flex">
          <a class="transition-colors hover:text-base-content" href="#philosophy">// philosophy</a>
          <a class="transition-colors hover:text-base-content" href="#why">// why us</a>
          <a class="transition-colors hover:text-base-content" href="#capabilities">// capabilities</a>
          <a class="transition-colors hover:text-base-content" href="#process">// process</a>
        </nav>
        <div class="flex items-center gap-[14px]">
          <div class="mono hidden gap-[2px] text-[12px] sm:flex">
            <button class="rounded-md bg-base-200 px-[7px] py-[4px] text-base-content">en</button>
            <button class="rounded-md px-[7px] py-[4px] text-base-content/40 transition hover:text-base-content">it</button>
            <button class="rounded-md px-[7px] py-[4px] text-base-content/40 transition hover:text-base-content">ja</button>
          </div>
          <button
            class="grid h-[38px] w-[38px] place-items-center rounded-full border border-base-300 text-base-content/60 transition hover:border-base-content/40 hover:text-base-content"
            aria-label="Toggle theme"
            type="button"
            @click="toggleTheme"
          >
            <svg class="i-sun h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></svg>
            <svg class="i-moon h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5Z" /></svg>
          </button>
          <a href="#contact" class="k-cta">kawaii<span class="opacity-70">(</span>talk<span class="opacity-70">)</span></a>
        </div>
      </div>
    </header>

    <!-- ============================ HERO ============================ -->
    <section id="hero" class="relative overflow-clip px-[var(--pad)] pb-[clamp(56px,8vh,100px)] pt-[clamp(48px,8vh,92px)]">
      <div class="k-glow"></div>
      <div class="mx-auto grid w-full max-w-[1240px] items-center gap-[clamp(32px,5vw,72px)] md:grid-cols-[1.15fr_.85fr]">
        <div>
          <span class="k-eyebrow reveal">boutique software house — four cities, one function</span>
          <h1 class="reveal mt-[18px] text-[clamp(40px,7vw,92px)] font-extrabold leading-[.98] tracking-[-.025em] [text-wrap:balance]">
            Software that<br /><span class="k-grad-text k-grad-anim">actually</span> works.
          </h1>
          <p class="reveal mt-[26px] max-w-[56ch] text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-base-content/60 [text-wrap:pretty]">
            We blend Japanese craft, Italian aesthetics, and Australian engineering into enterprise-grade
            software — delivered around the clock, without sacrificing a single pixel of quality.
          </p>
          <div class="reveal mt-[34px] flex flex-wrap gap-[12px]">
            <a href="#contact" class="k-cta">Start a project <span class="arr">→</span></a>
            <a href="#process" class="k-cta k-cta--ghost">See how we work</a>
          </div>
          <div class="mono reveal mt-[40px] flex flex-wrap gap-[26px] text-[12.5px] text-base-content/40">
            <span class="inline-flex items-center gap-[7px]"><i class="h-[7px] w-[7px] rounded-full bg-primary"></i> 24h delivery coverage</span>
            <span>0 missed deadlines</span>
            <span>enterprise-grade, boutique-built</span>
          </div>
        </div>

        <!-- coverage card -->
        <aside class="reveal relative overflow-hidden rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-[22px] shadow-[var(--shadow)]" aria-label="Live coverage">
          <div class="mono mb-[6px] flex items-center justify-between text-[12px] text-base-content/40">
            <span>// live coverage</span>
            <span>4 hubs</span>
          </div>
          <div class="flex flex-col">
            <div
              v-for="hub in HUBS"
              :key="hub.tz"
              class="grid grid-cols-[1fr_auto_auto] items-center gap-[12px] border-t border-base-300 py-[14px] first:border-t-0"
            >
              <div>
                <div class="text-[15px] font-bold">{{ hub.city }}</div>
                <div class="mono text-[11px] text-base-content/40">{{ hub.zone }}</div>
              </div>
              <div class="mono text-[15px] tabular-nums">{{ now[hub.tz].hm }}</div>
              <div
                class="k-status mono rounded-full border px-[8px] py-[4px] text-[10.5px] tracking-[.04em] whitespace-nowrap"
                :class="now[hub.tz].open
                  ? 'is-live border-primary/40 bg-[var(--accent-soft)] text-primary'
                  : 'border-base-300 text-base-content/40'"
              >
                <span class="k-pulse"></span>{{ now[hub.tz].open ? "Active" : "Resting" }}
              </div>
            </div>
          </div>
          <div class="mono mt-[4px] flex justify-between border-t border-base-300 pt-[14px] text-[11.5px] text-base-content/40">
            <span>continuous handoff</span>
            <span><b class="font-medium text-primary">24h</b> of active development</span>
          </div>
        </aside>
      </div>
    </section>

    <div class="mx-auto w-full max-w-[1240px] px-[var(--pad)]"><div class="h-px bg-base-300"></div></div>

    <!-- ===================== COVERAGE / TIMELINE ===================== -->
    <section id="coverage" class="px-[var(--pad)] py-[clamp(72px,11vh,150px)]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="reveal mb-[40px] flex flex-wrap items-end justify-between gap-[30px]">
          <div>
            <div class="k-label mb-[20px]">// coverage</div>
            <h2 class="text-[clamp(30px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-.02em] [text-wrap:balance]">
              The sun never sets<br />on our code.
            </h2>
          </div>
          <p class="max-w-[56ch] text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-base-content/60 [text-wrap:pretty]">
            While your team sleeps, ours keeps moving. Morning briefs become evening releases — handoffs
            flow Tokyo → Perth → Palermo → San Francisco, every day, with no gaps.
          </p>
        </div>

        <div class="k-tl reveal relative overflow-hidden rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-[clamp(20px,3vw,36px)] shadow-[var(--shadow)]">
          <div class="mono mb-[14px] flex items-center justify-between text-[12px] text-base-content/40">
            <span>// one global work cycle · 24h (UTC)</span>
            <span class="tabular-nums" v-html="nowLabel"></span>
          </div>
          <div class="k-tl-ruler">
            <div v-for="t in ticks" :key="t" class="k-tl-tick" :style="{ left: pct(t) }">{{ pad(t) }}</div>
          </div>
          <div class="k-tl-lanes">
            <div
              v-for="hub in HUBS"
              :key="hub.tz"
              class="k-tl-lane"
              :class="{ 'is-on': laneOn(hub) }"
            >
              <div class="flex flex-col gap-[2px] pr-[16px]">
                <span class="text-[14px] font-bold">{{ hub.city }}</span>
                <span class="k-tl-zone mono text-[10.5px] text-base-content/40">{{ hub.zone }}</span>
              </div>
              <div class="k-tl-track">
                <div
                  v-for="(band, i) in hub.bands"
                  :key="i"
                  class="k-tl-band"
                  :class="{ 'is-on': bandOn(band[0], band[1]) }"
                  :style="{ left: pct(band[0]), width: pct(band[1] - band[0]) }"
                ></div>
              </div>
            </div>
            <div class="k-tl-overlay"><div class="k-tl-sweep" :style="{ left: sweepLeft }"></div></div>
          </div>
          <div class="mt-[14px] grid grid-cols-[116px_1fr] items-center border-t border-base-300 pt-[18px]">
            <div class="mono pr-[16px] text-[11px] text-base-content/40">coverage</div>
            <div class="k-grad-panel relative h-[10px] rounded-full">
              <span class="mono absolute right-[10px] top-1/2 -translate-y-1/2 text-[9.5px] tracking-[.04em] text-white">NO DEAD HOURS</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="mx-auto w-full max-w-[1240px] px-[var(--pad)]"><div class="h-px bg-base-300"></div></div>

    <!-- ============================ PHILOSOPHY ============================ -->
    <section id="philosophy" class="px-[var(--pad)] py-[clamp(72px,11vh,150px)]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="reveal">
          <div class="k-label">// philosophy</div>
          <h2 class="mt-[12px] text-[clamp(30px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-.02em]">Every problem is an equation.</h2>
          <p class="mt-[18px] max-w-[56ch] text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-base-content/60">
            Disciplined craft, visual intelligence, and pragmatic engineering — collapsed into one delivery model.
          </p>
        </div>
        <div class="reveal mt-[14px] grid gap-px overflow-hidden rounded-[var(--radius-box)] border border-base-300 bg-base-300 md:grid-cols-3">
          <article v-for="p in philosophy" :key="p.title" class="bg-base-100 p-[clamp(24px,2.6vw,38px)] transition-colors hover:bg-base-200">
            <div class="mono mb-[18px] text-[12px] text-primary">{{ p.kicker }}</div>
            <h3 class="mb-[12px] text-[clamp(20px,2vw,25px)] font-bold leading-[1.15] tracking-[-.01em]">{{ p.title }}</h3>
            <p class="text-[15.5px] leading-[1.6] text-base-content/60 [text-wrap:pretty]">{{ p.body }}</p>
            <div class="mt-[22px] flex flex-wrap gap-[7px]">
              <span v-for="tag in p.tags" :key="tag" class="k-tag">{{ tag }}</span>
            </div>
          </article>
        </div>
      </div>
    </section>

    <div class="mx-auto w-full max-w-[1240px] px-[var(--pad)]"><div class="h-px bg-base-300"></div></div>

    <!-- ============================ WHY US ============================ -->
    <section id="why" class="px-[var(--pad)] py-[clamp(72px,11vh,150px)]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="reveal mb-[14px] grid items-end gap-[clamp(24px,4vw,56px)] md:grid-cols-2">
          <div>
            <div class="k-label">// why kawaii(x,y)</div>
            <h2 class="mt-[12px] text-[clamp(30px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-.02em]">Boutique focus,<br />enterprise outcomes.</h2>
          </div>
          <p class="text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-base-content/60">
            Most teams make you choose between speed, quality, and senior attention. Our model is built so you don't have to.
          </p>
        </div>
        <div class="reveal grid gap-px overflow-hidden rounded-[var(--radius-box)] border border-base-300 bg-base-300 md:grid-cols-2">
          <article v-for="w in why" :key="w.n" class="group relative overflow-hidden bg-base-100 p-[clamp(26px,2.8vw,42px)] transition-colors hover:bg-base-200">
            <span class="absolute left-0 top-0 bottom-0 w-[3px] origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100" style="background: var(--grad)"></span>
            <div class="mono mb-[20px] flex items-center gap-[10px] text-[12px] text-base-content/40">
              <span class="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-[12px] font-bold text-white" style="background: var(--grad)">{{ w.n }}</span>
              {{ w.kicker }}
            </div>
            <h3 class="mb-[11px] text-[clamp(19px,1.8vw,24px)] font-bold leading-[1.12] tracking-[-.015em]">{{ w.title }}</h3>
            <p class="max-w-[48ch] text-[15px] leading-[1.6] text-base-content/60 [text-wrap:pretty]">{{ w.body }}</p>
          </article>
        </div>
      </div>
    </section>

    <div class="mx-auto w-full max-w-[1240px] px-[var(--pad)]"><div class="h-px bg-base-300"></div></div>

    <!-- ============================ CAPABILITIES ============================ -->
    <section id="capabilities" class="px-[var(--pad)] py-[clamp(72px,11vh,150px)]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="reveal">
          <div class="k-label">// capabilities</div>
          <h2 class="mt-[12px] text-[clamp(30px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-.02em]">
            <span class="mono font-medium text-primary">kawaii(</span>enterprise, scale<span class="mono font-medium text-primary">)</span>
          </h2>
          <p class="mt-[18px] max-w-[56ch] text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-base-content/60">
            We work where quality has to survive scale, stakeholder scrutiny, and real operational complexity.
          </p>
        </div>
        <div class="reveal mt-[14px] grid gap-px overflow-hidden rounded-[var(--radius-box)] border border-base-300 bg-base-300 md:grid-cols-2 lg:grid-cols-3">
          <article v-for="c in capabilities" :key="c.num" class="group relative flex min-h-[156px] flex-col overflow-hidden bg-base-100 p-[clamp(22px,2.4vw,32px)] transition-colors hover:bg-base-200">
            <span class="absolute left-0 right-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" style="background: var(--grad)"></span>
            <span class="mono absolute right-[clamp(22px,2.4vw,32px)] top-[clamp(22px,2.4vw,32px)] text-[11px] text-base-content/40">{{ c.num }}</span>
            <h3 class="mb-[10px] text-[19px] font-bold">{{ c.title }}</h3>
            <div class="mb-[16px] flex flex-wrap gap-x-[12px] gap-y-[6px]">
              <span v-for="tag in c.tags" :key="tag" class="k-tag">{{ tag }}</span>
            </div>
            <p class="mt-auto text-[14.5px] leading-[1.55] text-base-content/60 [text-wrap:pretty]">{{ c.body }}</p>
          </article>
        </div>
      </div>
    </section>

    <div class="mx-auto w-full max-w-[1240px] px-[var(--pad)]"><div class="h-px bg-base-300"></div></div>

    <!-- ============================ PROCESS ============================ -->
    <section id="process" class="px-[var(--pad)] py-[clamp(72px,11vh,150px)]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="reveal">
          <div class="k-label">// process</div>
          <h2 class="mt-[12px] text-[clamp(30px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-.02em]">The process is the product.</h2>
          <p class="mt-[18px] max-w-[56ch] text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-base-content/60">We treat delivery as a system. Clarity in, quality out.</p>
        </div>
        <div class="reveal mt-[20px] border-t border-base-300">
          <div
            v-for="s in process"
            :key="s.n"
            class="grid grid-cols-[40px_1fr] items-baseline gap-[clamp(16px,3vw,48px)] border-b border-base-300 py-[clamp(22px,2.6vw,34px)] transition-colors hover:bg-base-200 sm:grid-cols-[54px_220px_1fr]"
          >
            <span class="mono text-[13px] text-base-content/40">{{ s.n }}</span>
            <span class="mono col-start-2 text-[clamp(17px,1.7vw,21px)] font-medium tracking-[-.01em] text-primary sm:col-start-auto">
              {{ s.sig }}<span class="text-base-content/40">{{ s.muted }}</span>
            </span>
            <div class="col-start-2 sm:col-start-auto">
              <h3 class="mb-[8px] text-[19px] font-bold">{{ s.title }}</h3>
              <p class="max-w-[60ch] text-[15px] leading-[1.55] text-base-content/60 [text-wrap:pretty]">{{ s.body }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ TESTIMONIAL ============================ -->
    <section id="voices" class="px-[var(--pad)] pt-[clamp(72px,11vh,150px)]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="reveal relative overflow-hidden rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-[clamp(34px,5.5vw,78px)] shadow-[var(--shadow)]">
          <span class="k-grad-text pointer-events-none absolute left-[clamp(20px,3vw,46px)] top-[clamp(-30px,-2vw,-10px)] select-none text-[clamp(120px,16vw,220px)] font-extrabold leading-none opacity-20">“</span>
          <blockquote class="relative max-w-[26ch] text-[clamp(21px,2.7vw,34px)] font-bold leading-[1.3] tracking-[-.018em] [text-wrap:balance]">
            They shipped what we'd been quoted six months for in a fraction of the time — and the code was cleaner than anything our own team had written.
          </blockquote>
          <div class="relative mt-[30px] flex items-center gap-[14px]">
            <div class="mono grid h-[44px] w-[44px] flex-none place-items-center rounded-full border border-base-300 bg-base-200 text-[13px] text-base-content/40">★</div>
            <div>
              <div class="text-[15px] font-bold">Placeholder Client</div>
              <div class="mono mt-[2px] text-[12px] text-base-content/40">VP Engineering · enterprise SaaS</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ PROOF ============================ -->
    <section id="proof" class="px-[var(--pad)] py-[clamp(72px,11vh,150px)]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="k-grad-panel reveal rounded-[var(--radius-box)] p-[clamp(40px,6vw,80px)] text-white shadow-[var(--shadow-lg)]">
          <div class="k-label" style="color: rgba(255,255,255,.7)">// proof</div>
          <h2 class="mt-[12px] text-[clamp(30px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-.02em] text-white">Equations don't lie.</h2>
          <div class="mt-[48px] grid grid-cols-2 gap-[clamp(20px,3vw,40px)] lg:grid-cols-4">
            <div v-for="st in proofStats" :key="st.k">
              <div class="text-[clamp(40px,5vw,68px)] font-extrabold leading-none tracking-[-.02em] text-white">{{ st.v }}</div>
              <div class="mono mt-[12px] text-[12.5px]" style="color: rgba(255,255,255,.78)">{{ st.k }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ CONTACT ============================ -->
    <section id="contact" class="px-[var(--pad)] py-[clamp(72px,11vh,150px)]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="reveal">
          <div class="k-label">// contact</div>
          <h2 class="mt-[12px] text-[clamp(30px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-.02em]">You have a complex problem.<br />We have the function.</h2>
          <p class="mt-[18px] max-w-[56ch] text-[clamp(17px,1.5vw,21px)] leading-[1.55] text-base-content/60">
            Tell us about the project. We'll respond within 24 hours — whichever time zone you're writing from.
          </p>
        </div>
        <div class="reveal mt-[30px] grid gap-[clamp(32px,5vw,72px)] md:grid-cols-[1.1fr_.9fr]">
          <form @submit.prevent="onSubmit">
            <label class="mono mb-[8px] block text-[12px] text-base-content/40">Name</label>
            <input v-model="formName" class="input input-bordered mb-[20px] w-full" type="text" required placeholder="Your name" />

            <label class="mono mb-[8px] block text-[12px] text-base-content/40">Email</label>
            <input class="input input-bordered mb-[20px] w-full" type="email" required placeholder="you@company.com" />

            <label class="mono mb-[8px] block text-[12px] text-base-content/40">Company</label>
            <input class="input input-bordered mb-[20px] w-full" type="text" placeholder="Company (optional)" />

            <label class="mono mb-[8px] block text-[12px] text-base-content/40">Indicative budget</label>
            <div class="mb-[20px] flex flex-wrap gap-[8px]">
              <button
                v-for="b in budgets"
                :key="b"
                type="button"
                class="mono rounded-full border px-[14px] py-[9px] text-[13px] transition"
                :class="budget === b
                  ? 'border-primary bg-primary text-primary-content'
                  : 'border-base-300 text-base-content/60 hover:border-base-content/40'"
                @click="budget = b"
              >{{ b }}</button>
            </div>

            <label class="mono mb-[8px] block text-[12px] text-base-content/40">Project brief</label>
            <textarea class="textarea textarea-bordered mb-[20px] min-h-[110px] w-full" placeholder="What are you trying to build? What does success look like?"></textarea>

            <button type="submit" class="k-cta">
              {{ sent ? "kawaii(sent ✓)" : "kawaii(send)" }} <span v-if="!sent" class="arr">→</span>
            </button>
          </form>

          <aside class="flex flex-col gap-[22px]">
            <div>
              <h4 class="mono mb-[14px] text-[12px] font-medium text-base-content/40">// current office time</h4>
              <div class="flex flex-col gap-[11px]">
                <div v-for="hub in HUBS" :key="hub.tz" class="flex items-baseline justify-between">
                  <div class="text-[14px] font-semibold">
                    {{ hub.city }}<small class="mono ml-[6px] text-[11px] font-normal text-base-content/40">{{ hub.zone.split(" · ")[0] }}</small>
                  </div>
                  <div class="mono text-[14px] tabular-nums text-base-content/60">{{ now[hub.tz].hms }}</div>
                </div>
              </div>
            </div>
            <div class="border-t border-base-300 pt-[20px]">
              <h4 class="mono mb-[14px] text-[12px] font-medium text-base-content/40">// direct line</h4>
              <a href="mailto:hello@kawaii.software" class="mono text-[16px] text-primary">hello@kawaii.software</a>
              <p class="mt-[8px] text-[14px] text-base-content/60">Usually answers within one global work cycle.</p>
            </div>
            <div class="border-t border-base-300 pt-[20px]">
              <h4 class="mono mb-[14px] text-[12px] font-medium text-base-content/40">// based in</h4>
              <p class="text-[14px] leading-[1.7] text-base-content/60">
                Tokyo, Japan · Perth, Australia<br />Palermo, Italy · San Francisco, USA<br />
                <span class="text-base-content/40">Global assistance, four aligned time horizons.</span>
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <!-- ============================ FOOTER ============================ -->
    <footer class="border-t border-base-300 px-[var(--pad)] py-[52px]">
      <div class="mx-auto w-full max-w-[1240px]">
        <div class="flex flex-wrap items-start justify-between gap-[30px]">
          <div>
            <a href="#hero" class="mono inline-flex items-baseline text-[18px] font-bold tracking-tight">kawaii<span class="text-primary">(x,y)</span></a>
            <p class="mt-[8px] text-[15px] text-base-content/60">Cute software that works.</p>
            <p class="mono mt-[16px] text-[12px] text-base-content/40">// built with kaizen, shipped with amore</p>
          </div>
          <div class="mono flex gap-[22px] text-[13px]">
            <a class="text-base-content/60 transition hover:text-primary" href="#">Privacy</a>
            <a class="text-base-content/60 transition hover:text-primary" href="#">Cookies</a>
            <a class="text-base-content/60 transition hover:text-primary" href="#">LinkedIn</a>
            <a class="text-base-content/60 transition hover:text-primary" href="#">GitHub</a>
          </div>
        </div>
        <p class="mono mt-[40px] text-[11.5px] text-base-content/40">kawaii(x,y) © 2026 — Tokyo · Perth · Palermo · San Francisco</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useHead } from "@hushkey/howl-vue/head";
import type { VuePageProps } from "@hushkey/howl-vue";
import type { State } from "@howl/config";
import { type Hub, HUBS, OFFICE_END, OFFICE_START } from "../data/hubs.ts";

defineProps<VuePageProps<unknown, State>>();

useHead({
  title: "kawaii(x,y) — Cute software that works.",
  meta: [
    {
      name: "description",
      content:
        "A boutique software house blending Japanese craft, Italian aesthetics, and Australian engineering into enterprise-grade software. Four cities, one function, 24h coverage.",
    },
  ],
});

/* ---- static section content ---- */
const philosophy = [
  {
    kicker: "// japanese spirit",
    title: "Shokunin",
    body:
      "The Japanese artisan does not stop at working. They stop at right. Each line is deliberate, each architecture choice intentional.",
    tags: ["kaizen", "ikigai", "shokunin"],
  },
  {
    kicker: "// italian design",
    title: "Form is substance",
    body:
      "Italian aesthetics aren't decoration — they're strategy. Clean interfaces lower cognitive load, speed adoption, and communicate trust before the first click.",
    tags: ["ux", "typography", "craftsmanship"],
  },
  {
    kicker: "// australian engineering",
    title: "Pragmatic by design",
    body:
      "No over-engineering, no architecture theatre. We build systems that scale when needed, stay observable under pressure, and ship without drama.",
    tags: ["scalability", "devops", "reliability"],
  },
];

const why = [
  {
    n: "01",
    kicker: "continuous delivery",
    title: "Your roadmap never sleeps.",
    body:
      "Four time zones hand off in sequence, so progress continues around the clock — briefs written in the morning become reviewable builds by the next. No overnight idle, no waiting for one office to wake up.",
  },
  {
    n: "02",
    kicker: "senior-only teams",
    title: "People who've shipped at scale.",
    body:
      "You work directly with the engineers and designers doing the work — no juniors learning on your budget, no layers of account management between you and the decisions that matter.",
  },
  {
    n: "03",
    kicker: "design + engineering",
    title: "One function, not two vendors.",
    body:
      "Interface craft and systems engineering live under the same roof. Fewer handoffs, fewer translation losses — what gets designed is what gets shipped, fast.",
  },
  {
    n: "04",
    kicker: "enterprise-grade",
    title: "Reliable under real pressure.",
    body:
      "Security, observability, and governance are part of the foundation, not bolted on before launch. Built for scale, stakeholder scrutiny, and operational complexity from commit one.",
  },
];

const capabilities = [
  { num: "01", title: "Cloud Architectures", tags: ["aws", "gcp", "multi-region"], body: "Infrastructure shaped for resilience, cost clarity, and enterprise governance." },
  { num: "02", title: "Backend Systems", tags: ["apis", "real-time", "pipelines"], body: "Reliable services for data-intensive, mission-critical products." },
  { num: "03", title: "Frontend Enterprise", tags: ["next.js", "design-systems", "performance"], body: "Interfaces that feel refined under scrutiny and stay fast under load." },
  { num: "04", title: "Mobile", tags: ["react-native", "native", "offline-first"], body: "Mobile products engineered for continuity, not just app-store presence." },
  { num: "05", title: "AI Integration", tags: ["llms", "rag", "automation"], body: "Useful AI embedded into workflows with measurable operational value." },
  { num: "06", title: "DevOps & Security", tags: ["ci/cd", "observability", "hardening"], body: "Delivery pipelines and infrastructure ready for serious environments." },
];

const process = [
  { n: "01", sig: "brief", muted: "(x)", title: "Listen first", body: "We listen before proposing. A half-defined problem usually becomes a half-successful project." },
  { n: "02", sig: "architect", muted: "(x, y)", title: "Sketch the solution", body: "We design before touching code. Every decision has a reason and an honest trade-off." },
  { n: "03", sig: "build", muted: "(...hubs)", title: "Stay in sync", body: "Tokyo, Perth, Palermo, and San Francisco stay aligned so no feature disappears into silence." },
  { n: "04", sig: "assert", muted: "(quality)", title: "Review across teams", body: "Cross-team reviews, testing discipline, and performance budgets before anything ships." },
  { n: "05", sig: "loop", muted: "()", title: "Deploy & iterate", body: "Launch is not the finish line. It's the first measured iteration of continuous improvement." },
];

const proofStats = [
  { v: "24h", k: "daily coverage" },
  { v: "4", k: "cities, one cadence" },
  { v: "0", k: "missed deadlines, so far" },
  { v: "∞", k: "possible iterations" },
];

/* ---- live clocks (filled on the client; SSR shows placeholders) ---- */
const now = reactive<Record<string, { hm: string; hms: string; open: boolean }>>({});
for (const hub of HUBS) now[hub.tz] = { hm: "--:--", hms: "--:--:--", open: false };

function partsFor(tz: string): Record<string, string> {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date())) if (p.type !== "literal") o[p.type] = p.value;
  return o;
}
function tick() {
  for (const hub of HUBS) {
    const p = partsFor(hub.tz);
    const h = Number(p.hour);
    now[hub.tz] = {
      hm: `${p.hour}:${p.minute}`,
      hms: `${p.hour}:${p.minute}:${p.second}`,
      open: h >= OFFICE_START && h < OFFICE_END,
    };
  }
}

/* ---- timeline animation ---- */
const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const sweepHour = ref(0);
const sweepLeft = computed(() => pct(sweepHour.value));

function pct(h: number): string {
  return `${(h / 24) * 100}%`;
}
function pad(h: number): string {
  return String(h).padStart(2, "0");
}
function bandOn(a: number, b: number): boolean {
  return sweepHour.value >= a && sweepHour.value < b;
}
function laneOn(hub: Hub): boolean {
  return hub.bands.some(([a, b]) => bandOn(a, b));
}
const activeCities = computed(() => HUBS.filter(laneOn).map((h) => h.city));
const nowLabel = computed(() => {
  const hh = Math.floor(sweepHour.value);
  const mm = Math.floor((sweepHour.value - hh) * 60);
  const stamp = `${pad(hh)}:${pad(mm)} UTC`;
  const a = activeCities.value;
  if (a.length === 0) return stamp;
  return `${stamp} · <b class="font-medium text-primary">${a.length === 1 ? a[0] : a.length + " hubs"}</b> active`;
});

/* ---- theme toggle (writes a cookie so the server paints it next load) ---- */
function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("kawaii-theme", next);
  } catch { /* ignore */ }
  document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
}

/* ---- contact form ---- */
const budgets = ["<50k", "50k–200k", "200k+", "to be defined"];
const budget = ref(budgets[0]);
const formName = ref("");
const sent = ref(false);
function onSubmit() {
  sent.value = true;
  setTimeout(() => (sent.value = false), 2200);
}

/* ---- lifecycle (client only) ---- */
let clockTimer: ReturnType<typeof setInterval> | undefined;
let raf = 0;
let observer: IntersectionObserver | undefined;
const root = ref<HTMLElement | null>(null);

onMounted(() => {
  // Reconcile persisted theme with what the server painted: the cookie is the
  // source of truth, but if localStorage drifted (e.g. cookie cleared), re-sync.
  try {
    const saved = localStorage.getItem("kawaii-theme");
    const current = document.documentElement.getAttribute("data-theme");
    if (saved && saved !== current) {
      document.documentElement.setAttribute("data-theme", saved);
      document.cookie = `theme=${saved}; path=/; max-age=31536000; samesite=lax`;
    }
  } catch { /* ignore */ }

  tick();
  clockTimer = setInterval(tick, 1000);

  const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const LOOP = 22000;
  let startTs: number | null = null;
  const frame = (ts: number) => {
    if (startTs === null) startTs = ts;
    let f = ((ts - startTs) % LOOP) / LOOP;
    if (reduce) {
      const p = partsFor("UTC");
      f = (Number(p.hour) + Number(p.minute) / 60) / 24;
    }
    sweepHour.value = f * 24;
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const els = root.value?.querySelectorAll<HTMLElement>(".reveal") ?? [];
  if (!("IntersectionObserver" in globalThis)) {
    els.forEach((e) => e.classList.add("in"));
  } else {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            observer!.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e, i) => {
      e.style.transitionDelay = `${Math.min(i % 6, 5) * 55}ms`;
      observer!.observe(e);
    });
  }
});

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
  if (raf) cancelAnimationFrame(raf);
  observer?.disconnect();
});
</script>

<!-- page-local, intentionally NOT scoped: the theme icon swap keys off the
     `data-theme` attribute on <html>, which lives outside this component. -->
<style>
.i-moon {
  display: none;
}
[data-theme="dark"] .i-sun {
  display: none;
}
[data-theme="dark"] .i-moon {
  display: inline;
}
</style>
