import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { trustedForwardedHost } from "@/lib/host-routing";

const clashDisplay = localFont({
  src: [
    { path: "./fonts/ClashDisplay-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ClashDisplay-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ClashDisplay-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-clash",
  display: "swap",
});

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Satoshi-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

// ─── Theme fonts (public page) ───────────────────────────────────────────────
// Curated font picker. Each maps to a --lb-font-* CSS variable that the
// theme-tokens resolver references. All families are SELF-HOSTED under
// ./fonts/google/ (latin subset, weights pinned by the picker) so builds
// never touch Google's servers — CI and Docker builds work offline, and
// the product keeps its no-third-party-requests stance (#72).
//
// preload: false — critical for public page performance. With preload on,
// the browser would download ALL font families × all weights on EVERY page
// even though the active theme only uses ONE. With preload off, the
// @font-face rules still exist in the CSS (so the admin theme picker
// works), but the browser only downloads a font when an element actually
// renders with that font-family. Geist Mono (admin UI) stays preloaded.

const geistMono = localFont({
  src: [
    {
      path: "./fonts/google/geistmono-100900-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

const inter = localFont({
  src: [
    {
      path: "./fonts/google/inter-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/inter-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/inter-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/inter-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-inter",
  display: "swap",
  preload: false,
});

const poppins = localFont({
  src: [
    {
      path: "./fonts/google/poppins-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/poppins-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/poppins-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/poppins-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-poppins",
  display: "swap",
  preload: false,
});

const playfair = localFont({
  src: [
    {
      path: "./fonts/google/playfairdisplay-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/google/playfairdisplay-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/playfairdisplay-500-italic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "./fonts/google/playfairdisplay-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/playfairdisplay-600-italic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "./fonts/google/playfairdisplay-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/playfairdisplay-700-italic.woff2",
      weight: "700",
      style: "italic",
    },
    {
      path: "./fonts/google/playfairdisplay-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-playfair",
  display: "swap",
  preload: false,
});

const jetbrains = localFont({
  src: [
    {
      path: "./fonts/google/jetbrainsmono-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/jetbrainsmono-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/jetbrainsmono-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/jetbrainsmono-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-jetbrains",
  display: "swap",
  preload: false,
});

const spaceGrotesk = localFont({
  src: [
    {
      path: "./fonts/google/spacegrotesk-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/spacegrotesk-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/spacegrotesk-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/spacegrotesk-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-space-grotesk",
  display: "swap",
  preload: false,
});

const dmSans = localFont({
  src: [
    {
      path: "./fonts/google/dmsans-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/dmsans-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/dmsans-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/dmsans-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-dm-sans",
  display: "swap",
  preload: false,
});

const lora = localFont({
  src: [
    {
      path: "./fonts/google/lora-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/google/lora-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/lora-500-italic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "./fonts/google/lora-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/lora-600-italic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "./fonts/google/lora-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/lora-700-italic.woff2",
      weight: "700",
      style: "italic",
    },
    {
      path: "./fonts/google/lora-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-lora",
  display: "swap",
  preload: false,
});

const bebas = localFont({
  src: [
    {
      path: "./fonts/google/bebasneue-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--lb-font-bebas",
  display: "swap",
  preload: false,
});

const sora = localFont({
  src: [
    {
      path: "./fonts/google/sora-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/sora-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/sora-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/sora-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-sora",
  display: "swap",
  preload: false,
});

const outfit = localFont({
  src: [
    {
      path: "./fonts/google/outfit-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/outfit-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/outfit-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/outfit-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-outfit",
  display: "swap",
  preload: false,
});

const pressStart2P = localFont({
  src: [
    {
      path: "./fonts/google/pressstart2p-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--lb-font-press-start",
  display: "swap",
  preload: false,
});

const nunito = localFont({
  src: [
    {
      path: "./fonts/google/nunito-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/nunito-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/nunito-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/nunito-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/google/nunito-800-normal.woff2",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--lb-font-nunito",
  display: "swap",
  preload: false,
});

const montserrat = localFont({
  src: [
    {
      path: "./fonts/google/montserrat-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/montserrat-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/montserrat-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/montserrat-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-montserrat",
  display: "swap",
  preload: false,
});

const caveat = localFont({
  src: [
    {
      path: "./fonts/google/caveat-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/google/caveat-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/google/caveat-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/google/caveat-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--lb-font-caveat",
  display: "swap",
  preload: false,
});

const pacifico = localFont({
  src: [
    {
      path: "./fonts/google/pacifico-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--lb-font-pacifico",
  display: "swap",
  preload: false,
});

const abrilFatface = localFont({
  src: [
    {
      path: "./fonts/google/abrilfatface-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--lb-font-abril",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  // Resolve the origin from request headers (or BASE_URL env) so metadata
  // resolves correctly on every self-hosted instance, not just the demo.
  let origin = "http://localhost:3000";
  try {
    if (process.env.BASE_URL) {
      origin = process.env.BASE_URL.replace(/\/$/, "");
    } else {
      const { headers } = await import("next/headers");
      const h = await headers();
      const host = (
        trustedForwardedHost(h) ||
        h.get("host") ||
        "localhost:3000"
      ).toString();
      const proto = (h.get("x-forwarded-proto") || "http").toString();
      origin = `${proto}://${host}`;
    }
  } catch {
    // headers() not available at build time — keep the localhost fallback.
  }

  // Root layout always uses the default LinkBreeze favicon.
  // Per-page favicons are set in the public route's generateMetadata().
  const icons: Metadata["icons"] = {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  };

  return {
    title: "LinkBreeze — Self-hosted link-in-bio",
    description:
      "Self-hosted link-in-bio platform with analytics, QR codes, and themes. The open-source Linktree alternative.",
    metadataBase: new URL(origin),
    authors: [
      { name: "LinkBreeze", url: "https://linkbreeze.omnirise.dev" },
      { name: "OmniRise", url: "https://omnirise.dev" },
    ],
    creator: "LinkBreeze",
    publisher: "LinkBreeze",
    applicationName: "LinkBreeze",
    icons,
    manifest: "/site.webmanifest",
    openGraph: {
      title: "LinkBreeze — Self-hosted link-in-bio",
      description: "The open-source Linktree alternative you own.",
      siteName: "LinkBreeze",
      images: ["/banner.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: "LinkBreeze — Self-hosted link-in-bio",
      description: "The open-source Linktree alternative you own.",
      images: ["/banner.png"],
      site: "@OmniRise00",
      creator: "@OmniRise00",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${clashDisplay.variable} ${satoshi.variable} ${geistMono.variable} ${inter.variable} ${poppins.variable} ${playfair.variable} ${jetbrains.variable} ${spaceGrotesk.variable} ${dmSans.variable} ${lora.variable} ${bebas.variable} ${sora.variable} ${outfit.variable} ${pressStart2P.variable} ${nunito.variable} ${montserrat.variable} ${caveat.variable} ${pacifico.variable} ${abrilFatface.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
