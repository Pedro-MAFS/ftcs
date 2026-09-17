import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  computeZhSourceHash,
  loadEmailDraftSlot,
  saveEmailDraftSlot,
  saveEmailDraftZh,
} from "./email-storage.js";

function createTempProject(): string {
  return mkdtempSync(join(tmpdir(), "ftcs-email-zh-"));
}

test("saveEmailDraftZh writes zh only and sets hash", () => {
  const root = createTempProject();
  try {
    saveEmailDraftSlot(
      root,
      "lead_zh_1",
      { kind: "company" },
      {
        lead_id: "lead_zh_1",
        product_id: "prod_x",
        status: "pending_review",
        language: "en",
        audience: "company",
        subject: "Hello Team",
        body: "We supply WPC decking.",
        recipient: { company: "Acme" },
        personalization_evidence: [],
        review: { approved: null, reviewer_notes: null, reviewed_at: null },
      }
    );

    const res = saveEmailDraftZh(root, "lead_zh_1", { kind: "company" }, {
      subject_zh: "你好团队",
      body_zh: "我们供应塑木地板。",
    });
    assert.equal(res.success, true);
    if (!res.success) return;

    const loaded = loadEmailDraftSlot(root, "lead_zh_1", { kind: "company" });
    assert.equal(loaded?.subject, "Hello Team");
    assert.equal(loaded?.body, "We supply WPC decking.");
    assert.equal(loaded?.subject_zh, "你好团队");
    assert.equal(loaded?.body_zh, "我们供应塑木地板。");
    assert.equal(
      loaded?.zh_source_hash,
      computeZhSourceHash("Hello Team", "We supply WPC decking.")
    );
    assert.equal(res.zh_source_hash, loaded?.zh_source_hash);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("saveEmailDraftZh fails when draft missing", () => {
  const root = createTempProject();
  try {
    const res = saveEmailDraftZh(root, "missing", { kind: "company" }, {
      subject_zh: "主题",
      body_zh: "正文",
    });
    assert.equal(res.success, false);
    if (res.success) return;
    assert.equal(res.error, "draft_not_found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("email_draft_save preserves existing zh when omitted", () => {
  const root = createTempProject();
  try {
    saveEmailDraftSlot(
      root,
      "lead_zh_2",
      { kind: "company" },
      {
        lead_id: "lead_zh_2",
        product_id: "prod_x",
        status: "pending_review",
        language: "en",
        audience: "company",
        subject: "A",
        body: "B",
        subject_zh: "甲",
        body_zh: "乙",
        zh_source_hash: "abc",
        recipient: { company: "Acme" },
        personalization_evidence: [],
        review: { approved: null, reviewer_notes: null, reviewed_at: null },
      }
    );

    saveEmailDraftSlot(
      root,
      "lead_zh_2",
      { kind: "company" },
      {
        lead_id: "lead_zh_2",
        product_id: "prod_x",
        status: "pending_review",
        language: "en",
        audience: "company",
        subject: "A2",
        body: "B2",
        recipient: { company: "Acme" },
        personalization_evidence: [],
        review: { approved: null, reviewer_notes: null, reviewed_at: null },
      }
    );

    const loaded = loadEmailDraftSlot(root, "lead_zh_2", { kind: "company" });
    assert.equal(loaded?.subject, "A2");
    assert.equal(loaded?.subject_zh, "甲");
    assert.equal(loaded?.body_zh, "乙");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
