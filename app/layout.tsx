import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { getAnalyticsSettings } from "@/lib/analytics-settings";
import "./globals.css";
/* eslint-disable @next/next/no-css-tags -- KaTeX é servido localmente para não depender de CDN. */

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: { default: "Academia Jurídico-Contábil", template: "%s | Academia Jurídico-Contábil" },
  description: "Artigos e cursos sobre Direito, Contabilidade e suas interfaces para profissionais das duas áreas.",
  applicationName: "Academia Jurídico-Contábil",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/favicon.png" },
  alternates: { canonical: "/" },
  openGraph: { title: "Academia Jurídico-Contábil", description: "Blog e cursos para profissionais do Direito e da Contabilidade.", type: "website", locale: "pt_BR", siteName: "Academia Jurídico-Contábil", images: [{ url: "/og.png", width: 1730, height: 909, alt: "Academia Jurídico-Contábil" }] },
  twitter: { card: "summary_large_image", title: "Academia Jurídico-Contábil", description: "Blog e cursos para profissionais do Direito e da Contabilidade.", images: ["/og.png"] },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const analytics = await getAnalyticsSettings().catch(() => ({ enabled: false, measurementId: "", source: "disabled" as const }));
  const measurementId = analytics.enabled ? analytics.measurementId : undefined;
  return (
    <html lang="pt-BR">
      <head>
        <link rel="stylesheet" href="/katex.min.css" />
        {measurementId && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`} />
            <script
              id="ga-bootstrap"
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');`,
              }}
            />
          </>
        )}
      </head>
      <body>
        {children}
        <Suspense>
          <AnalyticsConsent initialMeasurementId={measurementId} />
        </Suspense>
      </body>
    </html>
  );
}
