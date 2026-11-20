# PriChat

An open-source HTTPS messenger for temporary conversations. Enter a display name, copy your person code, and invite another person to a direct chat or a discussion. No PriChat signup, email or phone number is required. The browser uses the chosen name in messages and invitations.

## Run on Windows, Linux or macOS

Install Node.js 24 or later. There are no runtime dependencies to install.

```powershell
git clone https://github.com/motionedits246-max/Prichat.git
cd Prichat
npm start
```

Open **http://127.0.0.1:5173**. For a two-person test on one PC, open two tabs with different temporary names. In one tab select your name and **Copy person code**. In the other select **New conversation → Message a person** and paste the code. Accept the invitation in the first tab. You can also create a discussion and send a single-use invite link. Use an HTTPS address when testing across devices. Browser cryptography requires a secure context.

## Rooms and identities

- The default identity lasts for the current tab. Refreshing or leaving discards its keys. **Keep on device** stores non-exportable private CryptoKeys and the display name in this browser's IndexedDB. Losing the browser profile loses the saved code.
- A person code is a 96-bit fingerprint of the device's encryption and signing public keys. Share or compare codes over a trusted channel. Display names can repeat.
- A direct chat has at most two participants. A discussion has at most eight. Only the creator can issue invitations. Links expire after ten minutes and can be redeemed once. Share links privately because their fragment contains the room key.
- A saved device earns a **blue activity tick** after sending encrypted chat packets in occupied rooms on three distinct UTC dates. The badge records a capped day count and the last credited UTC date. People can create multiple devices. The badge establishes neither identity nor uniqueness.
- Selecting **Leave and close** ends the room for everyone. A lost connection expires after 90 seconds, and a room has a one-hour lifetime. Messages are live-only. They reach active tabs through short polling and a two-minute encrypted delivery buffer. A late joiner gets no backlog from the official relay. A tab keeps up to 500 displayed messages in memory.
- **Forget identity** removes the current profile's saved keys from this browser and deletes its live badge record. Keys from a previously lost browser profile cannot be recovered.

## Self-host with normal HTTPS

Run one Node process per instance. The self-host relay holds rooms, membership, connection state, invitations and ciphertext in an in-memory SQLite database. Restarting it ends all rooms. Only opt-in activity badge records are written to `data/badges.sqlite`. The default binds to loopback. Place a TLS reverse proxy on the same host, set the canonical origin, and proxy to `127.0.0.1:5173`. A normal domain or a provider's HTTPS subdomain works. Review the host and proxy's logging and backup settings.

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

A Docker build is also available. Publish the app port to the host loopback and give only the badge store a volume. Set the same canonical origin used by the reverse proxy.

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
| Saved identities | Device keys in browser, optional badge records on disk | Device keys in browser, optional badge records in D1 |

The managed preview can have an outer owner-only access gate. Self-hosting the application requires no ChatGPT account. D1 offers provider-level point-in-time recovery. [Cloudflare D1 retention](https://developers.cloudflare.com/d1/reference/time-travel/)

## Cryptography and privacy limits

The browser generates separate P-256 ECDH and ECDSA key pairs through Web Crypto and proves possession of its signing key to open a session. Person-code invitations are encrypted with ECDH, HKDF-SHA-256 and AES-GCM. Each room has a random 256-bit symmetric key. Each message uses a fresh 96-bit nonce, AES-GCM with room and sender context, and a signature checked against the sender's fingerprint. The API sees public keys, room membership, which code sent each packet, timing and ciphertext sizes. Aliases and discussion names travel inside the encrypted payloads. The app requests no location, contacts, camera or microphone permissions and loads no external analytics, fonts or scripts.

**This first release uses an unaudited protocol.** It has no forward secrecy or post-compromise recovery. A stolen room key can expose recorded ciphertext from that room. For sensitive use, review both the protocol and its implementation. A compromised host can deliver modified JavaScript and a compromised device can read the screen. Participants can screenshot or save received messages. A hostile operator can log data or suppress room closure. The reference server enforces room expiry and closing; it cannot erase data from another person's device. Saved identities make activities linkable by design.

## Development

```powershell
npm test
npm run build
npm run validate
```

`public/` contains the accessible HTML, CSS, browser UI and cryptography. `relay.js` enforces invitation, membership and activity rules. `server.mjs` and `node-store.mjs` run the memory-backed self-host. `worker/index.js` and the SQL in `drizzle/` support the hosted pilot. The build embeds same-origin assets and shared code in the Worker output. Deployment-specific site identity in `.openai/hosting.json` belongs to the original preview. Recreate the binding and database for an independent Worker deployment.

Contributions are welcome under the MIT license. For security issues, contact the repository owner privately before publishing sensitive details.

