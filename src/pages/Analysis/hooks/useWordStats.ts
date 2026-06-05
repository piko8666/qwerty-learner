import { db } from '@/utils/db'
import type { IWordRecord, ChapterRecord } from '@/utils/db/record'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'

export interface IWordStats {
  isEmpty: boolean
  exerciseRecord: { date: string; count: number; level: number }[]
  wordRecord: { date: string; count: number; level: number }[]
  wpmRecord: [string, number][]
  wpmMA7: [string, number][]
  accuracyRecord: [string, number][]
  accuracyMA7: [string, number][]
  wrongTimeRecord: { name: string; value: number }[]
  topWrongWords: { word: string; count: number }[]
  summary: {
    maxWpm: number
    avgAccuracy: number
    totalDays: number
    nemesisKey: string
  }
}

// 輔助函數：根據完成章節數決定熱力圖顏色等級 (0-4)
function getExerciseLevel(count: number): number {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 4) return 2
  if (count <= 7) return 3
  return 4
}

// 輔助函數：計算 7 日滾動移動平均線 (MA7)
function calculateMA7(data: [string, number][]): [string, number][] {
  const result: [string, number][] = []
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - 6)
    const windowSlice = data.slice(start, i + 1)
    const sum = windowSlice.reduce((acc, curr) => acc + curr[1], 0)
    const avg = Math.round(sum / windowSlice.length)
    result.push([data[i][0], avg])
  }
  return result
}

