import axios, { isAxiosError } from "axios";
import type { AxiosRequestConfig } from "axios";
import type { ZodType } from "zod";

import { env } from "@/config/env";

export type ApiError = { ok: false; status: number; message: string };
export type ApiResult<T> = { ok: true; data: T } | ApiError;

// Extraxts a human message out of an error field that may be a string, an array
// of strings, or an array of objects.
function extractField(value: unknown): string | null {
  if (typeof value === "string") {
    return value || null;
  }

  if (Array.isArray(value)) {
    const parts = value.map((item) =>
      item && typeof item === "object" && "msg" in item
        ? String((item as { msg: unknown }).msg)
        : String(item)
    );
    return parts.join("; ") || null;
  }

  return null;
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const { detail, message, error } = data as Record<string, unknown>;
    const field =
      extractField(detail) ?? extractField(message) ?? extractField(error);

    if (field !== null) {
      return field;
    }
  }

  if (typeof data === "string" && data) {
    return data;
  }

  return fallback || "Request failed";
}

function createJsonApi(basePath = "") {
  const gatewayUrl = env.gatewayUrl || "http://localhost:8000";
  const instance = axios.create({ baseURL: `${gatewayUrl}${basePath}` });

  async function request<T>(
    schema: ZodType<T>,
    config: AxiosRequestConfig
  ): Promise<T> {
    try {
      const { data } = await instance.request<unknown>(config);
      return schema.parse(data);
    } catch (err) {
      if (isAxiosError(err)) {
        throw new Error(getErrorMessage(err.response?.data, err.message));
      }

      throw err;
    }
  }

  return {
    get: <T>(schema: ZodType<T>, url: string) => request(schema, { url }),
    post: <T>(schema: ZodType<T>, url: string, data: unknown) =>
      request(schema, { url, method: "POST", data }),
    delete: <T>(schema: ZodType<T>, url: string) =>
      request(schema, { url, method: "DELETE" }),
  };
}

export const api = {
  airport: createJsonApi("/api/airport"),
  beach: createJsonApi(),
  hotel: createJsonApi("/api/hotel"),
  parrot: createJsonApi("/api/parrot"),
};
