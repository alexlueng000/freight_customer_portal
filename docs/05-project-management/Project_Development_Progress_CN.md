# Freight Customer Portal 项目开发进度表

> 更新时间：2026-09-03
>
> 当前阶段：V1.1 基线已封板，进入 P1 试点优化
>
> 详细实现日志：[DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md)
>
> 当前风险：[CURRENT_RISKS.md](./CURRENT_RISKS.md)

## 当前结论

根据 2026-09-02 最新 `Freight_Customer_Portal_PRD_V1.1_CN.docx`，V1 MVP 主链路已从 V1.0 的完整闭环收紧为 `Rate → Quote → Booking → SO → Basic Shipment`。当前代码已完成 Rate Import P0-A、Booking/SO/Shipment P0-B 技术 Gate，并已将 Shipment 状态与客户侧展示对齐到 V1.1 Basic Shipment 口径。2026-09-03 已用真实演示单 `BOOK202609000007 → SHP202609000001` 复验到 Basic Shipment 到港，V1.1 核心闭环可以收口；下一阶段重点转向用户体验、通知和操作型 Dashboard。Invoice、完整 BL/Document、复杂 Tracking 保留为历史实现与 Backlog 能力，不再作为 V1 P0 继续扩展。

## 阶段总览

| 阶段 | 范围                                                       | 状态                | 已完成证据                                                                                        | 剩余工作                                               |
| ---- | ---------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| M0   | Monorepo、Web/API/Worker、Prisma、Docker、CI               | 已完成              | 构建、Lint、TypeScript、CI 基线                                                                   | 生产部署演练                                           |
| M1   | Tenant、User、Customer、Auth、RBAC、审计、租户隔离         | 主体完成            | 服务端权限与敏感域跨租户负向测试                                                                  | 密码重置、登录失败审计、安全响应头                     |
| M2   | Rate、Excel 导入、客户查价、Quote、PDF、改价               | P0-A 已通过当前验收 | 真实 Excel 01/02/08 回放、异步导入/PDF、状态机与审计                                              | 继续用更多真实样本回归                                 |
| M3   | Quote 转 Booking、提交、审核、退回、提交 Carrier/Agent、SO | V1.1 基线封板       | 原子转单、V1.1 Booking 状态机、SO 登记/发布解耦、权限负向测试、正常主链人工走通                   | 试点反馈与稳定性验证                                   |
| M4   | Basic Shipment                                             | V1.1 基线封板       | SO 后创建 Shipment，状态收敛为 PLANNED/DEPARTED/ARRIVED/CANCELLED，客户侧简化展示，浏览器回归通过 | 即将 ETD、浏览器回归                                  |
| M5   | Notification、Branding、Dashboard 待办                     | 部分完成            | Notification 持久化与队列基线；SO/Booking/Shipment 关键事件；Dashboard 聚合 API 和真实页面        | 生产邮件、完整通知中心、租户 Branding、角色化 Dashboard |
| M6   | Pilot Hardening                                            | 进行中              | UAT 发现记录与风险登记已建立                                                                      | P1 缺口、可观测性、备份恢复、稳定性验证                |

## 第一生产纵切状态

| 业务节点                                | 状态                 | 说明                                                                                                             |
| --------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 创建租户、管理员、客户公司与客户用户    | 已完成               | Demo seed 可重复执行，用户与客户范围受租户约束                                                                   |
| 创建/导入 Rate 与客户查价               | 已完成               | 后台成本接口与客户销售价接口分离                                                                                 |
| 创建、审核、发送、接受 Quote 与下载 PDF | 已完成               | 价格快照、手工改价、异步 PDF、状态审计已实现                                                                     |
| Quote 转 Booking、提交与内部确认        | 已完成               | 转单事务、幂等和状态机已实现                                                                                     |
| 登记/发布 SO 并创建 Basic Shipment      | 已完成               | SO 结构化登记与客户发布解耦；Shipment 创建后进入 `PLANNED / 待开船`                                              |
| 客户查看 SO 与 Basic Shipment           | 已完成基础能力       | 客户侧只展示船名航次、ETD/ATD、ETA/ATA、基础状态与简化 Timeline                                                  |
| Invoice、BL、复杂 Tracking              | 已实现但移出 V1 P0   | 作为历史能力和 Backlog 保留，试点前不继续扩展                                                                    |
| 完整浏览器黄金路径                      | 已按 V1.1 重定并通过 | Rate → Quote → Booking → SO 内部隐藏/发布 → Basic Shipment → 客户查看已通过；Invoice/BL/复杂 Tracking 已移出主链 |

