import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";
export const metadata: Metadata = { title: "Contact", description: "Contacter PelotonFR et suivre une demande de support ou de confidentialité." };
export default function ContactPage() {
  return <article className="mx-auto max-w-2xl px-4 py-10"><h1 className="text-3xl font-bold">Contact</h1>
    <p className="my-5 text-muted-foreground">Une question, une erreur à corriger ou une demande concernant tes données ? Écris-nous ici. Aucun compte ni adresse e-mail ne sont nécessaires.</p>
    <ContactForm />
  </article>;
}
