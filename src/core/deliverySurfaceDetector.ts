import type { ProjectSnapshot } from './types.js';

export type DeliverySurfaceId =
  | 'static_web'
  | 'spa_ui'
  | 'api'
  | 'cli'
  | 'config'
  | 'data'
  | 'worker'
  | 'browser_extension'
  | 'notebook'
  | 'mobile_app'
  | 'desktop_app'
  | 'game_demo'
  | 'three_d_scene'
  | 'ml_model'
  | 'media_pipeline'
  | 'llm_app'
  | 'library';

export interface DeliverySurface {
  id: DeliverySurfaceId;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  contract_hint: string;
}

export interface DeliverySurfaceInput {
  snapshot: ProjectSnapshot;
  files: string[];
  pkg?: {
    bin?: unknown;
    main?: string;
    module?: string;
    types?: string;
    exports?: unknown;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null;
  sourceText: string;
}

const SPECIALIZED_SURFACES: DeliverySurfaceId[] = [
  'browser_extension',
  'notebook',
  'mobile_app',
  'desktop_app',
  'game_demo',
  'three_d_scene',
  'ml_model',
  'media_pipeline',
];

export function detectDeliverySurfaces(input: DeliverySurfaceInput): DeliverySurface[] {
  const files = input.files;
  const fileSet = new Set(files);
  const deps = { ...(input.pkg?.dependencies ?? {}), ...(input.pkg?.devDependencies ?? {}) };
  const text = input.sourceText;
  const frameworks = input.snapshot.detected_frameworks;
  const surfaces: DeliverySurface[] = [];
  const add = (surface: DeliverySurface): void => {
    if (surfaces.some((existing) => existing.id === surface.id)) return;
    surfaces.push({ ...surface, evidence: unique(surface.evidence).slice(0, 8) });
  };

  if (
    fileSet.has('manifest.json') &&
    /"manifest_version"\s*:\s*[23]/.test(text)
  ) {
    add({
      id: 'browser_extension',
      label: 'Browser extension',
      confidence: 'high',
      evidence: ['manifest.json', ...files.filter((file) => /(^|\/)(popup|background|content)\.(html|js|ts)$/.test(file))],
      contract_hint: 'Validate manifest_version, popup/background/content entry evidence and browser permission surface.',
    });
  }

  const notebookFiles = files.filter((file) => file.endsWith('.ipynb'));
  if (notebookFiles.length > 0) {
    add({
      id: 'notebook',
      label: 'Notebook or data exploration',
      confidence: 'high',
      evidence: notebookFiles,
      contract_hint: 'Validate notebook files are parseable JSON and document the conversion path to repeatable scripts/tests.',
    });
  }

  if (
    ['expo', 'react-native', '@capacitor/core', 'cordova'].some((dep) => dep in deps) ||
    files.some((file) => /^(app\.json|app\.config\.(js|ts)|android\/|ios\/)/.test(file))
  ) {
    add({
      id: 'mobile_app',
      label: 'Mobile app',
      confidence: 'high',
      evidence: [
        ...Object.keys(deps).filter((dep) => ['expo', 'react-native', '@capacitor/core', 'cordova'].includes(dep)),
        ...files.filter((file) => /^(app\.json|app\.config\.(js|ts)|android\/|ios\/)/.test(file)),
      ],
      contract_hint: 'Validate platform config, start/build scripts and the mobile runtime boundary before productizing screens.',
    });
  }

  if (
    ['electron', '@tauri-apps/api', '@tauri-apps/cli'].some((dep) => dep in deps) ||
    files.some((file) => /^src-tauri\/|(^|\/)electron\.(js|mjs|cjs|ts)$/.test(file))
  ) {
    add({
      id: 'desktop_app',
      label: 'Desktop app',
      confidence: 'high',
      evidence: [
        ...Object.keys(deps).filter((dep) => ['electron', '@tauri-apps/api', '@tauri-apps/cli'].includes(dep)),
        ...files.filter((file) => /^src-tauri\/|(^|\/)electron\.(js|mjs|cjs|ts)$/.test(file)),
      ],
      contract_hint: 'Validate desktop shell entry, preload/security boundary and package scripts before UI expansion.',
    });
  }

  const gameDeps = ['phaser', 'pixi.js', 'kaboom', 'matter-js', 'melonjs', 'playcanvas'];
  const gameFiles = files.filter((file) => /(^|\/)(game|scene|level|player|sprite|world)\.(js|mjs|cjs|ts|tsx)$/.test(file));
  const hasGameDependency = gameDeps.some((dep) => dep in deps);
  const hasGameFrameworkSource = /\b(Phaser\.Game|PIXI\.Application|new\s+Kaboom|kaboom\(|Matter\.Engine)\b/.test(text);
  const hasGameLoopSource = /\b(gameLoop|requestAnimationFrame|getContext\(["']2d["']\))\b/.test(text);
  if (
    hasGameDependency ||
    hasGameFrameworkSource ||
    (gameFiles.length > 0 && hasGameLoopSource)
  ) {
    add({
      id: 'game_demo',
      label: 'Game or interactive simulation',
      confidence: hasGameDependency || hasGameFrameworkSource ? 'high' : 'medium',
      evidence: [
        ...Object.keys(deps).filter((dep) => gameDeps.includes(dep)),
        ...gameFiles,
        ...(hasGameFrameworkSource || hasGameLoopSource ? ['game runtime source evidence'] : []),
      ],
      contract_hint: 'Validate game loop/runtime entry, input controls, deterministic smoke path and asset references before adding content.',
    });
  }

  const threeDDeps = ['three', '@react-three/fiber', '@react-three/drei', 'babylonjs', '@babylonjs/core', 'aframe', 'playcanvas'];
  const threeDFiles = files.filter((file) => /(^|\/)(scene|renderer|canvas|world|model|viewer)\.(js|mjs|cjs|ts|tsx|vue|svelte)$/.test(file));
  if (
    threeDDeps.some((dep) => dep in deps) ||
    /\.(glb|gltf|fbx|obj|stl|hdr|exr)$/.test(files.join('\n')) ||
    /\b(THREE\.WebGLRenderer|new\s+THREE\.|WebGLRenderer|createScene|SceneLoader|Engine\(|getContext\(["']webgl2?["']\)|<a-scene\b)\b/i.test(text)
  ) {
    add({
      id: 'three_d_scene',
      label: '3D or WebGL scene',
      confidence: threeDDeps.some((dep) => dep in deps) ? 'high' : 'medium',
      evidence: [
        ...Object.keys(deps).filter((dep) => threeDDeps.includes(dep)),
        ...threeDFiles,
        ...files.filter((file) => /\.(glb|gltf|fbx|obj|stl|hdr|exr)$/.test(file)).slice(0, 6),
      ],
      contract_hint: 'Validate renderer/canvas entry, frame loop, asset loading and nonblank scene smoke checks before visual iteration.',
    });
  }

  const mlDeps = ['@tensorflow/tfjs', 'tensorflow', 'torch', 'onnxruntime-web', 'onnxruntime-node', '@xenova/transformers', '@huggingface/transformers', 'transformers', 'scikit-learn', 'ultralytics'];
  const modelFiles = files.filter((file) => /\.(onnx|pt|pth|tflite|pkl|joblib|safetensors)$/.test(file) || /(^|\/)model\.json$/.test(file));
  if (
    mlDeps.some((dep) => dep in deps) ||
    modelFiles.length > 0 ||
    /\b(InferenceSession\.create|model\.predict|pipeline\(|torch\.load|tf\.load(?:Layers)?Model|AutoModel|from_pretrained|predict_proba)\b/.test(text)
  ) {
    add({
      id: 'ml_model',
      label: 'ML model or inference demo',
      confidence: mlDeps.some((dep) => dep in deps) || modelFiles.length > 0 ? 'high' : 'medium',
      evidence: [
        ...Object.keys(deps).filter((dep) => mlDeps.includes(dep)),
        ...modelFiles.slice(0, 8),
      ],
      contract_hint: 'Validate model artifact/framework evidence, deterministic sample input, output schema and fallback/error behavior.',
    });
  }

  const mediaDeps = ['sharp', 'fluent-ffmpeg', 'ffmpeg', 'jimp', 'opencv-python', 'moviepy', 'librosa', 'canvas'];
  const mediaFiles = files.filter((file) => /^(media|audio|video|images|assets)\//.test(file) || /(^|\/)(process-media|resize|transcode|thumbnail|extract-audio)\.(js|mjs|cjs|ts|py)$/.test(file));
  if (
    mediaDeps.some((dep) => dep in deps) ||
    /(^|\/)(ffmpeg|ffprobe)$/.test(files.join('\n')) ||
    /\b(sharp\(|ffmpeg\(|MediaRecorder|getUserMedia|cv2\.|moviepy|librosa|Jimp\.read|createCanvas|toFile\(|resize\()\b/.test(text)
  ) {
    add({
      id: 'media_pipeline',
      label: 'Media processing pipeline',
      confidence: mediaDeps.some((dep) => dep in deps) ? 'high' : 'medium',
      evidence: [
        ...Object.keys(deps).filter((dep) => mediaDeps.includes(dep)),
        ...mediaFiles.slice(0, 8),
      ],
      contract_hint: 'Validate input/output formats, fixture processing, artifact paths and failure behavior before scaling the pipeline.',
    });
  }

  if (files.some((file) => /(^|\/)index\.html$/.test(file))) {
    add({
      id: 'static_web',
      label: 'Static web UI',
      confidence: frameworks.some((framework) => ['react', 'vue', 'next', 'svelte'].includes(framework)) ? 'medium' : 'high',
      evidence: files.filter((file) => /(^|\/)index\.html$/.test(file)).slice(0, 4),
      contract_hint: 'Validate render smoke, responsive behavior, accessibility basics and asset references.',
    });
  }

  if (
    frameworks.some((framework) => ['react', 'vue', 'next', 'svelte'].includes(framework)) ||
    ['react', 'vue', 'next', 'svelte'].some((dep) => dep in deps) ||
    files.some((file) => /^(src|app|pages|components)\/.*\.(tsx|jsx|vue|svelte)$/.test(file))
  ) {
    add({
      id: 'spa_ui',
      label: 'Framework web UI',
      confidence: 'high',
      evidence: [
        ...frameworks.filter((framework) => ['react', 'vue', 'next', 'svelte'].includes(framework)),
        ...Object.keys(deps).filter((dep) => ['react', 'vue', 'next', 'svelte'].includes(dep)),
      ],
      contract_hint: 'Validate build, browser render smoke, responsive states and interaction accessibility.',
    });
  }

  if (
    frameworks.some((framework) => ['express', 'fastify', 'nestjs', 'flask', 'fastapi', 'django', 'starlette'].includes(framework)) ||
    ['express', 'fastify', 'koa', 'hono', '@nestjs/core', 'flask', 'fastapi', 'django', 'starlette'].some((dep) => dep in deps) ||
    /@app\.(?:route|get|post|put|delete|patch)\(|FastAPI\s*\(|APIRouter\s*\(|express\s*\(|fastify\s*\(|new\s+Hono\s*\(|router\.(?:get|post|put|delete|patch)\(/.test(text)
  ) {
    add({
      id: 'api',
      label: 'HTTP API',
      confidence: 'high',
      evidence: [...frameworks, ...Object.keys(deps)].filter(Boolean),
      contract_hint: 'Validate route contract, health behavior, request/response examples and error semantics.',
    });
  }

  if (input.pkg?.bin || files.some((file) => /^bin\/.+\.(js|mjs|cjs|ts)$/.test(file) || /(^|\/)(cli|main)\.py$/.test(file))) {
    add({
      id: 'cli',
      label: 'Command line tool',
      confidence: input.pkg?.bin ? 'high' : 'medium',
      evidence: [
        ...(input.pkg?.bin ? ['package.json bin'] : []),
        ...files.filter((file) => /^bin\/.+\.(js|mjs|cjs|ts)$/.test(file) || /(^|\/)(cli|main)\.py$/.test(file)),
      ],
      contract_hint: 'Validate executable entry, --help behavior and deterministic exit codes.',
    });
  }

  if (detectEnvVars(text).length > 0) {
    add({
      id: 'config',
      label: 'Runtime configuration',
      confidence: 'high',
      evidence: detectEnvVars(text),
      contract_hint: 'Validate every required env var is documented and defaults are safe.',
    });
  }

  if (
    ['prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'sequelize', 'mongoose', 'knex', 'sqlalchemy', 'alembic'].some((dep) => dep in deps) ||
    files.some((file) => /^(migrations|prisma|db|database)\//.test(file) || /(^|\/)(schema\.prisma|models\.py|database\.py|db\.py)$/.test(file)) ||
    /\b(create_engine|declarative_base|mongoose\.connect|new\s+PrismaClient|drizzle\(|knex\(|sequelize\.define)\b/.test(text)
  ) {
    add({
      id: 'data',
      label: 'Data or persistence layer',
      confidence: 'high',
      evidence: [
        ...Object.keys(deps).filter((dep) => ['prisma', '@prisma/client', 'drizzle-orm', 'typeorm', 'sequelize', 'mongoose', 'knex', 'sqlalchemy', 'alembic'].includes(dep)),
        ...files.filter((file) => /^(migrations|prisma|db|database)\//.test(file) || /(^|\/)(schema\.prisma|models\.py|database\.py|db\.py)$/.test(file)),
      ],
      contract_hint: 'Validate schema, migrations and seed/reset boundaries before adding persistent features.',
    });
  }

  if (
    ['bullmq', 'bull', 'bee-queue', 'agenda', 'node-cron', 'celery', 'rq', 'dramatiq', 'apscheduler'].some((dep) => dep in deps) ||
    files.some((file) => /^(workers?|jobs?|tasks?)\//.test(file) || /(^|\/)(worker|jobs|tasks|scheduler)\.(py|js|mjs|cjs|ts)$/.test(file)) ||
    /\b(new\s+Worker|Queue\(|worker_process|@shared_task|Celery\(|BackgroundTasks|cron\.schedule|APScheduler)\b/.test(text)
  ) {
    add({
      id: 'worker',
      label: 'Worker or scheduled job',
      confidence: 'high',
      evidence: [
        ...Object.keys(deps).filter((dep) => ['bullmq', 'bull', 'bee-queue', 'agenda', 'node-cron', 'celery', 'rq', 'dramatiq', 'apscheduler'].includes(dep)),
        ...files.filter((file) => /^(workers?|jobs?|tasks?)\//.test(file) || /(^|\/)(worker|jobs|tasks|scheduler)\.(py|js|mjs|cjs|ts)$/.test(file)),
      ],
      contract_hint: 'Validate worker entrypoints, retry/failure behavior and queue/scheduler wiring.',
    });
  }

  if (/from\s+openai\s+import\s+OpenAI|OpenAI\s*\(|chat\.completions\.create|DEEPSEEK_API_KEY|OPENAI_API_KEY|WW_MODEL|WW_BASE_URL/i.test(text)) {
    add({
      id: 'llm_app',
      label: 'LLM application',
      confidence: 'high',
      evidence: ['OpenAI-compatible client or provider env vars'],
      contract_hint: 'Validate provider/key/model selection, redaction and no server-wide public key requirement.',
    });
  }

  if (input.pkg?.types || input.pkg?.exports || files.some((file) => /^src\/.+\.(ts|js|py)$/.test(file))) {
    add({
      id: 'library',
      label: 'Reusable library/package',
      confidence: input.pkg?.types || input.pkg?.exports ? 'high' : 'low',
      evidence: [
        ...(input.pkg?.types ? ['package.json types'] : []),
        ...(input.pkg?.exports ? ['package.json exports'] : []),
        ...files.filter((file) => /^src\/.+\.(ts|js|py)$/.test(file)).slice(0, 4),
      ],
      contract_hint: 'Validate public API exports, type/build output and consumer-facing usage examples.',
    });
  }

  return surfaces;
}

export function requiresSurfaceContractMatrix(surfaces: DeliverySurface[]): boolean {
  return surfaces.some((surface) => SPECIALIZED_SURFACES.includes(surface.id));
}

export function renderDeliverySurfaceMarkdown(surfaces: DeliverySurface[]): string {
  const rows = surfaces.length > 0
    ? surfaces.map((surface) => `| \`${surface.id}\` | ${surface.label} | ${surface.confidence} | ${surface.evidence.join(', ') || 'detected by source scan'} | ${surface.contract_hint} |`)
    : ['| `unknown` | Unknown demo surface | low | no strong evidence | Add a deterministic intake check before productization. |'];
  return [
    '# Productization Surface Map',
    '',
    'This file records the delivery surfaces MatrixOmnix detected before expanding a demo into a product.',
    'It is intentionally evidence-based so agents do not apply UI, API, worker or model-specific optimizations to the wrong project type.',
    '',
    '| Surface | Label | Confidence | Evidence | Contract boundary |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '## Verification',
    '',
    '```bash',
    'npm run surface:contract-check',
    '```',
    '',
  ].join('\n');
}

function detectEnvVars(text: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]{1,80})/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]{1,80})['"]\]/g,
    /os\.environ(?:\.get)?\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
    /getenv\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
    /\benv(?:\.str|\.int|\.bool)?\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      if (match[1]) names.add(match[1]);
    }
  }
  return Array.from(names).sort();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = String(value ?? '').trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}
