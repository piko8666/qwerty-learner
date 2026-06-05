import React, { useState, useEffect } from 'react'
import {
  supabase,
  pullWrongWordRecords,
} from '@/utils/db/supabaseSync'
import type { User } from '@supabase/supabase-js'

// ==========================================
// 新增：引入 Jotai 的全域 Atom
// ==========================================
import { useAtom } from 'jotai'
import { authUserAtom, authLoadingAtom } from '@/store'

export const HeaderAuth: React.FC = () => {
  // ==========================================
  // 修改：將 useState 替換為全域的 useAtom
  // ==========================================
  const [user, setUser] = useAtom(authUserAtom)
  const [authLoading, setAuthLoading] = useAtom(authLoadingAtom)

  // 以下為控制彈窗的局部狀態，保持原樣
  const [showModal, setShowModal] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false) // 切换登录与注册
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // 监听 Supabase 登录状态的变更
  useEffect(() => {
    // ✨ 如果全域已經有 user 資料且已經載入完成，就不用重複請求，避免重複噴 log 與視覺閃爍
    if (user && !authLoading) return

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        console.log('[Header Session]', session)
        const currentUser = session?.user ?? null

        setUser(currentUser)
        setAuthLoading(false)

        if (currentUser) {
          try {
            console.log('[自动恢复云端错题]')
            // 删除await pullWrongWordRecords()
          } catch (err) {
            console.error('[恢复云端错题失败]', err)
          }
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth Event]', event, session)
        const currentUser = session?.user ?? null

        setUser(currentUser)
        setAuthLoading(false)

        if (event === 'SIGNED_IN' && currentUser) {
          try {
            await pullWrongWordRecords()
          } catch (err) {
            console.error(err)
          }
        }
      },
    )

    return () => subscription.unsubscribe()
  }, [setUser, setAuthLoading, user, authLoading])

  // 处理登录/注册提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      /**
       * 注册
       */
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) {
          throw error
        }

        setMessage('注册成功，请登录。')
        setIsSignUp(false)
      } else {
        /**
         * 登录
         */
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          throw error
        }

        try {
          console.log('[登录成功，开始恢复云端错题]')
          await pullWrongWordRecords()
          console.log('[云端错题恢复完成]')
        } catch (syncError) {
          console.error('[恢复云端错题失败]', syncError)
        }

        setShowModal(false)
        setEmail('')
        setPassword('')
      }
    } catch (err: any) {
      setMessage(`错误: ${err?.message ?? '操作失败'}`)
    } finally { // <-- 修改為正確的 finally
      setLoading(false)
    }
  }

  // HeaderAuth.tsx 修改後的登出函數
  const handleSignOut = async () => {
    console.log('[Supabase 登出開始]')
    if (confirm('確定要退出登入嗎？（注意：這將會清除本機的緩存記錄）')) {
      try {
        // 1. 嘗試通知 Supabase 後端登出
        await supabase.auth.signOut()
      } catch (err) {
        console.warn('[Supabase 後端登出失敗，執行前端強制清理]', err)
      } finally {
        // 2. 清除 Jotai 全域狀態與瀏覽器 Token 快取
        setUser(null)
        setAuthLoading(false)
        localStorage.removeItem('sb-supabase-auth-token')

        // 3. ✨ 新增：強制清空瀏覽器本地的 IndexedDB 所有打字記錄 ✨
        try {
          // 引入您在 @/utils/db 中導出的 db 實例
          const { db } = await import('@/utils/db') 
          
          // 平行清空所有本地資料表
          await Promise.all([
            db.wordRecords.clear(),
            db.chapterRecords.clear(),
            db.reviewRecords.clear(),
            db.wrongWordRecords.clear(),
            db.revisionDictRecords.clear(),
            db.revisionWordRecords.clear()
          ])
          console.log('[本地資料庫已成功清空重設]')
          
          // 4. 重新整理網頁，讓 UI 面板重整重新讀取空資料
          window.location.reload()
        } catch (dbErr) {
          console.error('[清空本地資料庫失敗]', dbErr)
        }
      }
    }
  }

  // 彻底拦截原生全局事件，不让其传导给打字面板
  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
  }

  return (
    <div className="relative flex items-center">
      {authLoading ? (
        <div className="w-5 h-5" />
      ) : user ? (
        <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="max-w-[100px] truncate" title={user.email}>
            {user.email?.split('@')[0]}
          </span>
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500 transition-colors"
            title="退出登录"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setShowModal(true); setMessage(''); }}
          className="p-1.5 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="登录/注册云端同步"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      )}

      {/* 模态弹窗 (Modal) */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 animate__animated animate__fadeIn animate__faster"
          onKeyDown={handleModalKeyDown} 
        >
          <div className="w-full max-w-sm p-6 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {isSignUp ? '注册云端同步账号' : '登录云端同步'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">邮箱地址</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">密码</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="******"
                />
              </div>

              {message && (
                <p className={`text-xs p-2 rounded ${message.startsWith('错误') ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' : 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400'}`}>
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
              >
                {loading ? '处理中...' : isSignUp ? '立即注册' : '登 录'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}
                className="text-xs text-green-500 hover:underline"
              >
                {isSignUp ? '已有账号？立即登录' : '没有账号？注册一个新同步账号'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}