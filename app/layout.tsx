import type { Metadata } from "next";
import "./globals.css";
import BottomTabs from "@/components/BottomTabs";
import OnboardingNag from "@/components/OnboardingNag";

export const metadata: Metadata = {
  title: "메추리",
  description: "연세대 국제캠퍼스 맛집 지도 + 메뉴 추천",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <main className="flex-1 px-4 py-4">{children}</main>
        <BottomTabs />
        <OnboardingNag />
      </body>
    </html>
  );
}
