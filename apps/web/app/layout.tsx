import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '货代客户在线门户',
  description: '面向货代公司的多租户客户门户',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
