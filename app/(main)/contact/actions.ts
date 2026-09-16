"use server";
import { headers } from "next/headers";
import { visitorKey } from "@/lib/request-security";
import { createContact, lookupContact } from "@/lib/contact";

export async function submitContact(category: string, message: string) {
  return createContact(category, message, visitorKey({ headers: await headers() }));
}
export async function readContact(id: string, code: string) {
  return lookupContact(id, code, visitorKey({ headers: await headers() }));
}
