# Freight Customer Portal V1 — Booking / SO / Shipment 阶段验收清单

> 文档版本：V1.0
> 日期：2026-08-29
> 适用范围：Accepted Quote 转 Booking、Booking 提交/审核/确认、SO 上传下载、Shipment 建档
> 当前结论：功能开发与自动化验证完成，待业务 UAT 签署

## 1. 验收目标

确认以下前半段核心业务链在真实数据库、真实鉴权、S3 兼容对象存储和多租户约束下可运行：

```text
Accepted Quote
→ Booking Draft
→ 客户补充并提交
→ Operation 审核确认
→ 上传并放出 SO
→ 客户下载 SO
→ 创建 Shipment
```

Container、Tracking Timeline、BL、Invoice 属于后续阶段，不纳入本清单的通过条件。

## 2. 验收前置条件

- Web、API、PostgreSQL、Redis 和 MinIO 均已启动且 readiness 正常。
- 15 个 Prisma migration 已应用，权限和 DEMO seed 已执行。
- 准备 Tenant Admin/Operation、Customer Admin 和另一个租户的测试账号。
- 准备一份 PDF、PNG 或 JPEG 格式 SO，大小不超过 10 MB。
- 验收不得通过直接修改数据库跳过状态动作。

## 3. Booking 转单与客户提交

### BOOKING-UAT-001 Accepted Quote 转 Booking

1. 客户打开状态为 `ACCEPTED` 的 Quote。
2. 点击“创建订舱”。
3. 检查 Booking 编号、航线、船司、ETD 和箱型需求。

预期结果：

- Booking 状态为 `DRAFT`，编号符合 `BOOKyyyyMM######`。
- 航线、船司、ETD、箱型和数量来自 Quote 快照。
- Quote 在同一事务中变为 `BOOKED`。
- 重复点击不会创建第二份 V1 常规 Booking。
- 创建 Booking 与 Quote 状态变化均写入 AuditLog。

结果：`□ 通过  □ 失败  □ 阻塞`

### BOOKING-UAT-002 编辑、校验与提交

1. 在客户 Booking 详情填写品名、件数、毛重、体积、发货人、地址、联系人和箱量。
2. 保存草稿并刷新页面。
3. 删除一个必填值后尝试提交，再恢复并提交。

预期结果：

- 只有 `DRAFT` Booking 可编辑。
- 缺失必填字段时服务端返回明确字段列表。
- 数量和重量必须为正数，重复箱型被拒绝。
- 完整资料提交后状态变为 `SUBMITTED` 并保存 `submittedAt`。

结果：`□ 通过  □ 失败  □ 阻塞`

## 4. 内部审核与状态机

### BOOKING-UAT-003 审核、确认与拒绝

1. Operation 打开 `SUBMITTED` Booking 并开始审核。
2. 确认一份 Booking。
3. 对另一份 Booking 填写原因并拒绝。
4. 尝试从 DRAFT 直接确认或从 CONFIRMED 再拒绝。

预期结果：

- 合法路径为 `SUBMITTED → UNDER_REVIEW → CONFIRMED`。
- 拒绝仅允许 `UNDER_REVIEW → REJECTED` 且原因必填。
- 非法跳转被服务端拒绝，前端隐藏按钮不替代服务端校验。
- 每次状态变化保存时间、操作者、备注和审计记录。

结果：`□ 通过  □ 失败  □ 阻塞`

## 5. SO 上传与客户下载

### DOCUMENT-UAT-004 上传并放出 SO

1. Operation 打开 `CONFIRMED` Booking。
2. 分别尝试上传不支持格式、空文件和超过 10 MB 文件。
3. 上传合法 PDF/PNG/JPEG SO。

预期结果：

- 非法文件被拒绝，不创建 Document 或改变 Booking 状态。
- 合法文件写入 S3 兼容对象存储，数据库只保存元数据。
- Document 类型为 `SO`、版本从 1 开始、`customerVisible=true`。
- Booking 原子更新为 `SO_RELEASED`；上传与状态变化均写入 AuditLog。
- 数据库事务失败时尝试清理已上传的孤儿对象。

结果：`□ 通过  □ 失败  □ 阻塞`

### DOCUMENT-UAT-005 客户可见性与下载授权

1. 对同一 Booking 准备一份 `customerVisible=false` 内部文件。
2. 客户打开 Booking 详情并下载 SO。
3. 使用另一客户公司及另一租户账号猜测 SO Document ID。

预期结果：

- 客户列表仅显示 ACTIVE 且 `customerVisible=true` 的文件。
- SO 下载内容、MIME 和原始文件名正确。
- 内部文件不出现在客户列表，直接猜 URL 也无法下载。
- 其他客户公司和其他租户返回未找到/无权限，不泄漏对象存在性。
- 成功下载写入 Document 下载审计。

结果：`□ 通过  □ 失败  □ 阻塞`

## 6. Shipment 建档

### SHIPMENT-UAT-006 从 Booking 创建 Shipment

1. Operation 对 `SO_RELEASED` Booking 点击“创建 Shipment”。
2. 填写可选 Vessel、Voyage 和 ETA。
3. 再次从同一 Booking 创建 Shipment。

预期结果：

- Shipment 编号符合 `SHPyyyyMM######`，初始状态为 `PLANNED`。
- customer、Booking、POL/POD、Carrier 和 ETD 快照正确。
- V1 常规路径阻止重复创建；数据模型仍保留 Booking 1:N Shipment 的未来能力。
- Shipment 创建写入 AuditLog，客户可在自己的 Shipment 列表读取。

结果：`□ 通过  □ 失败  □ 阻塞`

## 7. 自动化与构建门禁

### TECH-UAT-007

- [x] Prisma schema validate/generate 通过。
- [x] 两个新 migration 在本地 PostgreSQL 成功应用。
- [x] API/Web TypeScript typecheck 通过。
- [x] API/Web ESLint 通过。
- [x] API 15 个测试套件、58 项测试通过。
- [x] Next.js/NestJS/Worker 全量生产构建通过。
- [x] 真实 MinIO 上传、客户下载和 Shipment 查询返回成功。
- [x] 隐藏文件与跨租户 Document 下载负向测试通过。

## 8. 验收签署

| 角色       | 姓名 | 结论                         | 日期 | 备注 |
| ---------- | ---- | ---------------------------- | ---- | ---- |
| 产品负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |
| 业务负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |
| 技术负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |

未通过项必须记录缺陷编号、负责人、截止日期和复验结果。
