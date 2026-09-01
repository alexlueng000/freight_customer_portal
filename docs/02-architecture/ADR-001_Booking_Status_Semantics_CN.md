# ADR-001：Booking 状态语义与 P0-B 迁移

> 状态：ACCEPTED
> 日期：2026-09-01
> 影响范围：Booking、SO、Shipment、Notification、Audit、API、Web、Seed、自动化测试

## 1. 背景

当前 Booking 状态机为：

```text
DRAFT → SUBMITTED → UNDER_REVIEW → CONFIRMED → SO_RELEASED
```

业务 UAT 已证明：

- `UNDER_REVIEW` 没有任务领取、负责人、锁、审核清单或 SLA，只有一次无业务价值的点击。
- `CONFIRMED` 实际表示内部资料审核通过，容易被误解为船司已确认舱位。
- `SO_RELEASED` 同时表示文件已上传和客户已可见，无法表达“内部已收到、尚未发布”。
- 当前 `REJECTED` 是终态，不能表达客户补料后重新提交。

## 2. 决策

采用以下状态：

```text
DRAFT
→ SUBMITTED
→ APPROVED
→ BOOKING_SUBMITTED
→ BOOKED
```

并增加两个分支状态：

```text
SUBMITTED → REVISION_REQUIRED → SUBMITTED
SUBMITTED | APPROVED | BOOKING_SUBMITTED → REJECTED | CANCELLED
```

状态含义：

| 状态 | 内部含义 | 客户文案 | 可执行动作 |
| --- | --- | --- | --- |
| DRAFT | 客户草稿 | 草稿 | 客户编辑、提交、删除草稿 |
| SUBMITTED | 客户已提交，待资料审核 | 已提交 | Operation 通过、退回补充、拒绝 |
| REVISION_REQUIRED | 资料退回客户补充 | 待补充资料 | 客户编辑并重新提交 |
| APPROVED | 资料审核通过，待向船司/代理订舱 | 处理中 | Operation 提交船司/代理 |
| BOOKING_SUBMITTED | 已向船司/代理提交，等待 SO | 订舱处理中 | 内部登记 SO |
| BOOKED | 已收到并发布 SO | 已订舱 | 创建 Shipment、客户查看 SO |
| REJECTED | 业务明确拒绝，终态 | 已拒绝 | 只读 |
| CANCELLED | 已取消，终态 | 已取消 | 只读 |

## 3. 合法转换

```text
DRAFT             → SUBMITTED | CANCELLED
SUBMITTED         → APPROVED | REVISION_REQUIRED | REJECTED | CANCELLED
REVISION_REQUIRED → SUBMITTED | CANCELLED
APPROVED          → BOOKING_SUBMITTED | REJECTED | CANCELLED
BOOKING_SUBMITTED → BOOKED | REJECTED | CANCELLED
BOOKED            → （无普通状态转换）
REJECTED          → （终态）
CANCELLED         → （终态）
```

`BOOKED` 只能由 SO 发布事务产生，禁止提供普通“设为已订舱”端点。

## 4. 语义化动作与权限

| 动作 | Endpoint | 权限 | 状态转换 |
| --- | --- | --- | --- |
| 提交订舱 | `POST /bookings/:id/submit` | `booking.submit` | DRAFT/REVISION_REQUIRED → SUBMITTED |
| 删除草稿 | `POST /bookings/:id/cancel`（V1 继续软取消） | `booking.submit` | DRAFT → CANCELLED |
| 退回补充 | `POST /admin/bookings/:id/request-revision` | `booking.manage` | SUBMITTED → REVISION_REQUIRED |
| 审核通过 | `POST /admin/bookings/:id/approve` | `booking.manage` | SUBMITTED → APPROVED |
| 业务拒绝 | `POST /admin/bookings/:id/reject` | `booking.manage` | 指定状态 → REJECTED |
| 提交船司/代理 | `POST /admin/bookings/:id/submit-to-carrier` | `booking.manage` | APPROVED → BOOKING_SUBMITTED |
| 登记 SO | `POST /admin/bookings/:id/so-records` | `document.upload` | 状态不变 |
| 发布 SO | `POST /admin/bookings/:id/so-records/:soId/publish` | `document.manage` | BOOKING_SUBMITTED → BOOKED |

旧 `/review`、`/confirm`、`/release-so` 不继续承载新业务。预试点阶段可在同一变更中更新全部调用方并删除；如果外部客户端已经使用，则先返回弃用提示并设置一个版本兼容窗口。

## 5. 历史状态映射

| 旧状态 | 新状态 | 映射理由 |
| --- | --- | --- |
| DRAFT | DRAFT | 语义不变 |
| SUBMITTED | SUBMITTED | 语义不变 |
| UNDER_REVIEW | SUBMITTED | 旧状态没有独立业务价值 |
| CONFIRMED | APPROVED | 旧 Confirm 实际是内部资料审核通过 |
| SO_RELEASED | BOOKED | 仅在数据满足已发布 SO，或作为明确记录的历史例外时映射 |
| REJECTED | REJECTED | 旧记录按终止处理，不推断为可补充 |
| CANCELLED | CANCELLED | 语义不变 |

迁移前必须列出所有 `SO_RELEASED` 但不存在客户可见 ACTIVE SO 的 Booking。不得在未知情况下静默映射。

## 6. 被否决的方案

### 保留 UNDER_REVIEW

否决原因：当前没有认领、处理人、锁或 SLA。未来如果增加这些能力，可重新引入具有独立业务价值的任务状态。

### 继续使用 CONFIRMED

否决原因：无法区分内部审核通过和船司确认舱位，容易在页面、通知和客户沟通中产生误解。

### 使用 REJECTED 表示退回补充

否决原因：退回补充可继续编辑和重提，而真正拒绝是终态；两者权限、文案和审计含义不同。

### SO 上传即发布

否决原因：上传人员可能尚未核对文件或结构化字段，会造成错误文件直接暴露给客户。

## 7. 影响与约束

- 所有状态转换继续由服务端状态机控制，并通过条件更新防止并发重复动作。
- 状态变更与 AuditLog 在同一数据库事务中完成。
- 退回原因使用稳定代码；客户可见说明与内部备注分字段保存。
- 客户 API 不返回内部备注。
- SO 上传默认 `customerVisible=false`；发布事务才可设置为 true。
- Shipment 创建要求 Booking=BOOKED 且存在已发布 SO；历史例外必须在迁移报告中明确处理。
- 需要同步更新 Prisma enum、数据库约束、Seed、Swagger、前端状态文案/筛选、Notification 事件和全部测试。

## 8. 确认项

- [x] 批准采用 `REVISION_REQUIRED / APPROVED / BOOKING_SUBMITTED / BOOKED`。
- [x] 批准 `REJECTED` 仅表示业务终止。
- [x] 批准客户看到 APPROVED 时统一显示“处理中”，不暴露内部审核术语。
- [x] 批准 BOOKED 必须由 SO 发布事务产生。
