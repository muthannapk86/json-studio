require('dotenv').config();

const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;
const APP_URL = process.env.APP_URL || (
  process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `http://localhost:${PORT}`
);

const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;
const LS_VARIANT_ID = process.env.LEMONSQUEEZY_VARIANT_ID;
const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

const LS_BASE = 'https://api.lemonsqueezy.com/v1';
const LS_HEADERS = {
  Accept: 'application/vnd.api+json',
  'Content-Type': 'application/vnd.api+json',
  Authorization: `Bearer ${LS_API_KEY}`,
};

// Webhook route must be registered before express.json()
// so the original request body is available for signature verification.
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-signature'];

  if (LS_WEBHOOK_SECRET) {
    const digest = crypto
      .createHmac('sha256', LS_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');

    if (signature !== digest) {
      console.error('Webhook signature mismatch');
      return res.status(400).send('Invalid signature');
    }
  }

  try {
    const event = JSON.parse(req.body.toString());
    console.log('Lemon Squeezy event received:', event.meta?.event_name);
  } catch (error) {
    console.error('Could not parse webhook body:', error.message);
  }

  res.json({ received: true });
});

app.use(express.json());

// index.html is in the project root.
app.use(express.static(__dirname));

// Create a Lemon Squeezy Checkout session for the Pro subscription.
app.post('/api/create-checkout-session', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (!LS_API_KEY || !LS_STORE_ID || !LS_VARIANT_ID) {
    return res.status(500).json({
      error: 'Server is missing Lemon Squeezy configuration.'
    });
  }

  try {
    const response = await fetch(`${LS_BASE}/checkouts`, {
      method: 'POST',
      headers: LS_HEADERS,
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: { email },
            product_options: {
              redirect_url: `${APP_URL}/?checkout=success`
            }
          },
          relationships: {
            store: {
              data: {
                type: 'stores',
                id: String(LS_STORE_ID)
              }
            },
            variant: {
              data: {
                type: 'variants',
                id: String(LS_VARIANT_ID)
              }
            }
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Lemon Squeezy checkout error:', JSON.stringify(data));
      return res.status(500).json({
        error: 'Could not create checkout session.'
      });
    }

    res.json({ url: data.data.attributes.url });
  } catch (error) {
    console.error('Checkout session error:', error.message);
    res.status(500).json({
      error: 'Could not create checkout session.'
    });
  }
});

// Check whether an email has an active Lemon Squeezy subscription.
app.get('/api/subscription-status', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (!LS_API_KEY) {
    return res.status(500).json({
      error: 'Server is missing Lemon Squeezy configuration.'
    });
  }

  try {
    const url =
      `${LS_BASE}/subscriptions?filter[user_email]=` +
      encodeURIComponent(email);

    const response = await fetch(url, { headers: LS_HEADERS });
    const data = await response.json();

    if (!response.ok) {
      console.error('Lemon Squeezy status error:', JSON.stringify(data));
      return res.status(500).json({
        error: 'Could not check subscription status.'
      });
    }

    const allowedStatuses = new Set(['active', 'on_trial']);

    const active = Array.isArray(data.data) &&
      data.data.some((subscription) => {
        const attributes = subscription.attributes;

        return (
          String(attributes.variant_id) === String(LS_VARIANT_ID) &&
          allowedStatuses.has(attributes.status)
        );
      });

    res.json({ active });
  } catch (error) {
    console.error('Subscription status error:', error.message);
    res.status(500).json({
      error: 'Could not check subscription status.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`JSON Studio running on port ${PORT}`);
});
