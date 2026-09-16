import { CANONICAL_SITE_URL } from "@/lib/site-url";
import type { Metadata } from "next";
import { Manrope, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"], display: "swap" });

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_SITE_URL),
  title: {
    default: "PelotonFR — Ta prochaine course commence ici",
    template: "%s | PelotonFR",
  },
  description:
    "Trouve les courses cyclistes FFC, FSGT et UFOLEP près de chez toi. Consulte les parcours, prépare ta saison et retrouve ton club.",
  keywords: ["cyclisme", "course", "FFC", "FSGT", "UFOLEP", "calendrier", "France"],
  openGraph: {
    title: "PelotonFR",
    description: "Le calendrier du cyclisme amateur : courses, parcours et saison.",
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
      <html
        lang="fr"
        suppressHydrationWarning
        className={`${manrope.variable} ${display.variable} ${plexMono.variable} h-full antialiased`}
      >
        <head>
          {/* Anti-flash: apply dark class before hydration */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`,
            }}
          />
        </head>
        <body className="min-h-full flex flex-col">
          <TooltipProvider>{children}</TooltipProvider>
        </body>
      </html>
  );
}
