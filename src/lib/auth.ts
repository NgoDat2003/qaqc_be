import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "qualityops_jwt_secret_dev_2026_change_in_prod"
);

export interface JWTPayload {
  userId: string;
  email: string;
  roleKeys: string[];
  defaultRole: string;
}

export async function signToken(payload: JWTPayload) {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h") // Token valid for 24 hours
    .sign(SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as JWTPayload;
  } catch (err) {
    return null;
  }
}
