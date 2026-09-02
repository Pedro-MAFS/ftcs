# US-E-10 Places 官方 token 网关通道

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-E-10  
> **状态**：**无限期延后**（2026-09-03 产品决策）  
> **范围（原规划）**：token-gateway 代调 Google Places；桌面 `PLACES_PROVIDER=gateway`；官方通道用户不经 BYOK 跑 R3  

---

## 决策记录

| 日期 | 决定 |
|------|------|
| 2026-09-03 | **无限期延后**，不排期、不写实现详设、不在 token-gateway 增 Places 端点 |

**原因（摘要）**

1. **网络**：Google Places API（`places.googleapis.com`）在中国大陆通常需用户侧可访问 Google 的网络环境；平台集中代调等于在服务端稳定跨境访问 Google，与用户本机 BYOK + 自备网络（E-07）风险轮廓不同。  
2. **合规**：向大陆用户商业提供「免翻墙、代调 Google API」的叙事，可能涉及跨境数据、代访问境外被限服务、电信/增值业务等议题，需专门法律评估；在评估完成前 **不做**。  
3. **产品已可交付 R3**：E-07 自定义 Key + E-08 Skill + E-09 探索页「开始 R3」已满足目标用户（自备 GCP Key 与网络，如 TUN VPN）跑通地图发现。  
4. **官方通道仍可用 R3**：官方通道用户 **可并存 BYOK Places Key**（E-07 Q9）；模型/Tavily 走官方，Places 直连 Google，**不依赖** E-10。

**不变**

- `places-api` MCP 保留 `PLACES_PROVIDER=gateway` **占位**与 `PLACES_GATEWAY_NOT_READY` 错误码；**不实现** gateway 分支。  
- `isPlacesGatewayReady()` 恒 `false`；Preflight 官方通道无 Key 时引导 **设置 → 探索填写 Places Key**，不再提示「等待官方代调开通」。

**若未来重启（非承诺）**

需同时满足：律师书面意见、网关部署国/用户范围、Google 企业条款、与大陆运营主体切割方案；再另开评审，**不**沿用本故事原 Should 优先级。

---

## 相关文档

- 需求 §5.7 / §14：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md)  
- BYOK MCP：[US-E-07-Places-MCP自定义Key.md](US-E-07-Places-MCP自定义Key.md)  
- Preflight：[US-E-09-探索页开始R3与Preflight.md](US-E-09-探索页开始R3与Preflight.md)
