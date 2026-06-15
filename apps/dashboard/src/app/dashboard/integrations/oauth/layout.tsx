export default function OAuthPopupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-10 font-sans antialiased">
      {children}
    </div>
  );
}
