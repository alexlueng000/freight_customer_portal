# P0-B 实施计划：Quote → Booking → SO 真实业务流程

> 文档日期：2026-09-01
> 开始条件：B0 可与 P0-A 验收并行；B1 代码实施在 P0-A Gate 通过后开始
> 目标：降低客户订舱填写负担，明确内部审核与实际订舱语义，将 SO 内部保存与客户发布解耦。

## 1. 范围与成功标准

P0-B 只处理以下链路：

```text
Accepted Quote
→ Booking Draft
→ 客户补充最少资料
→ Operation 审核
→ 提交船司/代理
→ 登记并内部保存 SO
→ 核对后发布给客户
→ 允许创建 Shipment
```

不在 P0-B 中实现：Partial Booking、船司 EDI、抢单/任务锁、复杂截关规则引擎、OCR 或自动识别 SO。

成功标准：

- Quote 已知信息不再要求客户重复填写。
- V1 一张 Accepted Quote 只能创建一张 Booking，箱型和箱量不可修改。
- Operation 审核不再经过无业务价值的“开始审核”。
- 内部审核通过不等于船司已确认舱位。
- SO 上传默认内部可见，只有明确发布后客户才可读取。
- 状态、文件可见性、租户和客户范围均由服务端强制。
- 核心正向和负向路径均有自动化验证。

## 2. 开发前必须冻结的决策

### 2.1 Booking 状态语义

当前批准 ERD 使用：

```text
DRAFT → SUBMITTED → UNDER_REVIEW → CONFIRMED → SO_RELEASED
```

最新 Pilot P0 路线图建议：

```text
DRAFT
→ SUBMITTED        客户已提交，待审核
→ APPROVED         资料审核通过，待实际订舱
→ BOOKING_SUBMITTED 已提交船司/代理，待 SO
→ BOOKED           已收到并发布 SO
```

两份文档存在实质冲突，不在 migration 中静默选择。建议采用新语义，并先形成 ADR/产品决策记录。

建议历史数据映射：

- `UNDER_REVIEW → SUBMITTED`：旧“开始审核”不代表有效业务节点。
- `CONFIRMED → APPROVED`：旧 Confirm 实际是内部资料审核通过。
- `SO_RELEASED → BOOKED`：旧数据已上传并客户可见。
- `DRAFT / SUBMITTED / REJECTED / CANCELLED` 先保留，但必须另行决定“退回补充”是否引入 `REVISION_REQUIRED`。

退回补充推荐方案：新增 `REVISION_REQUIRED`，允许客户修改后重新提交；`REJECTED` 仅表示业务终止。这能避免把“需补资料”和“不接受该票业务”混为同一状态。

### 2.2 SO 发布权限

建议明确分开：

- `document.upload`：上传和保存内部 SO。
- `document.manage`：发布、替换或撤回客户可见 SO。

当前 Operation 同时具有两项权限，但后端仍须在不同端点独立校验，不因默认角色配置而合并业务动作。

### 2.3 客户联系人与 Shipper 来源

- 订舱联系人默认使用当前 User 的 `displayName + email`。
- 当 User email 能匹配当前客户公司的 CustomerContact 时，补入其 phone；否则用默认订舱联系人的 phone。
- Booking 继续保存联系人快照，不在历史 Booking 中动态读取联系人新值。
- 新增租户隔离的 `CustomerShipper` 地址簿；Booking 保存选中 Shipper 的快照。

## 3. 实施分解

### B0：决策记录与迁移设计（设计已完成，待确认）

交付：

- Booking 状态 ADR，包含最终枚举、客户/内部显示文案、动作、调用角色和合法转换。
- 历史数据查询与映射报告，确认每个旧状态的实际记录数。
- 可回滚 migration 计划：先添加新枚举/字段，再迁移数据，最后删除旧值；不修改已应用 migration。
- API 兼容计划：不再新增通用 `set status`，使用语义化 action endpoint。

完成门槛：状态冲突已有明确书面决策，migration 能够在数据副本上演练。

当前产出：

- `docs/02-architecture/ADR-001_Booking_Status_Semantics_CN.md`
- `docs/05-project-management/P0_B_B0_DATA_INVENTORY_AND_MIGRATION_PLAN_CN.md`
- 本地数据库盘点发现 7 条 Booking 均为 `SO_RELEASED`；其中 1 条演示 Booking 已有关联 Shipment 但没有 SO Document，已列为 migration 前 Seed 修复项。

### B1：Booking 客户侧减负（已完成）

2026-09-01 第一切片已完成：

