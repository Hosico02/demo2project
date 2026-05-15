<template>
  <div class="app-shell" :style="cursorStyle">
    <div v-if="page === 'home'" class="cursor-capture" aria-hidden="true"></div>
    <div v-if="page === 'home'" class="cursor-core" aria-hidden="true"></div>

    <header class="topbar">
      <button class="brand" type="button" @click="navigate('home')" aria-label="MatrixOmnix home">
        MatrixOmnix
      </button>
      <nav class="nav" aria-label="Primary navigation">
        <button v-for="item in navItems" :key="item.id" type="button" :aria-current="page === item.id ? 'page' : undefined" @click="navigate(item.id)">
          {{ item.label }}
        </button>
      </nav>
    </header>

    <main class="page">
      <template v-if="page === 'home'">
        <section class="hero" id="home">
          <div class="hero-center">
            <div ref="titleStackRef" class="title-stack">
              <div class="title-layer title-layer--en">
                <h1 class="hero-title hero-title--en">
                  <span class="hero-title__intro">HELLO I'M</span>
                  <span class="hero-title__name">MatrixOmnix</span>
                </h1>
              </div>
              <div class="title-layer title-layer--cn">
                <img class="hero-icon" src="./assets/matrixomnix_icon.svg" alt="MatrixOmnix icon - 全域智能矩阵" />
              </div>
            </div>

            <p class="subcopy">
              MatrixOmnix is currently in beta: a multi-agent harness for turning rough demos into verified product baselines, with market-aware gates and premise-preserving agent workflows.
            </p>
          </div>
        </section>

        <section class="panel-grid" aria-label="MatrixOmnix capability panels">
          <FlipPanel id="intake" title="Intake" :active="flippedPanels.has('intake')" @open="flipOn" @close="flipOff">
            Point MatrixOmnix at a local demo repository to detect runtime, entrypoints, project surfaces and immediate product gaps.
          </FlipPanel>
          <FlipPanel id="verify" title="Verify" :active="flippedPanels.has('verify')" @open="flipOn" @close="flipOff">
            Analyzer, Planner, Executor, Verifier, Reviewer and QA Memory require evidence before claiming progress.
          </FlipPanel>
          <FlipPanel id="operate" title="Operate" :active="flippedPanels.has('operate')" @open="flipOn" @close="flipOff">
            Use the CLI to run controlled iterations, inspect evidence, replay QA regressions and decide when a demo is product-ready.
          </FlipPanel>
        </section>
      </template>

      <section v-else-if="page === 'about'" class="content-page about-page" id="about">
        <PageHeading kicker="About" title="MatrixOmnix is a demo-to-product operating system.">
          MatrixOmnix exists because a demo can look impressive while still missing the systems that make it usable, testable, deployable and maintainable. The project is currently a beta local-first multi-agent harness. Its long-term direction is a managed productization platform with auditable workspaces, market-aware gates, premise-preserving domain models and repeatable long-horizon runs.
        </PageHeading>

        <div class="image-grid" aria-label="MatrixOmnix framework diagrams">
          <figure>
            <img src="./assets/framework-loop.svg" alt="MatrixOmnix multi-agent loop from intake through analyzer, planner, executor, verifier, reviewer and QA memory." />
            <figcaption>Multi-agent productization loop</figcaption>
          </figure>
          <figure>
            <img src="./assets/harness-map.svg" alt="MatrixOmnix harness map covering UI, CLI, API, config, data and worker contracts." />
            <figcaption>Harness coverage map</figcaption>
          </figure>
          <figure>
            <img src="./assets/deployment-flow.svg" alt="MatrixOmnix beta roadmap from local CLI usage to managed workspaces and hosted orchestration." />
            <figcaption>Beta-to-hosted roadmap</figcaption>
          </figure>
        </div>

        <section class="about-narrative" aria-label="MatrixOmnix overview">
          <article>
            <h2>Why it exists</h2>
            <p>
              Coding agents are already strong at producing code, but demo-to-product work fails when there is no independent system asking whether the result has tests, contracts, configuration, runtime controls, documentation, UX checks, release evidence and regression memory. MatrixOmnix sits above coding agents and turns those expectations into a supervised loop.
            </p>
          </article>
          <article>
            <h2>What it is today</h2>
            <p>
              The beta runs locally against a repository you control. It analyzes project structure, detects delivery surfaces, researches market expectations when explicitly allowed, plans verified task batches, runs provider-backed executors, repairs failed verification first and stores evidence under <code>.demo2project</code>. It now distinguishes agent-facing simulation products from human multiplayer products, so a multi-agent werewolf theater is evaluated against model configuration, rules, replay, evaluation and observability rather than being forced into an account-and-matchmaking roadmap.
            </p>
          </article>
          <article>
            <h2>What we do not claim yet</h2>
            <p>
              MatrixOmnix is not yet a hosted upload-and-return service, and a high internal score must not replace human review. The current priority is making the scoring stricter and faster: source-cited market research must produce real capabilities, provider output must be parseable, every product-ready claim must survive tests, builds and gap gates, and mechanical closeout work should not burn model time.
            </p>
          </article>
          <article>
            <h2>Where it is going</h2>
            <p>
              The roadmap moves toward managed workspaces, queued long-running sessions, safer provider sandboxes, richer UI/browser verification, domain-specific product gates, team dashboards and report artifacts that explain exactly what changed, what passed, what failed and what still blocks a mature product release.
            </p>
          </article>
        </section>

        <section class="text-grid" aria-label="Current and future state">
          <article>
            <h2>Current state</h2>
            <p>
              MatrixOmnix can already lift rough repositories into stronger engineering baselines by adding tests, runtime contracts, configuration checks, documentation, deployment hooks, UI harnesses and QA regression memory. The latest live MiniMax-M2.7-highspeed run on a restored agent-facing werewolf demo reached a 97/100 production-ready baseline with zero open findings and 33 passing pytest cases in three iterations, with no repair task. The built-in stress suite also reaches product-ready on 12/12 demo fixtures across UI, API, CLI, LLM chat, game, WebGL/3D, ML inference, media pipeline, browser extension, notebook, mobile and desktop surfaces.
            </p>
          </article>
          <article>
            <h2>Future state</h2>
            <p>
              The mature product should compare a demo against real market expectations, run for hours without losing discipline, explain every gate in plain language and let teams decide whether to continue iterating, ship an internal baseline or block release until remaining product gaps are closed. Hosted upload, workspace isolation, queues and product ZIP return remain future service work, not current beta claims.
            </p>
          </article>
        </section>

        <a class="repo-link" href="https://github.com/Hosico02/demo2project" target="_blank" rel="noreferrer">
          Open source repository: github.com/Hosico02/demo2project
        </a>
      </section>

      <section v-else-if="page === 'service'" class="content-page service-page" id="service">
        <PageHeading kicker="Service" title="How to use MatrixOmnix beta.">
          MatrixOmnix is not a hosted file-processing service yet. Use the beta locally from the CLI, review every verification report, and keep productization changes under source control.
        </PageHeading>

        <section class="service-layout" data-service-guide>
          <article class="usage-card">
            <h2>Beta workflow</h2>
            <p>
              Install the repo, point MatrixOmnix at a demo project, run analysis and gap checks, then let controlled iterations make scoped improvements with verification evidence. For LLM or agent demos, enable web research and advisory agents so MatrixOmnix can classify the product premise, compare source-cited market expectations and avoid forcing unrelated features into the project.
            </p>
            <code>pnpm install && pnpm build</code>
            <code>pnpm matrixomnix doctor</code>
            <code>pnpm matrixomnix analyze --project ./demo</code>
          </article>

          <ol class="usage-steps">
            <li><strong>Analyze</strong><span>Detect runtime, dependencies, entrypoints, UI/API/CLI/data/worker surfaces, secrets risk and missing project contracts.</span></li>
            <li><strong>Plan</strong><span>Convert gaps into scoped work with acceptance checks, fallback paths and evidence requirements; broad deterministic backlogs can be batched more aggressively.</span></li>
            <li><strong>Iterate</strong><span>Run one or more controlled executor rounds, then inspect generated reports before trusting the result.</span></li>
            <li><strong>Verify</strong><span>Run <code>matrixomnix gap --project ./demo</code>; by default it executes detected tests/builds and caps the score when evidence is red.</span></li>
          </ol>
        </section>

        <code class="command-strip">matrixomnix iterate --project ./demo --provider minimax --web --advisory-agents --max-iterations 4</code>
      </section>

      <section v-else class="content-page contact-page" id="contact">
        <PageHeading kicker="Contact" title="Bring a rough demo. Leave with a product baseline.">
          Use GitHub for issues, roadmap discussion and deployment feedback while the hosted MatrixOmnix service is being prepared.
        </PageHeading>

        <div class="contact-grid">
          <a href="https://github.com/Hosico02/demo2project" target="_blank" rel="noreferrer">
            <span>Repository</span>
            <strong>github.com/Hosico02/demo2project</strong>
          </a>
          <a href="https://github.com/Hosico02" target="_blank" rel="noreferrer">
            <span>Owner</span>
            <strong>github.com/Hosico02</strong>
          </a>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue'

