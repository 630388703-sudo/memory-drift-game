import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://memory-drift-game.dsydsy0920900940.chatgpt.site"),
  title: "记忆漂移：最后一个下午",
  description: "一款关于数据保存、回忆重构与不确定真相的竖屏互动叙事游戏。",
  openGraph: {
    title: "记忆漂移：最后一个下午",
    description: "照片可以保存，但原始记忆仍然无法确认。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "记忆漂移：最后一个下午" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "记忆漂移：最后一个下午",
    description: "照片可以保存，但原始记忆仍然无法确认。",
    images: ["/og.png"],
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
