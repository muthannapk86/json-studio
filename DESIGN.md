# JSON Studio — Design Document

**Status:** MVP deployment design  
**Primary runtime:** Node.js 18+ with Express  
**Hosting target:** Replit Autoscale Deployment  
**Payments:** Lemon Squeezy subscription checkout

## Purpose

JSON Studio is a browser-based utility for inspecting and transforming JSON. The interface provides a free viewer/formatter and marks Diff, Schema, Convert, and Graph as Pro features. Browser JavaScript performs JSON processing locally; a small Express server serves the app and safely communicates with Lemon Squeezy.

The product principle is privacy: pasted JSON must not be sent to the application server. Payment metadata is the exception.

## Current architecture

```text
User browser (index.html)                   Lemon Squeezy
• viewer / formatter                        • checkout + billing
• diff / schema / convert / graph                   ▲
• Pro interface state                              authenticated API calls
          │                                           │
          │ serves app and calls JSON APIs             │
          ▼                                           │
Replit Autoscale Deployment (Node.js + Express) ─────┘
• GET /                 • POST /api/create-checkout-session
• GET /api/subscription-status
• POST /api/webhook
```

| File | Responsibility |
| --- | --- |
| `index.html` | Entire client UI, CSS, browser-side JSON tools, and Pro UI state. It stores the entered billing email in browser `localStorage`. |
| `server.js` | Express server, static-file serving, checkout creation, subscription lookup, and webhook HMAC verification. |
| `package.json` | Node manifest; `npm start` runs `node server.js`. |

## Request flows

### Normal JSON work

1. A visitor opens `/`; Express returns `index.html`.
2. They paste or upload JSON.
3. Browser JavaScript parses, formats, compares, converts, or visualizes it.
4. The JSON stays in the browser and is not sent to Express or Lemon Squeezy.

### Pro checkout

1. The visitor enters an email and presses **Unlock Pro**.
2. The browser posts that email to `/api/create-checkout-session`.
3. Express reads its Lemon Squeezy Secrets and creates a hosted checkout.
4. The browser redirects to Lemon Squeezy.
5. Lemon Squeezy returns to `APP_URL/?checkout=success` after payment.

### Subscription status and webhook

The browser asks `/api/subscription-status?email=...`. The server asks Lemon Squeezy whether that email has an active subscription and returns `{ "active": true | false }`. Separately, Lemon Squeezy sends lifecycle events to `/api/webhook`; the server receives the raw request, verifies its HMAC signature, currently logs the event, and replies successfully.

## Replit architecture

Replit has two separate environments:

| Environment | Purpose | Lifecycle |
| --- | --- | --- |
| Project Editor and Preview | Development: edit, run, inspect errors. | Temporary development URL; stop and restart freely. |
| Published Deployment | Production app that visitors use. | A separate deployed snapshot and public URL; republish to release later changes. |

Use an **Autoscale Deployment** for this app. It needs an Express server for API routes and payment Secrets. A Static deployment only serves files, so it cannot run `server.js` or keep payment credentials server-side.

Autoscale can start instances for traffic and scale with demand. It means the app must be stateless: in-memory data may vanish as instances restart or scale. This project already fits that model because Lemon Squeezy is its subscription source of truth. A deployed filesystem is also not appropriate for customer data; use managed storage or a database if persistence is later required.

## Replit configuration

Use Node.js 18 or newer. There is no build step.

```text
Install: npm install       (automatically inferred from package.json)
Run:     npm start
Build:   leave empty
Port:    supplied by Replit in PORT
```

The server already uses `process.env.PORT || 3000`; never create a `PORT` Secret.

### Required Secrets

Add these in Replit’s **Secrets** panel, including the production deployment when prompted. Never add values to source code, `index.html`, Git, or screenshots.

| Secret | Purpose |
| --- | --- |
| `LEMONSQUEEZY_API_KEY` | Authorizes server-to-Lemon Squeezy requests. |
| `LEMONSQUEEZY_STORE_ID` | Identifies the Lemon Squeezy store. |
| `LEMONSQUEEZY_VARIANT_ID` | Identifies the Pro subscription variant. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Verifies incoming webhook signatures. |
| `APP_URL` | Final public HTTPS URL used as checkout return URL. |

Set `APP_URL` only to the final public domain, for example `https://json-studio.replit.app`. If it changes, update the secret and republish.

### Required static-file correction

`index.html` is currently in the project root, while `server.js` serves a `public/` directory. Make one of these changes before running:

- Recommended: replace `app.use(express.static(path.join(__dirname, 'public')));` with `app.use(express.static(__dirname));`.
- Or create `public/`, move `index.html` into it, and retain the existing middleware.

The first option matches the current project. Without it, `/` will not return the interface.

## Deployment plan

1. Import the GitHub repository or ZIP into Replit.
2. Apply the static-file correction.
3. Set the Run workflow to `npm start`.
4. Add development Secrets and click **Run**.
5. Confirm Preview shows the full interface before publishing.
6. Choose **Publish → Autoscale**.
7. Add production Secrets and set `APP_URL` to the deployed URL.
8. Publish, then register `https://YOUR-DOMAIN/api/webhook` in Lemon Squeezy using the same webhook signing secret.
9. Test checkout and active-subscription status with a test subscription before launch.

## Security and product risks

The current design is a useful prototype, but it is not strong access control.

- The client unlocks Pro UI based on an email in `localStorage`. Someone who knows an email can ask the status endpoint about it; email alone is not user authentication.
- Pro code is sent to the browser. Visitors can alter browser code or invoke functions through developer tools. This is a user-experience lock, not enforceable authorization.
- The server calls Lemon Squeezy for every status check. This may create latency and rate-limit pressure as usage grows.
- Webhooks are verified when the secret is configured, but are only logged. Cancellations and renewals are not retained or acted on.
- Do not log secret values or full user JSON payloads.

## Recommended evolution

### Stage 1 — publishable MVP

Keep this architecture after the static-file correction. Use Replit Secrets, configure the webhook, and manually test the payment flow.

### Stage 2 — accounts and entitlements

Add actual sign-in (magic link or OAuth), an internal user ID, an entitlement database table, and webhook-driven subscription updates:

```text
Sign-in → authenticated session → server checks entitlement → Pro feature
Lemon Squeezy webhook → signature verification → entitlement database update
```

For non-bypassable Pro capabilities, move protected computation or export endpoints to the server and require authenticated entitlement. If JSON must never leave the browser, describe Pro gating honestly as a commercial/UI convention rather than tamper-proof protection.

### Stage 3 — operations

Add rate limits for payment endpoints, structured error reporting, webhook-failure monitoring, privacy policy, terms, support contact, and retention policy. Connect a custom domain only after the default deployment works.

## Acceptance checklist

- [ ] `npm start` runs successfully.
- [ ] Preview returns the interface at `/`.
- [ ] Local JSON tools work without uploading JSON.
- [ ] Checkout redirects and returns to the exact production HTTPS URL.
- [ ] Invalid webhook signature returns HTTP 400; a valid one returns `{ "received": true }`.
- [ ] An active test subscription unlocks the expected UI.
- [ ] No secrets appear in Git or browser-delivered files.
