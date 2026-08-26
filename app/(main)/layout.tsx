import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function MainLayout({
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
      <Navbar />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
