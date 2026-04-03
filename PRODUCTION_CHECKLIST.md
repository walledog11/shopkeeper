# Production Checklist

Things that must be done before deploying to production.

---

## WhatsApp Integration

### Twilio Account
- [ ] Upgrade from Twilio trial to a paid account, or ensure a full WhatsApp Business account is set up
- [ ] Switch from the WhatsApp Sandbox to a WhatsApp Business number — the sandbox requires every recipient to manually opt in and cannot send first messages, making it unsuitable for production notifications
- [ ] Verify all destination phone numbers are reachable (sandbox restriction gone on paid accounts)

### Environment Variables

**Gateway (`.env`)**
- [ ] `TWILIO_ACCOUNT_SID` — production Twilio account SID
- [ ] `TWILIO_AUTH_TOKEN` — production Twilio auth token
- [ ] `TWILIO_WHATSAPP_NUMBER` — WhatsApp Business number in `whatsapp:+1xxxxxxxxxx` format (replace sandbox `whatsapp:+14155238886`)
- [ ] `TWILIO_WEBHOOK_URL` — production domain URL of the Twilio webhook endpoint (e.g. `https://yourdomain.com/api/webhooks/twilio`)
- [ ] `DASHBOARD_INTERNAL_URL` — internal URL of the dashboard service (e.g. `https://yourdomain.com` or internal service URL)
- [ ] `INTERNAL_API_SECRET` — long random secret shared with the dashboard; rotate from any dev value

**Dashboard (`.env.local` / production env)**
- [ ] `TWILIO_ACCOUNT_SID` — same as gateway
- [ ] `TWILIO_AUTH_TOKEN` — same as gateway
- [ ] `TWILIO_FROM_NUMBER` — E.164 number used to send OTP SMS for phone verification (e.g. `+1xxxxxxxxxx`)
- [ ] `TWILIO_WEBHOOK_URL` — must match the value in gateway (used for signature validation in the proxy)
- [ ] `GATEWAY_INTERNAL_URL` — internal URL of the gateway service
- [ ] `INTERNAL_API_SECRET` — must match gateway value

### Webhook URL
- [ ] Point Twilio WhatsApp Business webhook to `https://yourdomain.com/api/webhooks/twilio`
- [ ] Remove the ngrok-based proxy setup — in production the dashboard and gateway each have stable public URLs, so the dashboard Twilio proxy route (`/api/webhooks/twilio`) may no longer be needed if the gateway is directly reachable

### Dev-Only Code to Remove
- [ ] `apps/dashboard/src/app/api/phone/send-code/route.ts` — remove the `isDev` branch that skips Twilio and uses hardcoded code `000000`
- [ ] `apps/dashboard/src/app/api/phone/verify-code/route.ts` — remove the `NODE_ENV !== "development"` guard around the rate limiter
- [ ] `apps/dashboard/src/app/api/phone/send-code/route.ts` — remove the `NODE_ENV !== "development"` guard around the send rate limiter

---

## General Infrastructure

- [ ] Replace all ngrok tunnel URLs with stable production domain URLs
- [ ] Rotate `INTERNAL_API_SECRET` to a new value not used during development
- [ ] Ensure Redis is production-grade (persistent, backed up) — conversation context and pending plans are stored there
- [ ] Confirm `DATABASE_URL` points to the production Neon PostgreSQL instance
