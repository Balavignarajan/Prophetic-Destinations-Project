import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AuthProvider } from '../lib/auth';
import { AdminLayout } from '../components/AdminLayout';

export const metadata: Metadata = {
  title: 'Prophetic Destinations — Admin Console',
  description: 'Curriculum & Content Management System for Prophetic Destinations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      {/* Browser extensions (ColorZilla's cz-shortcut-listen, password managers, ...) add attributes to <body> before React hydrates; that is not an app mismatch. Applies to this element's own attributes only, not to anything inside it. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-slate-50 text-slate-900 antialiased">
        <Suspense fallback={null}>
          <AuthProvider>
            <AdminLayout>{children}</AdminLayout>
          </AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
