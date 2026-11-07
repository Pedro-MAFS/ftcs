/** 模型重试看门狗：只有连续处于 retry 才计时。离开 retry 即释放。 */
export type RetryWatchAction = 'start' | 'continue' | 'recover' | 'clear'

export function retryWatchOnStatus(
  inRetry: boolean,
  sawSessionError: boolean,
  statusType: string,
): RetryWatchAction {
  if (statusType === 'retry') return inRetry ? 'continue' : 'start'
  if (inRetry && !sawSessionError) return 'recover'
  return 'clear'
}