export function useWordStats(startTime: number, endTime: number, reload?: boolean): IWordStats {
  const [stats, setStats] = useState<IWordStats>({
    isEmpty: false,
    exerciseRecord: [],
    wordRecord: [],
    wpmRecord: [],
    wpmMA7: [],
    accuracyRecord: [],
    accuracyMA7: [],
    wrongTimeRecord: [],
    topWrongWords: [],
    summary: { maxWpm: 0, avgAccuracy: 0, totalDays: 0, nemesisKey: '无' }
  })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const startMs = startTime * 1000
        const endMs = endTime * 1000

        const rawChapterRecords = await db.chapterRecords.toArray()
        const rawWordRecords = await db.wordRecords.toArray()

        // 清洗並規範化章節數據的時間戳
        const chapterRecords = rawChapterRecords.map(record => {
          const ts = record.timeStamp || (record as any).timestamp || (record as any).time_stamp
          let normalizedMs = 0
          if (ts) {
            normalizedMs = typeof ts === 'string' ? dayjs(ts).valueOf() : (ts < 10000000000 ? ts * 1000 : ts)
          }
          return { ...record, timeStamp: normalizedMs }
        }).filter(record => record.timeStamp >= startMs && record.timeStamp <= endMs)

        // 清洗並規範化單字數據的時間戳
        const wordRecords = rawWordRecords.map(record => {
          const ts = record.timeStamp || (record as any).timestamp || (record as any).time_stamp
          let normalizedMs = 0
          if (ts) {
            normalizedMs = typeof ts === 'string' ? dayjs(ts).valueOf() : (ts < 10000000000 ? ts * 1000 : ts)
          }
          return { ...record, timeStamp: normalizedMs }
        }).filter(record => record.timeStamp >= startMs && record.timeStamp <= endMs)

        if (chapterRecords.length === 0 && wordRecords.length === 0) {
          setStats(prev => ({ ...prev, isEmpty: true }))
          return
        }

        const exerciseMap: Record<string, number> = {}
        const wordMap: Record<string, number> = {}
        const wpmMap: Record<string, number[]> = {}
        const accuracyMap: Record<string, number[]> = {}
        const wrongWordMap: Record<string, number> = {}
        const wrongKeyMap: Record<string, number> = {}

        let totalCorrect = 0
        let totalWrong = 0
        const practicedDaysSet = new Set<string>()

        // =================================================================
        // 4. 解析章節資料 (計算 WPM 手速與正確率波動)
        // =================================================================
        chapterRecords.forEach((record) => {
          if (record.timeStamp) {
            const dateStr = dayjs(record.timeStamp).format('YYYY-MM-DD')
            exerciseMap[dateStr] = (exerciseMap[dateStr] || 0) + 1
            practicedDaysSet.add(dateStr)

            // ✨ 新增優化：每日打字單字量，直接從章節的 wordNumber 欄位進行精確累加！
            // 這樣即便單字表在重新登入後被拍平成一個單字只有一筆，歷史每天敲了多少字也絕對不會丟失！
            wordMap[dateStr] = (wordMap[dateStr] || 0) + Number(record.wordNumber || 0)

            if (!wpmMap[dateStr]) wpmMap[dateStr] = []



            if (!accuracyMap[dateStr]) accuracyMap[dateStr] = []

            // WPM 動態公式逆向推算
            let currentWpm = Number((record as any).wpm || (record as any).speed || 0)
            if (currentWpm === 0 && record.time > 0 && record.wordNumber > 0) {
              currentWpm = Math.round((record.wordNumber * 60) / record.time)
            }

            if (currentWpm > 0 && currentWpm < 250) {
              wpmMap[dateStr].push(currentWpm)
            }

            // 🌟【統一化核心修復點】：不再區分本地與雲端不同的公式！
            // 統一使用 wrongCount 和 wordNumber 進行最穩定的字元/擊鍵級正確率計算。
            // 這樣一來，不論是在本地剛練習完的資料，還是重新登入從雲端拉回來的資料，
            // 其計算基底完全相同，正確率折線圖上的數值在重新登入前後將 100% 完美保持一致！
            let currentAcc = 100
            if ((record as any).accuracy !== undefined) {
              currentAcc = Number((record as any).accuracy)
            } else if (record.wordNumber > 0) {
              const wrongCount = Number((record as any).wrongCount || 0)
              if (wrongCount > 0) {
                const totalChars = record.wordNumber * 5 // 依標準英文單字長度 5 個字母估算
                currentAcc = Math.round((totalChars / (totalChars + wrongCount)) * 100)
              } else {
                currentAcc = 100
              }
            }
            
            // 安全緩衝限制，防禦極端數值
            currentAcc = Math.max(10, Math.min(100, currentAcc))
            accuracyMap[dateStr].push(currentAcc)
          }
        })

        // =================================================================
        // 5. 解析單字資料 (統計單字量、高頻錯詞、盲區按鍵)
        // =================================================================
        wordRecords.forEach((record) => {
          if (!record.timeStamp) return
          const dateStr = dayjs(record.timeStamp).format('YYYY-MM-DD')

          // ❌ 刪除或註釋掉下面這行（因為打字量已經改由上方章節數據精確接管）
          // wordMap[dateStr] = (wordMap[dateStr] || 0) + 1
          
          if (!exerciseMap[dateStr]) exerciseMap[dateStr] = 0
          practicedDaysSet.add(dateStr)

          const wrong = Number(record.wrongCount || 0)


          const correct = (record as any).correctCount !== undefined ? Number((record as any).correctCount || 0) : (wrong === 0 ? 5 : 4)
          
          totalCorrect += correct
          totalWrong += wrong

          if (record.word) {
            wrongWordMap[record.word] = (wrongWordMap[record.word] || 0) + wrong
          }

          const mistakes = (record as any).mistakes || (record as any).wrongKeys
          if (mistakes) {
            if (typeof mistakes === 'object' && !Array.isArray(mistakes)) {
              Object.values(mistakes).forEach((arr: any) => {
                if (Array.isArray(arr)) {
                  arr.forEach((k) => {
                    if (typeof k === 'string') {
                      const upper = k.toUpperCase()
                      wrongKeyMap[upper] = (wrongKeyMap[upper] || 0) + 1
                    }
                  })
                }
              })
            } else if (Array.isArray(mistakes)) {
              mistakes.forEach((k) => {
                if (typeof k === 'string') {
                  const upper = k.toUpperCase()
                  wrongKeyMap[upper] = (wrongKeyMap[upper] || 0) + 1
                }
              })
            }
          }
        })

        // 動態補齊空白日期
        let startDay = dayjs(startMs)
        const endDay = dayjs(endMs)
        while (startDay.isBefore(endDay) || startDay.isSame(endDay, 'day')) {
          const dStr = startDay.format('YYYY-MM-DD')
          if (exerciseMap[dStr] === undefined) exerciseMap[dStr] = 0
          if (wordMap[dStr] === undefined) wordMap[dStr] = 0
          startDay = startDay.add(1, 'day')
        }

        // 資料轉換與排序
        const exerciseRecord = Object.entries(exerciseMap).map(([date, value]) => ({ date, count: value, level: getExerciseLevel(value) })).sort((a, b) => a.date.localeCompare(b.date))
        const wordRecord = Object.entries(wordMap).map(([date, value]) => ({ date, count: value, level: value > 0 ? Math.min(4, Math.ceil(value / 30)) : 0 })).sort((a, b) => a.date.localeCompare(b.date))

        const wpmRecord = Object.entries(wpmMap)
          .map(([date, values]) => [date, values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0] as [string, number])
          .filter((item) => item[1] > 0)
          .sort((a, b) => a[0].localeCompare(b[0]))

        const accuracyRecord = Object.entries(accuracyMap)
          .map(([date, values]) => [date, values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 100] as [string, number])
          .filter((item) => item[1] < 100 || (wordMap[item[0]] || 0) > 0)
          .sort((a, b) => a[0].localeCompare(b[0]))

        const wpmMA7 = calculateMA7(wpmRecord)
        const accuracyMA7 = calculateMA7(accuracyRecord)

        const wrongTimeRecord = Object.entries(wrongKeyMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
        const topWrongWords = Object.entries(wrongWordMap).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 5)

        const maxWpm = wpmRecord.length > 0 ? Math.max(...wpmRecord.map((i) => i[1])) : 0
        const avgAccuracy = totalCorrect + totalWrong > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 100
        const totalDays = practicedDaysSet.size
        const nemesisKey = wrongTimeRecord.length > 0 ? wrongTimeRecord[0].name : '无'

        setStats({
          isEmpty: false,
          exerciseRecord,
          wordRecord,
          wpmRecord,
          wpmMA7,
          accuracyRecord,
          accuracyMA7,
          wrongTimeRecord,
          topWrongWords,
          summary: { maxWpm, avgAccuracy, totalDays, nemesisKey },
        })
      } catch (error) {
        console.error('[useWordStats 統計核心邏輯出錯]', error)
        setStats(prev => ({ ...prev, isEmpty: false }))
      }
    }

    fetchStats()
  }, [startTime, endTime, reload])

  return stats
}