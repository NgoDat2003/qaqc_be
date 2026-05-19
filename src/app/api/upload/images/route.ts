import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
const IMAGE_UPLOAD_ROLES = ["qc_auditor", "store_manager", "qa_manager"];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

function hasValidImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (mimeType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
}

export async function POST(request: NextRequest) {
  const forbidden = requireRole(request, IMAGE_UPLOAD_ROLES);
  if (forbidden) return forbidden;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return response.error("Image file is required", 400);
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return response.error("Only JPEG, PNG, and WEBP images are allowed", 400);
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return response.error("Image size must not exceed 5MB", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasValidImageSignature(buffer, file.type)) {
      return response.error("Image content does not match the declared file type", 400);
    }

    const fileName = `${Date.now()}-${randomUUID()}${extensionForMimeType(file.type)}`;
    const relativeDir = path.join("uploads", "evidence");
    const outputDir = path.join(process.cwd(), "public", relativeDir);
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, fileName), buffer);

    const image = await prisma.evidence.create({
      data: {
        url: `/${relativeDir.replace(/\\/g, "/")}/${fileName}`,
        fileName: file.name,
        mimeType: file.type,
      },
      select: {
        id: true,
        url: true,
        fileName: true,
        mimeType: true,
      },
    });

    return response.created(image, "Image uploaded successfully");
  } catch (error) {
    console.error("Upload image error:", error);
    return response.error("Internal server error", 500);
  }
}
