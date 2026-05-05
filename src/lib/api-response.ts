import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Typed response format:
//   Success: { data: T, message?: string }
//   Error:   { message: string, statusCode: number }
// ---------------------------------------------------------------------------

export const response = {
  success: <T>(data: T, message?: string, meta?: any, status = 200) => {
    return NextResponse.json(
      {
        success: true,
        data,
        message,
        meta,
      },
      { status }
    );
  },

  created: <T>(data: T, message?: string) => {
    return NextResponse.json(
      { success: true, data, message },
      { status: 201 }
    );
  },

  error: (message: string, status = 400, code?: string, details?: any) => {
    return NextResponse.json(
      {
        success: false,
        error: {
          statusCode: status,
          message,
          code,
          details,
        },
      },
      { status }
    );
  },

  unauthorized: (message = "Unauthorized access") => {
    return NextResponse.json(
      {
        success: false,
        error: {
          statusCode: 401,
          message,
          code: "UNAUTHORIZED",
        },
      },
      { status: 401 }
    );
  },

  forbidden: (message = "Permission denied") => {
    return NextResponse.json(
      {
        success: false,
        error: {
          statusCode: 403,
          message,
          code: "FORBIDDEN",
        },
      },
      { status: 403 }
    );
  },
};
