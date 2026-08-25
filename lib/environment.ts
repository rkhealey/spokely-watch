import { cookies } from "next/headers";
import type { Environment } from "@prisma/client";

export const ENVIRONMENT_FILTER_COOKIE_NAME = "spokely_environment_filter";
const ENVIRONMENT_FILTER_DURATION_SECONDS = 60 * 60 * 24 * 365;

// The dashboard's global Production/Development toggle. Defaults to
// PRODUCTION so an unset cookie never accidentally shows dev/test traffic.
export async function getEnvironmentFilter(): Promise<Environment> {
  const value = (await cookies()).get(ENVIRONMENT_FILTER_COOKIE_NAME)?.value;
  return value === "DEVELOPMENT" ? "DEVELOPMENT" : "PRODUCTION";
}

export async function setEnvironmentFilterCookie(environment: Environment) {
  (await cookies()).set(ENVIRONMENT_FILTER_COOKIE_NAME, environment, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ENVIRONMENT_FILTER_DURATION_SECONDS,
  });
}
