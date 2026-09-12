import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { HttpError } from "./HttpError.js";

const mimeExtensions = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "application/pdf": new Set([".pdf"]),
} as const;

export type PrivateEvidenceMetadata = {
  originalName: string;
  mimeType: keyof typeof mimeExtensions;
  extension: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
};

export function inspectPrivateEvidence(
  originalNameHeader: string | undefined,
  mimeHeader: string | undefined,
  content: Buffer,
  maximumBytes: number,
  folder: string,
): PrivateEvidenceMetadata {
  const normalizedMime = (mimeHeader ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!(normalizedMime in mimeExtensions)) {
    throw new HttpError({ code: "EVIDENCE_MEDIA_TYPE_UNSUPPORTED", message: "Solo se admiten archivos JPEG, PNG o PDF.", statusCode: 415 });
  }
  const mimeType = normalizedMime as keyof typeof mimeExtensions;
  const allowedExtensions = mimeExtensions[mimeType];
  if (content.length === 0 || content.length > maximumBytes) {
    throw new HttpError({ code: "EVIDENCE_SIZE_INVALID", message: "El archivo está vacío o excede el tamaño permitido.", statusCode: 413 });
  }
  const originalName = (originalNameHeader ?? "evidencia").replace(/[\r\n/\\]/g, "_").slice(0, 255);
  const extension = extname(originalName).toLowerCase();
  if (!allowedExtensions.has(extension) || !hasExpectedSignature(mimeType, content)) {
    throw new HttpError({ code: "EVIDENCE_CONTENT_INVALID", message: "La extensión, el MIME y el contenido del archivo no coinciden.", statusCode: 415 });
  }
  return {
    originalName,
    mimeType,
    extension,
    sizeBytes: content.length,
    checksum: createHash("sha256").update(content).digest("hex"),
    storageKey: `${folder}/${randomUUID()}${extension}`,
  };
}

function hasExpectedSignature(mimeType: keyof typeof mimeExtensions, content: Buffer): boolean {
  if (mimeType === "image/png") return content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  return content.subarray(0, 5).toString("ascii") === "%PDF-";
}
