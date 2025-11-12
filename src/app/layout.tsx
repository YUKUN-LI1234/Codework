import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'Data Dashboard',
  description: 'Procurement, Sales, and Inventory Visualisation',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
