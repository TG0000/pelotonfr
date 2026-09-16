import { PlanProvider } from "@/hooks/usePlan";
import { Beacon } from "@/components/layout/Beacon";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlanProvider>
      {/* Reaching the races by keyboard meant tabbing through the whole
          navigation on every page. */}
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      {process.env.VERCEL_ENV === "preview" && <div className="bg-primary text-primary-foreground text-center text-xs px-4 py-2">Version de test V0.2 · Les courses « Démo » sont fictives.</div>}
      <Navbar />
      <main id="contenu" className="flex-1">
        {children}
        {/* Une vue par page, sans personne dedans : le tableau de bord lit d'où le site est lu. */}
        <Beacon />
      </main>
      <Footer />
    </PlanProvider>
  );
}
