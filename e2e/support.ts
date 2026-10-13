import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../src/types/database";

export const STATE_FILE = path.resolve(process.cwd(), ".playwright/accounts.json");
export const PASSWORD = "E2eTest-Passw0rd";

export type Accounts = {
  runId: string;
  visitor: { id: string; email: string; name: string };
  company: { id: string; email: string; name: string; companyName: string };
  admin: { id: string; email: string; name: string };
};

/**
 * Accounts written by global setup. Spec files may be loaded before setup
 * runs, so the file is read lazily on first property access.
 */
export function readAccounts(): Accounts {
  let cached: Accounts | undefined;
  return new Proxy({} as Accounts, {
    get(_target, key) {
      cached ??= JSON.parse(readFileSync(STATE_FILE, "utf8")) as Accounts;
      return cached[key as keyof Accounts];
    },
  });
}

export function loadEnv() {
  process.loadEnvFile?.(path.resolve(process.cwd(), ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishable || !secret) throw new Error("E2E tests need Supabase settings in .env.local");
  return { url, publishable, secret };
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient() {
  const env = loadEnv();
  return createClient<Database>(env.url, env.secret, noSession);
}

export function anonClient() {
  const env = loadEnv();
  return createClient<Database>(env.url, env.publishable, noSession);
}

export async function login(page: Page, email: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
}
