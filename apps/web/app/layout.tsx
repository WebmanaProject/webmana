import type { Metadata } from "next";
import "./globals.css";
import { Chrome } from "./components/Chrome";

export const metadata: Metadata = {
  title: "Webmana",
  description: "Self-hosted command center for your domain portfolio, with a built-in MCP server.",
};

/** Applies the saved theme before paint to avoid a flash of the wrong theme. */
const themeInit = `(function(){try{var t=localStorage.getItem('webmana-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="flex min-h-screen flex-col bg-bg text-text antialiased">
        <Chrome>{children}</Chrome>
      </body>
    </html>
  );
}
