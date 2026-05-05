import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { response } from "@/lib/api-response";
import { requireRole } from "@/lib/rbac";
import { writeFile } from "fs/promises";
import path from "path";
import fs from "fs";

export async function POST(request: NextRequest) {
  try {
    const forbidden = requireRole(request, ["qc_auditor", "qa_manager", "store_manager"]);
    if (forbidden) return forbidden;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string || "photo";

    if (!file) {
      return response.error("No file provided", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // In dev, save to public/uploads/evidence
    // Ensure dir exists
    const uploadDir = path.join(process.cwd(), "public", "uploads", "evidence");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.name) || ".jpg";
    const filename = `${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
    const filePath = path.join(uploadDir, filename);

    await writeFile(filePath, buffer);

    const url = `/uploads/evidence/${filename}`;

    const evidence = await prisma.evidence.create({
      data: {
        url,
        mimeType: type,
      },
    });

    return response.created({ id: evidence.id, url: evidence.url });
  } catch (error) {
    console.error("POST Upload Evidence Error:", error);
    return response.error("Internal server error", 500);
  }
}
