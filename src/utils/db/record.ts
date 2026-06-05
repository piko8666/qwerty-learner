import { getUTCUnixTimestamp } from '../index'
import type { Word } from '@/typings'

export interface IWordRecord {
  word: string
  timeStamp: number

  // 字典
  dict: string

  // 章节
  chapter: number | null

  // 每个字母输入耗时
  timing: number[]

  // 当前单词总错误次数
  wrongCount: number

  // 字母错误记录
  mistakes: LetterMistakes
}

export interface LetterMistakes {
  [index: number]: string[]
}

export class WordRecord implements IWordRecord {

  word: string

  timeStamp: number

  dict: string

  chapter: number | null

  timing: number[]

  wrongCount: number

  mistakes: Record<string,string[]>

  constructor(
    word: string,
    dict: string,
    chapter: number | null,

    timing: number[] = [],

    wrongCount: number,

    mistakes: Record<string,string[]> = {},
  ) {

    this.word = word

    this.timeStamp = getUTCUnixTimestamp()

    this.dict = dict

    this.chapter = chapter

    this.timing = timing || []

    this.wrongCount = wrongCount

    this.mistakes = mistakes || {}
  }

  get totalTime() {

    if (!this.timing?.length) {
      return 0
    }

    return this.timing.reduce(
      (acc, curr) => acc + curr,
      0,
    )
  }
}

/**
 * 错题累计记录（新增）
 *
 * IndexedDB:
 * wrongWordRecords
 *
 * Supabase:
 * wrong_word_records
 */
export interface IWrongWordRecord {
  id?: number

  word: string

  dict: string

  chapter: number

  wrongCount: number

  mistakes: LetterMistakes

  createTime: number

  isSynced: number
}

export class WrongWordRecord implements IWrongWordRecord {
  id?: number

  word: string

  dict: string

  chapter: number

  wrongCount: number

  createTime: number

  isSynced: number

  mistakes: LetterMistakes

  constructor(
  word: string,
  dict: string,
  chapter: number,

  wrongCount: number,

  mistakes: Record<string,string[]> = {},
) {
    this.word = word
    this.dict = dict
    this.chapter = chapter

    this.wrongCount = wrongCount

    this.createTime = Date.now()

    // 0=未同步
    // 1=已同步
    this.isSynced = 0

    this.mistakes = mistakes || {}
  }
}

export interface IChapterRecord {
  dict: string

  chapter: number | null

  timeStamp: number

  time: number

  correctCount: number

  wrongCount: number

  wordCount: number

  correctWordIndexes: number[]

  wordNumber: number

  wordRecordIds: number[]

  isSynced: number
}

export class ChapterRecord implements IChapterRecord {
  dict: string
  chapter: number | null
  timeStamp: number

  time: number

  correctCount: number

  wrongCount: number

  wordCount: number

  correctWordIndexes: number[]

  wordNumber: number

  wordRecordIds: number[]

  isSynced: number

  constructor(
    dict: string,
    chapter: number | null,
    time: number,
    correctCount: number,
    wrongCount: number,
    wordCount: number,
    correctWordIndexes: number[],
    wordNumber: number,
    wordRecordIds: number[],
  ) {
    this.dict = dict
    this.chapter = chapter

    this.timeStamp = getUTCUnixTimestamp()

    this.time = time

    this.correctCount = correctCount

    this.wrongCount = wrongCount

    this.wordCount = wordCount

    this.correctWordIndexes = correctWordIndexes

    this.wordNumber = wordNumber

    this.wordRecordIds = wordRecordIds

    this.isSynced = 0
  }

  get wpm() {
    if (this.time <= 0) return 0

    return Math.round((this.wordCount / this.time) * 60)
  }

  /**
   * 修复原项目 Bug
   */
  get inputAccuracy() {
    const total = this.correctCount + this.wrongCount

    if (total === 0) {
      return 0
    }

    return Math.round((this.correctCount / total) * 100)
  }

  get wordAccuracy() {
    if (this.wordNumber === 0) {
      return 0
    }

    return Math.round(
      (this.correctWordIndexes.length / this.wordNumber) * 100,
    )
  }
}

export interface IReviewRecord {
  id?: number

  dict: string

  // 当前复习进度
  index: number

  // 创建时间
  createTime: number

  // 是否完成
  isFinished: boolean

  // 复习单词列表
  words: Word[]
}

export class ReviewRecord implements IReviewRecord {
  id?: number

  dict: string

  index: number

  createTime: number

  isFinished: boolean

  words: Word[]

  constructor(
    dict: string,
    words: Word[],
  ) {
    this.dict = dict

    this.index = 0

    this.createTime = getUTCUnixTimestamp()

    this.words = words

    this.isFinished = false
  }
}

export interface IRevisionDictRecord {
  dict: string

  revisionIndex: number

  createdTime: number
}

export class RevisionDictRecord
  implements IRevisionDictRecord
{
  dict: string

  revisionIndex: number

  createdTime: number

  constructor(
    dict: string,
    revisionIndex: number,
    createdTime: number,
  ) {
    this.dict = dict

    this.revisionIndex = revisionIndex

    this.createdTime = createdTime
  }
}

export interface IRevisionWordRecord {
  word: string

  timeStamp: number

  dict: string

  errorCount: number
}

export class RevisionWordRecord
  implements IRevisionWordRecord
{
  word: string

  timeStamp: number

  dict: string

  errorCount: number

  constructor(
    word: string,
    dict: string,
    errorCount: number,
  ) {
    this.word = word

    this.timeStamp = getUTCUnixTimestamp()

    this.dict = dict

    this.errorCount = errorCount
  }
}