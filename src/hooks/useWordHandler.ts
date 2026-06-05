import { db } from '@/utils/db';
import { triggerCloudSync } from '@/utils/db/supabaseSync';

/**
 * 当用户打错单词时触发的业务回调
 */
export const handleInputWrong = async (word: string, dictId: string, chapterId: number) => {
  const now = Date.now();

  try {
    // 1. 获取本地该单词旧的错误计数
    const existing = await db.reviewRecords.get({ dictId, chapterId, word });
    const newWrongCount = (existing?.wrongCount || 0) + 1;

    // 2. 极速写入本地，确保前台流畅无卡顿
    await db.reviewRecords.put({
      word,
      dictId,
      chapterId,
      wrongCount: newWrongCount,
      updatedAt: now,
      isSynced: 0, // <--- 关键：标记为未同步，激活同步队列
    });

    // 3. 随手抛给防抖节流函数（高频调用会被内部计时器拦截，完全不用担心引发网络堵塞）
    triggerCloudSync(dictId, chapterId);
  } catch (err) {
    console.error('本地写入错题失败:', err);
  }
};