- 新增 Booking `packageType`、`cargoReadyDate`、`specialInstructions` 和 `sourceShipperId`。
- 新增租户/客户隔离的 `CustomerShipper` 地址簿、默认项唯一约束和数据库一致性触发器。
- Quote 转 Booking 默认带入当前 User 姓名/邮箱、匹配联系人电话和默认 Shipper 快照。
- 客户更新 DTO 不再接受 `containerRequests`，页面将箱型箱量改为只读报价快照。
- 客户页面新增来源报价摘要、包装类型、备货日期、特殊要求和常用发货人选择/新增。
- DRAFT 页面在没有文件/Shipment 时隐藏空的 SO/Shipment 区块，并将 CTA 改为“删除草稿 / 提交订舱”。
- 第 24 个 migration 已应用到本地数据库；API/Web typecheck、Lint 和 Booking 针对性测试通过（2 Suites、8 Tests）。

2026-09-02 B1 收口：

- 常用发货人已支持新增、编辑、停用和切换默认，并写入审计日志。
- 后端数据库集成测试覆盖跨租户、同租户跨客户公司、默认唯一性和停用行为。
- 新增客户 Booking 针对性 Playwright，覆盖自动带入、只读箱量、页面精简、中文必填错误和地址簿关键交互；本地 Chromium 实跑 1/1 通过。
- 黄金路径已移除客户提交 `containerRequests`，并补齐 `packageType` 和 `cargoReadyDate`。

`REVISION_REQUIRED` 编辑与重提属于 B2 状态语义迁移，不再作为 B1 未完成项。

数据模型：

- Booking 新增 `packageType`、`cargoReadyDate`、`specialInstructions`。
- 将现有 `packages` 在 API/界面语义上明确为 Package Quantity；是否重命名持久化字段由 migration 风险决定。
- 新增 `CustomerShipper`：`tenantId`、`customerCompanyId`、`name`、`address`、`contactName/email/phone`、`isDefault`、`status`、审计字段。
- Booking 保留 Shipper 和 Booking Contact 快照，可选保存来源 Shipper ID 用于追溯。

后端：

- Quote 转 Booking 继续使用单一事务：校验 Accepted Quote、防止重复创建、复制航线/船司/Service/ETD/箱型箱量快照、创建 Booking、更新 Quote=BOOKED、写 AuditLog。
- 联系人按第 2.3 节规则默认带入。
- 默认带入客户公司的默认 Shipper；无默认值时保持空值并请客户选择/新建。
- 移除客户修改 `containerRequests` 的能力，后端拒绝任何箱型/箱量修改。
- 草稿保存允许不完整；提交时强制最小必填字段，返回稳定错误代码和字段级 `details.missing`。
- Shipper 列表/新增/更新/设为默认均强制 `tenantId + customerCompanyId`，并写 AuditLog。

前端：

- 顶部显示并锁定来源 Quote、POL/POD、Carrier/Service、ETD、箱型和箱量、运输方案/价格摘要。
- 表单只保留 Cargo、Shipper、Booking Contact 和 Special Instructions。
- Package Type 使用受控选项：`CARTON / PALLET / CASE / BAG / DRUM / PACKAGE / OTHER`。
- DRAFT 阶段隐藏空 SO/Shipment 区块。
- CTA 改为“保存草稿 / 提交订舱 / 删除草稿”。
- 前后端错误映射到中文字段级提示，页面定位到第一个错误字段。

测试：

- Quote 快照和箱型箱量继承；重复创建冲突；箱量篡改拒绝。
- 当前用户/默认联系人带入；Shipper 复用；跨客户和跨租户 Shipper 访问失败。
- 草稿可部分保存；提交必填校验；客户不能修改已提交 Booking。
- Playwright 覆盖自动带入、地址簿选择、页面精简和中文错误。

### B2：Operation 审核与订舱执行语义

2026-09-02 已完成：

- Booking 状态迁移为 `DRAFT / SUBMITTED / REVISION_REQUIRED / APPROVED / BOOKING_SUBMITTED / BOOKED / REJECTED / CANCELLED`，本地第 25 个 migration 演练成功。
- 删除旧 `review / confirm / release-so` 端点，新增 `approve / request-revision / submit-to-carrier`；SO 上传与发布留给 B3 的安全模型实现。
- 新增 `BookingReviewAction`，分别保存客户可见说明、内部备注、退回原因、船司/代理和参考号；客户 API 不返回内部备注。
- 客户在 `REVISION_REQUIRED` 可编辑并重新提交；操作员页面按状态显示退回补充、审核通过、业务拒绝和提交船司/代理。
- 状态机与数据库集成测试 9/9 通过，针对性 Playwright 覆盖客户提交、退回、补料重提、审核通过和提交船司/代理，Chromium 实跑 1/1 通过。

完整黄金路径将在 B3 恢复 SO 登记/发布后重跑；当前不会回退到“上传即发布”的旧行为。

后端 action endpoint 建议：

