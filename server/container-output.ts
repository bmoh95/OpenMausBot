export type ScreenshotCheck = { ok: boolean; mime: "image/png" | "image/jpeg" };

/** A truncated base64 transfer must never become a "successful" preview frame. */
export function wholeScreenshot(bytes: Buffer): ScreenshotCheck {
  if (bytes.length < 512) return { ok: false, mime: "image/png" };
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (png) {
    return {
      ok: bytes.subarray(Math.max(0, bytes.length - 12)).includes(Buffer.from("IEND", "ascii")),
      mime: "image/png",
    };
  }
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  return {
    ok: jpeg && bytes.subarray(Math.max(0, bytes.length - 32)).includes(Buffer.from([0xff, 0xd9])),
    mime: "image/jpeg",
  };
}

export function clipExecOutput(text: string, limit = 20_000): string {
  if (text.length <= limit) return text;
  const head = Math.floor(limit / 5);
  return `${text.slice(0, head)}\n… ${text.length - limit} characters omitted …\n${text.slice(text.length - (limit - head))}`;
}

