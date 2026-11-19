import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const authDir = join(root, 'work', 'youtube-auth');
const api = 'https://www.googleapis.com/youtube/v3';

async function readJson(path, missing) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(missing);
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${path}.`);
    throw error;
  }
}

async function main() {
  const {installed: client} = await readJson(join(authDir, 'client.json'),
    'Missing work/youtube-auth/client.json. Follow docs/youtube-setup.md first.');
  const saved = await readJson(join(authDir, 'token.json'),
    'Not authorized yet. Run: node upload-youtube.mjs auth');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({...client, grant_type: 'refresh_token', refresh_token: saved.refresh_token}),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`OAuth refresh failed: ${token.error_description ?? token.error}. Run node upload-youtube.mjs auth again.`);
  }

  const ids = process.argv.slice(2).filter(value => !value.startsWith('-'));
  const query = ids.length
    ? `videos?part=snippet,status,processingDetails&id=${encodeURIComponent(ids.join(','))}`
    : 'channels?part=id,snippet&mine=true';
  const response = await fetch(`${api}/${query}`, {headers: {Authorization: `Bearer ${token.access_token}`}});
  const data = await response.json();
  if (!response.ok) throw new Error(`YouTube read failed: HTTP ${response.status} ${data.error?.message ?? ''}`);
  if (!ids.length) {
    console.log(JSON.stringify(data.items.map(channel => ({id: channel.id, title: channel.snippet.title})), null, 2));
    return;
  }
  console.log(JSON.stringify(data.items.map(video => ({
    id: video.id,
    title: video.snippet.title,
    channelId: video.snippet.channelId,
    status: video.status,
    processing: video.processingDetails,
  })), null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