const navItems = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'service', label: 'Service' },
  { id: 'contact', label: 'Contact' },
]

const routeFromPath = () => {
  const slug = window.location.pathname.split('/').filter(Boolean).pop()
  return navItems.some((item) => item.id === slug) ? slug : 'home'
}

const page = ref(routeFromPath())
const cursorX = ref(window.innerWidth / 2)
const cursorY = ref(window.innerHeight / 2)
const maskX = ref(window.innerWidth / 2)
const maskY = ref(window.innerHeight / 2)
const titleStackRef = ref(null)
const flippedPanels = ref(new Set())

const cursorStyle = computed(() => ({
  '--cursor-x': `${cursorX.value}px`,
  '--cursor-y': `${cursorY.value}px`,
  '--mask-x': `${maskX.value}px`,
  '--mask-y': `${maskY.value}px`,
}))

const navigate = (id) => {
  page.value = id
  const path = id === 'home' ? '/' : `/${id}`
  window.history.pushState({ page: id }, '', path)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const flipOn = (id) => {
  const next = new Set(flippedPanels.value)
  next.add(id)
  flippedPanels.value = next
}

const flipOff = (id) => {
  const next = new Set(flippedPanels.value)
  next.delete(id)
  flippedPanels.value = next
}

let cleanup = () => {}

onMounted(() => {
  let frame = 0
  let latestPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 }

  const update = (clientX, clientY) => {
    cursorX.value = clientX
    cursorY.value = clientY
    const rect = titleStackRef.value?.getBoundingClientRect()
    if (rect) {
      maskX.value = clientX - rect.left
      maskY.value = clientY - rect.top
    }
  }

  const scheduleUpdate = (clientX, clientY) => {
    latestPoint = { x: clientX, y: clientY }
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      update(latestPoint.x, latestPoint.y)
    })
  }

  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse' || page.value !== 'home') return
    scheduleUpdate(event.clientX, event.clientY)
  }

  const onPopState = () => {
    page.value = routeFromPath()
  }

  document.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('popstate', onPopState)

  cleanup = () => {
    if (frame) window.cancelAnimationFrame(frame)
    document.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('popstate', onPopState)
  }
})

