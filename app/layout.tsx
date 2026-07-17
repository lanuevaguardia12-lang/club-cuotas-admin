import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ServiceWorkerProvider } from "@/components/providers/service-worker-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "La Nueva Guardia";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const primaryColor = process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? "#012f77";
const isIndexable = process.env.NEXT_PUBLIC_SITE_INDEXABLE === "true";
const appDescription =
  "Sistema web para administrar cuotas, jugadores, cobranzas y cash flow de un club deportivo.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: appName,
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  keywords: [
    "club deportivo",
    "cuotas",
    "jugadores",
    "cobranzas",
    "cash flow",
    "administracion deportiva",
  ],
  authors: [{ name: appName }],
  creator: appName,
  publisher: appName,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/brand/escudo-la-nueva-guardia.png",
        sizes: "1024x918",
        type: "image/png",
      },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: appName,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    url: appUrl,
    siteName: appName,
    title: appName,
    description: appDescription,
    locale: "es_AR",
    images: [
      {
        url: "/brand/escudo-la-nueva-guardia.png",
        width: 1024,
        height: 918,
        alt: appName,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: appName,
    description: appDescription,
    images: ["/brand/escudo-la-nueva-guardia.png"],
  },
  robots: {
    index: isIndexable,
    follow: isIndexable,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: primaryColor,
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ServiceWorkerProvider />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
