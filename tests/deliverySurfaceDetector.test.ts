import { describe, expect, it } from 'vitest';
import { detectDeliverySurfaces, requiresSurfaceContractMatrix } from '../src/core/deliverySurfaceDetector.js';
import type { ProjectSnapshot } from '../src/core/types.js';

const snapshot: ProjectSnapshot = {
  project_path: '/tmp/demo',
  detected_language: 'javascript',
  detected_frameworks: [],
  package_manager: 'npm',
  test_commands: [],
  build_commands: [],
  start_commands: [],
  important_files: [],
  missing_files: [],
  dependency_summary: { runtime: 0, dev: 0, has_lockfile: false },
  timestamp: new Date(0).toISOString(),
};

describe('deliverySurfaceDetector', () => {
  it('detects generalized demo delivery surfaces beyond web/API/CLI', () => {
    const surfaces = detectDeliverySurfaces({
      snapshot,
      files: ['manifest.json', 'popup.html', 'analysis.ipynb', 'src-tauri/tauri.conf.json', 'app.json', 'src/App.tsx'],
      pkg: {
        dependencies: {
          expo: '^54.0.0',
          electron: '^39.0.0',
        },
      },
      sourceText: '{"manifest_version":3,"name":"Demo Extension"}',
    });

    const ids = surfaces.map((surface) => surface.id);
    expect(ids).toContain('browser_extension');
    expect(ids).toContain('notebook');
    expect(ids).toContain('mobile_app');
    expect(ids).toContain('desktop_app');
    expect(requiresSurfaceContractMatrix(surfaces)).toBe(true);
  });

  it('does not require a surface matrix for ordinary API/CLI surfaces covered by dedicated harnesses', () => {
    const surfaces = detectDeliverySurfaces({
      snapshot: { ...snapshot, detected_frameworks: ['flask'] },
      files: ['app.py', 'bin/cli.js', 'package.json'],
      pkg: { bin: './bin/cli.js', dependencies: { express: '^5.0.0' } },
      sourceText: 'from flask import Flask\napp = Flask(__name__)\n@app.route("/healthz")\ndef healthz(): pass',
    });

    const ids = surfaces.map((surface) => surface.id);
    expect(ids).toContain('api');
    expect(ids).toContain('cli');
    expect(requiresSurfaceContractMatrix(surfaces)).toBe(false);
  });

  it('detects game, 3D, ML and media-processing demo surfaces', () => {
    const surfaces = detectDeliverySurfaces({
      snapshot,
      files: ['src/game.js', 'src/scene.ts', 'model.onnx', 'src/process-media.js', 'assets/sprite.png'],
      pkg: {
        dependencies: {
          phaser: '^3.90.0',
          three: '^0.180.0',
          'onnxruntime-web': '^1.23.0',
          sharp: '^0.34.0',
        },
      },
      sourceText: [
        'const game = new Phaser.Game({ scene });',
        'const renderer = new THREE.WebGLRenderer();',
        'const session = await ort.InferenceSession.create("model.onnx");',
        'await sharp(input).resize(256).toFile(output);',
      ].join('\n'),
    });

    const ids = surfaces.map((surface) => surface.id);
    expect(ids).toContain('game_demo');
    expect(ids).toContain('three_d_scene');
    expect(ids).toContain('ml_model');
    expect(ids).toContain('media_pipeline');
    expect(requiresSurfaceContractMatrix(surfaces)).toBe(true);
  });

  it('does not treat ordinary animated UI code as a game surface', () => {
    const surfaces = detectDeliverySurfaces({
      snapshot: { ...snapshot, detected_frameworks: ['vue'] },
      files: ['src/App.vue', 'src/cursor.ts'],
      pkg: { dependencies: { vue: '^3.5.0' } },
      sourceText: [
        'function tick() {',
        '  requestAnimationFrame(tick);',
        '  cursor.style.transform = `translate(${x}px, ${y}px)`;',
        '}',
      ].join('\n'),
    });

    expect(surfaces.map((surface) => surface.id)).not.toContain('game_demo');
  });
});
