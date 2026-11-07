import fs from 'node:fs'
import path from 'node:path'
import { isActive, type TaskRecord } from './lifecycle'

/** Store displayable task summaries only. A new host cannot resume an old MCP call. */
export class TaskJournal {
  private readonly records = new Map<string, TaskRecord>()
  private readonly file: string

  constructor(root: string, onInterrupted?: (record: TaskRecord) => void) {
    this.file = path.join(root, '.ftcs', 'tasks-v1.json')
    if (!fs.existsSync(this.file)) return
    const history: TaskRecord[] = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    let recovered = false
    for (const task of history) {
      if (isActive(task.state)) {
        task.state = 'interrupted'
        task.message = '桌面服务已重启，任务中断'
        task.finished_at = new Date().toISOString()
        task.revision++
        onInterrupted?.(task)
        recovered = true
      }
      this.records.set(task.task_id, task)
    }
    if (recovered) this.save()
  }

  snapshot() {
    return Array.from(this.records.values())
  }

  record(task: TaskRecord) {
    this.records.set(task.task_id, task)
    if (this.records.size > 200) this.records.delete(this.records.keys().next().value!)
    this.save()
  }

  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = this.file + '.tmp'
    fs.writeFileSync(temp, JSON.stringify(this.snapshot()), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temp, this.file)
  }
}