## 2026-09-03 更新摘要

- V1.1 基线已通过提交 `d94460a` 和标签 `v1.1.0-baseline` 封板。
- 登录态接口已返回由数据库角色权限关系计算得到的有效权限集合，前端不再只依赖角色名判断操作入口。
- Booking、Shipment、Rate、Customer、User 等关键页面已按有效权限及业务状态控制敏感操作按钮。
- 客户公司更新接口 `PATCH /api/v1/customers/:id` 已完成，保持租户隔离、客户编码不可变，并记录 `CUSTOMER_UPDATED` 审计日志。
- 客户详情页已增加“开通客户账号”入口，用户管理页支持按客户公司筛选并预绑定创建客户用户。
- 客户详情页已完成公司编辑抽屉，支持基础资料、信用账期、加价和状态维护；可选值支持显式清空，加价可安全切回“无加价”。
- API 校验响应已增加字段级错误映射，客户编辑表单会显示中文字段提示。
- Rate 手工新建/编辑表单已接入字段级错误映射，服务端重复编号、有效期、重复箱型和附加费箱型错误会定位到具体表单项。
- Booking/SO 表单已接入字段级错误映射，客户 Booking 保存/提交和后台 SO 登记会把服务端字段错误落到具体控件。
- 真实演示单 `BOOK202609000007 → SHP202609000001` 已完成 SO 发布、Basic Shipment 创建、开船和到港复验，确认 V1.1 主链路已收口。
- 围绕该复验修正了两个体验问题：创建 Basic Shipment 增加站内二次确认；Shipment 开船/到港时间异常提示不再使用浏览器原生确认框。
- SO Published、Shipment Created、Shipment Departed、Shipment Arrived 和 Booking Needs Update 已接入客户站内通知、邮件 Notification message log 与业务对象 Deep Link。
- 顶部通知菜单已接入真实通知 API，支持未读角标、空状态、点击标记已读并跳转。
- 新增 Dashboard 聚合 API，后台和客户 Dashboard 均已从模拟数据切换为真实数据入口。
- 客户 Dashboard 已补齐 Quote 待办口径：`SENT/VIEWED` 待确认报价和 `ACCEPTED` 且未创建 Booking 的报价都会进入首页待办。
- 客户 Quote 列表新增 `status=pending` 聚合筛选，避免报价查看后变成 `VIEWED` 或接受后变成 `ACCEPTED` 时从首页跳转列表消失。
- 主要表单必填项已统一为醒目的“* 必填”徽标，覆盖运价、报价改价、客户、联系人、用户、客户 Booking 和后台 SO 登记等入口。
- 浏览器回归已通过：管理员客户编辑、中文字段提示、保存与清空、加价切换、客户账号入口预绑定，以及 Operation 无管理按钮均符合权限预期。
- 回归中修复了客户公司选项异步加载后未自动预选的问题。
- 本轮收口结论：V1.1 核心业务闭环已经完成；下一步重点提升用户体验，优先进入通知和 Dashboard，不在本次提交中扩大 V1.1 功能范围。

## 2026-09-02 更新摘要

