import { NextResponse, NextRequest } from "next/server";
import { verifyToken } from "./lib/auth";

export async function middleware(request: NextRequest) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "http://localhost:3001",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "http://localhost:3001",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
  };

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && pathname !== "/api/auth/login") {
    const token = request.cookies.get("qo_token")?.value;

    if (!token) {
      return NextResponse.json(
        { message: "Unauthorized access", statusCode: 401 },
        { status: 401, headers: corsHeaders }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { message: "Invalid token", statusCode: 401 },
        { status: 401, headers: corsHeaders }
      );
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", decoded.userId);
    requestHeaders.set("x-user-roles", JSON.stringify(decoded.roleKeys));
    requestHeaders.set("x-user-email", decoded.email);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }

  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
