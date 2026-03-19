import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atlas",
  description: "Accountability Through Logic, Analysis & Strategy. Operational intelligence powered by InterRivus Systems.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "Atlas",
    description: "Accountability Through Logic, Analysis & Strategy.",
    url: "https://atlas.interrivus.com",
    siteName: "Atlas",
    images: [{ url: "https://atlas.interrivus.com/og-image.jpg", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Atlas",
    description: "Accountability Through Logic, Analysis & Strategy.",
    images: ["https://atlas.interrivus.com/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
