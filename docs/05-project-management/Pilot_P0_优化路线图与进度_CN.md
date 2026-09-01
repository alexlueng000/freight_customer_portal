# Freight Customer Portal Pilot P0 优化路线图与进度

> 文档日期：2026-09-01
> 当前阶段：业务 UAT 暂停，进入 Pilot Hardening
> 核心原则：先解决真实客户是否愿意使用，再继续扩展和测试 Shipment 后续流程。

## 1. 当前结论

V1 技术主链路已经覆盖：

```text
Rate → Quote → Booking → Shipment → Tracking → Document → Invoice
```

手工 UAT 已测试到 Booking 后上传 SO，暂未继续测试 Shipment。当前系统可以跑通演示流程，但真实业务体验仍存在明显阻断项：

1. 真实货代客户的复杂运价 Excel 无法直接进入系统。
2. Booking 客户侧填写负担过重，系统已有信息未充分继承。
3. Booking 内部审核状态与真实订舱作业语义不一致。
4. SO 上传与客户发布被合并，存在误发布和文件可见性风险。
5. 权限按钮、主数据维护、角色 Dashboard 和错误提示仍有 P1 缺口。

因此当前不继续扩展 Shipment 后续 UAT，先完成两个 P0 主战场：

```text
P0-A：真实运价 Excel 导入
P0-B：Quote → Booking → SO 真实业务流程
```

## 2. 总体优化路线

```text
冻结 Shipment 后续业务 UAT
→ 建立真实样本和整改前测试基线
→ P0-A：真实 Excel 分析、Mapping、预览与事务导入
→ P0-B1：Booking 客户侧减负
→ P0-B2：Booking 操作审核与状态语义重构
→ P0-B3：SO 结构化登记及上传/发布解耦
→ P1：权限、客户主数据、账号开通、Dashboard、错误体验
→ 从真实 Excel 导入开始重新跑完整链路
→ 恢复 Shipment / Tracking / Document / Invoice UAT
```

## 3. 阶段路线图

| 阶段 | 优先级 | 目标 | 当前状态 |
| --- | --- | --- | --- |
| 0. 冻结与基线 | P0 | 暂停后续 UAT，固定真实样本、问题清单和自动化测试基线 | 进行中 |
| 1. 复杂 Excel 分析 | P0 | 多 Sheet、偏移/双层表头、合并单元格、字段建议 | 已完成第一版 |
| 2. Mapping Profile | P0 | 人工修正映射并按租户/供应商保存复用 | 已完成基础能力 |
| 3. 标准化预览与校验 | P0 | 展示标准化 Rate、Price、Charge 和全部 Error/Warning | 已完成第一版 |
| 4. 确认与事务导入 | P0 | 用户确认后异步、幂等、整批事务写入 | 已完成第一版及本地环境集成验证 |
| 5. V2 宽表和附加费 | P0 | 推荐宽表、横向箱型、附加费 Sheet、旧模板兼容 | V2 下载模板已完成；附加费解析待开发 |
| 6. Booking 客户侧减负 | P0 | Quote 自动继承、联系人/Shipper 复用、最小表单 | 已完成并通过针对性 Playwright |
| 7. Booking 作业状态 | P0 | 待审核、待订舱、待 SO、已订舱语义统一 | 已完成并通过状态机/数据库测试 |
| 8. SO 登记与发布 | P0 | 结构化 SO、内部保存、核对后发布、版本追溯 | 已完成并通过可见性/并发/黄金路径测试 |
| 9. 横向体验与权限 | P1 | 权限按钮、主数据、账号、Dashboard、中文错误 | 待开发 |
| 10. 全链路回归 | Gate | 从真实 Excel 重新回归至 Shipment，决定是否恢复后续 UAT | 待执行 |

## 4. P0-A：真实运价 Excel 导入

### 4.1 产品目标

客户不需要先把原有 Excel 重填到平台模板。目标流程为：

```text
客户现有 Excel
→ 选择数据 Sheet
→ 识别或指定表头
→ 自动建议并人工确认字段 Mapping
→ 保存 Mapping Profile
→ 标准化数据预览
→ 完整校验 Error / Warning
→ 用户确认
→ 异步事务导入
```

