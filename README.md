# CueWindow Web

Static marketing, account, and download website for CueWindow.

## Render

Create a Render Static Site from this repository.

- Build command: `npm run build`
- Publish directory: `public`

Set these Render environment variables:

- `CUEWINDOW_SUPABASE_URL`
- `CUEWINDOW_SUPABASE_ANON_KEY`

Only the Supabase anon key belongs in this frontend. Do not add service-role keys,
database URLs, Gemini keys, Deepgram keys, or any desktop app secrets.
