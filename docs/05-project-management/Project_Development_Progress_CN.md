# Freight Customer Portal 项目开发进度表

> 更新时间：2026-08-31
>
> 当前阶段：Phase 5 功能闭环完成，进入业务 UAT 与 Pilot Hardening
>
> 详细实现日志：[DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md)
>
> 当前风险：[CURRENT_RISKS.md](./CURRENT_RISKS.md)

## 当前结论

V1 核心链路 `Rate → Quote → Booking → Shipment → Tracking → Document → Invoice` 已接入真实数据库、鉴权、租户/客户范围、审计与主要前端页面。完整黄金路径已有 Playwright 用例；当前工作重点不是继续扩展业务域，而是完成真实样本 UAT、修复 P1 体验/安全缺口，并补齐生产邮件、Branding、可观测性和发布演练。

## 阶段总览

| 阶段 | 范围 | 状态 | 已完成证据 | 剩余工作 |
| --- | --- | --- | --- | --- |
| M0 | Monorepo、Web/API/Worker、Prisma、Docker、CI | 已完成 | 构建、Lint、TypeScript、CI 基线 | 生产部署演练 |
| M1 | Tenant、User、Customer、Auth、RBAC、审计、租户隔离 | 主体完成 | 服务端权限与敏感域跨租户负向测试 | 密码重置、登录失败审计、安全响应头 |
| M2 | Rate、Excel 导入、客户查价、Quote、PDF、改价 | 基础功能完成，P0 导入适配待整改 | 真实 API、异步导入/PDF、状态机与审计 | 真实复杂 Excel Mapping、预览、Profile 与样本验收 |
| M3 | Quote 转 Booking、提交、审核、确认、SO | 功能完成，UAT 中 | 原子转单、状态机、SO 权限与负向测试 | 字段级错误提示、客户资料维护缺口 |
| M4 | Shipment、Container、Tracking、Document | 功能完成，UAT 中 | 后台维护、客户只读、版本化文件、E2E | 真实柜/节点/BL 样本签署 |
| M5 | Invoice、Notification、Branding | 部分完成 | Invoice 全流程；Notification 持久化与队列基线 | 生产邮件、通知中心 UI、Branding |
| M6 | Pilot Hardening | 进行中 | UAT 发现记录与风险登记已建立 | P1 缺口、可观测性、备份恢复、稳定性验证 |

## 第一生产纵切状态

| 业务节点 | 状态 | 说明 |
| --- | --- | --- |
| 创建租户、管理员、客户公司与客户用户 | 已完成 | Demo seed 可重复执行，用户与客户范围受租户约束 |
| 创建/导入 Rate 与客户查价 | 已完成 | 后台成本接口与客户销售价接口分离 |
| 创建、审核、发送、接受 Quote 与下载 PDF | 已完成 | 价格快照、手工改价、异步 PDF、状态审计已实现 |
| Quote 转 Booking、提交与内部确认 | 已完成 | 转单事务、幂等和状态机已实现 |
| 上传 SO、创建 Shipment、Container 与 Tracking | 已完成 | 文件授权、客户可见性、语义化状态动作已实现 |
| 上传客户可见 BL 并由客户下载 | 已完成 | 文档版本、SUPERSEDED 与下载授权已实现 |
| 创建、发布、确认 Invoice | 已完成 | Decimal 汇总、状态机、附件和通知事件已实现 |
| 完整浏览器黄金路径 | 已建立 | 最近保存的报告为 2026-08-30，状态 passed；今天未重跑 E2E |

## 2026-08-31 更新摘要

- 优化运价导入模板：中文表头、冻结首行、筛选、示例多箱型数据；Worker 同时兼容中英文表头。
- 统一后台/客户报价状态中文文案与颜色。
- 报价审核和客户接受动作增加更清晰的确认语义与二次确认。
- 顶部栏将用户身份与“退出登录”拆分为独立控件，并增加退出中状态。
- 新增核心 UAT 发现、术语表、真实业务适配评估，以及 Rate Import、Rate Search → Quote、Sales Quote Review、Quote → Booking 优化需求文档。
- 新增真实货代 Excel 示例合集，作为后续 Rate UAT 和导入 V2 的样本输入。

## 测试状态

本日验证详情见 [2026-08-31 代码与测试审阅报告](./TEST_REPORT_2026-08-31_CN.md)。当前结论：

- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- 不依赖数据库的 Worker 测试：2 个套件、2 个测试通过。
- 完整 `pnpm test`：未完成；本地 PostgreSQL `localhost:5433` 未运行，数据库集成套件在初始化阶段中止，不能记为代码断言失败，也不能记为通过。
- 最近保存的 Playwright 结果：2026-08-30，`passed`、无失败用例；该结果早于今天改动，今天的 E2E 状态为未验证。

## 当前优先级

1. P0：使用脱敏真实货代 Excel 完成 Sheet/表头识别、字段 Mapping、导入预览和可复用 Mapping Profile，客户无需重填平台模板。
2. P0：整改 Booking 表单减负、内部审核状态语义及 SO 上传/客户发布解耦。
3. 启动 PostgreSQL/Redis/MinIO 后重跑 `pnpm test` 与完整 Playwright，保存当天报告。
4. 关闭 UAT P1：字段级校验提示、客户公司编辑、客户账号开通入口、角色化 Dashboard。
5. 使用真实 Rate、Booking、Container、Tracking、BL、Invoice 样本完成业务签署。
6. 接入生产邮件传输、通知中心 UI 与租户 Branding。
7. 完成 CSP/Security Headers、密码重置、可观测性和数据库备份恢复演练。

## 文档使用约定

- 本文只维护里程碑、当前状态和优先级，不重复实现细节。
- 详细完成项与验证历史统一记录在 `DEVELOPMENT_PROGRESS.md`。
- 未关闭风险统一记录在 `CURRENT_RISKS.md`。
- 手工业务测试问题统一记录在 `Core_Flow_UAT_Findings_CN.md`。
- 测试结论必须注明执行日期、命令、依赖状态和是否为历史报告，禁止把旧报告表述为当天通过。
