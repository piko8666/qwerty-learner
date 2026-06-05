import { createClient } from '@supabase/supabase-js'
import { db } from './index'
import {
  WrongWordRecord,
  WordRecord,
  ChapterRecord,
} from './record'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

/**
 * 原 word_records 功能保留
 */

export interface WordRecordPayload {
  word: string

  isCorrect: boolean

  typingTime: number

  createdAt?: string
}


export async function uploadWordRecords(
  records: WordRecordPayload[],
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('未登录')
  }

  return await supabase
    .from('word_records')
    .insert(
      records.map((record) => ({
        user_id: user.id,

        word: record.word,

        is_correct: record.isCorrect,

        typing_time: record.typingTime,
      })),
    )
}

export async function getWordRecords(
  limit = 1000,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return []
  }

  const { data, error } =
    await supabase
      .from('word_records')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', {
        ascending: false,
      })
      .limit(limit)

  if (error) {
    throw error
  }

  return data
}

export async function getStatistics() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data, error } =
    await supabase
      .from('word_records')
      .select('is_correct')
      .eq('user_id', user.id)

  if (error) {
    throw error
  }

  const total = data.length

  const correct =
    data.filter(
      (item) => item.is_correct,
    ).length

  const wrong =
    total - correct

  return {
    total,

    correct,

    wrong,

    accuracy:
      total > 0
        ? (
            (correct / total) *
            100
          ).toFixed(2)
        : '0.00',
  }
}

export async function signOut() {
  return await supabase.auth.signOut()
}

/**
 * 错题同步
 */

let syncDebounceTimeout:
  | ReturnType<typeof setTimeout>
  | null = null

let lastSyncTime = 0

const HARD_SYNC_INTERVAL =
  20000

const IDLE_WAIT_TIME = 3000

export async function triggerCloudSync() {

  const now = Date.now()

  if (syncDebounceTimeout) {
    clearTimeout(
      syncDebounceTimeout,
    )
  }

  if (
    now - lastSyncTime >=
    HARD_SYNC_INTERVAL
  ) {

    await executeWrongWordSync()

  } else {

    syncDebounceTimeout =
      setTimeout(async () => {

        await executeWrongWordSync()

      }, IDLE_WAIT_TIME)

  }
}


  


/**
 * 本地 → 云端
 */

async function executeWrongWordSync() {

  lastSyncTime = Date.now()

  try {

    const {
      data: { user },
    } =
      await supabase.auth.getUser()

    if (!user) {
      return
    }

    const unsyncedRecords =
      await db.wrongWordRecords
        .filter(
          item =>
            item.isSynced === 0,
        )
        .toArray()

    if (
      unsyncedRecords.length > 0
    ) {

      const payload =
  unsyncedRecords.map(
    item => ({
      user_id: user.id,

      word: item.word,

      dict_id: item.dict,

      chapter_id:
        item.chapter,

      wrong_count:
        item.wrongCount,

      mistakes:
        item.mistakes || {},

      updated_at:
        new Date(
          item.createTime,
        ).toISOString(),
    }),
  )

      const { error } =
        await supabase
          .from(
            'wrong_word_records',
          )
          .upsert(
            payload,
            {
              onConflict:
                'user_id,dict_id,word',
            },
          )

      if (error) {
        throw error
      }

      await db.wrongWordRecords.bulkPut(
        unsyncedRecords.map(
          item => ({
            ...item,
            isSynced: 1,
          }),
        ),
      )
    }

  } catch (err) {

    console.error(
      '[错题同步失败]',
      err,
    )

  }

  console.log(
    '[开始同步章节]',
  )

  await syncChapterRecords()

  console.log(
    '[开始同步单词]',
  )

  await syncWordRecords()
}

/**
 * 云端 → 本地
 *
 * 登录成功后调用一次
 */