平台 V2 模板继续提供，但定位为推荐模板，不作为导入前提。

### 4.2 已完成

#### 工作簿分析

- 新增 `POST /api/v1/rates/import/analyze`。
- 支持分析多个 Sheet。
- 扫描前 20 行并识别偏移表头。
- 支持单层和双层表头候选。
- 统计合并单元格区域。
- 提取样例数据行。
- 自动建议以下标准字段：
  - Rate Number；
  - POL / POD 代码与名称；
  - Carrier / Service；
  - 生效日、失效日、ETD；
  - 币种、供应商、合约号；
  - 长表箱型、成本和售价；
  - 20GP / 40GP / 40HQ 横向成本和售价。
- 分析接口为只读操作，不创建 ImportJob、不入队、不写入 Rate。

#### 真实 Excel 兼容

- 发现真实样本使用带 XML Namespace Prefix 的合法 OpenXML，ExcelJS 4.4 无法直接读取。
- 增加安全的 OpenXML 前缀兼容回退。
- `docs/07-sample-data/真实货代Excel示例合集.xlsx` 已可成功读取全部 7 个 Sheet。
- 主要 FCL Sheet 可定位第 4 行表头，自动识别约 7–9 个标准字段。
- 该真实样本已加入自动化回归测试。

#### Mapping UI

- 运价导入界面不再只强调下载平台模板。
- 用户可直接上传客户当前维护的 `.xlsx`。
- 可查看每个 Sheet 的行列数、合并区域和表头候选。
- 可选择 Sheet 和表头候选。
- 可查看自动 Mapping 建议。
- 可人工调整每一列对应的系统标准字段。
- 同一标准字段不能在界面中重复选择。

#### Mapping Profile

- 新增 `RateImportMappingProfile` Prisma 模型和 migration。
- Profile 包含：
  - `tenantId`；
  - Profile 名称；
  - 供应商；
  - Sheet 名称；
  - 表头行和表头层数；
  - 字段 Mapping；
  - 来源指纹；
  - 创建人、更新人和时间。
- Profile 名称在租户内唯一。
- 查询强制按 `tenantId` 过滤。
- 防止重复源列和重复目标字段。
- 创建 Profile 写入 AuditLog。
- 前端支持保存 Mapping Profile，并明确提示保存 Profile 不会写入 Rate。

### 4.3 已完成第一版

```text
已确认 Mapping
→ 读取数据行
→ 转换为 NormalizedRateImport
→ 生成标准化预览
→ 字段校验和业务校验
→ 展示全部 Error / Warning
```

预览至少需要展示：

- Rate 数量；
- 箱型价格数量；
- 附加费数量；
- 标准化后的前若干条数据；
- 原 Sheet、原行、原列；
- 自动修正内容；
- Error 和 Warning 汇总。

当前实现包括：

- 新增 `POST /api/v1/rates/import/preview`，预览过程只读且不创建 Rate。
- 预览成功后生成 32 字节不透明随机 Token，仅在 Redis 中保存 Token 的 SHA-256 键。
- Token 与 `tenantId + userId` 绑定，默认 30 分钟过期，可通过 `RATE_IMPORT_PREVIEW_TTL_SECONDS` 配置。
- Redis 临时记录保存原始工作簿、Mapping 和标准化结果，后续确认导入必须复用同一份服务端数据。
- 使用用户确认的 Sheet、表头和字段 Mapping 读取数据行。
- 建立统一 `NormalizedRateImport` / `NormalizedRateImportPrice` 结构。
- 同时支持 V1 长表价格字段和 20GP / 40GP / 40HQ 横向价格字段。
- 标准化代码、币种、状态、日期、航程天数及箱型价格。
- 返回 Rate、箱型价格、附加费、Error 和 Warning 数量。
- 每个问题保留来源 Sheet、行、列和标准字段，便于回到原 Excel 定位。
- 前端可生成标准化预览，查看前 100 条 Rate、箱型价格及完整问题清单。
- 缺少状态时默认 `DRAFT` 并产生 Warning；缺少运价编号时提示后续必须生成租户唯一编号。
- 非法币种、日期范围、金额、状态、必填字段和无有效价格均产生 Error。
- V1 长表中相同 `rateNo` 会合并为一条标准化 Rate；基础字段不一致或箱型重复时产生 Error。

