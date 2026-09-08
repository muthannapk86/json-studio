# JSON Studio on Replit

## Run

The `Start application` workflow runs:

```sh
PORT=5000 npm start
```

The Express server serves the app and its API from port 5000.

## Optional payment configuration

The browser-based JSON tools work without external services. Lemon Squeezy checkout and subscription status additionally require these Replit Secrets:

- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_VARIANT_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`

Set `APP_URL` when a fixed public callback URL is needed; in development the server uses the Replit development domain automatically.