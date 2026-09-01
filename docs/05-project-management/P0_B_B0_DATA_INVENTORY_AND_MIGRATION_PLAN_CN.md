# P0-B B0：Booking 数据盘点与迁移计划

> 日期：2026-09-01
> 环境：本地开发 PostgreSQL 17，数据库 `freight_portal`
> 本文只记录设计与只读盘点；尚未创建或应用状态 migration。

## 1. 本地数据盘点

### Booking 状态

| 旧状态 | 数量 |
| --- | ---: |
| DRAFT | 0 |
| SUBMITTED | 0 |
| UNDER_REVIEW | 0 |
| CONFIRMED | 0 |
| SO_RELEASED | 7 |
| REJECTED | 0 |
| CANCELLED | 0 |

### SO 与 Shipment 一致性

- 7 条 `SO_RELEASED` Booking 中，6 条存在 ACTIVE 且客户可见的 SO Document。
- 7 条均已关联 Shipment。
- `BOOK-DEMO-SHIPPED` 已有关联 Shipment，但没有 SO Document；这是演示 Seed 历史例外，不满足新流程“发布 SO 后才能 BOOKED/创建 Shipment”。
- 当前共有 6 条 SO Document，全部为 `ACTIVE + customerVisible=true`。

结论：正式迁移前必须修复 Seed 例外，或将其作为明确的 legacy exception 记录；禁止把检查结果忽略后直接迁移。

## 2. 代码影响盘点

直接影响：

- `prisma/schema.prisma`：BookingStatus、Booking 时间字段及新增 review/SO 关系。
- `prisma/seed.mjs`：`SO_RELEASED` 演示 Booking 和无 SO 的 Shipment 演示数据。
- `apps/api/src/modules/bookings/booking-state-machine.ts` 及测试。
- `apps/api/src/modules/bookings/bookings.service.ts`：review、confirm、releaseSo、createShipment 和时间戳写入。
- `apps/api/src/modules/bookings/admin-bookings.controller.ts`：旧 action endpoint。
- Booking API 数据库集成测试、Shipment/Invoice fixture 和 Playwright golden path。
- 后台 Booking 列表/详情、客户 Booking 详情的状态筛选、状态标签和按钮。
- UAT Checklist 与核心流程文档中的旧状态描述。

间接影响：

- Notification 事件名称与消息文案。
- AuditLog action 名称和历史查询。
- Shipment 创建前置条件。
- Dashboard/列表统计（后续接入时必须使用新状态）。

## 3. Migration 策略

### 3.1 前置检查

迁移必须先执行只读断言：

1. 按旧状态统计 Booking 数量。
2. 列出所有 `SO_RELEASED` 且不存在 `ACTIVE + customerVisible=true + documentType='SO'` 的 Booking。
3. 列出所有已关联 Shipment 但 Booking 不是 `SO_RELEASED` 的记录。
4. 列出所有 SO Document 与 Booking tenant 不一致的记录；期望为 0。
5. 保存迁移前数量和异常业务编号作为发布证据。

任一未知异常存在时停止 migration，不自动猜测。

### 3.2 推荐的单次维护窗口迁移

项目尚未进入外部试点，可在一个版本内同步更新数据库与所有调用方。推荐在新 migration 中：

1. 创建临时 enum `BookingStatus_new`，包含：
   `DRAFT, SUBMITTED, REVISION_REQUIRED, APPROVED, BOOKING_SUBMITTED, BOOKED, REJECTED, CANCELLED`。
2. 将 `bookings.status` 临时转换为 text。
3. 使用显式 CASE 完成旧值映射。
4. 删除旧 `BookingStatus` enum，将临时 enum 重命名为 `BookingStatus`。
5. 将 `bookings.status` 转回新 enum 并恢复默认值 `DRAFT`。
6. 添加新时间字段：`revisionRequestedAt`、`approvedAt`、`bookingSubmittedAt`、`bookedAt`。
7. 将 `confirmedAt → approvedAt`；将旧 `SO_RELEASED` 的历史时间按 SO Document.createdAt 或现有业务时间填入 `bookedAt`。
8. 保留 `underReviewAt` 和 `confirmedAt` 一个兼容版本，只读保留历史；确认无调用后再用后续 migration 删除，避免在同一变更中丢失追溯信息。
9. 新增状态相关表/字段时加入 tenant-aware 外键、唯一约束和索引。

