/**
 * 浏览窗缩在主窗口旁边或被挡住时，Windows 会把页面标成遮挡并冻住脚本。
 * 快照和跳转仍能返回，页面里的脚本调用会一直等。这些开关要在 app ready 之前加上。
 */
export const BROWSER_BACKGROUND_SWITCHES: Array<{ name: string; value?: string }> = [
  { name: 'disable-renderer-backgrounding' },
  { name: 'disable-backgrounding-occluded-windows' },
  { name: 'disable-background-timer-throttling' },
  { name: 'disable-features', value: 'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling' },
]

export function applyBrowserBackgroundSwitches(
  appendSwitch: (name: string, value?: string) => void,
): void {
  for (const item of BROWSER_BACKGROUND_SWITCHES) {
    appendSwitch(item.name, item.value)
  }
}
