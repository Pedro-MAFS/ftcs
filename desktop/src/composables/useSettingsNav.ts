import { ref } from 'vue'
import type { SettingsCategory } from '../types/settings'

const activeCategory = ref<SettingsCategory>('model')

export function useSettingsNav() {
  function setCategory(category: SettingsCategory): void {
    activeCategory.value = category
  }

  return {
    activeCategory,
    setCategory,
  }
}
