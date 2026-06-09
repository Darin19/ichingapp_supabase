<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6a2898e9-3a15-424b-9868-ebe0c648816b

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Configure Supabase in [.env.local](.env.local):
   - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Supabase Auth is used for login.
   - Supabase Postgres stores master data, labels, decks, canvases, and card positions.
3. Optional Auto-Draw setup:
   - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
   - Link Supabase with `supabase link --project-ref <project-ref>`.
   - Set Freemodel secrets with `supabase secrets set FREEMODEL_API_KEY="fe_oa_..." FREEMODEL_BASE_URL="https://api.freemodel.dev" FREEMODEL_MODEL="gpt-5.5" FREEMODEL_REASONING_EFFORT="xhigh"`.
   - Deploy the proxy with `supabase functions deploy generate-canvas`.
   - Auto-Draw lets Freemodel choose the spread size automatically, capped at 50 cards.
4. Run the app:
   `npm run dev`

Firebase is only used for static Hosting configuration in `firebase.json` and `.firebaserc`.
