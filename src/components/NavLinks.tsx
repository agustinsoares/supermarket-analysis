"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Comparar" },
  { href: "/products", label: "Productos" },
  { href: "/flyers", label: "Folletos" },
  { href: "/shopping", label: "Lista de la compra" },
  { href: "/pantry", label: "Despensa" },
  { href: "/recipes", label: "Recetas" },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Principal">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={(l.href === "/" ? path === "/" : path.startsWith(l.href)) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
