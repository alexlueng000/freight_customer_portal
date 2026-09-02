# P0-B4 全链路回归 Gate 记录

> 执行日期：2026-09-02
> 范围：Rate → Quote → Booking → SO → Shipment，以及 P0-B1–B3 的权限、状态机和事务回归
> 当前结论：**V1.1 正常业务主链已确认走通；技术 Gate 通过；正式签署姓名待补录**

## 1. 已通过门禁

| 门禁 | 执行结果 | 证据 |
| --- | --- | --- |
| Prisma schema | 通过 | `prisma validate` 成功；本地测试库 29 个 migration，无待应用 migration |
| TypeScript | 通过 | API、Web、Worker `tsc --noEmit` 全部通过 |
| ESLint | 通过 | API、Web、Worker 均为 0 warning / 0 error |
| API 单元/集成测试 | 通过 | 23 suites、101 tests 全部通过 |
| Booking/PostgreSQL 专项 | 通过 | 6 tests 全部通过，覆盖 Quote 转 Booking、跨租户/跨客户、Shipper、退回重提、提交船司、SO 隐藏/发布/替换 |
| Worker 单元/集成测试 | 通过 | 4 suites、12 tests 全部通过，含真实 PostgreSQL 运价导入事务测试 |
| 生产构建 | 通过 | NestJS API、Next.js Web、Worker 构建全部成功 |
| Playwright | 通过 | 6 个场景全部实跑通过：Booking 1、黄金路径 1、Shipment 2、Invoice 2 |
| Swagger | 通过 | 7 个新增 Booking/SO action path 均存在于 OpenAPI JSON |
| Diff hygiene | 通过 | `git diff --check` 无空白错误 |

## 2. 已覆盖的 B4 风险

- Booking 查询同时强制 tenant scope 和 customer company scope。
- `DRAFT → SUBMITTED → REVISION_REQUIRED → SUBMITTED → APPROVED → BOOKING_SUBMITTED` 合法链路通过。
- 非法状态转换由服务端状态机拒绝。
- Shipper 地址簿不能跨租户或跨客户公司访问。
- SO 内部保存后客户列表为空；发布后才可见。
- 新 SO 发布后旧版本被替代，客户只读取当前发布版本。
- Shipment 创建要求 Booking 已 `BOOKED` 且存在已发布 SO。
- Quote 转 Booking 和 SO 发布使用数据库事务，并有审计记录断言。
- 运价导入失败整批回滚，不留下部分业务数据。

## 3. Playwright 执行结果

使用独立 `.next-e2e` 生产构建目录和隔离 Web 端口执行，避免现有 `next dev` 改写 `.next`：

```text
booking-customer.spec.ts  1/1
golden-path.spec.ts       1/1
shipment.spec.ts          2/2
invoice.spec.ts           2/2
```

初次失败根因为既有 `next dev` 与生产启动共用 `.next`，导致 vendor chunk 缺失；独立构建目录复验后 Booking 与黄金路径 2/2 通过。

全量串行执行还发现本地/CI 未显式设置 `NODE_ENV` 时被错误套用生产登录限流（5 次/分钟）。已修正为仅 `production` 使用 5 次限制，其余环境使用 50 次，并在 Playwright API 启动命令显式设置 `NODE_ENV=test`。修正后 API lint/typecheck 和 23 suites / 101 tests 再次通过；六个浏览器场景均已实际通过。

Swagger JSON 已确认以下新增路径可见：审批、退回、提交船司、SO 列表/保存、替换、发布及客户 SO 列表。

## 4. 剩余业务项

- [x] 在隔离构建目录和端口启动当前 Web 构建。
- [x] `booking-customer.spec.ts` 通过。
- [x] `golden-path.spec.ts` 通过。
- [x] Shipment、Invoice Playwright 场景通过。
- [x] Swagger 新增 Booking/SO action endpoint 可见。
- [x] 项目负责人确认 V1.1 正常业务主链人工走通。
- [ ] 正式归档时补录产品/业务/技术签署人姓名。

P0-B4 自动化与技术 Gate 已通过，V1.1 正常业务主链已经确认走通。Invoice、BL、复杂 Tracking 不恢复为 V1.1 P0；正式归档仍需补录签署人姓名。
