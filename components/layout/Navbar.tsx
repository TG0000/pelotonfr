"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { Bell, CalendarDays, Flag, Menu, UserRound, Users } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navLinks = [
  // One entry for the races: the calendar carries the filters, and the list and
  // the map are two of its views rather than two more places to set them again.
  { href: "/calendrier", label: "Courses", icon: CalendarDays },
  // And one for the rider. Everything personal lives behind this.
  { href: "/ma-saison", label: "Ma saison", icon: Flag },
  // Le club, parce qu'en FFC un coureur ne s'engage pas lui-même.
  { href: "/club", label: "Mon club", icon: Users },
  { href: "/alertes", label: "Alertes", icon: Bell },
  { href: "/profil", label: "Profil", icon: UserRound },
];

function NavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

export function Navbar() {
  const { isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="shrink-0" aria-label="PelotonFR — accueil">
          <Logo className="size-8 sm:hidden" />
          <Wordmark className="hidden sm:inline-flex" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 ml-4">
          {navLinks.map((link) => (
            <NavLink key={link.href} {...link} />
          ))}
        </nav>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {isSignedIn ? (
            <UserButton />
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm">
                  Connexion
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm">
                  S&apos;inscrire
                </Button>
              </SignUpButton>
            </div>
          )}

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="md:hidden" />
              }
            >
              <Menu className="size-5" />
              <span className="sr-only">Menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Wordmark />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 mt-6">
                {navLinks.map((link) => (
                  <NavLink key={link.href} {...link} />
                ))}
              </nav>
              {!isSignedIn && (
                <div className="flex flex-col gap-2 mt-6">
                  <SignInButton mode="modal">
                    <Button variant="outline" className="w-full">
                      Connexion
                    </Button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <Button className="w-full">S&apos;inscrire</Button>
                  </SignUpButton>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
