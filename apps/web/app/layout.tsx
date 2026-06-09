import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Webmana",
  description: "Self-hosted single pane of glass for your domains, with a built-in MCP server.",
};

/** Applies the saved theme before paint to avoid a flash of the wrong theme. */
const themeInit = `(function(){try{var t=localStorage.getItem('webmana-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
