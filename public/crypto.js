// Web Crypto primitives shared by the browser and relay. Private keys never go to the API.
const encoder = new TextEncoder();
export const utf8 = (value) => encoder.encode(value);
export const base64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
export const decode = (value) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
export const random = (size) =>
  base64(crypto.getRandomValues(new Uint8Array(size)));
export async function digest(value) {
  return base64(await crypto.subtle.digest("SHA-256", utf8(value)));
}
const curve = (name) => ({ name, namedCurve: "P-256" });
const signature = { name: "ECDSA", hash: "SHA-256" };
export async function personCode(box, sign) {
  const hash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      utf8("PriChat identity v1|" + box + "|" + sign),
    ),
  );
  const encoded = Array.from(hash.slice(0, 12), (n) =>
    n.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
  return "PC-" + encoded.match(/.{4}/g).join("-");
}
export async function makeDevice() {
  const [box, sign] = await Promise.all([
    crypto.subtle.generateKey(curve("ECDH"), false, ["deriveBits"]),
    crypto.subtle.generateKey(curve("ECDSA"), false, ["sign", "verify"]),
  ]);
  const pub = async (key) => base64(await crypto.subtle.exportKey("raw", key));
  const b = await pub(box.publicKey),
    s = await pub(sign.publicKey);
  return {
    boxKey: box.privateKey,
    signKey: sign.privateKey,
    box: b,
    sign: s,
    code: await personCode(b, s),
  };
}
export async function signText(key, value) {
  return base64(await crypto.subtle.sign(signature, key, utf8(value)));
}
export async function verifyText(pub, value, sig) {
  const k = await crypto.subtle.importKey(
    "raw",
    decode(pub),
    curve("ECDSA"),
    false,
    ["verify"],
  );
  return crypto.subtle.verify(signature, k, decode(sig), utf8(value));
}
export const loginProof = (origin, nonce) =>
  JSON.stringify(["PriChat login v1", origin, nonce]);
const aes = (bytes) =>
  crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
async function seal(key, context, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(context) },
    key,
    utf8(JSON.stringify(obj)),
  );
  return base64(iv) + "." + base64(ciphertext);
}
async function open(key, context, packet) {
  const [iv, ct] = packet.split(".");
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(iv), additionalData: utf8(context) },
    key,
    decode(ct),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
const envelopeContext = (room, code) =>
  JSON.stringify(["PriChat room v1", room, code]);
export async function packMessage(id, room, secret, value) {
  const context = envelopeContext(room, id.code);
  const encrypted = await seal(await aes(decode(secret)), context, value);
  return (
    encrypted + "~" + (await signText(id.signKey, context + "|" + encrypted))
  );
}
export async function unpackMessage(peer, room, secret, packet) {
  const [encrypted, sig] = packet.split("~"),
    context = envelopeContext(room, peer.code);
  if (
    (await personCode(peer.box, peer.sign)) !== peer.code ||
    !(await verifyText(peer.sign, context + "|" + encrypted, sig))
  )
    throw Error("Unverified message");
  return open(await aes(decode(secret)), context, encrypted);
}
export async function verifyRecipient(expected, peer) {
  if (
    peer?.code !== expected ||
    (await personCode(peer.box, peer.sign)) !== expected
  ) {
    throw Error(
      "The returned device keys do not match the person code you entered.",
    );
  }
  return peer;
}
async function inviteKey(device, peer, context) {
  if ((await personCode(peer.box, peer.sign)) !== peer.code)
    throw Error("Person code does not match the device keys.");
  const key = await crypto.subtle.importKey(
    "raw",
    decode(peer.box),
    curve("ECDH"),
    false,
    [],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: key },
    device.boxKey,
    256,
  );
  const ikm = await crypto.subtle.importKey("raw", bits, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: utf8("PriChat invite v1"),
      info: utf8(context),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function packInvite(device, peer, value) {
  const context = device.code + "|" + peer.code;
  return seal(await inviteKey(device, peer, context), context, value);
}
export async function unpackInvite(device, peer, packet) {
  const context = peer.code + "|" + device.code;
  return open(await inviteKey(device, peer, context), context, packet);
}
