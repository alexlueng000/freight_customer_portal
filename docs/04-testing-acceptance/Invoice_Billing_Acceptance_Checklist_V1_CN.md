# Freight Customer Portal V1 — Invoice / Billing 阶段验收清单

> 文档版本：V1.0
> 日期：2026-08-30
> 适用范围：Shipment 应收账单创建、附件、发布、客户确认、作废、人工标记收款与租户隔离
> 当前结论：功能开发、数据库迁移和自动化验证完成，待业务 UAT 签署

## 1. 验收目标

确认以下 V1 应收账单闭环在真实 PostgreSQL、真实鉴权、服务端权限和多租户约束下可运行：

```text
Shipment
→ Draft Invoice + InvoiceLine
→ Issued
→ Customer Confirmed
→ Paid
```

`VOID` 是受控终止状态。V1 不包含税务发票、收款核销、供应商应付、总账、会计凭证或自动银行对账。

## 2. 验收前置条件

- Web、API 和 PostgreSQL 已启动且 readiness 正常。
- 19 个 Prisma migration 已应用，权限和幂等 DEMO seed 已执行。
- 准备 Finance/Tenant Admin、Customer Admin 和另一租户客户账号。
- 至少准备一票属于目标客户的 Shipment。
- 验收不得通过直接修改数据库跳过状态动作。

## 3. 创建 Draft Invoice

### INVOICE-UAT-001 多费用行与金额计算

1. 内部用户从 Shipment 创建 Draft Invoice。
2. 添加至少两条费用行，填写费用代码、说明、数量和单价。
3. 填写币种、税额和到期日后保存。

预期结果：

- Invoice 编号符合 `INVyyyyMM######`，且在租户内唯一。
- Invoice 自动继承 Shipment 的 customer company，不接受客户端指定其他客户。
- InvoiceLine 保存 charge code、说明、数量、单价、币种、金额和排序。
- `amount = quantity × unitPrice`，`subtotal` 为费用行汇总，`totalAmount = subtotal + taxAmount`。
- 权威金额使用 Decimal，不使用 JavaScript 浮点数。
- Invoice、InvoiceLine、编号计数和 AuditLog 在同一事务内完成。

结果：`□ 通过  □ 失败  □ 阻塞`

### INVOICE-UAT-002 输入和数据库约束

1. 分别尝试空费用行、零/负数量、负单价、非法币种和非法日期。
2. 尝试使用另一租户 Shipment ID 创建账单。

预期结果：

- DTO 返回明确校验错误，不写入部分 Invoice 数据。
- 金额、币种和租户/客户一致性同时受数据库约束保护。
- 跨租户 Shipment 返回未找到，不泄漏对象存在性。

结果：`□ 通过  □ 失败  □ 阻塞`

### INVOICE-UAT-002A Invoice 附件

1. 后台为 Invoice 上传 PDF 附件，再上传一个新版本。
2. 客户打开已发布 Invoice 并下载附件。
3. 使用另一客户公司及另一租户账号猜测 Document ID。

预期结果：

- 新版本为 ACTIVE，旧版本为 SUPERSEDED，客户只看到有效版本。
- 附件固定关联当前 Invoice 和 tenant，且 customer visible。
- 客户可下载本公司已发布 Invoice 附件，跨客户/跨租户访问返回未找到。
- 上传和下载均写入 AuditLog；对象存储或数据库失败不遗留不一致的业务记录。

结果：`□ 通过  □ 失败  □ 阻塞`

## 4. 状态机与后台操作

### INVOICE-UAT-003 发布、确认和收款

1. Finance 发布 Draft Invoice。
2. 客户确认 Issued Invoice。
3. Finance 将 Customer Confirmed Invoice 标记为 Paid。
4. 尝试跳过状态或修改终态。

预期结果：

- 合法主路径为 `DRAFT → ISSUED → CUSTOMER_CONFIRMED → PAID`。
- 非法跳转由服务端状态机拒绝，不能依赖前端隐藏按钮。
- `issuedAt`、`confirmedAt`、`paidAt` 按动作写入。
- 每次状态变化记录 tenant、操作者、对象及 before/after AuditLog。

结果：`□ 通过  □ 失败  □ 阻塞`

### INVOICE-UAT-004 作废

1. 分别从 Draft、Issued 和 Customer Confirmed 执行作废。
2. 尝试作废 Paid 或已经 Void 的 Invoice。

预期结果：

- 仅状态机允许的非终态可进入 `VOID` 并记录 `voidedAt`。
- Paid 和 Void 为终态，不允许继续跳转。
- 作废操作需要 `invoice.manage` 并写入审计。

结果：`□ 通过  □ 失败  □ 阻塞`

## 5. 客户可见性与权限

### INVOICE-UAT-005 客户范围

1. 客户打开 Billing 列表和详情。
2. 使用同租户另一客户公司及另一租户账号猜测 Invoice ID。
3. 尝试读取 Draft 或 Void Invoice。

预期结果：

- 客户只看到本公司 `ISSUED`、`CUSTOMER_CONFIRMED`、`PAID` Invoice。
- Draft 和 Void 不出现在客户列表，直接猜 ID 也返回未找到。
- 其他客户公司和其他租户无法读取或确认该 Invoice。
- 客户不能执行创建、发布、作废或标记收款。

结果：`□ 通过  □ 失败  □ 阻塞`

### INVOICE-UAT-006 内部角色权限

1. Tenant Admin/Finance 查看和管理 Invoice。
2. Sales 查看自己负责客户的 Invoice。
3. Operation 或无权限内部账号尝试管理 Invoice。

预期结果：

- Tenant Admin/Finance 具备 `invoice.read` 与 `invoice.manage`。
- Sales 只读取自己负责客户的 Invoice，不具备管理权限。
- Customer Admin/User 只有本公司读取与确认权限。
- 未授权角色在服务端被拒绝。

结果：`□ 通过  □ 失败  □ 阻塞`

## 6. 页面与自动化门禁

### TECH-UAT-007

- [x] Prisma schema validate/generate 通过。
- [x] 19 个 migration 在本地 PostgreSQL 成功应用。
- [x] ESLint 与 TypeScript typecheck 通过。
- [x] API 18 个测试套件、63 项测试通过。
- [x] Worker 3 个测试套件、5 项测试通过。
- [x] Next.js/NestJS/Worker 全量生产构建通过。
- [x] Invoice 状态机和数据库集成测试共 2 个套件、3 项测试通过。
- [x] Invoice/Billing 后台和客户 Playwright E2E 共 2 项通过。
- [x] 全量 Shipment + Invoice/Billing Playwright E2E 共 4 项串行通过。
- [x] CI 运行全量 Playwright，并在失败时保留 screenshot、video、trace 和 HTML report。

## 7. 验收签署

| 角色       | 姓名 | 结论                         | 日期 | 备注 |
| ---------- | ---- | ---------------------------- | ---- | ---- |
| 产品负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |
| 业务负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |
| 技术负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |

未通过项必须记录缺陷编号、负责人、截止日期和复验结果。