export async function pullWrongWordRecords() {
  try {
    const {
      data: { user },
    } =
      await supabase.auth.getUser()

    if (!user) {
      return
    }

    const { data, error } =
      await supabase
        .from(
          'wrong_word_records',
        )
        .select('*')
        .eq('user_id', user.id)

    if (error) {
      throw error
    }

    if (!data?.length) {
      return
    }

    for (const item of data) {

  /**
   * wrongWordRecords
   */

  const wrongRecord =
  new WrongWordRecord(
    item.word,

    item.dict_id,

    item.chapter_id,

    item.wrong_count,

    item.mistakes || {},
  )

  wrongRecord.isSynced = 1

  const existsWrong =
    await db.wrongWordRecords
      .where('[dict+word]')
      .equals([
        item.dict_id,
        item.word,
      ])
      .first()

  if (!existsWrong) {
    await db.wrongWordRecords.add(
      wrongRecord,
    )
  }

  /**
   * ErrorBook兼容
   *
   * 补一条WordRecord
   */

  const existsWord =
    await db.wordRecords
      .where('[dict+chapter]')
      .equals([
        item.dict_id,
        item.chapter_id,
      ])
      .filter(
        (w) =>
          w.word === item.word,
      )
      .first()

  if (!existsWord) {

    const wordRecord =
  new WordRecord(
    item.word,

    item.dict_id,

    item.chapter_id,

    [],

    item.wrong_count,

    item.mistakes || {},
  )

    await db.wordRecords.add(
      wordRecord,
    )


    

  }
}

console.log(
  '[云端错题恢复完成]',
  data.length,
)

await pullChapterRecords()

await pullWordRecords()


  } catch (err) {
    console.error(
      '[错题恢复失败]',
      err,
    )
  }
}

export async function forceSyncAllWrongWords() {

  try {

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return
    }

    const unsyncedRecords =
      await db.wrongWordRecords
        .filter(
          item =>
            item.isSynced === 0,
        )
        .toArray()

    if (
      unsyncedRecords.length > 0
    ) {

      const payload =
        unsyncedRecords.map(
          item => ({
            user_id: user.id,
            word: item.word,
            dict_id: item.dict,
            chapter_id: item.chapter,
            wrong_count: item.wrongCount,
            updated_at:
              new Date(
                item.createTime,
              ).toISOString(),
          }),
        )

      const { error } =
        await supabase
          .from(
            'wrong_word_records',
          )
          .upsert(
            payload,
            {
              onConflict:
                'user_id,dict_id,word',
            },
          )

      if (error) {
        throw error
      }

      await db.wrongWordRecords.bulkPut(
        unsyncedRecords.map(
          item => ({
            ...item,
            isSynced: 1,
          }),
        ),
      )

      console.log(
        '[错题同步成功]',
        payload.length,
      )
    }

  } catch (err) {

    console.error(
      '[错题同步失败]',
      err,
    )

  }

  await syncChapterRecords()

  await syncWordRecords()
}

export async function syncChapterRecords() {

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return
  }

  const chapters =
    await db.chapterRecords
      .filter(
        item =>
          item.isSynced === 0,
      )
      .toArray()

  if (!chapters.length) {
    return
  }

  const payload =
    chapters.map((item) => ({
      user_id: user.id,

      dict_id: item.dict,

      chapter_id: item.chapter,

      time_spent: item.time,

      correct_count:
        item.correctCount,

      wrong_count:
        item.wrongCount,

      word_count:
        item.wordCount,

      word_number:
        item.wordNumber,

      created_at:
        new Date(
          item.timeStamp * 1000,
        ).toISOString(),
    }))

  const { error } =
    await supabase
      .from('chapter_records')
      .insert(payload)

  if (error) {

    console.error(
      '[章节同步失败]',
      error,
    )

    return
  }

  await db.chapterRecords.bulkPut(
    chapters.map(
      item => ({
        ...item,
        isSynced: 1,
      }),
    ),
  )

  console.log(
    '[章节同步成功]',
    payload.length,
  )
}

export async function pullChapterRecords() {

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return
  }

  const { data, error } =
    await supabase
      .from('chapter_records')
      .select('*')
      .eq(
        'user_id',
        user.id,
      )

  if (error) {

    console.error(
      '[章节恢复失败]',
      error,
    )

    return
  }

  for (const item of data) {

    const timestamp =
      Math.floor(
        new Date(
          item.created_at,
        ).getTime() / 1000,
      )

    const exists =
      await db.chapterRecords
        .where('timeStamp')
        .equals(timestamp)
        .first()

    if (exists) {
      continue
    }

    const chapter =
      new ChapterRecord(
        item.dict_id,

        item.chapter_id,

        item.time_spent,

        item.correct_count,

        item.wrong_count,

        item.word_count,

        [],

        item.word_number,

        [],
      )

    chapter.timeStamp =
      timestamp

    chapter.isSynced = 1

    await db.chapterRecords.add(
      chapter,
    )
  }

  console.log(
    '[章节恢复完成]',
    data.length,
  )
}