第一版边界：

- `RateCharge` 当前数量固定为 0，独立附加费 Sheet 尚未接入。
- 港口、船司仅完成格式/必填校验，尚未接主数据别名确认。
- `850/1250/1400` 等单元格多价当前作为金额 Error，不会自动猜测拆分。
- Redis Token 存取尚未在真实 Redis 环境执行集成测试。

### 4.4 后续待完成

确认导入第一版已实现：

- 新增 `POST /api/v1/rates/import/confirm`。
- 确认时重新校验预览 Token 的租户、用户和过期状态。
- 任意 Error 存在时禁止创建 Import Job 或入队。
- Warning 存在时要求用户显式勾选接受。
- Redis claim key 保证同一 Token 复用同一个 Import Job ID。
- BullMQ 使用 Import Job ID 作为幂等 Job ID。
- Worker 不信任浏览器数据，只接收服务端 Redis 中保存的标准化结果。
- Worker 对标准化载荷再次执行必填、日期、状态、币种和价格防御性校验。
- 写入 Rate、RatePrice、AuditLog 和 Import Job 状态使用同一数据库事务。
- Excel 未提供 `rateNo` 时，通过 `BusinessNumberCounter` 生成并发安全的 `RATEyyyyMM######` 编号。
- 前端 Error 未清零时禁用确认；Warning 必须勾选确认后才能提交。
- 2026-09-01 补充修复：预览 API 仅向前端返回前 100 条标准化 Rate 供展示，但 Redis 保存完整标准化结果，避免超过 100 条的真实工作簿确认导入时只入队前 100 条。
- 2026-09-01 补充：默认下载模板已改为 V2 宽表，`运价导入` Sheet 一行一条 Rate，20GP / 40GP / 40HQ 横向展开；同时预留 `附加费导入` 和 `填写说明` Sheet。当前附加费 Sheet 仍只作为推荐结构，正式解析/持久化待后续接入。

已补充标准化 Worker 事务集成测试用例。2026-09-01 已在本地 PostgreSQL 17、Redis 7、BullMQ 和真实 API/Worker 进程上完成集成验证：

- Worker 数据库集成测试 7/7 通过，覆盖原子写入、整批回滚、重复编号拒绝、并发安全编号、宽表多箱型和附加费持久化。
- `01_standard_english_FCL.xlsx` 通过真实 HTTP 完成分析、预览、Redis Token、确认、BullMQ 入队和 Worker 写入。
- 预览识别 5 条 Rate、15 条 RatePrice，Error/Warning 均为 0；Import Job 成功 5 条、失败 0 条。
- 后台 Rate Search 可查到生成的 `RATE202609000001`–`RATE202609000005`；将首条运价设为 ACTIVE 后，客户侧可查到 `CNSZX → SGSIN / PIL / 20GP / USD 420`。

1. 港口与船司主数据校验及别名确认机制。
2. `850/1250/1400` 等单元格多价拆分和人工确认。
3. 独立附加费 Sheet 和多币种附加费。
4. 另外两类结构明显不同的真实工作簿回放及导入后 Rate Search 验证。
5. V1 长表、V2 宽表和自定义 Mapping 持续共用同一 Normalize/Validate/Persist 流程。

### 4.5 验收 Gate

- 至少三类结构明显不同的脱敏真实工作簿完成回放。
- 客户不需要把数据复制到平台模板。
- 同来源下一期文件可复用 Mapping Profile。
- 一行多箱型正确拆分为 `RatePrice[]`。
- 不同币种附加费不会被错误合计。
- 错误能定位到原 Sheet、原行和原列。
- 任意 Error 存在时不写入业务数据。
- 同一工作簿保存异常时整批回滚。
- Mapping Profile 不能跨租户读取或使用。
- 导入后 Rate Search 返回正确价格。

## 5. P0-B：Quote → Booking → SO

### 5.1 Booking 客户侧减负

