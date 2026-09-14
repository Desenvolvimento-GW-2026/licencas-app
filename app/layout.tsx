import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Licenças de Poços — General Water",
  description: "Monitoramento de outorgas e licenças de poços",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
