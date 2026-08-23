import test from "node:test";
import assert from "node:assert/strict";
import { buildGatewaySearchBody, getGatewayBaseUrl, GatewaySearchError } from "./gateway.js";

test("getGatewayBaseUrl trims trailing slash", () => {
  const prev = process.env.FTCS_TOKEN_GATEWAY_BASE_URL;
  process.env.FTCS_TOKEN_GATEWAY_BASE_URL = "http://127.0.0.1:8088/v1/";
  try {
    assert.equal(getGatewayBaseUrl(), "http://127.0.0.1:8088/v1");
  } finally {
    if (prev === undefined) delete process.env.FTCS_TOKEN_GATEWAY_BASE_URL;
    else process.env.FTCS_TOKEN_GATEWAY_BASE_URL = prev;
  }
});

test("buildGatewaySearchBody omits include_domains when empty", () => {
  const none = buildGatewaySearchBody("q", 5, "en");
  assert.equal("include_domains" in none, false);

  const empty = buildGatewaySearchBody("q", 5, "en", []);
  assert.equal("include_domains" in empty, false);

  const withInclude = buildGatewaySearchBody("q", 5, "en", ["linkedin.com/company"]);
  assert.deepEqual(withInclude.include_domains, ["linkedin.com/company"]);
  assert.equal("api_key" in withInclude, false);
  assert.equal("num_results" in withInclude, false);
  assert.equal("include_answer" in withInclude, false);
});

test("GatewaySearchError carries code and status", () => {
  const err = new GatewaySearchError("INSUFFICIENT_BALANCE", "余额不足", 402);
  assert.equal(err.code, "INSUFFICIENT_BALANCE");
  assert.equal(err.httpStatus, 402);
  assert.equal(err.message, "余额不足");
});
