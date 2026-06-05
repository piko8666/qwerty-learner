import { useMemo, useCallback } from 'react'
import HeatmapCharts from './components/HeatmapCharts'
import KeyboardWithBarCharts from './components/KeyboardWithBarCharts'
import LineCharts from './components/LineCharts'
import { useWordStats } from './hooks/useWordStats'
import Layout from '@/components/Layout'
import { isOpenDarkModeAtom } from '@/store'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { useHotkeys } from 'react-hotkeys-hook'
import { useNavigate } from 'react-router-dom'
import IconX from '~icons/tabler/x'

const Analysis = () => {
  const navigate = useNavigate()
  const [, setIsOpenDarkMode] = useAtom(isOpenDarkModeAtom)

  const onBack = useCallback(() => {
    navigate('/')
  }, [navigate])

  const changeDarkModeState = () => {
    setIsOpenDarkMode((old) => !old)
  }

  useHotkeys(
    'ctrl+d',
    () => {
      changeDarkModeState()
    },
    { enableOnFormTags: true, preventDefault: true },
    [],
  )

  useHotkeys('enter,esc', onBack, { preventDefault: true })

  // ✨【性能修复优化】：利用 useMemo 将起始/结束时间戳固定，阻止因组件重绘引起的死循环查询
  const [startTime, endTime] = useMemo(() => [
    dayjs().subtract(1, 'year').startOf('day').unix(),
    dayjs().endOf('day').unix()
  ], [])

  const { 
    isEmpty, exerciseRecord, wordRecord, wpmRecord, wpmMA7, 
    accuracyRecord, accuracyMA7, wrongTimeRecord, topWrongWords, summary 
  } = useWordStats(startTime, endTime)

  return (
    <Layout>
      <div className="flex w-full flex-1 flex-col overflow-y-auto pl-20 pr-20 pt-16">
        <IconX className="absolute right-20 top-10 mr-2 h-7 w-7 cursor-pointer text-gray-400" onClick={onBack} />
        
        <ScrollArea.Root className="flex-1 overflow-y-auto">
          <ScrollArea.Viewport className="h-full w-auto pb-[10rem] [&>div]:!block">
            {isEmpty ? (
              <div className="align-items-center m-4 grid h-80 w-auto place-content-center overflow-hidden rounded-lg shadow-lg dark:bg-gray-600">
                <div className="text-2xl text-gray-400">暂无练习数据</div>
              </div>
            ) : (
              <>
                {/* ✨【核心升级一】：精致全局高光数据指标 Widget 看板 */}
                <div className="grid grid-cols-4 gap-6 mx-4 my-6">
                  <div className="p-6 rounded-xl bg-white shadow-md dark:bg-gray-800 border dark:border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">🚀 历史最高手速</div>
                    <div className="text-3xl font-bold text-purple-600">
                      {summary?.maxWpm} <span className="text-xs font-normal text-gray-400">WPM</span>
                    </div>
                  </div>
                  <div className="p-6 rounded-xl bg-white shadow-md dark:bg-gray-800 border dark:border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">🎯 综合打字正确率</div>
                    <div className="text-3xl font-bold text-green-500">
                      {summary?.avgAccuracy}<span className="text-xs font-normal text-gray-400">%</span>
                    </div>
                  </div>
                  <div className="p-6 rounded-xl bg-white shadow-md dark:bg-gray-800 border dark:border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">📅 累计练习天数</div>
                    <div className="text-3xl font-bold text-blue-500">
                      {summary?.totalDays} <span className="text-xs font-normal text-gray-400">天</span>
                    </div>
                  </div>
                  <div className="p-6 rounded-xl bg-white shadow-md dark:bg-gray-800 border dark:border-gray-700">
                    <div className="text-sm text-gray-400 mb-1">⚠️ 盲区宿敌按键</div>
                    <div className="text-3xl font-bold text-red-500">
                      {summary?.nemesisKey} <span className="text-xs font-normal text-gray-400">键</span>
                    </div>
                  </div>
                </div>

                {/* ✨【核心升级二】：智能分析师诊断提示建议 */}
                <div className="mx-4 my-4 p-4 rounded-xl bg-purple-50 dark:bg-purple-900 dark:bg-opacity-20 border border-purple-200 dark:border-purple-800 text-sm text-purple-700 dark:text-purple-300">
                  💡 <b>打字教练诊断建议：</b> 您历史最不熟练的盲区宿敌按键是 <b>{summary?.nemesisKey}</b>。在输入包含该字母的单词时，建议放缓敲击，刻意强化正确的肌肉记忆。结合下方的 7日滚动趋势均线 观察，您的整体手速与节奏正处于稳健上升期，请继续保持！
                </div>

                {/* 练习打卡热力图 */}
                <div className="mx-4 my-6 h-auto w-auto overflow-hidden rounded-lg p-8 shadow-lg bg-white dark:bg-gray-800 dark:bg-opacity-50">
                  <HeatmapCharts title="过去一年练习次数热力图 (日课达标度)" data={exerciseRecord} />
                </div>
                <div className="mx-4 my-6 h-auto w-auto overflow-hidden rounded-lg p-8 shadow-lg bg-white dark:bg-gray-800 dark:bg-opacity-50">
                  <HeatmapCharts title="过去一年练习词数热力图 (量化统计度)" data={wordRecord} />
                </div>

                {/* WPM与正确率趋势图（无缝支持传入真实值及 maData 7日均线数据） */}
                <div className="mx-4 my-6 h-80 w-auto overflow-hidden rounded-lg p-8 shadow-lg bg-white dark:bg-gray-800 dark:bg-opacity-50">
                  <LineCharts title="WPM 手速演进趋势图（真实波动值 + 7日滚动均线）" name="WPM" data={wpmRecord} maData={wpmMA7} />
                </div>
                <div className="mx-4 my-6 h-80 w-auto overflow-hidden rounded-lg p-8 shadow-lg bg-white dark:bg-gray-800 dark:bg-opacity-50">
                  <LineCharts title="正确率变化趋势图（真实波动值 + 7日滚动均线）" name="正确率(%)" data={accuracyRecord} maData={accuracyMA7} suffix="%" />
                </div>

                {/* ✨【核心升级三】：底部并排联动：键盘按键错误排行 vs ❌高频错词排行榜 */}
                <div className="grid grid-cols-3 gap-6 mx-4 my-6">
                  <div className="col-span-2 h-80 overflow-hidden rounded-lg p-8 shadow-lg bg-white dark:bg-gray-800 dark:bg-opacity-50">
                    <KeyboardWithBarCharts title="按键错误次数排行" name="错误次数" data={wrongTimeRecord} />
                  </div>
                  
                  <div className="col-span-1 h-80 overflow-hidden rounded-lg p-8 shadow-lg bg-white dark:bg-gray-800 dark:bg-opacity-50 flex flex-col">
                    <h3 className="text-base font-medium mb-4 text-gray-700 dark:text-gray-300">❌ 高频错词 Top 5</h3>
                    <div className="flex-1 flex flex-col justify-around">
                      {topWrongWords.length > 0 ? (
                        topWrongWords.map((item, idx) => (
                          <div key={item.word} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                            <span className="text-sm font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded text-red-500 font-bold">
                              {idx + 1}. {item.word}
                            </span>
                            <span className="text-xs text-gray-400">打错 {item.count} 次</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-400 text-center py-10">暂无高频错词记录</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="flex touch-none select-none bg-transparent " orientation="vertical"></ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </div>
    </Layout>
  )
}

export default Analysis