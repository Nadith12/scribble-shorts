import {createHash} from 'node:crypto';
import {mkdir, open, readFile, rename, stat, writeFile, unlink} from 'node:fs/promises';
import {dirname, relative, resolve, isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';

export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const fileHash = async path => digest(await readFile(path));
export async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export async function atomic(path, data) {
  await mkdir(dirname(path), {recursive: true});
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2));
  // OneDrive/antivirus can briefly hold the destination on Windows. Keep the old
  // file intact and retry the atomic replacement; never fall back to truncation.
  for(let attempt=0;;attempt++){
    try{await rename(tmp,path);break;}
    catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||attempt>=4)throw e;await new Promise(done=>setTimeout(done,40*3**attempt));}
  }
}
export function inside(root, path) {
  const target = resolve(path), rel = relative(resolve(root), target);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw new Error(`Path escapes workspace: ${path}`);
  return target;
}
export function checkAbort(signal) { if (signal?.aborted) throw new Error('Cancelled. Successful intermediate files were retained.'); }

export async function command(executable, args, {signal, timeoutMs = 600000, cwd, log, env = {}, maxOutput = 2000000} = {}) {
  checkAbort(signal);
  const child = spawn(executable, args, {cwd, env: {...process.env, ...env}, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '', expired = false, cancelled = false;
  const stop = () => {
    cancelled = signal?.aborted ?? false;
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
      killer.on('error', () => child.kill());
      killer.on('close', code => {if(code!==0)child.kill();});
      child.kill();
    } else child.kill('SIGTERM');
  };
  const timer = setTimeout(() => { expired = true; stop(); }, timeoutMs);
  signal?.addEventListener('abort', stop, {once: true});
  child.stdout.on('data', b => { stdout = (stdout + b).slice(-maxOutput); });
  child.stderr.on('data', b => { stderr = (stderr + b).slice(-maxOutput); });
  try {
    const code = await new Promise((done, fail) => {child.once('error', fail); child.once('close', done);});
    if (log) await atomic(log, stdout + '\n' + stderr);
    if (cancelled || signal?.aborted) throw new Error('Cancelled; intermediate files retained.');
    if (expired) throw new Error(`Timed out after ${timeoutMs}ms: ${executable}. ${log ? `See ${log}` : ''}`);
    if (code !== 0) throw new Error(`${executable} exited ${code}. ${log ? `See ${log}` : stderr.slice(-1500)}`);
    return {stdout, stderr};
  } finally {clearTimeout(timer); signal?.removeEventListener('abort', stop);}
}

export async function locked(path, fn) {
  await mkdir(dirname(path), {recursive: true});
  let handle;
  try {handle = await open(path, 'wx');}
  catch (e) {if (e.code === 'EEXIST') throw new Error(`Another run or an interrupted lock exists: ${path}. Check its PID before removing it.`); throw e;}
  await handle.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}));
  try {return await fn();} finally {await handle.close(); await unlink(path);}
}

export class Budget {
  constructor(config, path) {this.config = config; this.path = path;}
  async reserve(kind, estimate, details, {local = false} = {}) {
    return locked(this.path+'.lock',async()=>{
    if (!Number.isFinite(estimate) || estimate < 0) throw new Error(`A bounded estimated cost is required for ${kind}.`);
    if ((!local || estimate > 0) && !this.config.enabled) throw new Error('External generation is disabled. Enable it explicitly in local configuration.');
    const ledger = await json(this.path, {reservations: []});
    const total = ledger.reservations.reduce((sum, item) => sum + item.estimatedMaxCostUsd, 0);
    if (total + estimate > this.config.maxCostUsd + 1e-9) throw new Error('Configured generation cost budget exceeded.');
    if ((!local || estimate > 0) && ledger.reservations.filter(x => x.external).length >= this.config.maxRequests) throw new Error('Configured request limit exceeded.');
    const maximum = kind === 'video' ? this.config.maxVideos : kind === 'image' ? this.config.maxImages : Infinity;
    if (ledger.reservations.filter(x => x.kind === kind).length >= maximum) throw new Error(`${kind} generation limit exceeded.`);
    ledger.reservations.push({kind, estimatedMaxCostUsd: estimate, external: !local || estimate > 0, details, at: new Date().toISOString()});
    await atomic(this.path, ledger);
    // Failed/ambiguous requests remain reserved: the provider may still have billed them.
    });
  }
}

export async function stage(run, name, input, fn, signal) {
  checkAbort(signal);
  const path = resolve(run, `${name}.stage.json`), key = digest(input);
  const saved = await json(path, {});
  if (saved.key === key && saved.status === 'complete') {
    const valid = await Promise.all(saved.files.map(async f => {try {return await fileHash(f.path) === f.hash;} catch {return false;}}));
    if (valid.every(Boolean)) {console.log(`${name}: reused`); return saved.result;}
  }
  console.log(`${name}: working`);
  await atomic(path, {key, status: 'running', startedAt: new Date().toISOString()});
  try {
    const {result, files} = await fn();
    const checked = await Promise.all(files.map(async path => ({path: resolve(path), hash: await fileHash(path), bytes: (await stat(path)).size})));
    await atomic(path, {key, status: 'complete', result, files: checked, completedAt: new Date().toISOString()});
    return result;
  } catch (e) {await atomic(path, {key, status: 'failed', error: e.message}); throw e;}
}
