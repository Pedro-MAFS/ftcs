/**
 * 测试夹具：pantron.com 真实 Domain Search 响应（2026-09-14 实测，精简保留结构特征）。
 * 特征：accept_all 域、position 全 null、仅 steve@ 内嵌 verification valid、
 * sales@ 带 17 条 sources（用于验证截断）、含 still_on_page=false 的旧来源。
 */
export const PANTRON_DOMAIN_SEARCH_RESPONSE = {
  data: {
    domain: "pantron.com",
    disposable: false,
    webmail: false,
    accept_all: true,
    pattern: "{first}",
    organization: "Pantron Automation",
    emails: [
      {
        value: "steve@pantron.com",
        type: "personal",
        confidence: 84,
        first_name: null,
        last_name: null,
        position: null,
        seniority: null,
        department: null,
        decision_maker: false,
        verification: { date: "2026-09-14", status: "valid" },
        sources: [
          {
            domain: "kfia.org",
            uri: "https://kfia.org/Page/55/kentucky-wood-expo-kfia-wood-expo",
            extracted_on: "2026-05-19",
            last_seen_on: "2026-08-07",
            still_on_page: true,
          },
        ],
      },
      {
        value: "info@pantron.com",
        type: "generic",
        confidence: 81,
        first_name: null,
        last_name: null,
        position: null,
        seniority: null,
        department: "support",
        decision_maker: false,
        verification: { date: null, status: null },
        sources: [
          {
            domain: "pantron.com",
            uri: "https://pantron.com",
            extracted_on: "2026-08-18",
            last_seen_on: "2026-09-04",
            still_on_page: true,
          },
          {
            domain: "swivellink.com",
            uri: "https://swivellink.com/item/pantron-automation",
            extracted_on: "2016-04-25",
            last_seen_on: "2018-07-02",
            still_on_page: false,
          },
        ],
      },
      {
        value: "sales@pantron.com",
        type: "generic",
        confidence: 78,
        first_name: null,
        last_name: null,
        position: null,
        seniority: null,
        department: "sales",
        decision_maker: false,
        verification: { date: null, status: null },
        sources: Array.from({ length: 17 }, (_, i) => ({
          domain: i < 2 ? "fuchs-umwelttechnik.com" : `source-${i}.example.com`,
          uri: `https://source-${i}.example.com/page`,
          extracted_on: "2018-11-29",
          last_seen_on: i < 2 ? "2026-08-09" : "2018-01-01",
          still_on_page: i < 2,
        })),
      },
      {
        value: "ghost@pantron.com",
        type: "personal",
        confidence: 40,
        first_name: null,
        last_name: null,
        position: null,
        seniority: null,
        department: null,
        decision_maker: false,
        verification: { date: null, status: null },
        sources: [],
      },
    ],
  },
  meta: { results: 7 },
};

export const VERIFIER_VALID_RESPONSE = {
  data: {
    status: "valid",
    score: 100,
    email: "steve@pantron.com",
    regexp: true,
    gibberish: false,
    disposable: false,
    webmail: false,
    mx_records: true,
    smtp_server: true,
    smtp_check: true,
    accept_all: false,
    block: false,
  },
};

export const ACCOUNT_RESPONSE = {
  data: {
    plan_name: "Free",
    plan_level: 0,
    reset_date: "2026-10-14",
    requests: {
      credits: { used: 5, available: 50, remaining: 45 },
      searches: { used: 5, available: 50, remaining: 45 },
      verifications: { used: 10, available: 100, remaining: 90 },
    },
  },
};
