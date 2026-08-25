"use server";

import type { Environment } from "@prisma/client";
import { setEnvironmentFilterCookie } from "@/lib/environment";

export async function setEnvironmentFilter(environment: Environment) {
  await setEnvironmentFilterCookie(environment);
}
