import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import { GroupProvider } from "@/components/GroupProvider";
import { currentGroup } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Golf",
  description: "Golf group tracker",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Reads the group cookie server-side so the first paint already knows whether
// this group tracks money. cookies() opts the tree out of static rendering,
// which is already the de-facto state — every page is a client component that
// fetches on mount.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const group = await currentGroup();
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col pb-20">
        <GroupProvider group={group}>
          {children}
          <BottomNav />
        </GroupProvider>
      </body>
    </html>
  );
}
