'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client' 

export default function AuthBar() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    // 初始获取
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
    // 监听会话变化
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const login = () => router.push('/login?next=/dashboard')
  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="flex items-center gap-3">
      {email ? (
        <>
          <span className="text-sm text-gray-600">Hi, {email}</span>
          <button
            onClick={logout}
            className="rounded bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
          >
            退出登录
          </button>
        </>
      ) : (
        <button
          onClick={login}
          className="rounded bg-gray-900 px-3 py-1.5 text-white hover:opacity-90"
        >
          登录
        </button>
      )}
    </div>
  )
}
