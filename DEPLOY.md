# Alamo Airborne Pilot App — Deployment Guide

## What you're deploying

A mobile web app (PWA) that pilots can add to their iPhone home screen from Safari. No App Store needed. It runs offline and syncs to Airtable.

---

## Step 1 — Create a GitHub Repository

1. Go to **github.com** and create a free account if you don't have one
2. Click **New repository** → name it `alamo-pilot-app` → click **Create repository**
3. Upload the entire `alamo-pilot-app` folder to the repo:
   - Click **uploading an existing file**
   - Drag the entire folder in
   - Click **Commit changes**

---

## Step 2 — Deploy to Vercel

1. Go to **vercel.com** → sign up with your GitHub account
2. Click **Add New Project** → Import your `alamo-pilot-app` repo
3. Vercel auto-detects Vite. Leave all settings as-is.
4. **Before deploying**, add Environment Variables (click "Environment Variables"):

   | Name | Value |
   |------|-------|
   | `AIRTABLE_API_KEY` | Your Airtable personal access token (see below) |
   | `JWT_SECRET` | Any long random string — at least 40 characters |

5. Click **Deploy**
6. Vercel gives you a URL like `https://alamo-pilot-app.vercel.app` — that's the app URL

### Getting your Airtable API Key
1. Log into Airtable → click your avatar → **Account**
2. Click **Personal access tokens** → **Create token**
3. Name it "Pilot App"
4. Add scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
5. Add your base: **Alamo Airborne Flight Operations**
6. Copy the token — paste it as `AIRTABLE_API_KEY` in Vercel

---

## Step 3 — Update the COLLECTION STATUS formula (important!)

The `COLLECTION STATUS` field in COLLECTION ASSETS is currently a formula. You need to update it to also check the new `Collected (App)` checkbox.

1. In Airtable, open **COLLECTION ASSETS**
2. Click the `COLLECTION STATUS` field → Edit field
3. Look at the current formula and add this at the top of the OR() or IF():
   ```
   IF({Collected (App)}, "Collected", <existing formula here>)
   ```
   This makes the app's checkbox take priority in the status display.

---

## Step 4 — Set pilot passwords

For each pilot:
1. Open Airtable → **Pilots** table
2. Find the pilot's record
3. Fill in the `App Password` field with a password you give them (e.g., their last name + 4 digits)

Pilots log in with their **Airtable email** + the password you set here.

---

## Step 5 — Install on pilot iPhones

Send pilots the Vercel URL. They:
1. Open Safari on their iPhone and go to the URL
2. Tap the **Share** button (box with arrow pointing up)
3. Tap **Add to Home Screen**
4. Tap **Add**

The app now appears on their home screen like a native app, works offline, and opens full-screen.

---

## How the app works for pilots

- **Map view**: Colored dots for all their assigned sites
  - Blue = not collected
  - Green = collected
  - Yellow = partial collection
  - Orange = MOB fee
  - Red = site has an issue
- **List view**: Same sites in a scrollable list with filter tabs
- **Tap a site**: Opens a detail sheet with all the fields from the Pilot CSV interface
- **Mark status**: Tap Collected / Partial / MOB Fee — updates immediately in Airtable
- **Offline**: If they lose signal, updates queue locally and sync automatically when back online
- **Submit EOD**: Blue button at the bottom appears once they've marked sites — shows a summary and confirms the EOD report in Airtable

---

## Ongoing maintenance

- **Add/change pilot passwords**: Edit the `App Password` field in the Pilots table in Airtable
- **Change pilot site assignments**: Update the `Pilot assigned` field on COLLECTION ASSETS (already your existing workflow)
- **View what pilots collected**: Check the EOD Reports table in Airtable, or the `Collected (App)` checkbox in COLLECTION ASSETS

---

## Need help?

If something isn't working:
1. Check Vercel → your project → **Functions** tab for API errors
2. Make sure the Airtable token has the right scopes and base access
3. Check that `JWT_SECRET` is set in Vercel environment variables