```text
POST /api/v1/admin/bookings/:id/approve
POST /api/v1/admin/bookings/:id/request-revision
POST /api/v1/admin/bookings/:id/reject
POST /api/v1/admin/bookings/:id/submit-to-carrier
POST /api/v1/admin/bookings/:id/cancel
```

规则：

- 删除/停用 `review` 动作；不创建没有负责人、锁或 SLA 语义的 UNDER_REVIEW。
- `approve`：`SUBMITTED → APPROVED`，默认不要求备注。
- `request-revision`：`SUBMITTED → REVISION_REQUIRED`，退回原因类型和补充说明必填，内容客户可见。
- 客户修改后：`REVISION_REQUIRED → SUBMITTED`，保留原退回记录。
- `reject`：用于真正的业务终止，原因必填。
- `submit-to-carrier`：`APPROVED → BOOKING_SUBMITTED`，记录提交时间、操作人和可选代理/参考号。
- 每个动作使用并发安全的条件更新，在同一事务写 AuditLog。

退回原因建议使用稳定枚举/代码：

```text
CARGO_INCOMPLETE
SHIPPER_INCOMPLETE
CONTACT_INCOMPLETE
CARGO_READY_DATE_INVALID
CARGO_CONTAINER_CONFLICT
DANGEROUS_GOODS_INFO_REQUIRED
OTHER
```

数据追溯建议新增 `BookingReviewAction`，保存 action、reasonCode、customerVisibleRemark、internalRemark、actorUserId 和 createdAt，不只依赖可被覆盖的 `lastStatusRemark`。

操作员页面：

- 将“报价已确认信息”与“客户补充订舱资料”分区。
- SUBMITTED 仅显示“退回补充 / 审核通过”。
- 审核通过使用简单确认；退回补充使用必填原因 Modal。
- 桌面端使用 Cargo + Shipper 高密度双栏，窄屏切换单栏。
- Sales 和只有 `booking.read` 的用户只读，不渲染操作按钮。

测试：

- 状态机全部合法/非法转换单元测试。
- Operation 可操作；Sales/客户无权操作；前端按钮与后端权限一致。
- 退回原因缺失、非法跳转、重复点击、并发审批和跨租户访问失败。
- 退回历史可追溯，内部备注不返回客户 API。

### B3：SO 结构化登记、版本与发布解耦

2026-09-02 已完成：

- 新增 `BookingSoRecord`、结构化 SO 字段、`INTERNAL_DRAFT / PUBLISHED / SUPERSEDED` 状态和租户一致性触发器；第 26、27 个 migration 本地应用成功，并回填历史客户可见 SO。
- `document.upload` 负责内部保存，Document 固定 `customerVisible=false`；`document.manage` 才能发布。
- 发布事务原子更新 SO Record、Document 可见性、旧版本淘汰、Booking=`BOOKED` 和 AuditLog。
- 替换版本在新版本发布前不影响客户当前可见版本；发布后旧 Record/Document 立即失效；部分唯一索引保证同一 Booking 最多一个 PUBLISHED SO，并发发布测试通过。
- Shipment 创建强制要求 Booking=`BOOKED` 且存在 `ACTIVE + customerVisible` 的 SO。
- 数据库测试覆盖发布前隐藏、直接下载拒绝、发布、替换、旧版本失效和跨租户访问；状态机/数据库测试 9/9 通过。
- 针对性 Playwright 与完整 Rate → Invoice 黄金路径均在 Chromium 实跑 1/1 通过。

数据模型建议新增 `BookingSoRecord`：

- 关联：`tenantId`、`bookingId`、`documentId`。
- 业务：`soNumber`、`sourceType`、`sourceName`、`carrierCode`、`vessel`、`voyage`、`etd`、`eta`。
- 截关：`cyCutoffAt`、`siCutoffAt`、`vgmCutoffAt`、`terminal`。
- 追溯：`receivedAt`、`version`、`status`、`uploadedById`、`publishedById`、`publishedAt`。
- 状态：`INTERNAL_DRAFT / PUBLISHED / SUPERSEDED`。

流程：

```text
BOOKING_SUBMITTED
→ 登记 SO 结构化信息
→ 上传文件（Document.customerVisible=false）
→ 内部核对
→ 发布确认
→ SO Record=PUBLISHED
→ Document.customerVisible=true
→ Booking=BOOKED
```

后端 action endpoint 建议：

```text
POST /api/v1/admin/bookings/:id/so-records
POST /api/v1/admin/bookings/:id/so-records/:soId/publish
POST /api/v1/admin/bookings/:id/so-records/:soId/replace
GET  /api/v1/admin/bookings/:id/so-records
GET  /api/v1/bookings/:id/so-records
```

安全与事务规则：

