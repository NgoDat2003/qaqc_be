import { NextResponse } from "next/server";

type TimingMetric = {
  name: string;
  durationMs: number;
  description?: string;
};

export function withServerTiming<T extends NextResponse>(
  response: T,
  metrics: TimingMetric[]
) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_SERVER_TIMING !== "true") {
    return response;
  }

  response.headers.set(
    "Server-Timing",
    metrics
      .map((metric) => {
        const duration = metric.durationMs.toFixed(2);
        const description = metric.description ? `;desc=\"${metric.description}\"` : "";
        return `${metric.name};dur=${duration}${description}`;
      })
      .join(", ")
  );

  return response;
}
