#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { evaluateStartTask } from "./start-task.js"

const server = new McpServer({
  name: "ftcs-task",
  version: "0.1.0",
})

const TOOL_DESCRIPTION = [
  "用户明确要开始一轮获客步骤时才调用。",
  "画像不要调用，请告诉用户去录入页选资料后用左侧按钮。",
  "补联系人、单封重写、中文对照不要调用，请告诉用户使用对应的现有按钮。",
  "调用后不要再写文件，也不要再启动第二次。",
  "本工具只校验参数并返回 JSON，不会自己跑流水线。",
].join("")

server.tool(
  "start_task",
  TOOL_DESCRIPTION,
  {
    stage: z
      .string()
      .describe("获客步骤：keywords（扩展关键词）、explore（探索）、score（评分去重）、email（起草待处理线索）"),
    explore_channel: z
      .string()
      .optional()
      .describe("仅 stage 为 explore 时必填：r1 全网搜索、r2 社媒发现、r3 地图发现"),
    product_id: z
      .string()
      .optional()
      .describe("可空。空则由桌面使用当前产品；没有当前产品时由桌面拒绝启动"),
  },
  async (args) => {
    const result = evaluateStartTask(args)
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    }
  },
)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
