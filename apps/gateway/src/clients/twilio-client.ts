import twilio from 'twilio';

type TwilioInstance = ReturnType<typeof twilio>;

let _twilioInitialized = false;
let _twilioClient: TwilioInstance | null = null;
let _twilioFrom: string | null = null;

export function getTwilio(): { client: TwilioInstance; from: string } | null {
  if (!_twilioInitialized) {
    _twilioInitialized = true;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;

    if (sid && auth && from) {
      _twilioClient = twilio(sid, auth);
      _twilioFrom = from;
    }
  }

  return _twilioClient && _twilioFrom ? { client: _twilioClient, from: _twilioFrom } : null;
}
