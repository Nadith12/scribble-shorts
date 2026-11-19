# Connect a YouTube channel

This repo uploads with the official **YouTube Data API v3** and a **Desktop OAuth client**. There is no third-party upload service, no password storage, and no browser automation of YouTube Studio.

You need:

- a Google account that owns (or can manage) the target YouTube channel;
- a Google Cloud project;
- the YouTube Data API v3 enabled;
- an OAuth consent screen with the `youtube.upload` and `youtube.readonly` scopes;
- a Desktop-app OAuth client JSON.

The whole flow is one-time. The resulting refresh token is stored at `work/youtube-auth/token.json`, which is git-ignored.

> **Check current policy before relying on it.** Google changed the API upload rules on 2 November 2026: videos uploaded from unverified API projects are no longer restricted to private viewing. OAuth verification, test-user limits and quota rules still apply. The links below are the authority, not this page.

## 1. Create the Google Cloud project

1. Open <https://console.cloud.google.com/>.
2. Create a project (for example `scribble-shorts`).
3. Select it in the project picker.

## 2. Enable the YouTube Data API v3

1. Go to **APIs & Services → Library**.
2. Search for **YouTube Data API v3**.
3. Open it and click **Enable**.

Direct link: <https://console.cloud.google.com/apis/library/youtube.googleapis.com>

## 3. Configure the OAuth consent screen

The console now calls parts of this **Google Auth Platform**.

1. Go to **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding / Audience**).
2. User type: **External** (use **Internal** only for a Google Workspace organization).
3. Fill in the app name, user support email and developer contact email.
4. Add scopes:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
5. Add your own Google account under **Audience → Test users** while the app is in testing.

### Publish the app before automating

While the publishing status is **Testing**, Google issues refresh tokens that **expire after 7 days** for external apps using scopes beyond basic profile. A weekly upload job will break every week.

Go to **Audience → Publishing status → Publish app**. For personal use this usually means an "unverified app" warning and a cap of 100 users, not a blocker. Google may require verification for sensitive scopes if you distribute the app; verification is not required for your own account within the test-user limit. See:

- <https://developers.google.com/identity/protocols/oauth2> (refresh-token expiration)
- <https://support.google.com/cloud/answer/10311615> (app audience and publishing status)

If you leave it in Testing, plan to re-run `npm run youtube:auth` every week.

## 4. Create the OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Desktop app**.
3. Create it, then **Download JSON**.
4. Save the file as:

   ```
   work/youtube-auth/client.json
   ```

   Keep the `installed` object exactly as downloaded. The uploader reads `client_id` and `client_secret` from it and refuses other client types.

## 5. Authorize the channel

```bash
npm run youtube:auth
```

The script:

- starts a temporary loopback server on `127.0.0.1`;
- prints a Google consent URL;
- verifies the OAuth `state` value;
- exchanges the code with PKCE;
- reads `channels?mine=true` and prints the authorized channel;
- writes `work/youtube-auth/token.json` with mode `0600`.

Open the URL, choose the **intended channel** (not a brand account you did not mean to use), and grant both scopes. If Google does not return a refresh token, revoke the app's access at <https://myaccount.google.com/permissions> and run the command again.

Confirm the channel at any time:

```bash
npm run youtube:status
# [ { "id": "UCxxxxxxxxxxxxxxxxxxxxxx", "title": "Your channel" } ]
```

Copy that `id` into `shorts.config.local.json`:

```json
{
  "publication": {
    "channel": "UCxxxxxxxxxxxxxxxxxxxxxx",
    "visibility": "public",
    "audience": "general"
  }
}
```

The uploader refuses to upload if the requested channel ID does not match the authorized token or the channel returned by the API.

## 6. Upload

The pipeline normally does this through `node shorts.mjs finish --id <id>`. A manual upload is also available:

```bash
node upload-youtube.mjs upload "outputs/My Episode.mp4" \
  --channel UCxxxxxxxxxxxxxxxxxxxxxx \
  --title "My Episode" \
  --audience general \
  --visibility public \
  --description "Description and sources."
```

Details:

- The file must be a non-empty MP4 inside `outputs/`.
- Upload is resumable and streams from disk.
- `--audience` is required: `general` or `kids`. It sets `selfDeclaredMadeForKids`.
- The category is fixed to `27` (Education) in the uploader; edit `upload-youtube.mjs` if your channel needs another category.
- `notifySubscribers=false` is sent, so an automated batch does not ping subscribers for every render. Change it if you want notifications.
- The response's `status.privacyStatus` is compared with the requested visibility. A mismatch is an error; the script never assumes success.

Vertical videos of 3 minutes or less are treated as Shorts by YouTube; there is no separate Shorts upload endpoint. Do not add `#Shorts` as a substitute for the correct aspect ratio and duration.

## 7. Quota

The YouTube Data API is quota-metered. Google's current documentation describes a default allocation of **10,000 units per day** plus per-method allowances (including `videos.insert`). A batch of uploads can exhaust this quickly, and every status poll also costs quota.

- Quota page: <https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas>
- Rules and audit request: <https://developers.google.com/youtube/data/guides/quota_and_compliance_audits>

If you need more, request an audit through Google's form. Do not create multiple projects to work around the quota; that violates the API terms.

## 8. Security

- **Never commit** `work/youtube-auth/client.json` or `token.json`. Both are git-ignored, but check `git status` before pushing.
- The refresh token can upload to the authorized channel. Treat it like a password.
- Revoke access at <https://myaccount.google.com/permissions> if a machine is lost or a token leaks, then re-authorize.
- Do not paste the client secret or token into chat, issues, screenshots or logs.
- The uploader never prints the token or client secret.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Missing work/youtube-auth/client.json` | Client JSON not saved there | Download a **Desktop app** client and save it at that exact path |
| `Google did not issue an offline token` | Consent was granted before, or access type was not offline | Revoke at myaccount.google.com/permissions and run auth again |
| `invalid_grant` after about a week | Consent screen is still in **Testing** | Publish the app to **In production**, then re-authorize |
| `The requested channel does not match the authorized channel` | Wrong channel selected, or stale config | Run `npm run youtube:status`, update `publication.channel`, re-auth if needed |
| `HTTP 403 ... quotaExceeded` | Daily quota exhausted | Wait for the Pacific-time reset or request a quota extension |
| Upload succeeds but stays `processing` | YouTube is still transcoding | Run `finish` again; it polls the existing upload and never re-uploads |
| Uploaded video is private though `public` was requested | Channel default, age restriction, or a policy/verification issue | Check YouTube Studio and the API response recorded in `work/pipeline/<id>/upload.json` |

When anything is uncertain, inspect `upload.json` and the channel **before** retrying. The pipeline deliberately refuses to upload a second copy when a previous attempt may have reached YouTube.
