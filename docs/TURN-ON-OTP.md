# Turn on OTP sign-up (no coding needed)

PakkaBill already has OTP by SMS built in. It stays **off** until you turn it on in the admin panel
(Settings → OTP by SMS) with an SMS company's key. When it is on:

- **Create account** on the website asks for an OTP sent to the mobile number, so only real
  numbers can sign up.
- **Log in** shows "Forgot your password? **Set a new one with OTP**, or **log in with OTP**", so
  nobody is locked out and support no longer has to reset passwords by hand.
- **My account** shows "✓ verified" next to the number. Accounts made before OTP was on get a
  **Verify your mobile number** card.
- **Delete my account** can be confirmed with an OTP when the password is forgotten.
- **Admin → Overview** shows **OTP SMS today** and the last 14 days, with a rough cost. Each
  customer shows whether the number is verified (also a column in the customer CSV).

**Website only for now.** The Android app is not changed: sign-up there keeps working with mobile
number and password while OTP is on (the server knows the app by its `PakkaBillApp/` User-Agent).
The website opened inside the app is the website, so it does ask for the OTP.

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

## Step 2: Turn it on in the admin panel

1. Open the admin panel → **Settings** → scroll to **OTP by SMS**.
2. Choose the **SMS company** and paste its **API key** (and the Template ID for MSG91).
3. Type your own mobile number and tap **Send test SMS**. The SMS should come in a minute with the
   code shown on screen.
4. Tick **Turn on OTP by SMS** and tap **Save settings**. It is on for everyone within a minute.

To turn it off, untick it and save. Your key stays saved for next time.

(The older way still works: the Vercel environment variables `OTP_PROVIDER`, `FAST2SMS_API_KEY`,
`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `TWOFACTOR_API_KEY`, `TWOFACTOR_TEMPLATE`. They are used only
while no company is chosen in the admin panel.)

## Step 3: Check it

Open the site in a private window → **Sign up** → you should see **Send OTP**. Try it with your own
number. If the SMS does not come, check the SMS company's dashboard (balance, DLT approval) and
Vercel → project → **Logs** (search "OTP send failed": it shows the company's reply).

## How it works (for a developer)

`api/_lib/otp.js` makes a 6-digit code, keeps only its hash in Redis for 10 minutes (5 wrong tries,
used once, separate for each purpose: signup, login, reset, verify, delete), and asks the provider
to deliver it. SMS sent per day are counted in `otpsms:YYYY-MM-DD` for the admin. Limits: 3 SMS per
number in 10 minutes, 10 a day, 20 an hour per IP. `/api/config` reports `otp: true` when a provider
is set, and the app (`pro.js`) then shows the OTP fields. API: `/api/auth` actions `otpSend`
`{ phone, purpose }`, `otpLogin` `{ phone, otp }`, `otpReset` `{ phone, otp, newPassword }`,
`verify` `{ otp }` (logged in), `delete` takes `{ otp }` instead of the password, and `signup`
takes `{ otp }`. A user who used any OTP gets `verifiedAt`; `publicUser` sends `verified`. Tests:
`node test/otp-audit.js`. Locally: `OTP_PROVIDER=test npm run dev` prints the code in the terminal.
