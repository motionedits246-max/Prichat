import { decode, random, utf8 } from "./crypto.js";
export const PART = 128 * 1024;
export const MAX_FILE = 50 * 1024 * 1024;
const safeImages = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const safeAudio = [
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/webm",
  "audio/flac",
  "audio/aac",
];
const safeVideo = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
export function mediaTag(type) {
  if (safeImages.includes(type)) return "img";
  if (safeAudio.includes(type)) return "audio";
  if (safeVideo.includes(type)) return "video";
  return "";
}
function encodeBytes(bytes) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 16384)
    raw += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
const fileKey = (secret, usage) =>
  crypto.subtle.importKey("raw", decode(secret), "AES-GCM", false, [usage]);
const params = (iv, room, id, index, size) => ({
  name: "AES-GCM",
  iv,
  additionalData: utf8(
    JSON.stringify(["PriChat file v1", room, id, index, size]),
  ),
});
export function validFile(f) {
  return (
    !!f &&
    /^[\w-]{22}$/.test(f.id) &&
    /^[\w-]{43}$/.test(f.secret) &&
    Number.isSafeInteger(f.size) &&
    f.size > 0 &&
    f.size <= MAX_FILE &&
    typeof f.filename === "string" &&
    f.filename.length <= 128 &&
    typeof f.mime === "string" &&
    f.mime.length <= 96
  );
}
// Keep large transfers moving without buffering the entire file in memory.
async function transferParts(count, task) {
  let next=0, failure;
  async function worker(){
    while(!failure && next<count){
      const i=next++;
      try{await task(i);}catch(error){failure=error;}
    }
  }
  await Promise.all(Array.from({length:Math.min(4,count)},worker));
  if(failure)throw failure;
}
export async function uploadFile(api, room, file, progress) {
  if (!file.size || file.size > MAX_FILE)
    throw Error("Choose a file between 1 byte and 50 MiB.");
  const f = {
    id: random(16),
    secret: random(32),
    filename: (file.name || "attachment").slice(0, 128),
    size: file.size,
    mime: file.type.split(";")[0].slice(0, 96),
  };
  const parts = Math.ceil(f.size / PART),
    key = await fileKey(f.secret, "encrypt");
  await api("upload-start", { room, file: f.id, parts });
  let completed=0;
  await transferParts(parts,async index=>{
    const bytes = await file
        .slice(index * PART, (index + 1) * PART)
        .arrayBuffer(),
      iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      params(iv, room, f.id, index, f.size),
      key,
      bytes,
    );
    await api("upload-part", {
      room,
      file: f.id,
      part: index,
      data: encodeBytes(iv) + "." + encodeBytes(new Uint8Array(encrypted)),
    });
    progress?.(++completed / (parts + 1));
  });
  return f;
}
export async function downloadFile(api, room, f) {
  if (!validFile(f)) throw Error("Invalid attachment.");
  const key = await fileKey(f.secret, "decrypt"),
    chunks = [];
  await transferParts(Math.ceil(f.size/PART),async index=>{
    const { data } = await api("download-part", {
      room,
      file: f.id,
      part: index,
    });
    if (typeof data !== "string" || data.length > 174801)
      throw Error("Invalid attachment data.");
    const [iv, cipher] = data.split(".");
    const bytes = await crypto.subtle.decrypt(
      params(decode(iv), room, f.id, index, f.size),
      key,
      decode(cipher),
    );
    if (bytes.byteLength !== Math.min(PART, f.size - index * PART))
      throw Error("Incomplete attachment.");
    chunks[index]=bytes;
  });
  return new Blob(chunks, {
    type: mediaTag(f.mime) ? f.mime : "application/octet-stream",
  });
}
export const validPhoto = (s) =>
  typeof s === "string" &&
  s.length <= 2400 &&
  /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(s);
async function sourceImage(file) {
  if (!file || !safeImages.includes(file.type) || file.size > 12 * 1024 * 1024)
    throw Error("Choose a JPEG, PNG, WebP or GIF under 12 MiB.");
  const image = await createImageBitmap(file);
  if (image.width * image.height > 40e6) {
    image.close();
    throw Error("Choose a smaller image.");
  }
  return image;
}
function surface(size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}
function drawFit(ctx, image, size, cover) {
  const scale = (cover ? Math.max : Math.min)(
    size / image.width,
    size / image.height,
  );
  const w = image.width * scale,
    h = image.height * scale;
  ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
}
export async function profilePhoto(file) {
  const image = await sourceImage(file);
  try {
    for (const size of [80, 64, 48, 32]) {
      const canvas = surface(size),
        ctx = canvas.getContext("2d");
      ctx.fillStyle = "#181a20";
      ctx.fillRect(0, 0, size, size);
      drawFit(ctx, image, size, true);
      const data = canvas.toDataURL("image/jpeg", 0.65);
      if (validPhoto(data)) return data;
    }
    throw Error("Could not resize this picture.");
  } finally {
    image.close();
  }
}
export async function makeSticker(file, caption, shape) {
  const image = await sourceImage(file),
    size = 256,
    canvas = surface(size),
    ctx = canvas.getContext("2d");
  try {
    ctx.beginPath();
    if (shape === "Circle") ctx.arc(128, 128, 124, 0, Math.PI * 2);
    else ctx.roundRect(4, 4, 248, 248, 34);
    ctx.clip();
    drawFit(ctx, image, size, true);
    if (caption) {
      ctx.font = "bold 27px system-ui";
      ctx.textAlign = "center";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#161619";
      ctx.fillStyle = "white";
      ctx.strokeText(caption, 128, 218, 226);
      ctx.fillText(caption, 128, 218, 226);
    }
    const blob = await new Promise((ok, fail) =>
      canvas.toBlob(
        (x) => (x ? ok(x) : fail(Error("Could not create sticker."))),
        "image/png",
      ),
    );
    return new File([blob], "sticker.png", { type: "image/png" });
  } finally {
    image.close();
  }
}
export async function makeGif(files, delay) {
  if (files.length < 2 || files.length > 8)
    throw Error("Select two to eight pictures.");
  const { GIFEncoder, quantize, applyPalette } = await import("./gifenc.js");
  const gif = GIFEncoder(),
    size = 256,
    canvas = surface(size),
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  for (const file of files) {
    const image = await sourceImage(file);
    try {
      ctx.fillStyle = "#17191e";
      ctx.fillRect(0, 0, size, size);
      drawFit(ctx, image, size, false);
    } finally {
      image.close();
    }
    const pixels = ctx.getImageData(0, 0, size, size).data,
      palette = quantize(pixels, 128),
      indexed = applyPalette(pixels, palette);
    gif.writeFrame(indexed, size, size, { palette, delay, repeat: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  gif.finish();
  return new File([gif.bytes()], "animation.gif", { type: "image/gif" });
}
