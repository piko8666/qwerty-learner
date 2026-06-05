import { db } from '.'
import { WrongWordRecord } from './record'
import { getCurrentDate, recordDataAction } from '..'

export type ExportProgress = {
  totalRows?: number
  completedRows: number
  done: boolean
}

export type ImportProgress = {
  totalRows?: number
  completedRows: number
  done: boolean
}

export async function exportDatabase(
  callback: (
    exportProgress: ExportProgress,
  ) => boolean,
) {
  const [
    pako,
    { saveAs },
  ] = await Promise.all([
    import('pako'),
    import('file-saver'),
    import('dexie-export-import'),
  ])

  const blob = await db.export({
    progressCallback: ({
      totalRows,
      completedRows,
      done,
    }) => {
      return callback({
        totalRows,
        completedRows,
        done,
      })
    },
  })

  const [
    wordCount,
    chapterCount,
  ] = await Promise.all([
    db.wordRecords.count(),
    db.chapterRecords.count(),
  ])

  const json = await blob.text()

  const compressed =
    pako.gzip(json)

  const compressedBlob =
    new Blob([compressed])

  const currentDate =
    getCurrentDate()

  saveAs(
    compressedBlob,
    `Qwerty-Learner-User-Data-${currentDate}.gz`,
  )

  recordDataAction({
    type: 'export',
    size: compressedBlob.size,
    wordCount,
    chapterCount,
  })
}

/**
 * 迁移旧版 reviewRecords 错题数据
 */
async function migrateLegacyWrongWords() {
  try {
    const reviewRecords =
      await db.reviewRecords.toArray()

    if (
      !reviewRecords ||
      reviewRecords.length === 0
    ) {
      return
    }

    let migratedCount = 0

    for (const item of reviewRecords as any[]) {
      /**
       * 跳过正常 ReviewRecord
       */
      if (
        item.words &&
        Array.isArray(item.words)
      ) {
        continue
      }

      /**
       * 旧版错题记录
       */
      if (
        item.word &&
        item.dict &&
        item.wrongCount
      ) {
        const existing =
          await db.wrongWordRecords
            .where('[dict+word]')
            .equals([
              item.dict,
              item.word,
            ])
            .first()

        if (existing) {
          await db.wrongWordRecords.update(
            existing.id!,
            {
              wrongCount:
                existing.wrongCount +
                item.wrongCount,

              createTime:
                Math.max(
                  existing.createTime,
                  item.createTime ||
                    Date.now(),
                ),

              isSynced: 0,
            },
          )
        } else {
          const record =
            new WrongWordRecord(
              item.word,
              item.dict,
              item.chapter ?? -1,
              item.wrongCount,
            )

          record.createTime =
            item.createTime ||
            Date.now()

          record.isSynced =
            item.isSynced ?? 0

          await db.wrongWordRecords.add(
            record,
          )
        }

        migratedCount++
      }
    }

    if (migratedCount > 0) {
      console.log(
        `[数据迁移] 已迁移 ${migratedCount} 条旧版错题记录`,
      )
    }
  } catch (err) {
    console.error(
      '[迁移旧版错题失败]',
      err,
    )
  }
}

export async function importDatabase(
  onStart: () => void,
  callback: (
    importProgress: ImportProgress,
  ) => boolean,
) {
  const [pako] =
    await Promise.all([
      import('pako'),
      import('dexie-export-import'),
    ])

  const input =
    document.createElement('input')

  input.type = 'file'

  input.accept =
    'application/gzip'

  input.addEventListener(
    'change',
    async () => {
      const file =
        input.files?.[0]

      if (!file) {
        return
      }

      onStart()

      const compressed =
        await file.arrayBuffer()

      const json =
        pako.ungzip(compressed, {
          to: 'string',
        })

      const blob =
        new Blob([json])

      await db.import(blob, {
        acceptVersionDiff: true,

        acceptMissingTables: true,

        acceptNameDiff: false,

        acceptChangedPrimaryKey:
          false,

        overwriteValues: true,

        clearTablesBeforeImport:
          true,

        progressCallback: ({
          totalRows,
          completedRows,
          done,
        }) => {
          return callback({
            totalRows,
            completedRows,
            done,
          })
        },
      })

      /**
       * 导入完成后迁移旧版错题
       */
      await migrateLegacyWrongWords()

      const [
        wordCount,
        chapterCount,
      ] = await Promise.all([
        db.wordRecords.count(),
        db.chapterRecords.count(),
      ])

      recordDataAction({
        type: 'import',

        size: file.size,

        wordCount,

        chapterCount,
      })

      console.log(
        '[数据库导入完成]',
      )
    },
  )

  input.click()
}