- 上传成功但数据库写入失败时删除孤儿对象。
- 上传默认 `customerVisible=false`，创建 BookingSoRecord 与 Document 时写 AuditLog。
- 发布在一个数据库事务中同时更新 SO Record、Document 可见性、Booking 状态和 AuditLog。
- 客户 API 只返回 PUBLISHED + ACTIVE + customerVisible 的当前版本。
- 新版本发布后，旧 SO Record 和 Document 变为 SUPERSEDED；旧文件不再从客户列表暴露。
- 所有查询强制 tenant scope；客户查询额外强制 customer company scope。
- 创建 Shipment 的前置条件改为 Booking=BOOKED 且存在已发布 SO。

测试：

- 上传后客户不可见；发布后客户可见。
- 上传权限不等于发布权限。
- 版本替换保留历史，且客户只见当前发布版。
- 文件类型/大小、孤儿文件清理、重复发布、并发替换、非法状态和跨租户/跨客户访问。
- 上传、替换、发布和下载审计记录完整。

### B4：全链路回归 Gate

从数据入口重新执行：

```text
真实 Excel 导入
→ 客户查价
→ Quote 创建/发送/接受
→ Booking Draft 自动继承
→ 客户补充最少资料并提交
→ Operation 退回/重提交或审核通过
→ 提交船司/代理
→ SO 内部保存
→ 客户不可见验证
→ SO 发布
→ 客户下载
→ 创建 Shipment
```

必须覆盖：

- Tenant Admin、Operation、Sales、Customer Admin 和 Customer User 的角色差异。
- 跨租户、同租户跨客户公司、隐藏 SO、非法状态、重复点击和并发请求。
- API 集成测试、PostgreSQL 事务测试和 Playwright 黄金路径。
- lint、typecheck、unit/integration/E2E 全部通过，新 API 在 Swagger 中可见。

Gate 通过后，才恢复 Shipment、Tracking、Document 和 Invoice 后续业务 UAT。

## 4. 建议执行节奏

| 阶段 | 建议时长 | 主要交付 | 阶段 Gate |
| --- | ---: | --- | --- |
| B0 决策/迁移 | 0.5–1 天 | ADR、数据盘点、migration 方案 | 状态语义与历史映射批准 |
| B1 客户减负 | 2–3 天 | schema/API/客户页/Shipper 地址簿/测试 | 最小资料可提交，Quote 数据锁定 |
| B2 审核语义 | 2–3 天 | 状态机/action API/审核页/历史 | 退回、重提交、审批和提交船司通过 |
| B3 SO 解耦 | 3–4 天 | SO Record/上传/发布/版本/权限/测试 | 未发布 SO 客户绝对不可见 |
| B4 回归 | 1–2 天 | 全链路 E2E、负向用例、验收记录 | P0-B Gate 通过 |

预估总计：8.5–13 个开发日，不包报告冲突后的产品等待时间。

## 5. 主要风险与控制

1. **状态重命名影响广**：Prisma enum、migration、API、前端筛选/标签、seed、Worker/通知、E2E 和历史数据必须同批更新。使用数据副本演练迁移，不直接在唯一本地数据库上试错。
2. **退回与拒绝语义混淆**：优先引入 `REVISION_REQUIRED`，不用终态 REJECTED 表达可修改的订舱。
3. **Shipper 主数据过度扩展**：P0 仅做客户级地址簿与默认项，不做通用 Party/Address 引擎。
4. **SO 误发布**：上传与发布必须不同端点、不同权限、二次确认，默认客户不可见。
5. **快照与主数据漂移**：Booking 和 SO 保存当时快照，不因联系人或 Shipper 后续修改而改写历史记录。
6. **权限只做前端隐藏**：所有动作由后端 permission + tenant + customer + status 共同校验。

## 6. 实施顺序

1. 明日先完成 P0-A 验收。
2. P0-A Gate 通过后执行 B0，冻结 Booking 状态和退回语义。
3. 先交付 B1，让客户不再填写无意义占位数据。
4. 再交付 B2，将内部审核和实际订舱节点分开。
5. 交付 B3，先保证 SO 不误发布，再恢复 Shipment 创建衔接。
6. 执行 B4 全链路回归，通过后恢复后续 UAT。

## 7. 依据文档

- `docs/01-product/Freight_Customer_Portal_PRD_V1.0_CN.docx`
- `docs/02-architecture/Freight_Customer_Portal_Technical_Design_V1.0_CN.docx`
- `docs/02-architecture/Freight_Customer_Portal_Database_ERD_Prisma_Design_V1.0_CN.docx`
- `docs/03-feature-requirements/quote-to-booking-optimization.md`
- `docs/03-feature-requirements/booking-operator-review-optimization.md`
- `docs/05-project-management/Pilot_P0_优化路线图与进度_CN.md`
