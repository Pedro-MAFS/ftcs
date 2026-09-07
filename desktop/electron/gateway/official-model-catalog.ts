export interface OfficialCatalogModel {
  id: string
  label: string
  ownedBy?: string
  inputTypes?: string[]
  outputTypes?: string[]
}

/** 官方通道离线兜底（主路径为网关 GET /models） */
export const OFFICIAL_MODEL_CATALOG: {
  models: OfficialCatalogModel[]
  small: OfficialCatalogModel[]
} = {
  models: [
    {
      id: 'deepseek/deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      ownedBy: 'deepseek',
      inputTypes: ['txt'],
      outputTypes: ['txt'],
    },
    {
      id: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      ownedBy: 'deepseek',
      inputTypes: ['txt'],
      outputTypes: ['txt'],
    },
    {
      id: 'glm/glm-5.3-flash',
      label: 'GLM 5.3 Flash · 读图',
      ownedBy: 'glm',
      inputTypes: ['txt', 'image'],
      outputTypes: ['txt'],
    },
    {
      id: 'qwen/qwen3.8-flash',
      label: 'Qwen 3.8 Flash · 读图',
      ownedBy: 'qwen',
      inputTypes: ['txt', 'image'],
      outputTypes: ['txt'],
    },
  ],
  small: [
    {
      id: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      ownedBy: 'deepseek',
      inputTypes: ['txt'],
      outputTypes: ['txt'],
    },
    {
      id: 'glm/glm-5.3-flash',
      label: 'GLM 5.3 Flash · 读图',
      ownedBy: 'glm',
      inputTypes: ['txt', 'image'],
      outputTypes: ['txt'],
    },
    {
      id: 'qwen/qwen3.8-flash',
      label: 'Qwen 3.8 Flash · 读图',
      ownedBy: 'qwen',
      inputTypes: ['txt', 'image'],
      outputTypes: ['txt'],
    },
  ],
}

export function getOfficialModelCatalog() {
  return OFFICIAL_MODEL_CATALOG
}
