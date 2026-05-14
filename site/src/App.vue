<template>
  <div class="app-shell" :style="cursorStyle">
    <div class="cursor-capture" aria-hidden="true"></div>
    <div class="cursor-core" aria-hidden="true"></div>

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
      <section v-if="page === 'home'" class="hero" id="home">
        <div ref="titleStackRef" class="title-stack">
          <div class="title-layer title-layer--en">
            <h1 class="hero-title hero-title--en">
              <span class="hero-title__intro">HELLO I'M</span>
              <span class="hero-title__name">MatrixOmnix</span>
            </h1>
          </div>
          <div class="title-layer title-layer--cn">
            <h1 class="hero-title hero-title--cn">
              <span class="hero-title__intro">你好，我是</span>
              <span class="hero-title__name hero-title__name--cn">全域智能矩阵</span>
            </h1>
          </div>
        </div>

        <p class="subcopy">
          A production-grade multi-agent harness that turns raw demo archives into verified product zip artifacts.
        </p>

        <section class="panel-grid" aria-label="MatrixOmnix capability panels">
          <FlipPanel id="intake" title="Intake" :active="flippedPanels.has('intake')" @open="flipOn" @close="flipOff">
            Single files, zip archives and rough repositories are normalized into a safe productization workspace.
          </FlipPanel>
          <FlipPanel id="verify" title="Verify" :active="flippedPanels.has('verify')" @open="flipOn" @close="flipOff">
            Analyzer, Planner, Executor, Verifier, Reviewer and QA Memory require evidence before claiming progress.
          </FlipPanel>
          <FlipPanel id="ship" title="Ship" :active="flippedPanels.has('ship')" @open="flipOn" @close="flipOff">
            The service returns a productized zip with source, tests, docs, reports and reproducible harness scripts.
          </FlipPanel>
        </section>
      </section>

      <section v-else-if="page === 'about'" class="content-page about-page" id="about">
        <PageHeading kicker="About" title="MatrixOmnix is a demo-to-product operating system.">
          Today it is a production-grade multi-agent harness for productizing demos. Next it becomes a hosted service where users upload a demo archive and receive a product zip with verification evidence.
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
            <img src="./assets/deployment-flow.svg" alt="Deployment flow from uploaded demo archive to Supabase storage, MatrixOmnix worker and returned product zip." />
            <figcaption>Hosted service flow</figcaption>
          </figure>
        </div>

        <section class="text-grid" aria-label="Current and future state">
          <article>
            <h2>Current</h2>
            <p>
              MatrixOmnix scores projects, finds gaps, plans verifiable tasks, executes via providers such as MiniMax, repairs failed verification and stores QA regressions across iterations.
            </p>
          </article>
          <article>
            <h2>Future</h2>
            <p>
              The hosted MatrixOmnix service will accept demo archives, isolate execution, run long-horizon productization, package the final result as zip and expose traceable reports.
            </p>
          </article>
        </section>

        <a class="repo-link" href="https://github.com/Hosico02/demo2project" target="_blank" rel="noreferrer">
          Open source repository: github.com/Hosico02/demo2project
        </a>
      </section>

      <section v-else-if="page === 'service'" class="content-page service-page" id="service">
        <PageHeading kicker="Service" title="Upload a demo. Receive a product zip.">
          MatrixOmnix accepts compressed demo projects, runs the productization harness, then returns one normalized zip artifact for broad compatibility.
        </PageHeading>

        <section class="service-layout">
          <form class="upload-panel" data-upload-form data-return-format="zip" @submit.prevent="prepareUpload">
            <label for="demo-archive">Demo archive</label>
            <input
              id="demo-archive"
              ref="fileInputRef"
              name="demo-archive"
              type="file"
              data-demo-upload
              accept=".zip,.7z,.rar,.tar,.tar.gz,.tgz,application/zip,application/x-7z-compressed,application/x-rar-compressed,application/gzip"
              @change="updateUploadStatus"
            />
            <div class="upload-meta">
              <span>Input: zip, 7z, rar, tar, tar.gz, tgz</span>
              <span>Output: zip</span>
            </div>
            <button type="submit">Prepare Productization</button>
            <p class="upload-status" :data-state="uploadReady ? 'ready' : 'idle'" role="status" aria-live="polite">
              {{ uploadStatus }}
            </p>
          </form>

          <ol class="usage-steps">
            <li><strong>Intake</strong><span>Detect entrypoints, runtime, dependencies, secrets, UI/API/CLI/data/worker surfaces and archive safety.</span></li>
            <li><strong>Iterate</strong><span>Run analyzer, planner, executor, verifier, reviewer and QA memory until product gates are satisfied.</span></li>
            <li><strong>Return</strong><span>Package product source, tests, docs, reports and evidence into one zip artifact.</span></li>
          </ol>
        </section>

        <code class="command-strip">matrixomnix long-run --project ./demo --provider minimax-m27 --hours 10 --in-place</code>
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
const fileInputRef = ref(null)
const flippedPanels = ref(new Set())
const uploadStatus = ref('No archive selected.')
const uploadReady = ref(false)

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

const archiveExtension = (fileName) => {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.tar.gz')) return 'tar.gz'
  return lower.split('.').pop() || ''
}

const validateArchive = (file) => {
  const allowed = ['zip', '7z', 'rar', 'tar', 'tar.gz', 'tgz']
  if (!file) return { ok: false, message: 'No archive selected.' }
  const ext = archiveExtension(file.name)
  if (!allowed.includes(ext)) {
    return { ok: false, message: 'Unsupported archive. Upload zip, 7z, rar, tar, tar.gz or tgz.' }
  }
  if (file.size > 512 * 1024 * 1024) {
    return { ok: false, message: 'Archive is larger than the 512 MB service limit.' }
  }
  return { ok: true, message: `${file.name} is ready. MatrixOmnix will return a product zip artifact.` }
}

const updateUploadStatus = () => {
  const result = validateArchive(fileInputRef.value?.files?.[0])
  uploadReady.value = result.ok
  uploadStatus.value = result.message
}

const prepareUpload = () => {
  updateUploadStatus()
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
    if (event.pointerType !== 'mouse') return
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
