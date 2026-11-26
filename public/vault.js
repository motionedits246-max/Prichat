import {
  makeDevice,
  personCode,
  base64,
  decode,
  utf8,
  random,
  packInvite,
  unpackInvite,
} from "./crypto.js";
import { validPhoto } from "./media.js";

const invalid = () => Error("Check your person code and password.");
async function importDevice(pair, expected) {
  const keys = await Promise.all(
    ["ECDH", "ECDSA"].map(async (name, i) => {
      const jwk = pair[i];
      if (
        jwk?.crv !== "P-256" ||
        ![jwk.x, jwk.y, jwk.d].every(
          (x) => typeof x === "string" && /^[\w-]{43}$/.test(x),
        )
      )
        throw invalid();
      const raw = new Uint8Array(65);
      raw[0] = 4;
      raw.set(decode(jwk.x), 1);
      raw.set(decode(jwk.y), 33);
      return {
        pub: base64(raw),
        key: await crypto.subtle.importKey(
          "jwk",
          jwk,
          { name, namedCurve: "P-256" },
          false,
          [i ? "sign" : "deriveBits"],
        ),
      };
    }),
  );
  const [b, s] = keys,
    code = await personCode(b.pub, s.pub);
  if (code !== expected) throw invalid();
  return { code, box: b.pub, sign: s.pub, boxKey: b.key, signKey: s.key };
}
// Encrypt the enrollment copy to this device before storing its non-exportable active keys.
export async function prepareDevice() {
  const fresh = await makeDevice(true);
  const pair = await Promise.all(
    [fresh.boxKey, fresh.signKey].map((k) => crypto.subtle.exportKey("jwk", k)),
  );
  const device = await importDevice(pair, fresh.code);
  return { device, enrollment: await packInvite(device, device, pair) };
}
async function access(code, password) {
  if (
    !/^PC-(?:[0-9A-F]{4}-){5}[0-9A-F]{4}$/.test(code) ||
    typeof password !== "string" ||
    !password.length ||
    password.length > 256
  )
    throw invalid();
  const base = await crypto.subtle.importKey(
    "raw",
    utf8(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 600000,
      salt: utf8("PriChat/profile/access/v1/" + code),
    },
    base,
    256,
  );
  const root = await crypto.subtle.importKey("raw", bits, "HKDF", false, [
    "deriveBits",
    "deriveKey",
  ]);
  new Uint8Array(bits).fill(0);
  const locator = base64(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: utf8("PriChat/profile/locator/v1"),
      },
      root,
      256,
    ),
  );
  return { root, locator };
}
function derive(root, salt) {
  if (typeof salt !== "string" || !/^[\w-]{22}$/.test(salt)) throw invalid();
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: decode(salt),
      info: utf8("PriChat/profile/encryption/v1"),
    },
    root,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
const params = (iv, code, part) => ({
  name: "AES-GCM",
  iv,
  additionalData: utf8("PriChat/profile/v1/" + code + "/" + part),
});
async function seal(key, code, part, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return (
    base64(iv) +
    "." +
    base64(
      await crypto.subtle.encrypt(
        params(iv, code, part),
        key,
        utf8(JSON.stringify(obj)),
      ),
    )
  );
}
async function open(key, code, part, packet) {
  const [iv, ct] = packet.split(".");
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        params(decode(iv), code, part),
        key,
        decode(ct),
      ),
    ),
  );
}
function fields(name, photo) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 32 ||
    (photo !== "" && !validPhoto(photo))
  )
    throw Error("Invalid profile details.");
  return { name, photo };
}
export async function enrollProfile(
  api,
  session,
  device,
  enrollment,
  password,
  name,
  photo,
) {
  if (!enrollment)
    throw Error("This device-only profile needs its original browser.");
  if (password.length < 15 || password.length > 256)
    throw Error("Use a password of 15–256 characters.");
  const code = device.code,
    { root, locator } = await access(code, password),
    salt = random(16),
    key = await derive(root, salt);
  const keys = await seal(
      key,
      code,
      "keys",
      await unpackInvite(device, device, enrollment),
    ),
    profile = await seal(key, code, "profile", fields(name, photo));
  try {
    const { revision } = await api(
      "profile-create",
      { locator, salt, keys, profile },
      session,
    );
    return { code, key, revision };
  } catch (err) {
    if (err.status === 409) {
      try {
        return (await restoreProfile(api, code, password)).vault;
      } catch {}
    }
    throw err;
  }
}
export async function restoreProfile(api, input, password) {
  const code = input.trim().toUpperCase(),
    { root, locator } = await access(code, password);
  const row = await api("profile-open", { code, locator }, "");
  try {
    const key = await derive(root, row.salt),
      pair = await open(key, code, "keys", row.keys),
      meta = await open(key, code, "profile", row.profile);
    return {
      device: await importDevice(pair, code),
      ...fields(meta.name, meta.photo),
      vault: { code, key, revision: row.revision },
    };
  } catch {
    throw invalid();
  }
}
export async function updateProfile(api, session, vault, name, photo) {
  const profile = await seal(
    vault.key,
    vault.code,
    "profile",
    fields(name, photo),
  );
  const res = await api(
    "profile-update",
    { profile, revision: vault.revision },
    session,
  );
  vault.revision = res.revision;
}
