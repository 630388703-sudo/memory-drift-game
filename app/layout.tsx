import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://memory-drift-game.dsydsy0920900940.chatgpt.site"),
  other: { "codex-preview": "development" },
  title: "记忆代谢｜Memory Metabolism",
  description: "一件关于反复回想、自然遗忘与数字保存的竖屏互动装置。",
  openGraph: {
    title: "记忆代谢｜Memory Metabolism",
    description: "同一段记忆在彩色、黑白与紫蓝版本之间被反复重构。",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "记忆代谢｜Memory Metabolism",
    description: "一件关于反复回想、自然遗忘与数字保存的竖屏互动装置。",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
