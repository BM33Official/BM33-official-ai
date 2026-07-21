export const metadata = {
  title: "BM33.official",
  description: "LINE bot กลางของรุ่น BM33 คณะแพทยศาสตร์วชิรพยาบาล",
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
