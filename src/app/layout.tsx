import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Supermarket Analysis",
  description: "Precios de Rema 1000, Kiwi y Extra en un solo lugar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
