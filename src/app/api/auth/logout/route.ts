import { response } from "@/lib/api-response";

// POST /api/auth/logout
// Clear the qo_token cookie by setting maxAge to 0
export async function POST() {
  const res = response.success(null, "Logged out successfully");

  res.cookies.set("qo_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0, // expire immediately
    path: "/",
  });

  return res;
}
