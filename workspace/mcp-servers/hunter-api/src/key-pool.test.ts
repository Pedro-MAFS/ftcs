import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeKeyPool,
  effectiveKeyStatus,
  keyFingerprint,
  keyTail,
  loadKeyPoolState,
  markKeyExhausted,
  markKeyInvalid,
  pickAvailableKey,
} from "./key-pool.js";

const K1 = "key-one-1111";
const K2 = "key-two-2222";

describe("key-pool", () => {
  let root: string;
  before(() => {
    root = mkdtempSync(join(tmpdir(), "ftcs-key-pool-"));
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("指纹稳定且随 Key 变化；落盘不含明文 Key", () => {
    assert.equal(keyFingerprint(K1), keyFingerprint(K1));
    assert.notEqual(keyFingerprint(K1), keyFingerprint(K2));
    assert.equal(keyTail(K1), "1111");

    markKeyInvalid(root, K1);
    const state = loadKeyPoolState(root);
    const [fpr] = Object.keys(state.keys);
    assert.equal(fpr, keyFingerprint(K1));
    assert.ok(!JSON.stringify(state).includes(K1));
  });

  it("未知 Key 默认 ok；invalid 永久生效", () => {
    assert.equal(effectiveKeyStatus(root, K2).status, "ok");
    markKeyInvalid(root, K2);
    assert.equal(effectiveKeyStatus(root, K2).status, "invalid");
    // 时间前进也不复位
    const future = new Date(Date.now() + 90 * 24 * 3600 * 1000);
    assert.equal(effectiveKeyStatus(root, K2, future).status, "invalid");
  });

  it("exhausted 到 reset_date 当天自动复位；未来日期保持 exhausted", () => {
    const isolated = mkdtempSync(join(tmpdir(), "ftcs-key-pool-exp-"));
    try {
      markKeyExhausted(isolated, K1, "2999-01-01");
      assert.equal(effectiveKeyStatus(isolated, K1).status, "exhausted");

      markKeyExhausted(isolated, K2, "2000-01-01");
      assert.equal(effectiveKeyStatus(isolated, K2).status, "ok");
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("exhausted 无 reset_date 时次日复位", () => {
    const isolated = mkdtempSync(join(tmpdir(), "ftcs-key-pool-null-"));
    try {
      markKeyExhausted(isolated, K1, null);
      const now = new Date();
      assert.equal(effectiveKeyStatus(isolated, K1, now).status, "exhausted");
      const in25h = new Date(now.getTime() + 25 * 3600 * 1000);
      assert.equal(effectiveKeyStatus(isolated, K1, in25h).status, "ok");
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("pickAvailableKey 按配置顺序返回第一个可用 Key", () => {
    const isolated = mkdtempSync(join(tmpdir(), "ftcs-key-pool-pick-"));
    try {
      assert.equal(pickAvailableKey(isolated, [K1, K2]), K1);
      markKeyExhausted(isolated, K1, "2999-01-01");
      assert.equal(pickAvailableKey(isolated, [K1, K2]), K2);
      markKeyInvalid(isolated, K2);
      assert.equal(pickAvailableKey(isolated, [K1, K2]), null);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("describeKeyPool 汇总状态与重置日", () => {
    const isolated = mkdtempSync(join(tmpdir(), "ftcs-key-pool-desc-"));
    try {
      markKeyExhausted(isolated, K1, "2026-10-14");
      markKeyInvalid(isolated, K2);
      const pool = describeKeyPool(isolated, [K1, K2]);
      assert.deepEqual(pool, [
        { tail: "1111", status: "exhausted", exhausted_until: "2026-10-14" },
        { tail: "2222", status: "invalid", exhausted_until: null },
      ]);
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });

  it("状态文件损坏时静默降级为空态", () => {
    const isolated = mkdtempSync(join(tmpdir(), "ftcs-key-pool-corrupt-"));
    try {
      const dir = join(isolated, "data", "cache", "hunter");
      // 目录不存在时 load 应返回空态
      assert.deepEqual(loadKeyPoolState(isolated), { keys: {} });
      // 写入损坏 JSON
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "key-pool.json"), "{ not json", "utf8");
      assert.deepEqual(loadKeyPoolState(isolated), { keys: {} });
      // 损坏后仍可正常标记
      markKeyInvalid(isolated, K1);
      assert.equal(effectiveKeyStatus(isolated, K1).status, "invalid");
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  });
});