目标：客户只填写系统无法自动获得、且每票真实变化的最少信息。

自动继承并锁定：

- 来源 Quote；
- POL / POD；
- Carrier / Service；
- ETD；
- 箱型和箱量；
- 报价运输方案摘要。

默认带入或选择：

- 当前登录用户的联系人信息；
- 客户公司常用 Shipper；
- Shipper 地址簿。

客户每票确认：

- Commodity；
- Package Type / Quantity；
- Gross Weight；
- Volume；
- Cargo Ready Date；
- Dangerous Goods；
- Special Instructions。

页面同时需要：

- Draft 阶段隐藏空的 SO 和 Shipment 区域；
- “提交审核”改为“提交订舱”；
- “取消订舱”改为“删除草稿”；
- 字段级中文错误直接显示在对应输入项下。

当前状态：待开发。

### 5.2 Booking 操作审核与状态语义

建议状态语义：

```text
DRAFT
→ SUBMITTED（客户已提交，待审核）
→ APPROVED（资料审核通过，待实际订舱）
→ BOOKING_SUBMITTED（已提交船司/代理，待 SO）
→ BOOKED（已收到并登记 SO）
```

关键决策：

- 删除没有认领、锁定、负责人或 SLA 意义的“开始审核”。
- 内部资料审核通过不等于船公司确认舱位。
- `CONFIRMED` 不再同时表达内部审核和外部确认两个含义。
- 退回补充需要明确原因和客户可见规则。
- 状态变更继续由服务端状态机控制并写入 AuditLog。

当前状态：待完成状态决策记录、历史数据兼容方案和 migration 设计。

### 5.3 SO 结构化登记与发布

目标流程：

```text
从船公司网站、邮件或订舱代理取得 SO
→ 登记结构化 SO 信息
→ 上传附件并内部保存
→ 内部核对
→ 二次确认发布
→ 客户可见
```

结构化字段至少包括：

- SO Number；
- 来源类型和 Carrier / Agent；
- Vessel / Voyage；
- ETD / ETA；
- CY / SI / VGM Cut-off；
- Terminal；
- 收到时间；
- 上传人、版本和客户可见状态。

安全要求：

- 上传默认内部可见。
- 上传权限不自动等于发布权限。
- 新版本保留历史，旧版本标记 `SUPERSEDED`。
- 客户读取同时校验 tenant、customer company、Document 状态和可见性。
- 上传、替换和发布均写入 AuditLog。

当前状态：需求已记录，待开发。

## 6. P1 横向优化

P0 完成后处理：

1. 所有业务按钮按 `permission + object status` 共同渲染。
2. Sales 查看 Booking 时保持只读，不展示 Operation 操作。
3. 客户公司创建后支持受控编辑。
4. 客户详情支持开通和管理客户登录账号。
5. 明确区分联系人和客户登录用户。
6. Dashboard 按 Tenant Admin、Sales、Operation、Finance 和 Customer 区分。
7. 统一加载、空状态、成功、失败、权限不足和二次确认体验。
8. 清理“按钮可点击，调用后才报无权限”的死操作。

## 7. 全链路回归 Gate

完成 P0/P1 后，不从当前 SO 页面继续，而是从数据入口重新回归：

```text
真实客户 Excel 导入
→ 客户查价
→ 获取正式 Quote
→ 销售审核并发送
→ 客户接受 Quote
→ 创建 Booking
→ 补充最少资料
→ Operation 审核
→ 提交船司/代理
→ 登记并发布 SO
→ 创建 Shipment
```

同时覆盖：

- Tenant Admin、Sales、Operation、Customer Admin、Customer User；
- 跨租户访问；
- 同租户跨客户公司访问；
- 非法状态转换；
- 重复点击和并发请求；
- 内部文件与客户可见文件。

只有该链路通过，才恢复 Shipment、Tracking、Document 和 Invoice 后续 UAT。

## 8. 当前代码与验证状态

### 已提交基线

```text
8873ec0 Document UAT findings and harden booking flow
```

### 当前未提交的 P0 工作区

