# Freight Customer Portal V1.1 基线封板记录

> 封板日期：2026-09-02
> 基线范围：Rate → Quote → Booking → SO → Basic Shipment
> 结论：正常业务主链已人工走通，代码、数据模型、迁移、自动化与产品口径完成封板，可进入 P1 试点优化。

## 1. 冻结范围

- 仅支持海运 FCL。
- Accepted Quote 在 V1 常规路径中只创建一个 Booking，不支持 Partial Booking。
- Booking 主链为 `DRAFT → SUBMITTED → REJECTED/APPROVED → BOOKING_SUBMITTED → BOOKED`，另有 `CANCELLED`。
- SO 使用结构化字段登记，附件仅作凭证；内部登记与发布客户为两个独立动作。
- Basic Shipment 状态固定为 `PLANNED → DEPARTED → ARRIVED`，另有 `CANCELLED`；`DEPARTED` 在客户侧展示为“运输中”。
- Invoice、完整 BL/Document、Container 和复杂 Tracking 保留历史实现，但不属于 V1.1 P0，不继续扩展。

## 2. 封板变更

- Prisma、服务端状态机、Shipment API、后台/客户页面和 seed 已统一到最终 Basic Shipment 状态。
- Shipment 页面移除 Container、通用 Event Builder、BL 和参考附件等非 V1.1 主任务。
- 状态动作要求实际发生时间，并校验 ETA 不早于 ETD、ATA 不早于 ATD。
- 最终迁移 `20260902223000_simplify_shipment_status_v1` 保留可重放的前置迁移链，并将中间状态安全映射到最终状态。
- V1.1 PRD、术语表、验收清单、UAT 发现和项目进度已统一口径。
- `UAT-OPT-011` 与 `UAT-OPT-012` 已补充实现证据并关闭。

## 3. 2026-09-02 封板验证

| 检查 | 结果 |
| --- | --- |
| Prisma Client generate | 通过 |
| Prisma schema validate | 通过 |
| Migration status | 29 个 migration，数据库为最新 |
| API ESLint / TypeScript | 通过 |
| Web ESLint / TypeScript | 通过 |
| Shipment 状态机单元测试 | 2/2 通过 |
| Booking/SO 数据库集成测试 | 8/8 通过 |
| V1.1 Golden Path | 1/1 通过 |
| Basic Shipment 浏览器冒烟 | 2/2 通过 |
| DOCX render | 13 页渲染成功；本地 LibreOffice 缺少中文字体，中文显示缺字，但修改段落无裁切或重叠 |
| Diff hygiene | `git diff --check` 通过 |

## 4. 封板后的变更纪律

- P1 开发不得改变上述领域对象关系和状态机，除非先更新 PRD、迁移方案与回归基线。
- 所有新需求先判断是否直接服务于 Rate、Quote、Booking、SO 或 Basic Shipment。
- 非主链能力默认进入 Backlog，不以“代码已经存在”为理由恢复到 V1.1 P0。
- 每个 P1 变更继续执行 tenant/customer scope、服务端权限、审计与自动化门禁。

## 5. 下一阶段入口

从字段级错误提示、权限化按钮、客户公司编辑和客户账号开通开始；随后实现 Email/Deep Link、操作型 Dashboard、Branding 与生产安全门禁。
