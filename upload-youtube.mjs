import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('.', import.meta.url));
const authDir = join(root, 'work', 'youtube-auth');
const clientPath = join(authDir, 'client.json');
const tokenPath = join(authDir, 'token.json');
const api = 'https://www.googleapis.com/youtube/v3';
const scopes = ['youtube.upload', 'youtube.readonly']
  .map(scope => `https://www.googleapis.com/auth/${scope}`).join(' ');

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.error?.message ?? body.error_description ?? body.error;
    throw new Error(`Google returned HTTP ${response.status}${typeof detail === 'string' ? ` (${detail})` : ''}.`);
  }
  return response;
}

async function loadJson(path, missingMessage) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(missingMessage);
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${path}.`);
    throw error;
  }
}

async function getClient() {
  const { installed } = await loadJson(clientPath, `Save the Google Desktop OAuth client JSON at ${clientPath}.`);
  if (!installed?.client_id || !installed.client_secret) {
    throw new Error('Download credentials for a Google OAuth client of type Desktop app.');
  }
  return { client_id: installed.client_id, client_secret: installed.client_secret };
}

async function exchange(client, fields) {
  const response = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ ...client, ...fields }),
  });
  return response.json();
}

async function getChannel(token) {
  const response = await request(`${api}/channels?part=id,snippet&mine=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { items } = await response.json();
  if (items?.length !== 1) throw new Error('Google did not return a single YouTube channel. Authorize with the intended channel.');
  return items[0];
}

async function authorize() {
  const client = await getClient();
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const server = createServer();
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const redirect = `http://127.0.0.1:${server.address().port}/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'select_account consent',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });

  let timer;
  try {
    const code = await new Promise((done, fail) => {
      timer = setTimeout(() => fail(new Error('Google authorization timed out. Run auth again.')), 5 * 60_000);
      server.on('request', (req, res) => {
        const callback = new URL(req.url, redirect);
        const receivedState = Buffer.from(callback.searchParams.get('state') ?? '');
        if (callback.pathname !== '/callback' || receivedState.length !== state.length ||
            !timingSafeEqual(receivedState, Buffer.from(state))) {
          res.writeHead(400).end('Invalid authorization callback.');
          return;
        }
        const code = callback.searchParams.get('code');
        if (!code) {
          res.writeHead(400).end('Google authorization was declined.');
          fail(new Error('Google authorization was declined.'));
          return;
        }
        res.end('Google authorization received. Return to your terminal to see the channel.');
        done(code);
      });
      console.log(`Open this link in your browser and select the intended YouTube channel:\n${url.href}`);
    });
    const token = await exchange(client, {
      grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect,
    });
    if (!token.refresh_token) throw new Error('Google did not issue an offline token. Run auth again and grant access.');
    const channel = await getChannel(token.access_token);
    await mkdir(authDir, { recursive: true });
    const tempPath = `${tokenPath}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(tempPath, JSON.stringify({ refresh_token: token.refresh_token, channelId: channel.id }), {
      mode: 0o600, flag: 'wx',
    });
    await rename(tempPath, tokenPath);
    console.log(`Authorized ${channel.snippet.title} (${channel.id}). No video was uploaded.`);
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
}

async function upload(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      channel: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string', default: '' },
      visibility: { type: 'string', default: 'public' },
      audience: { type: 'string' },
    },
  });
  if (positionals.length !== 1 || !values.channel || !values.title?.trim() ||
      !['general', 'kids'].includes(values.audience) || !['private', 'unlisted', 'public'].includes(values.visibility)) {
    throw new Error(usage);
  }
  const outputs = await realpath(join(root, 'outputs'));
  const file = await realpath(resolve(root, positionals[0]));
  const outputPath = relative(outputs, file);
  const info = await stat(file);
  if (outputPath.startsWith('..') || isAbsolute(outputPath) || !info.isFile() ||
      !info.size || extname(file).toLowerCase() !== '.mp4') {
    throw new Error('Choose a nonempty MP4 inside outputs/.');
  }

  const saved = await loadJson(tokenPath, 'Run the auth command before uploading.');
  if (saved.channelId !== values.channel) throw new Error('The requested channel does not match the authorized channel.');
  const client = await getClient();
  const token = await exchange(client, { grant_type: 'refresh_token', refresh_token: saved.refresh_token });
  const channel = await getChannel(token.access_token);
  if (channel.id !== values.channel) throw new Error('The signed-in channel does not match the requested channel.');

  const headers = { Authorization: `Bearer ${token.access_token}` };
  const session = await request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(info.size),
    },
    body: JSON.stringify({
      snippet: { title: values.title, description: values.description, categoryId: '27' },
      status: { privacyStatus: values.visibility, selfDeclaredMadeForKids: values.audience === 'kids' },
    }),
  });
  const location = session.headers.get('location');
  if (!location || new URL(location).origin !== 'https://www.googleapis.com') {
    throw new Error('Google did not return a valid upload URL.');
  }
  try {
    const response = await request(location, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': String(info.size) },
      body: createReadStream(file),
      duplex: 'half',
    });
    const video = await response.json();
    if (!video.id || !video.status?.privacyStatus) throw new Error('The upload response did not identify a video and its visibility.');
    console.log(`${video.status.privacyStatus} upload to ${channel.snippet.title}: https://www.youtube.com/watch?v=${video.id}`);
    if (video.status.privacyStatus !== values.visibility) {
      throw new Error('YouTube returned a different visibility from the one requested.');
    }
  } catch (error) {
    throw new Error(`${error.message} Check the channel for the upload before retrying.`);
  }
}

const usage = `node upload-youtube.mjs auth
node upload-youtube.mjs upload "outputs/video.mp4" --channel CHANNEL_ID --title "Video title" --audience general [--description "Video description"] [--visibility private|unlisted|public]`;

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help') console.log(usage);
  else if (command === 'auth' && !args.length) await authorize();
  else if (command === 'upload') await upload(args);
  else throw new Error(usage);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
