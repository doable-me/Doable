export default function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a0f]">
      {children}
    </div>
  );
}
