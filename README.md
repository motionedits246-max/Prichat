# PriChat

An open-source HTTPS messenger for temporary conversations. Enter a display name, copy your person code, and invite another person to a direct chat or a discussion. No PriChat signup, email or phone number is required. The browser uses the chosen name in messages and invitations.

## Run on Windows, Linux or macOS

Install Node.js 24 or later. There are no runtime dependencies to install.

```powershell
git clone https://github.com/motionedits246-max/Prichat.git
cd Prichat
npm start
```

Open **http://127.0.0.1:5173**. For a two-person test on one PC, open two tabs with different temporary names. In one tab open your avatar and click your person code to copy it. In the other select **Message a person** and paste the code. Accept the invitation in the first tab. You can also create a discussion and send a single-use invite link. Use an HTTPS address when testing across devices. Browser cryptography requires a secure context.

## Rooms and identities

- The default identity lasts for the current tab. Refreshing or leaving discards its keys. **Keep on device** stores non-exportable private CryptoKeys and the display name in this browser's IndexedDB. Losing the browser profile loses the saved code.
- A person code is a 96-bit fingerprint of the device's encryption and signing public keys. Share or compare codes over a trusted channel. Display names can repeat.
- A direct chat has at most two participants. A discussion has at most eight. Only the creator can issue invitations. Links expire after ten minutes and can be redeemed once. Share links privately because their fragment contains the room key.
- A saved device earns a **blue activity tick** after sending encrypted chat packets in occupied rooms on three distinct UTC dates. The badge records a capped day count and the last credited UTC date. People can create multiple devices. The badge establishes neither identity nor uniqueness.
- Selecting **Leave and close** ends the room for everyone. A lost connection expires after 90 seconds, and a room has a one-hour lifetime. Messages are live-only. They reach active tabs through short polling and a two-minute encrypted delivery buffer. A late joiner gets no backlog from the official relay. A tab keeps up to 500 displayed messages in memory.
- **Forget identity** removes the current profile's saved keys from this browser and deletes its live badge record. Keys from a previously lost browser profile cannot be recovered.

## Sharing in a room

Press **Enter** or the send arrow. The progress bar completes when the relay accepts the message. Failed text stays in the composer. File uploads report progress as encrypted parts are accepted.

Use **Reply** beside any message to quote it. **More** opens quick reactions, an on-device extractive summary, forwarding, starring, a tab-local pin and copying. Replies link to the original message in its room. The smile button opens searchable emoji, GIFs, stickers, audio, live emoji and virtual gifts. The GIF and sticker catalogue is bundled locally.

Open **+** to share photos, video, audio files, documents, GIFs, emoji, a contact, an event, a note, or a location you review before sending. Pasting an image opens the same review step. The sticker maker crops a picture and adds an optional caption. The GIF maker combines two to eight local images. Choose **File or document** to send any extension, including an extensionless file, up to 50 MiB (52,428,800 bytes). Original file attachments can contain their original metadata. Open a received file to decrypt it on your device.

Post a poll or start **Tic-tac-toe** or **Four in a row** while participants are in the room. Votes can be changed. Game moves and votes travel as signed room messages. People who join later do not receive earlier cards. The creator plays first, and the first other participant to make a legal move takes the second seat.

Open Settings and use the pencil on your avatar, or select **Account → Profile picture**. The browser crops and re-encodes the image, persists it for device and permanent profiles, and shares it inside subsequent encrypted messages. Each attachment uses a fresh file key carried inside its signed room message. Published encrypted parts expire with their message timer or the room, whichever comes first. Unfinished uploads expire after two minutes without a new chunk, or when the room closes. Downloaded copies stay under the recipient’s control.

## Railway deployment

Deploy the repository as a single service and generate a public domain in Railway Networking. The Node server uses Railway’s assigned port and `RAILWAY_PUBLIC_DOMAIN` to construct the HTTPS origin for identity challenges. When using a custom domain, set `PUBLIC_ORIGIN` to the exact HTTPS origin opened in the browser, then redeploy. An old or mismatched `PUBLIC_ORIGIN` takes precedence over the generated domain and causes a 403 on `/api/info` and `/api/challenge`. One instance serves one canonical origin. Mount a persistent volume at `/app/data` to retain permanent profiles and badge progress across Railway redeploys.

## Profiles and room controls

Each person code generates its own geometric avatar locally. It follows the code when you reopen a saved identity. Settings opens a separate index and detail panel for profile editing, privacy, appearance, sounds and session information. Room Info includes current members, shared items, starred messages, invitations and local appearance controls. The creator can edit an encrypted description, restrict posting and set a timer for new messages. Stars and per-room preferences last for the room session. The optional camera and location actions request permission when chosen and let you review before sending.

Temporary identities and identities kept on a device both use the existing signup-free flow. A blue tick indicates activity on three messaging days. Permanent profiles earn a gold activity tick under the same rule.