onBeforeUnmount(() => cleanup())

const PageHeading = defineComponent({
  props: {
    kicker: { type: String, required: true },
    title: { type: String, required: true },
  },
  setup(props, { slots }) {
    return () => h('section', { class: 'page-heading' }, [
      h('p', { class: 'section-kicker' }, props.kicker),
      h('h1', props.title),
      h('p', slots.default?.()),
    ])
  },
})

const FlipPanel = defineComponent({
  props: {
    id: { type: String, required: true },
    title: { type: String, required: true },
    active: { type: Boolean, required: true },
  },
  emits: ['open', 'close'],
  setup(props, { emit, slots }) {
    const toggle = () => {
      emit(props.active ? 'close' : 'open', props.id)
    }
    const open = () => emit('open', props.id)
    const close = () => emit('close', props.id)
    return () => h('section', {
      class: ['panel', 'flip-panel', props.active ? 'flipped' : ''],
      tabindex: '0',
      role: 'button',
      'aria-label': `Show ${props.title} details`,
      onPointerenter: open,
      onPointerleave: close,
      onFocus: open,
      onBlur: close,
      onTouchstart: open,
      onKeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggle()
        }
        if (event.key === 'Escape') close()
      },
    }, [
      h('div', { class: 'flip-card-inner' }, [
        h('div', { class: 'flip-card-front' }, [h('h2', props.title)]),
        h('div', { class: 'flip-card-back' }, [h('h2', props.title), h('p', slots.default?.())]),
        h('div', { class: 'wipe-line', 'aria-hidden': 'true' }),
      ]),
    ])
  },
})
</script>
