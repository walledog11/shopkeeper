export default function OAuthPopupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background px-4 py-6 font-sans antialiased">
      {children}
    </div>
  );
}
