import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

const bengali = Noto_Sans_Bengali({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-bengali",
  fallback: ["Hind Siliguri", "SolaimanLipi", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Mess Meal Manager — মাল্টি-অফিস মেস মিল ম্যানেজার",
  description:
    "Multi-Office Mess Meal Manager — দৈনিক মিল, বাজার খরচ, স্থায়ী তহবিল, অন্যান্য আয়, মাসিক হিসাব, দেনা-পাওনা, PDF/CSV রিপোর্ট এবং Google Sheets সিংক।",
  applicationName: "Mess Meal Manager",
  keywords: [
    "mess meal manager",
    "মেস মিল ম্যানেজার",
    "multi office mess",
    "meal rate",
    "bazar expense",
    "google sheets sync",
  ],
  authors: [{ name: "Mess Meal Manager" }],
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#226e4a" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" suppressHydrationWarning className={bengali.variable}>
      <body className="antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mmm-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
