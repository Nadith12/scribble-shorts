import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaults = {
  schemaVersion: 1,
  renderer: 'hyperframes', fps: 30, width: 1080, height: 1920,
  captions: true, animationIntensity: 0.65,
  minDuration: 30, maxDuration: 60,
  style: {background: '#fff9ed', accent: '#007e84', ink: '#25212b'},
  resources: {workers: 2, timeoutMs: 600000, retries: 1, maxAssetBytes: 40000000, maxSourceBytes: 2000000},
  external: {enabled: false, maxCostUsd: 0, maxRequests: 8, maxImages: 4, maxVideos: 1},
  research: {
    provider: 'disabled', baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY',
    routineModel: '', complexModel: '', useComplex: false, webSearch: false,
    maxCandidates: 5, maxSources: 4, maxOutputTokens: 6000, estimatedMaxCostUsd: null,
    timeoutMs: 120000, sourceCacheHours: 168,
  },
  tts: {provider: 'kokoro', voice: 'am_michael', speed: 0.95, sentencePause: 0.22,
    model: 'assets/kokoro/kokoro-v1.0.onnx', voices: 'assets/kokoro/voices-v1.0.bin',
    dependencies: 'vendor/kokoro-deps', threads: 4, targetLufs: -16, truePeak: -1.6,
    leadingSilence: 0.12, trailingSilence: 0.28, command: null},
  visuals: {provider: 'diagram', command: null},
  video: {enabled: false, maxDuration: 5, command: null},
  paths: {
    python: process.env.PYTHON ?? 'python',
    hyperframes: 'node_modules/hyperframes/bin/hyperframes.mjs',
    browser: process.env.HYPERFRAMES_BROWSER_PATH ?? '',
    ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
    scribble: 'assets/scribble.js',
    font: 'assets/inter-bold.woff2',
    gsap: 'assets/gsap.min.js',
  },
  publication: {channel: '', visibility: 'public', audience: 'general', processingAttempts: 12, processingIntervalMs: 5000, deleteAfterPublish: true},
};

export function merge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = {...base};
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid configuration key.');
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(base?.[key] ?? {}, value) : value;
  }
  return out;
}

export async function loadConfig(path) {
  const selected = path ? resolve(path) : join(ROOT, 'shorts.config.local.json');
  const config = merge(defaults, existsSync(selected) ? JSON.parse(await readFile(selected, 'utf8')) : {});
  if (config.schemaVersion !== 1 || !['hyperframes', 'remotion'].includes(config.renderer)) throw new Error('Unsupported config version or renderer.');
  if (!Number.isInteger(config.fps) || config.fps < 15 || config.fps > 60) throw new Error('fps must be an integer between 15 and 60.');
  if (config.width !== 1080 || config.height !== 1920) throw new Error('This composition supports 1080 × 1920.');
  if (!(config.animationIntensity >= 0 && config.animationIntensity <= 1)) throw new Error('animationIntensity must be 0–1.');
  if (!(config.external.maxCostUsd >= 0) || !(config.external.maxRequests >= 0)) throw new Error('External budgets must be nonnegative.');
  for(const key of ['maxRequests','maxImages','maxVideos'])if(!Number.isInteger(config.external[key])||config.external[key]<0)throw new Error(`external.${key} must be a nonnegative integer.`);
  if(!Number.isFinite(config.external.maxCostUsd))throw new Error('External cost budget must be finite.');
  for(const key of ['maxAssetBytes','maxSourceBytes'])if(!Number.isInteger(config.resources[key])||config.resources[key]<1000)throw new Error(`resources.${key} must be a positive byte limit.`);
  if(!Number.isInteger(config.research.maxCandidates)||config.research.maxCandidates<2||config.research.maxCandidates>12)throw new Error('maxCandidates must be 2–12.');
  if(!(config.research.maxSources>=1&&config.research.maxSources<=6))throw new Error('maxSources must be 1–6.');
  if (!(config.resources.workers >= 1 && config.resources.workers <= 8)) throw new Error('workers must be 1–8.');
  if (!(config.resources.timeoutMs >= 1000) || !(config.resources.retries >= 0 && config.resources.retries <= 3)) throw new Error('Invalid timeout or retry limit.');
  if (!(config.tts.speed >= 0.5 && config.tts.speed <= 2) || !(config.tts.threads >= 1 && config.tts.threads <= 16)) throw new Error('Invalid TTS speed or thread count.');
  if (config.tts.truePeak > -0.5 || config.tts.truePeak < -9) throw new Error('truePeak must be between -9 and -0.5 dB.');
  if (!['kokoro', 'command'].includes(config.tts.provider)) throw new Error('TTS provider must be kokoro or command.');
  if (!['general', 'kids'].includes(config.publication.audience)) throw new Error('publication.audience must be general or kids.');
  if (!['private', 'unlisted', 'public'].includes(config.publication.visibility)) throw new Error('publication.visibility must be private, unlisted or public.');
  return config;
}

export const projectPath = path => resolve(ROOT, path);