### 3.3 状态映射 SQL 逻辑

```text
DRAFT       → DRAFT
SUBMITTED   → SUBMITTED
UNDER_REVIEW→ SUBMITTED
CONFIRMED   → APPROVED
SO_RELEASED → BOOKED（前置检查通过或例外已书面处理）
REJECTED    → REJECTED
CANCELLED   → CANCELLED
```

不允许把 `REJECTED` 自动映射为 `REVISION_REQUIRED`，因为历史数据无法证明它是补料还是业务拒绝。

## 4. 本地例外修复方案

`BOOK-DEMO-SHIPPED` 的推荐处理：

- 修改 Seed，使演示 Shipment Booking 同时创建确定性的 SO Document/BookingSoRecord；或者将该演示数据定位为“历史导入例外”，单独保存 legacy migration 标记。
- 推荐前者，因为 golden path 和演示环境应遵循当前产品规则，不应长期依赖例外。
- Seed 必须继续幂等，不保存真实凭据，不依赖手工数据库修改。

在 BookingSoRecord 尚未实现前，不立即伪造数据库记录；B3 schema 完成时一并修复 Seed。

## 5. 回滚设计

数据库回滚只用于部署失败后的短窗口恢复：

```text
REVISION_REQUIRED → SUBMITTED
APPROVED          → CONFIRMED
BOOKING_SUBMITTED → CONFIRMED
BOOKED            → SO_RELEASED
```

风险：新系统中的 `APPROVED` 和 `BOOKING_SUBMITTED` 回滚后都会变成 `CONFIRMED`，会损失细分语义。因此：

- 迁移前必须备份数据库。
- 部署后在创建新状态数据前完成冒烟检查。
- 一旦产生 `REVISION_REQUIRED` 或 `BOOKING_SUBMITTED` 生产记录，优先向前修复，不建议执行有损回滚。
- 回滚前导出 Booking ID、状态、时间戳和 BookingReviewAction/BookingSoRecord 作为恢复依据。

## 6. API 兼容策略

预试点推荐做法：同一版本更新所有仓库内调用方，然后删除旧 endpoint：

- 删除 `/admin/bookings/:id/review`。
- `/confirm` 替换为 `/approve`。
- `/release-so` 拆成 SO 上传与 publish 两个 endpoint。
- 增加 `/request-revision` 和 `/submit-to-carrier`。

如果部署时存在仓库外客户端：

- 旧 endpoint 暂留一个版本并返回 deprecation header。
- `/review` 不再产生状态变化，返回明确迁移错误而不是静默成功。
- `/confirm` 可短期代理到 approve，但必须记录旧客户端调用日志。
- `/release-so` 不得代理为“上传即发布”，避免继续保留安全缺口。

## 7. 验证计划

迁移验证：

- 迁移前后 Booking 总数一致。
- 每个旧状态的映射数量符合盘点报告。
- 所有 Booking 的 status 均属于新 enum。
- tenant/customer/quote/shipment/document 关系数量不变。
- `BOOKED` 数据均有已发布 SO，书面 legacy exception 除外。

代码验证：

- 状态机合法和非法转换全覆盖。
- 并发 approve/request-revision/submit-to-carrier/publish 只允许一个成功。
- 内部备注不进入客户响应。
- 跨租户和跨客户访问失败。
- 隐藏 SO 在 publish 前不可通过列表或下载 endpoint 访问。
- Golden Path 更新为新状态和新 action endpoint。

## 8. B0 Gate

- [x] 权威文档和现有实现已盘点。
- [x] 文档冲突已明确记录。
- [x] 本地历史状态和 SO 一致性已完成只读盘点。
- [x] 新状态、动作、显示语义和历史映射已形成 ADR 草案。
- [x] Migration、回滚、API 兼容和验证方案已形成。
- [x] 产品负责人确认 ADR-001 的四个确认项（2026-09-01）。
- [x] 在本地开发数据库执行 migration 演练（2026-09-02，第 25 个 migration 成功应用）。

B0 设计工作已完成，ADR 已确认；状态 migration 将在 B2 实施并先在数据库副本演练。
