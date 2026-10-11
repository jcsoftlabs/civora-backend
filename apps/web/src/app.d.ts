import type { Locale } from "$lib/i18n";

declare global {
  namespace App {
    interface Locals {
      surface: "marketing" | "console" | "admin" | "site";
      locale: Locale;
      partyHost?: string;
      partyId?: string;
    }
    interface Error {
      code: string;
    }
  }
}
export {};
