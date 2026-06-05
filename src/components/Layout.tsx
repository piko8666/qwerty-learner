import type React from 'react'
import { useContext, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import Footer from './Footer'
import { HeaderAuth } from './HeaderAuth'
import Tooltip from '@/components/Tooltip'

// 引入頂欄核心控制組件
import { DictChapterButton } from '@/pages/Typing/components/DictChapterButton'
import PronunciationSwitcher from '@/pages/Typing/components/PronunciationSwitcher'
import Switcher from '@/pages/Typing/components/Switcher'
import StartButton from '@/pages/Typing/components/StartButton'
import { TypingContext, TypingStateActionType } from '@/pages/Typing/store'
import { currentDictIdAtom, currentChapterAtom } from '@/store'

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  
  // 訂閱全局詞典與章節狀態
  const currentDictId = useAtomValue(currentDictIdAtom)
  const currentChapter = useAtomValue(currentChapterAtom)

  // ✨【核心修復】：使用數值基準線，完美避開 React 18 嚴格模式雙發問題
  const savedDictId = useRef(currentDictId)
  const savedChapter = useRef(currentChapter)
  const prevPathname = useRef(location.pathname)

  useEffect(() => {
    // 1. 如果路由路徑發生了切換（例如從 / 跳轉到 /analysis）
    if (prevPathname.current !== location.pathname) {
      prevPathname.current = location.pathname
      // 刷新當前非主頁頁面的「初始數值基準線」
      savedDictId.current = currentDictId
      savedChapter.current = currentChapter
      return // 僅刷新基準線，本次 render 絕對不執行跳轉重定向
    }

    // 2. 如果停留在非主頁（如分析、錯題本等），且目前的狀態跟初始基準線不一致
    // 說明用戶確確實實手動點擊了頂部的下拉菜單更新了詞典或章節！
    if (location.pathname !== '/') {
      if (currentDictId !== savedDictId.current || currentChapter !== savedChapter.current) {
        // 同步更新基準線防止重複觸發，並果斷將用戶彈回主頁開始練習該章節！
        savedDictId.current = currentDictId
        savedChapter.current = currentChapter
        navigate('/')
      }
    }
  }, [currentDictId, currentChapter, location.pathname, navigate])

  // 感知打字上下文
  const typingContext = useContext(TypingContext)
  const state = typingContext?.state
  const dispatch = typingContext?.dispatch
  const isLoading = !state?.chapterData?.words || state.chapterData.words.length === 0

  return (
    <div className="flex h-screen w-full flex-col justify-between bg-white dark:bg-gray-900 transition-colors">
      
      {/* 全局統一頂部導航欄 (z-50 確保下拉選單永遠在最上層) */}
      <header className="relative z-50 flex w-full items-center justify-between px-6 py-1 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        
        {/* 左側：Logo 標題（修改處：新增點擊事件與懸停效果） */}
        <div 
          className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate('/')}
        >
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Qwerty Learner</span>
        </div>

        {/* 中央核心控制區塊 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center space-x-2">
          <DictChapterButton />
          <PronunciationSwitcher />
          <Switcher />

          {/* 打字專屬動作按鈕：只有身處打字主頁時才渲染 */}
          {state && dispatch && (
            <>
              <StartButton isLoading={isLoading} />
              <Tooltip content="跳過該詞">
                <button
                  className={`${
                    state.isShowSkip ? 'bg-orange-400' : 'invisible w-0 bg-gray-300 px-0 opacity-0'
                  } my-btn-primary transition-all duration-300 `}
                  onClick={() => dispatch({ type: TypingStateActionType.SKIP_WORD })}
                >
                  Skip
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {/* 右側：登錄控制入口 */}
        <div className="flex items-center space-x-4">
          <HeaderAuth />
        </div>
      </header>

      {/* 核心內容區 */}
      <main className="flex-1 w-full overflow-y-auto pb-4">
        {children}
      </main>

      {/* 底部組件 */}
      <Footer />
    </div>
  )
}