- 新增并采用 `Freight_Customer_Portal_PRD_V1.1_CN.docx` 作为当前范围基线：FCL-only，V1 主链路冻结为 `Rate → Quote → Booking → SO → Basic Shipment`。
- Rate Import P0-A 已通过当前验收：真实 Excel 01/02/08 完成分析、预览、确认、队列入库、后台查价和客户查价回放。
- Booking/SO/Shipment P0-B 技术 Gate 已通过：Booking 审核语义、提交 Carrier/Agent、SO 登记与发布解耦、Shipment 建档均已接通。
- Operation Shipment Detail 已进一步按 V1 收敛：`PLANNED → DEPARTED → ARRIVED`，另有 `CANCELLED`；移除页面中的 Container、通用 Event Builder 与 BL/参考附件，状态动作使用实际发生时间。
- 客户侧 Shipment 页面已收敛为 Basic Shipment，不再把 Container、BL、完整 Tracking 作为 V1 P0 客户任务暴露。
- 已新增最终数据库迁移 `20260902223000_simplify_shipment_status_v1`，将中间版本的 Shipment 状态安全收敛到 `PLANNED/DEPARTED/ARRIVED/CANCELLED`；保留前置迁移以保证迁移链可重放。

## 2026-08-31 更新摘要

- 优化运价导入模板：中文表头、冻结首行、筛选、示例多箱型数据；Worker 同时兼容中英文表头。
- 统一后台/客户报价状态中文文案与颜色。
- 报价审核和客户接受动作增加更清晰的确认语义与二次确认。
- 顶部栏将用户身份与“退出登录”拆分为独立控件，并增加退出中状态。
- 新增核心 UAT 发现、术语表、真实业务适配评估，以及 Rate Import、Rate Search → Quote、Sales Quote Review、Quote → Booking 优化需求文档。
- 新增真实货代 Excel 示例合集，作为后续 Rate UAT 和导入 V2 的样本输入。

## 测试状态

2026-09-03 当前验证：

- `pnpm --filter @freight/api typecheck`：通过。
- `pnpm --filter @freight/web typecheck`：通过。
- `pnpm --filter @freight/api lint`：通过。
- `pnpm --filter @freight/web lint`：通过。
- `pnpm --filter @freight/worker lint`：通过。
- `pnpm --filter @freight/worker typecheck`：通过。
- Auth 与 Customer 数据库集成测试：通过，2 suites、9 tests。
- Dashboard 数据库集成测试：通过，1 suite、4 tests。
- Worker 邮件通知测试：通过，1 suite、2 tests。
- `pnpm --filter @freight/api test -- shipment-state-machine.spec.ts`：通过，2/2。
- `pnpm prisma:validate`：通过。
- `pnpm prisma:generate` 与 `pnpm prisma:validate`：通过。
- V1.1 Shipment migration：已成功应用到本地测试数据库。
- Booking/Shipment 状态机：通过，2 suites、5 tests。
- Booking/SO 数据库集成测试：通过，1 suite、8 tests。
- `pnpm test:e2e:golden`：通过，1/1；已重定为 V1.1 主链。

## 当前优先级

1. P1 用户体验：继续清理关键动作的二次确认、成功反馈、空状态、客户/后台文案和字段级错误提示。
2. P1 通知：补 Quote Ready、完整通知中心页面、生产邮件服务和失败恢复验证。
3. P1 Dashboard：继续做角色化细分、即将 ETD、浏览器回归和更精细空状态；客户首页 Quote 待办口径已完成第一版修复。
4. P1 试点硬化：完成租户 Branding、CSP/Security Headers、密码重置、可观测性和数据库备份恢复演练。
5. 持续门禁：在 CI 中重复运行 V1.1 Golden Path，正式归档时补录产品/业务/技术签署人姓名。

## 文档使用约定

- 本文只维护里程碑、当前状态和优先级，不重复实现细节。
- 详细完成项与验证历史统一记录在 `DEVELOPMENT_PROGRESS.md`。
- 未关闭风险统一记录在 `CURRENT_RISKS.md`。
- 手工业务测试问题统一记录在 `Core_Flow_UAT_Findings_CN.md`。
- 测试结论必须注明执行日期、命令、依赖状态和是否为历史报告，禁止把旧报告表述为当天通过。
