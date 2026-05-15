import { NextResponse } from "next/server";

type ServerTimingMetric = {
  name: string;
  durationMs: number;
  description?: string;
};

function sanitizeMetricName(name: string) {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

function sanitizeDescription(description: string) {
  return description.replace(/["\\]/g, "");
}

export function formatServerTiming(metrics: ServerTimingMetric[]) {
  return metrics
    .map((metric) => {
      const parts = [
        sanitizeMetricName(metric.name),
        `dur=${Math.max(0, metric.durationMs).toFixed(2)}`,
      ];

      if (metric.description) {
        parts.push(`desc="${sanitizeDescription(metric.description)}"`);
      }

      return parts.join(";");
    })
    .join(", ");
}

export function withServerTiming<T extends NextResponse>(
  res: T,
  metrics: ServerTimingMetric[]
): T {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_SERVER_TIMING !== "true") {
    return res;
  }

  res.headers.set("Server-Timing", formatServerTiming(metrics));
  return res;
}
