# Draftline — AI Website Builder Agent (backend version)

This version replaces the old "everyone enters their own API key" setup with:
- A shared Claude API key, stored securely on the server (never sent to the browser)
- Username/password accounts, so each client logs in instead of pasting a key

## Files
- `server.js` — Express server: handles login/signup and proxies chat requests to Claude
- `public/index.html` — the Draftline app itself (onboarding, competitor research, live preview, export)
- `package.json` — dependencies

## Environment variables (set these in Railway, under your service's Variables tab)

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your real Claude API key. Get/rotate it at console.anthropic.com — never commit it to GitHub. |
| `SESSION_SECRET` | Recommended | Any long random string, used to sign login sessions. |
| `DATA_DIR` | Optional | Where user accounts are stored. Defaults to `./data`. Point this at a mounted Railway Volume for accounts to survive redeploys. |

## Deploying on Railway

1. Push this whole folder (not just index.html) to your GitHub repo — `server.js`, `public/index.html`, `package.json`, `.gitignore`.
2. In Railway, your existing service will redeploy automatically once it detects the new push (Railway sees `package.json` + `server.js` and runs `npm install` then `npm start`).
3. Go to the service's **Variables** tab and add `ANTHROPIC_API_KEY` (and optionally `SESSION_SECRET`).
4. Redeploy if it doesn't happen automatically.
5. Open your Railway URL — you'll now see a login/signup screen instead of an API key prompt.

## Important notes

- **Rotate your API key** if you ever pasted a real one into a chat, doc, or committed it to a public repo — treat any key that's been shared as compromised.
- **Account storage**: by default, accounts are saved to a JSON file inside the container's filesystem. On Railway, this typically persists across redeploys of the same service, but for guaranteed durability (and to survive service recreation), attach a **Railway Volume**, mount it at `/data`, and set `DATA_DIR=/data`.
- **This still isn't bank-grade auth** — it's a simple, real login system (hashed passwords, sessions) appropriate for an internal team/client tool. If you later need password resets, roles, or admin controls, that's a further step up.
