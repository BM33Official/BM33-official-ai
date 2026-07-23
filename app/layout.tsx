import "./globals.css";

export const metadata = {
  title: "BM33.official",
  description: "LINE bot กลางของรุ่น BM33 คณะแพทยศาสตร์วชิรพยาบาล",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#3b3fd8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
