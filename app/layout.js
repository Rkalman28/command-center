import './globals.css';

export const metadata = {
  title: 'Command Center',
  description: 'Personal productivity dashboard — notes, tasks, and more.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
