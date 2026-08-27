import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://memory-drift-game.dsydsy0920900940.chatgpt.site"),
  other: { "codex-preview": "development" },
  title: "忘了自己是什么｜What Was I Again?",
  description: "追上一只不断忘记形态的生物，并用你的操作教会它一种新的自己。",
  openGraph: {
    title: "忘了自己是什么｜What Was I Again?",
    description: "一款关于记忆、模仿与共同生成的竖屏互动游戏。",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "忘了自己是什么｜What Was I Again?",
    description: "一款关于记忆、模仿与共同生成的竖屏互动游戏。",
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
