import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://memory-drift-game.dsydsy0920900940.chatgpt.site"),
  other: { "codex-preview": "development" },
  title: "忘了自己是什么｜What Was I Again?",
  description: "观察、重复回想并对照一段被重新生成的记忆：遗忘是缺陷，还是一种保护？",
  openGraph: {
    title: "忘了自己是什么｜What Was I Again?",
    description: "一场关于记忆重构与遗忘的横屏像素游戏。",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "忘了自己是什么｜What Was I Again?",
    description: "一场关于记忆重构与遗忘的横屏像素游戏。",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
