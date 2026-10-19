# Turn on OTP sign-up (no coding needed)

PakkaBill already has OTP by SMS built in. It stays **off** until you add an SMS company's key in
Vercel. When it is on:

- **Create account** asks for an OTP sent to the mobile number, so only real numbers can sign up.
- **Log in** shows "Forgot your password? **Log in with OTP**", so nobody is locked out.

When it is off (as now), sign-up and log in work with mobile number and password, as before.

## Step 1: Make an account with one SMS company (pick one)

| Company | Website | What you copy |
|---|---|---|
| **Fast2SMS** (easiest) | fast2sms.com | Dev API → **API Authorization Key** |
| **MSG91** | msg91.com | **Auth Key**, and the **Template ID** of an OTP template |
| **2Factor** | 2factor.in | **API Key** (and the name of an approved template, if you made one) |

Add some money to the SMS account (OTP SMS cost about 15 to 25 paise each).
Indian SMS rules (DLT): the company will guide you to register your sender name and OTP message
once. Follow their steps; PakkaBill does not need anything else.

For MSG91, make an OTP template whose message has `##OTP##`, for example:
`Your PakkaBill OTP is ##OTP##. It is valid for 10 minutes.`

## Step 2: Put the key in Vercel

1. Open vercel.com → your project **pakkabill1** → **Settings** → **Environment Variables**.
2. Add these (Environment: **Production**), only the lines for the company you picked:

| Name | Value |
|---|---|
| `OTP_PROVIDER` | `fast2sms` or `msg91` or `2factor` |
| `FAST2SMS_API_KEY` | your Fast2SMS key (only for Fast2SMS) |
| `MSG91_AUTH_KEY` | your MSG91 auth key (only for MSG91) |
| `MSG91_TEMPLATE_ID` | your MSG91 OTP template ID (only for MSG91) |
| `TWOFACTOR_API_KEY` | your 2Factor key (only for 2Factor) |
| `TWOFACTOR_TEMPLATE` | optional: your approved 2Factor template name |

3. Do the same in the project **pakkabill** if you use that site too.
4. Go to **Deployments**, open the top one, tap **⋯ → Redeploy**. Wait until it says Ready.

## Step 3: Check it

Open the site in a private window → **Sign up** → you should see **Send OTP**. Try it with your own
number. If the SMS does not come, check the SMS company's dashboard (balance, DLT approval) and
Vercel → project → **Logs** (search "OTP send failed": it shows the company's reply).

## To turn it off

Delete `OTP_PROVIDER` in Vercel and redeploy. Everything goes back to password only.

## How it works (for a developer)

`api/_lib/otp.js` makes a 6-digit code, keeps only its hash in Redis for 10 minutes (5 wrong tries,
used once, separate for sign-up and log in), and asks the provider to deliver it. Limits: 3 SMS per
number in 10 minutes, 10 a day, 20 an hour per IP. `/api/config` reports `otp: true` when a provider
is set, and the app (`pro.js`) then shows the OTP fields. API: `/api/auth` actions `otpSend`
`{ phone, purpose }`, `otpLogin` `{ phone, otp }`, and `signup` takes `{ otp }`. Tests:
`node test/otp-audit.js`. Locally: `OTP_PROVIDER=test npm run dev` prints the code in the terminal.
