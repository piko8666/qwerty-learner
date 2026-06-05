import { triggerCloudSync } from './supabaseSync'
import type {
  IChapterRecord,
  IReviewRecord,
  IRevisionDictRecord,
  IWordRecord,
  IWrongWordRecord,
  LetterMistakes,
} from './record'
import { useEffect } from 'react'
import {forceSyncAllWrongWords,} from './supabaseSync'

import {
  ChapterRecord,
  ReviewRecord,
  WordRecord,
  WrongWordRecord,
} from './record'

import { TypingContext, TypingStateActionType } from '@/pages/Typing/store'
import type { TypingState } from '@/pages/Typing/store/type'
import {
  currentChapterAtom,
  currentDictIdAtom,
  isReviewModeAtom,
} from '@/store'

import type { Table } from 'dexie'
import Dexie from 'dexie'

import { useAtomValue } from 'jotai'
import { useCallback, useContext } from 'react'

class RecordDB extends Dexie {
  wordRecords!: Table<IWordRecord, number>

  chapterRecords!: Table<IChapterRecord, number>

  reviewRecords!: Table<IReviewRecord, number>

  wrongWordRecords!: Table<IWrongWordRecord, number>

  revisionDictRecords!: Table<IRevisionDictRecord, number>

  revisionWordRecords!: Table<IWordRecord, number>

  constructor() {
    super('RecordDB')

        

      /**
     * Version 9 
     * 新增错题累计表 
	 
	 chapterRecords: '++id,timeStamp,isSynced,dict,chapter,time,[dict+chapter]',
     */
    this.version(9).stores({
  wordRecords: '++id,timeStamp,dict,chapter,wrongCount,[dict+chapter],[word+dict]', // 新增 wrongCount
  chapterRecords: '++id,timeStamp,isSynced,dict,chapter,time,[dict+chapter]',
  reviewRecords: '++id,dict,createTime,isFinished',
  wrongWordRecords: '++id,word,dict,chapter,wrongCount,isSynced,createTime,[dict+chapter],[dict+word]',
     })

    
  }
}


function mergeLetterMistake(
  oldMistake: LetterMistakes = {},
  newMistake: LetterMistakes = {},
): LetterMistakes {

  const result: LetterMistakes = {
    ...oldMistake,
  }

  Object.entries(
    newMistake,
  ).forEach(
    ([key, value]) => {

      const index =
        Number(key)

      result[index] = [
        ...(result[index] || []),
        ...value,
      ]
    },
  )

  return result
}

export const db = new RecordDB()



db.wordRecords.mapToClass(WordRecord)

db.chapterRecords.mapToClass(ChapterRecord)

db.reviewRecords.mapToClass(ReviewRecord)

db.wrongWordRecords.mapToClass(WrongWordRecord)

export function useSaveChapterRecord() {
  const currentChapter = useAtomValue(currentChapterAtom)

  const isRevision = useAtomValue(isReviewModeAtom)

  const dictID = useAtomValue(currentDictIdAtom)

  const saveChapterRecord = useCallback(
  async (
    typingState: TypingState,
  ) => {

    const {
      chapterData: {
        correctCount,
        wrongCount,
        userInputLogs,
        wordCount,
        words,
        wordRecordIds,
      },
      timerData: { time },
    } = typingState

    const correctWordIndexes =
      userInputLogs
        .filter(
          (log) =>
            log.correctCount > 0 &&
            log.wrongCount === 0,
        )
        .map(
          (log) => log.index,
        )

    const chapterRecord =
      new ChapterRecord(
        dictID,
        isRevision
          ? -1
          : currentChapter,
        time,
        correctCount,
        wrongCount,
        wordCount,
        correctWordIndexes,
        words.length,
        wordRecordIds ?? [],
      )

    await db.chapterRecords.add(
      chapterRecord,
    )

    console.log(
  '[章节记录保存]',
  {
    chapter:
      currentChapter,

    wordCount,

    correctCount,

    wrongCount,

    recordCount:
      wordRecordIds?.length,
  },
)
  },
  [
    currentChapter,
    dictID,
    isRevision,
  ],
)

  return saveChapterRecord
}

