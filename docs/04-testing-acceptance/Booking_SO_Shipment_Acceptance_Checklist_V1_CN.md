# Freight Customer Portal V1 — Booking / SO / Shipment 阶段验收清单

> 文档版本：V1.2
> 日期：2026-09-02
> 适用范围：Accepted Quote 转 Booking、Booking 提交/审核/确认、SO 上传下载、Shipment 建档
> 当前结论：V1.1 正常业务主链已由项目负责人确认走通；2026-09-03 已用真实演示单复验到 Basic Shipment 到港，正式签署栏待补姓名

## 1. 验收目标

确认以下前半段核心业务链在真实数据库、真实鉴权、S3 兼容对象存储和多租户约束下可运行：

```text
Accepted Quote
→ Booking Draft
→ 客户补充并提交
→ Operation 退回补充或审核通过
→ 提交船司/代理
→ 内部保存 SO
→ 核对并发布 SO
→ 客户下载 SO
→ 创建 Shipment
```

Container、Tracking Timeline、BL、Invoice 属于后续阶段，不纳入本清单的通过条件。

## 2. 验收前置条件

- Web、API、PostgreSQL、Redis 和 MinIO 均已启动且 readiness 正常。
- 当前 29 个 Prisma migration 已应用，权限和 DEMO seed 已执行。
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

1. Operation 打开 `SUBMITTED` Booking。
2. 退回一份 Booking，客户补料并重新提交。
3. 审核通过并提交船司/代理。
4. 对另一份 Booking 填写原因并拒绝。
5. 尝试从 DRAFT 直接确认或从 CONFIRMED 再拒绝。

预期结果：

- 合法路径为 `SUBMITTED → REVISION_REQUIRED → SUBMITTED → APPROVED → BOOKING_SUBMITTED`。
- 业务拒绝原因必填，退回补充保存稳定原因代码和客户可见说明。
- 非法跳转被服务端拒绝，前端隐藏按钮不替代服务端校验。
- 每次状态变化保存时间、操作者、备注和审计记录。

结果：`□ 通过  □ 失败  □ 阻塞`

## 5. SO 上传与客户下载

### DOCUMENT-UAT-004 内部保存并发布 SO

1. Operation 打开 `BOOKING_SUBMITTED` Booking。
2. 分别尝试上传不支持格式、空文件和超过 10 MB 文件。
3. 上传合法 PDF/PNG/JPEG SO，确认客户暂不可见。
4. 使用独立发布动作发布 SO。

预期结果：

- 非法文件被拒绝，不创建 Document 或改变 Booking 状态。
- 合法文件写入 S3 兼容对象存储，数据库只保存元数据。
- 内部保存后 Document 类型为 `SO`、版本从 1 开始、`customerVisible=false`。
- 发布事务原子设置 Record=`PUBLISHED`、Document=`customerVisible=true`、Booking=`BOOKED`。
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

1. Operation 对存在已发布 SO 的 `BOOKED` Booking 点击“创建 Shipment”。
2. 填写可选 Vessel、Voyage 和 ETA。
3. 再次从同一 Booking 创建 Shipment。

预期结果：

- Shipment 编号符合 `SHPyyyyMM######`，V1 常规路径初始状态为 `PLANNED / 待开船`。
- customer、Booking、POL/POD、Carrier 和 ETD 快照正确。
- V1 常规路径阻止重复创建；数据模型仍保留 Booking 1:N Shipment 的未来能力。
- Shipment 创建写入 AuditLog，客户可在自己的 Shipment 列表读取。

结果：`□ 通过  □ 失败  □ 阻塞`

### SHIPMENT-UAT-006A 真实演示单闭环复验

复验日期：2026-09-03

复验对象：

- Booking：`BOOK202609000007`
- Shipment：`SHP202609000001`
- 客户公司：`深圳市123发展有限公司`

复验路径：

```text
Booking BOOKED
→ SO 已发布给客户
→ 创建 Basic Shipment
→ 维护船名 / 航次 / ETD / ETA
→ 标记已开船
→ 标记已到港
```

复验结果：

- SO 发布后客户可见，但客户 Shipment 列表必须等 Basic Shipment 创建后才显示，符合 V1.1 “SO 发布”和“Shipment 建档”解耦口径。
- 后台已完成从 `BOOK202609000007` 创建 `SHP202609000001`。
- Shipment 状态已走到 `ARRIVED / 已到港`，页面 Timeline 显示 `已订舱 → 已开船 → 已到港`。
- 本轮人工复验中发现并修正两个 UX 问题：创建 Basic Shipment 增加站内二次确认；Shipment 状态动作不再使用浏览器原生确认框，时间异常提示合并到站内弹窗。

结果：`通过`

## 7. 自动化与构建门禁

### TECH-UAT-007

- [x] Prisma schema validate/generate 通过。
- [x] V1.1 最终状态迁移在本地 PostgreSQL 成功应用；当前共 29 个 migration，数据库 schema 为最新。
- [x] API/Web TypeScript typecheck 通过。
- [x] API/Web ESLint 通过。
- [x] 当前全量 API 23 个测试套件、101 项测试通过。
- [x] Worker 4 个测试套件、12 项测试通过，含真实 PostgreSQL 运价导入事务测试。
- [x] Next.js/NestJS/Worker 全量生产构建通过。
- [x] 真实 MinIO 上传、客户下载和 Shipment 查询返回成功。
- [x] 隐藏文件与跨租户 Document 下载负向测试通过。
- [x] P0-B4 Booking、黄金路径、Shipment、Invoice 共 6 个 Playwright 场景实跑通过。
- [x] 新增 Booking/SO action endpoint 已在 Swagger/OpenAPI JSON 中确认可见。
- [x] 2026-09-02 复验 V1.1 Golden Path 1/1、Basic Shipment 后台/客户侧冒烟 2/2 通过。
- [x] 2026-09-03 手工复验 `BOOK202609000007 → SHP202609000001`，确认 V1.1 核心闭环已走到 Basic Shipment 到港。

详细执行证据与剩余项见 `P0_B4_REGRESSION_GATE_REPORT_2026-09-02_CN.md`。

## 8. 验收签署

2026-09-02，项目负责人已在当前任务中确认核心正常闭环人工走通。2026-09-03，使用 `BOOK202609000007 → SHP202609000001` 复验到 Basic Shipment 到港。本表保留姓名栏，供正式归档时补录，不据此虚构签署人。

| 角色       | 姓名 | 结论                         | 日期 | 备注 |
| ---------- | ---- | ---------------------------- | ---- | ---- |
| 产品负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |
| 业务负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |
| 技术负责人 |      | `通过 / 有条件通过 / 不通过` |      |      |

未通过项必须记录缺陷编号、负责人、截止日期和复验结果。
