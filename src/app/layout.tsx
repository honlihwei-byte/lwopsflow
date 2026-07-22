import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { I18nRoot } from "@/components/i18n/I18nRoot";
import { DEFAULT_APP_BASE_URL } from "@/lib/app-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const siteDescription = "Attendance Management System for Retail & SME Operations";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_MARKETING_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      DEFAULT_APP_BASE_URL,
  ),
  title: {
    default: "LW OpsFlow",
    template: "%s — LW OpsFlow",
  },
  description: siteDescription,
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "LW OpsFlow",
    description: siteDescription,
    siteName: "LW OpsFlow",
    type: "website",
    images: [
      {
        url: "/images/lwopsflow-og.png",
        width: 1200,
        height: 630,
        alt: "LW OpsFlow",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LW OpsFlow",
    description: siteDescription,
    images: ["/images/lwopsflow-og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <I18nRoot>{children}</I18nRoot>
      </body>
    </html>
  );
}