export type WordKeyLogger = {
  letterTimeArray: number[]

  letterMistake: LetterMistakes
}

export function useSaveWordRecord() {
  const isRevision = useAtomValue(isReviewModeAtom)

  const currentChapter = useAtomValue(currentChapterAtom)

  const dictID = useAtomValue(currentDictIdAtom)

  const { dispatch } =
    useContext(TypingContext) ?? {}

  const saveWordRecord = useCallback(
    async ({
      word,
      wrongCount,
      letterTimeArray,
      letterMistake,
    }: {
      word: string
      wrongCount: number
      letterTimeArray: number[]
      letterMistake: LetterMistakes
    }) => {
      const timing: number[] = []

      for (
        let i = 1;
        i < letterTimeArray.length;
        i++
      ) {
        const diff =
          letterTimeArray[i] -
          letterTimeArray[i - 1]

        timing.push(diff)
      }

      const targetChapter =
        isRevision
          ? -1
          : currentChapter

      const wordRecord =
        new WordRecord(
          word,
          dictID,
          targetChapter,
          timing,
          wrongCount,
          letterMistake,
        )

      let dbID = -1

      try {
        /**
         * 保存历史记录
         */
        dbID =
          await db.wordRecords.add(
            wordRecord,
          )

console.log(
  '[单词记录保存]',
  word,
  dbID,
)
        /**
         * 保存累计错题
         */
if (wrongCount > 0) {

  const existing =
    await db.wrongWordRecords
      .where('[dict+word]')
      .equals([
        dictID,
        word,
      ])
      .first()

  if (existing) {

    await db.wrongWordRecords.update(
  existing.id!,
  {
    wrongCount:
      existing.wrongCount +
      wrongCount,

    mistakes:
      mergeLetterMistake(
        existing.mistakes || {},
        letterMistake,
      ),

    createTime:
      Date.now(),

    isSynced: 0,
  },
)

  } else {

    await db.wrongWordRecords.add(
  new WrongWordRecord(
    word,

    dictID,

    targetChapter,

    wrongCount,

    letterMistake,
  ),
)
  }

  try {
    await triggerCloudSync(

    )
  } catch (err) {
    console.error(
      '[触发云同步失败]',
      err,
    )
  }
}

      } catch (e) {
        console.error(e)
      }

      if (dispatch) {
        if (dbID > 0) {
          dispatch({
            type:
              TypingStateActionType.ADD_WORD_RECORD_ID,

            payload: dbID,
          })
        }

        dispatch({
          type:
            TypingStateActionType.SET_IS_SAVING_RECORD,

          payload: false,
        })
      }
    },
    [
      currentChapter,
      dictID,
      dispatch,
      isRevision,
    ],
  )

  return saveWordRecord
}

export function useDeleteWordRecord() {
  const deleteWordRecord = useCallback(
    async (
      word: string,
      dict: string,
    ) => {
      try {
        const deletedCount =
          await db.wordRecords
            .where({
              word,
              dict,
            })
            .delete()

        return deletedCount
      } catch (error) {
        console.error(
          '删除单词记录时出错：',
          error,
        )
      }
    },
    [],
  )

  return {
    deleteWordRecord,
  }
}
export function useBindSyncUnloadListener() {

  useEffect(() => {

    const handler = async () => {

  try {

    await forceSyncAllWrongWords()

  } catch (e) {

    console.error(
      '[页面关闭同步失败]',
      e,
    )

  }

}

    window.addEventListener(
      'beforeunload',
      handler,
    )

    return () => {

      window.removeEventListener(
        'beforeunload',
        handler,
      )

    }

  }, [])

}