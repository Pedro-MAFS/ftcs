import { shallowRef } from 'vue'
import type { MailTarget } from '../../../electron/mailbox/types'

// Keep the click until the mailbox tab has mounted and loaded its contacts.
export const pendingMailTarget = shallowRef<MailTarget>()
