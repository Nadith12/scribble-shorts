// Downloads the two Kokoro v1.0 files used by the narration stage.
// The model is Apache-2.0; kokoro-onnx is MIT. Nothing is installed system-wide.
import {createWriteStream} from 'node:fs';
import {mkdir, rename, stat, unlink} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const release = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1';
const files = [
  {name: 'kokoro-v1.0.onnx', url: `${release}/kokoro-v1.0.onnx`, minBytes: 300_000_000},
  {name: 'voices-v1.0.bin', url: `${release}/voices-v1.0.bin`, minBytes: 20_000_000},
];
const force = process.argv.includes('--force');

for (const file of files) {
  const destination = resolve(root, 'assets', 'kokoro', file.name);
  const existing = await stat(destination).catch(() => null);
  if (!force && existing && existing.size >= file.minBytes) {
    console.log(`${file.name}: present (${(existing.size / 1e6).toFixed(0)} MB)`);
    continue;
  }
  console.log(`${file.name}: downloading from the kokoro-onnx v1.0 model release…`);
  const response = await fetch(file.url);
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status} ${file.url}`);
  await mkdir(dirname(destination), {recursive: true});
  const temporary = `${destination}.${process.pid}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    const size = (await stat(temporary)).size;
    if (size < file.minBytes) throw new Error(`Downloaded file is too small (${size} bytes); the download may be incomplete.`);
    await rename(temporary, destination);
    console.log(`${file.name}: saved (${(size / 1e6).toFixed(0)} MB)`);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

console.log('\nNext: python -m pip install --target vendor/kokoro-deps -r requirements-kokoro.txt');
