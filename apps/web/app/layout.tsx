import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Webmana",
  description: "Self-hosted single pane of glass for your domains, with a built-in MCP server.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