// 📍 修改位置：src/utils/db/supabaseSync.ts 中的 syncWordRecords 函數
export async function syncWordRecords(records?: any[]) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // ✨【智商在線修正】：如果外部沒有傳入 records 參數（自動背景同步時），則自動去本地 IndexedDB 撈取未同步的單字記錄
  let targetRecords = records
  if (!targetRecords) {
    targetRecords = await db.wordRecords
      .filter(item => (item as any).isSynced === 0)
      .toArray()
  }

  // 防禦：如果兩者都空空如也，直接結束同步
  if (!targetRecords || targetRecords.length === 0) {
    return
  }

  const aggregated: Record<string, any> = {}
  targetRecords.forEach(item => {
    const key = `${item.dict}_${item.word}`
    if (!aggregated[key]) {
      aggregated[key] = {
        user_id: user.id,
        dict_id: item.dict,
        chapter_id: item.chapter,
        word: item.word,
        wrong_count: Number(item.wrongCount || 0),
        mistakes: item.mistakes || {},
        time_stamp: item.timeStamp ?? Date.now()
      }
    } else {
      // 如果單次批量內有重複單字，錯誤數累加，時間戳取最新，並合併宿敵按鍵
      aggregated[key].wrong_count += Number(item.wrongCount || 0)
      aggregated[key].time_stamp = Math.max(aggregated[key].time_stamp, item.timeStamp || 0)
      aggregated[key].mistakes = { ...aggregated[key].mistakes, ...item.mistakes }
    }
  })

  const payload = Object.values(aggregated)

  // 命中雲端資料庫的聯合唯一約束，實現單個單字原地彙總覆蓋
  const { error } = await supabase
    .from('word_records_sync')
    .upsert(payload, { onConflict: 'user_id,dict_id,word' })

  if (error) {
    console.error('[單字彙總記錄同步失敗]', error)
    return
  }

  console.log('[單字彙總記錄同步成功], 雲端已壓縮至：', payload.length)

  // ✨【狀態閉環】：如果是自動從本地資料庫拉取的數據，同步成功後需要批量將本地狀態解鎖改為已同步（isSynced: 1）
  if (!records) {
    await db.wordRecords.bulkPut(
      targetRecords.map(item => ({
        ...item,
        isSynced: 1
      }))
    )
  }
}

export async function pullWordRecords() {

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data, error } =
    await supabase
      .from(
        'word_records_sync',
      )
      .select('*')
      .eq(
        'user_id',
        user.id,
      )

  if (error) {

    console.error(
      '[单词记录恢复失败]',
      error,
    )

    return
  }

for (const item of data) {

    const exists =
  await db.wordRecords
    .where('[word+dict]')
    .equals([
      item.word,
      item.dict_id,
    ])
    .first()

    if (exists) {
      // ✨ 修改優化：如果本地已有記錄，則將其更新為雲端的最新累計彙總狀態，不再盲目 continue
      await db.wordRecords.update(exists.id!, {
        wrongCount: item.wrong_count,
        mistakes: item.mistakes,
        timeStamp: typeof item.time_stamp === 'string' ? Date.parse(item.time_stamp) : item.time_stamp
      })
      continue
    }

    const wordRecord =
      new WordRecord(


        item.word,

        item.dict_id,

        item.chapter_id,

        [],

        item.wrong_count,

        item.mistakes || {},
      )

    if (
      item.time_stamp
    ) {
      wordRecord.timeStamp =
  item.time_stamp || 0
    }

   if (
  item.total_time &&
  item.total_time > 0
) {

  wordRecord.timing = [
    item.total_time,
  ]
}

    await db.wordRecords.add(
      wordRecord,
    )
  }

  console.log(
    '[单词记录恢复完成]',
    data.length,
  )
}

