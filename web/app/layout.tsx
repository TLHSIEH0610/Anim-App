import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/app/providers";
import { MUIThemeProvider } from "@/theme";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Kid to Story Web",
  description: "Create children's books with AI illustrations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <MUIThemeProvider>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </MUIThemeProvider>
      </body>
    </html>
  );
}
