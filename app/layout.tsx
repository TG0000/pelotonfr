import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/**
 * Two voices, two jobs.
 *
 * Archivo has the sturdy, faintly condensed build of French road signage, which
 * is the register the calendar side of the product speaks in. Plex Mono carries
 * everything measured — dossards, times, placings, points — so a number always
 * looks like a number and columns of them line up.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PelotonFR — Toutes les courses cyclistes en France",
    template: "%s | PelotonFR",
  },
  description:
    "Retrouvez toutes les courses cyclistes en France : FFC, FSGT, UFOLEP. Calendrier, carte interactive et filtres avancés.",
  keywords: ["cyclisme", "course", "FFC", "FSGT", "UFOLEP", "calendrier", "France"],
  openGraph: {
    title: "PelotonFR",
    description: "Toutes les courses cyclistes en France",
    type: "website",
    locale: "fr_FR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="fr"
        suppressHydrationWarning
        className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
      >
        <head>
          {/* Anti-flash: apply dark class before hydration */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
            }}
          />
        </head>
        <body className="min-h-full flex flex-col">
          <TooltipProvider>{children}</TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
