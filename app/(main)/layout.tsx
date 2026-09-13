import { isOperator } from "@/lib/admin";
import { Beacon } from "@/components/layout/Beacon";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Reaching the races by keyboard meant tabbing through the whole
          navigation on every page. */}
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <Navbar operator={await isOperator()} />
      <main id="contenu" className="flex-1">
        {children}
        {/* Une vue par page, sans personne dedans : le tableau de bord lit d'où le site est lu. */}
        <Beacon />
      </main>
      <Footer />
    </>
  );
}