- 复杂工作簿分析器及 API；
- OpenXML Namespace Prefix 兼容回退；
- Mapping Profile DTO、Service、Controller；
- Mapping Profile Prisma 模型和 migration；
- 运价导入分析与 Mapping UI；
- 工作簿分析和租户 Mapping Service 测试；
- `jszip` 直接依赖及 lockfile 更新。

### 已执行验证

| 检查 | 结果 |
| --- | --- |
| Prisma schema validate | 通过，使用本地占位 `DATABASE_URL`，未连接数据库 |
| Prisma Client generate | 通过 |
| API lint | 通过 |
| API typecheck | 通过 |
| Web lint | 通过 |
| Web typecheck | 通过 |
| API build | 通过 |
| 针对性测试 | API 4 个 Suite、17 个 Test；Worker 1 个 Suite、2 个 Test 通过 |
| 真实 Excel 回放 | 7 个 Sheet 全部读取成功 |
| `git diff --check` | 通过 |
| 2026-09-01 Rate Import 针对性测试 | `pnpm --filter @freight/api test -- rate-import` 通过：3 个 Suite、14 个 Test |
| 2026-09-01 TypeScript 检查 | `pnpm --filter @freight/api typecheck`、`pnpm --filter @freight/web typecheck` 通过 |

### 后续业务项

- Booking B1/B2/B3 的第 24–27 个 migration 已应用到本地 PostgreSQL；Rate Import 相关 migration 状态按 P0-A 验收记录继续跟踪。
- Mapping Profile 数据库集成测试尚未执行。
- P0-B4 API 23 个 Suite / 101 个 Test、Worker 4 个 Suite / 12 个 Test 已通过。
- Booking、完整 Rate → Invoice、Shipment、Invoice 共 6 个 Playwright 场景已于 2026-09-02 在本地 Chromium 实跑通过。
- P0-B4 自动化与技术 Gate 已通过，待业务负责人完成 UAT 签署。
- 标准化预览和自定义 Mapping 的正式导入尚未完成。
- 2026-09-01 本机未找到 `docker` 命令，真实 Redis / BullMQ / PostgreSQL 队列回放无法在当前环境执行。

## 9. 当前风险与设计约束

1. 不能承诺任意复杂 Excel 首次上传即全自动识别；正确策略是系统建议、人工确认、Profile 复用。
2. 不能为了兼容客户 Excel，把未经确认的字符串直接写入 Rate。
3. Mapping Profile 是租户数据，必须始终按 `tenantId` 查询。
4. 多币种费用不得静默相加或转换。
5. 金额仍使用 PostgreSQL Decimal / Prisma Decimal，不使用 JavaScript 浮点作为权威结果。
6. 正式导入继续使用 BullMQ，Job 必须携带并校验 tenant context。
7. 工作簿存在任意 Error 时不得部分写入生产业务数据。
8. 标准模板和客户自定义 Excel 必须共享后续标准化与持久化逻辑，避免维护多套写库代码。

## 10. 下一步执行顺序

1. 启动 PostgreSQL、Redis、API 和 Worker，执行确认导入事务测试与真实队列回放。
2. 增加 Redis Token 和 Mapping Profile 跨租户集成测试。
3. 接入港口、船司主数据或别名确认机制。
4. 支持附加费 Sheet 和多币种费用校验。
5. 处理单元格多价的明确拆分/人工确认流程。
6. 运行完整 lint、typecheck、test 和针对性 Playwright。
7. P0-A 验收通过后进入 Booking 客户侧减负。

## 11. 关联文档

- [核心 UAT 发现](../04-testing-acceptance/Core_Flow_UAT_Findings_CN.md)
- [运价 Excel 导入 V2 需求](../03-feature-requirements/rate-import-v2-requirements.md)
- [真实运价 Excel 差距分析](../03-feature-requirements/Rate_Import_Reality_Gap_V1_CN.md)
- [Rate 阶段验收清单](../04-testing-acceptance/Rate_Acceptance_Checklist_V1_CN.md)
- [Quote → Booking 优化](../03-feature-requirements/quote-to-booking-optimization.md)
- [Booking 操作员审核优化](../03-feature-requirements/booking-operator-review-optimization.md)
- [项目开发进度](./Project_Development_Progress_CN.md)
