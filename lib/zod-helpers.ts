import { z } from "zod";

export const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Must be a valid ISO 8601 date string",
});
