/**
 * Text codec for save files. IndexedDB persists typed arrays directly via
 * structured clone, but a downloadable `.json` file cannot — `JSON.stringify`
 * turns a `Uint8Array` into a plain `{"0":..,"1":..}` object and loses its
 * type. These helpers tag each typed array as `{ $ta, $b64 }` so a save file
 * round-trips losslessly through text.
 */
import type { SaveFile } from "./schema";

/** Typed-array constructors a save file can contain. */
const CTORS = {
  Uint8Array,
  Uint16Array,
} as const;
type TypedArrayName = keyof typeof CTORS;

interface TaggedArray {
  $ta: TypedArrayName;
  $b64: string;
}

function isTaggedArray(v: unknown): v is TaggedArray {
  return (
    typeof v === "object" &&
    v !== null &&
    "$ta" in v &&
    "$b64" in v &&
    (v as TaggedArray).$ta in CTORS
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/** Serialize a save file to a JSON string, encoding typed arrays as base64. */
export function encodeSaveFile(file: SaveFile): string {
  return JSON.stringify(file, (_key, value) => {
    if (value instanceof Uint8Array) {
      return { $ta: "Uint8Array", $b64: bytesToBase64(value) };
    }
    if (value instanceof Uint16Array) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { $ta: "Uint16Array", $b64: bytesToBase64(bytes) };
    }
    return value;
  });
}

/**
 * Parse a save-file JSON string, rebuilding typed arrays. The result is an
 * untyped object — pass it through `migrate()` to validate and upgrade it.
 */
export function decodeSaveFile(text: string): unknown {
  return JSON.parse(text, (_key, value) => {
    if (isTaggedArray(value)) {
      const bytes = base64ToBytes(value.$b64);
      if (value.$ta === "Uint16Array") {
        return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      }
      return bytes;
    }
    return value;
  });
}