Choose **Permanent** when starting, or **Settings → Account → Make profile permanent** to keep a newly generated code across browsers. Select **Log in**, then enter your code and password on the same host. Save both safely. There is no password reset. Older device profiles use non-exportable original keys and can still open in the original browser. Create a separate permanent code to use across devices.

The browser derives a lookup secret and an encryption key from a password of at least 15 characters using PBKDF2-SHA256 (600,000 iterations) and HKDF. The relay stores encrypted key material and encrypted profile details. Restoring the profile still requires signing the session challenge. Rooms and messages are excluded from the profile. A stolen database permits offline password guessing.

## Self-host with normal HTTPS

Run one Node process per instance. The self-host relay holds rooms, membership, connection state, invitations and ciphertext in an in-memory SQLite database. Restarting it ends all rooms. Only encrypted permanent profiles and opt-in activity badge records are written to `data/badges.sqlite`. The default binds to loopback. Place a TLS reverse proxy on the same host, set the canonical origin, and proxy to `127.0.0.1:5173`. A normal domain or a provider's HTTPS subdomain works. Review the host and proxy's logging and backup settings.

```powershell
$env:PUBLIC_ORIGIN = "https://chat.example.org"
npm start
```

An example Caddy configuration, to use with your own domain and DNS, is:

```caddyfile
chat.example.org {
    reverse_proxy 127.0.0.1:5173
}
```

A Docker build is also available. Publish the app port to the host loopback and mount a persistent volume for saved profiles and badge records. Set the same canonical origin used by the reverse proxy.

```powershell
docker build -t prichat .
docker run --rm -p 127.0.0.1:5173:5173 -v prichat-badges:/app/data -e PUBLIC_ORIGIN=https://chat.example.org prichat
```

### Operator connection counts

The operator API is disabled by default. To enable it, set `PRICHAT_OPERATOR_TOKEN` to a private, randomly generated value of at least 32 characters in the server environment. Keep it out of client code, URL parameters and source control. From the operator machine:

```powershell
Invoke-RestMethod http://127.0.0.1:5173/api/operator -Headers @{ Authorization = "Bearer $env:PRICHAT_OPERATOR_TOKEN" }
```

It lists live person codes with a connection count per activity: available, in a room, or away. This activity is reported by the official client and can be inaccurate or spoofed. Each participant can see their own total connection count under their name. The operator API does not return message contents, names, coordinates or IP addresses. The network host and reverse proxy can observe IP addresses. Using a persistent code lets the operator associate activity across visits.

## Hosting profiles

| | Node self-host | Managed worker pilot |
|---|---|---|
| Room delivery | In-process memory, single instance | D1 database shared across worker instances |
| Cleanup | A five-second sweep and request-time checks | Request-time cleanup and expiry checks; idle physical records await the next request |
| On closure | Deletes room and child records, no chat database on disk | Deletes live rows; provider recovery history may contain earlier ciphertext and metadata |
| Saved identities | Device keys in browser, optional encrypted profiles and badges on disk | Device keys in browser, optional encrypted profiles and badges in D1 |

The managed preview can have an outer owner-only access gate. Self-hosting the application requires no ChatGPT account. D1 offers provider-level point-in-time recovery. [Cloudflare D1 retention](https://developers.cloudflare.com/d1/reference/time-travel/)

## Cryptography and privacy limits

The browser generates separate P-256 ECDH and ECDSA key pairs through Web Crypto and proves possession of its signing key to open a session. Person-code invitations are encrypted with ECDH, HKDF-SHA-256 and AES-GCM. Each room has a random 256-bit symmetric key. Each message uses a fresh 96-bit nonce, AES-GCM with room and sender context, and a signature checked against the sender's fingerprint. The API sees public keys, room membership, which code sent each packet, timing and ciphertext sizes. Aliases and discussion names travel inside the encrypted payloads. Camera capture and device location require a separate user action. The app loads no external analytics, fonts or scripts.

**This first release uses an unaudited protocol.** It has no forward secrecy or post-compromise recovery. A stolen room key can expose recorded ciphertext from that room. For sensitive use, review both the protocol and its implementation. A compromised host can deliver modified JavaScript and a compromised device can read the screen. Participants can screenshot or save received messages. A hostile operator can log data or suppress room closure. The reference server enforces room expiry and closing; it cannot erase data from another person's device. Saved identities make activities linkable by design.

## Development

```powershell
npm test
npm run build
npm run validate
```

`public/` contains the accessible HTML, CSS, browser UI and cryptography. `relay.js` enforces invitation, membership and activity rules. `server.mjs` and `node-store.mjs` run the memory-backed self-host. `worker/index.js` and the SQL in `drizzle/` support the hosted pilot. The build embeds same-origin assets and shared code in the Worker output. Deployment-specific site identity in `.openai/hosting.json` belongs to the original preview. Recreate the binding and database for an independent Worker deployment.

Contributions are welcome under the MIT license. For security issues, contact the repository owner privately before publishing sensitive details.

Interface icons are bundled from Lucide 0.468.0. See [the Lucide license](licenses/lucide.txt). The browser GIF maker uses [gifenc 1.0.3](licenses/gifenc.txt).
