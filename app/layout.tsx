import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import ServiceWorker from "@/components/service-worker";
import { DEFAULT_THEME, THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "¿A Cómo?";
const description = "¿A cómo está hoy? Calcula tu cambio y compártelo en un toque.";

// ID de medición de GA4 (G-XXXXXXXXXX). Si no está definido no se carga ningún
// script de Analytics: así en local no ensuciamos las métricas de producción.
const gaId = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  // Al desplegar, define NEXT_PUBLIC_SITE_URL (p. ej. https://tudominio.com)
  // para que la imagen de preview al compartir apunte al dominio real.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title,
  description,
  applicationName: "¿A Cómo?",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "¿A Cómo?",
  },
  openGraph: {
    title,
    description,
    type: "website",
    locale: "es_VE",
    siteName: "¿A Cómo?",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

// Ojo: el theme-color NO va aquí. Lo renderizamos a mano en <head> para que
// quede antes del script de tema, que le ajusta el color según el tema activo.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Splash screens de iOS (Safari no usa el manifest para esto): una imagen por
// resolución de iPhone, del 6/7/8 a la serie 16. En Android el splash se genera
// solo desde el manifest (ícono + nombre + fondo).
const IOS_SPLASH: { w: number; h: number; r: number }[] = [
  { w: 375, h: 667, r: 2 }, // SE 2/3, 6/7/8
  { w: 414, h: 736, r: 3 }, // 6+/7+/8+
  { w: 375, h: 812, r: 3 }, // X/XS/11 Pro, 12/13 mini
  { w: 414, h: 896, r: 2 }, // XR/11
  { w: 414, h: 896, r: 3 }, // XS Max/11 Pro Max
  { w: 390, h: 844, r: 3 }, // 12/13/14
  { w: 428, h: 926, r: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 393, h: 852, r: 3 }, // 14 Pro, 15/15 Pro, 16
  { w: 430, h: 932, r: 3 }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { w: 402, h: 874, r: 3 }, // 16 Pro
  { w: 440, h: 956, r: 3 }, // 16 Pro Max
];

function AppleSplashLinks() {
  return (
    <>
      {IOS_SPLASH.map(({ w, h, r }) => (
        <link
          key={`${w}x${h}@${r}`}
          rel="apple-touch-startup-image"
          media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`}
          href={`/splash/apple-splash-${w * r}x${h * r}.png`}
        />
      ))}
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-theme={DEFAULT_THEME}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content={THEME_COLORS[DEFAULT_THEME]} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppleSplashLinks />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorker />
        {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
      </body>
    </html>
  );
}
