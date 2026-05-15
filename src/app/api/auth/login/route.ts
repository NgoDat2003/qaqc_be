import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { response } from "@/lib/api-response";

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return response.error("Email and password are required", 400);
    }

    // 1. Find user with role assignments
    const user = await prisma.user.findUnique({
      where: { email: email as string },
      include: { roleAssignments: true },
    });

    if (!user) {
      return response.error("Invalid credentials", 401);
    }

    if (!user.isActive) {
      return response.error("Account is disabled", 403);
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(password as string, user.password);
    if (!isPasswordValid) {
      return response.error("Invalid credentials", 401);
    }

    // 3. Extract roles
    const roleKeys = user.roleAssignments.map((r) => r.roleKey);
    const defaultRole = roleKeys.length > 0 ? roleKeys[0] : "";

    // 4. Sign JWT
    const token = await signToken({
      userId: user.id,
      email: user.email,
      roleKeys,
      defaultRole,
    });

    // 5. Build response
    const data = {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      activeRole: defaultRole,
      availableRoles: roleKeys,
    };

    const res = response.success(data, "Login successful");

    res.cookies.set("qo_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return res;
  } catch (error) {
    console.error("Login error:", error);
    return response.error("Internal server error", 500);
  }
}
