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
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 antialiased">
        <Suspense fallback={null}>
          <AuthProvider>
            <AdminLayout>{children}</AdminLayout>
          </AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
