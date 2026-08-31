# Freight Customer Portal 项目开发进度表

更新时间：2026-08-28

## 当前目标

先跑通第一条真实业务纵切：

```text
客户登录
→ 输入 盐田 → 洛杉矶
→ 选择 ETD / 40HQ
→ 查询真实 Rate
→ 看到 COSCO / ONE / Maersk
→ 选择方案
→ 生成 Quote
→ 查看报价明细
→ 下载 PDF
→ 接受报价
→ 进入 Booking
```

## 阶段总览

| 阶段 | 模块 | 目标 | 当前状态 | 优先级 | 备注 |
| --- | --- | --- | --- | --- | --- |
| M0 | 项目基础 | Monorepo、Next.js、NestJS、Worker、Prisma、Docker 基线 | 已完成基础骨架 | P0 | 当前已有 Web/API/Worker 框架，API 仅有 health |
| M1 | SaaS / 安全底座 | Tenant、User、Customer、Auth、RBAC、租户隔离 | 未开始业务实现 | P0 | 真实流程必须先具备登录和 tenant/customer scope |
| M2 | Rate + Quote | Rate 查询、Quote 快照、PDF、接受/拒绝 | 未开始 | P0 | 第一条真实纵切的核心 |
| M3 | Booking | Quote 转 Booking、Draft、提交、审核、确认 | 未开始 | P0 | 本轮目标先做到进入 Booking 草稿 |
| M4 | Shipment + Tracking + Documents | Shipment、Container、TrackingEvent、Document 可见性 | 未开始 | P1 | 第一纵切跑通后再接 |
| M5 | Invoice + Notifications + Branding | Invoice 展示、客户确认、邮件通知、白标 | 未开始 | P1 | 账单多币种需谨慎处理 |
| M6 | Pilot Hardening | 权限补洞、性能、UAT、真实客户反馈 | 未开始 | P2 | 只修真实流程缺口，不扩大 V1 范围 |

## 第一纵切详细进度

| 序号 | 工作项 | 交付内容 | 状态 | 验收标准 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| 1 | Prisma 业务模型 | Tenant、User、CustomerCompany、CustomerContact、Rate、RatePrice、Quote、QuoteItem、Booking、BookingContainerRequest | 未开始 | `prisma validate` 通过，migration 可执行 | PostgreSQL |
| 2 | 种子数据 | 北辰国际物流租户、客户公司、客户账号、盐田到洛杉矶 40HQ 三条 Rate | 未开始 | seed 后可查到 COSCO / ONE / Maersk | Prisma 模型 |
| 3 | 登录认证 | 邮箱密码登录、会话或 token、当前用户上下文 | 未开始 | 客户账号可登录，未登录不能访问业务 API | User / Customer 模型 |
| 4 | 租户与客户隔离 | 后端统一 tenant/customer scope guard 或 service 约束 | 未开始 | Tenant A 无法访问 Tenant B 的 Rate / Quote / Booking | Auth |
| 5 | Rate Search API | `GET /api/v1/rates/search` | 未开始 | 输入 YANTIAN / LOS_ANGELES / 40HQ / ETD 返回三条有效运价 | Rate 数据 |
| 6 | Rate Search UI | `/portal/rates` 查询表单与结果列表 | 未开始 | 输入盐田、洛杉矶、ETD、40HQ 后展示三家船司 | Rate API |
| 7 | Quote Create API | `POST /api/v1/quotes`，从 Rate 创建 Quote 快照 | 未开始 | Quote 保存 route、carrier、container、费用、售价、有效期 | Rate API |
| 8 | Quote Detail API | `GET /api/v1/quotes/:id` | 未开始 | 只能查看本客户公司 Quote，明细金额来自快照 | Quote 模型 |
| 9 | Quote Detail UI | `/portal/quotes/[id]` | 未开始 | 展示报价状态、有效期、费用明细、总价 | Quote API |
| 10 | Quote PDF | `GET /api/v1/quotes/:id/pdf` | 未开始 | 下载 PDF 内容与 Quote 快照一致 | Quote Detail |
| 11 | Accept Quote | `POST /api/v1/quotes/:id/accept` 或 `accept-and-create-booking` | 未开始 | 未过期 Quote 可接受，非法状态不可接受 | Quote 状态机 |
| 12 | Booking From Quote API | 从已接受 Quote 创建 Booking Draft | 未开始 | Booking 复制 Quote 的航线、船司、箱型、客户信息 | Accept Quote |
| 13 | Booking Detail UI | `/portal/bookings/[id]` 草稿页 | 未开始 | 接受报价后跳转 Booking，可看到带入的订舱信息 | Booking API |
| 14 | 审计日志最小集 | Quote 创建、Quote 接受、Booking 创建记录 AuditLog | 未开始 | 可追踪 who / tenant / object / action / when | Auth / 业务 API |
| 15 | 自动化测试 | API integration + Playwright smoke | 未开始 | 登录到进入 Booking 的主链路可自动跑通 | 前后端功能 |

## API 计划

| 方法 | 路径 | 用途 | 状态 |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/login` | 客户登录 | 未开始 |
| `POST` | `/api/v1/auth/logout` | 退出登录 | 未开始 |
| `GET` | `/api/v1/auth/me` | 当前用户与租户上下文 | 未开始 |
| `GET` | `/api/v1/rates/search` | 客户查价 | 未开始 |
| `POST` | `/api/v1/quotes` | 从 Rate 生成 Quote | 未开始 |
| `GET` | `/api/v1/quotes/:id` | 查看 Quote 明细 | 未开始 |
| `GET` | `/api/v1/quotes/:id/pdf` | 下载 Quote PDF | 未开始 |
| `POST` | `/api/v1/quotes/:id/accept` | 接受报价 | 未开始 |
| `POST` | `/api/v1/bookings/from-quote` | Quote 转 Booking | 未开始 |
| `GET` | `/api/v1/bookings/:id` | 查看 Booking 草稿 | 未开始 |

## 前端页面计划

| 页面 | 用途 | 数据来源 | 状态 |
| --- | --- | --- | --- |
| `/login` | 客户登录 | Auth API | 未开始 |
| `/portal` | 客户工作台 | 后续接真实 KPI，当前为 mock | 部分完成 |
| `/portal/rates` | 查价与选择方案 | Rate Search API | 未开始 |
| `/portal/quotes/[id]` | 报价详情、PDF、接受报价 | Quote API | 未开始 |
| `/portal/bookings/[id]` | Booking 草稿详情 | Booking API | 未开始 |

## 测试计划

| 测试类型 | 覆盖内容 | 状态 |
| --- | --- | --- |
| Unit | Quote 状态机、Booking 状态机、价格计算、编号生成 | 未开始 |
| API Integration | 登录、Rate 查询、Quote 创建、PDF、接受报价、Booking 创建 | 未开始 |
| Security | 跨租户访问失败、跨客户公司访问失败、未登录访问失败 | 未开始 |
| E2E | 客户登录 → 查价 → 生成 Quote → 下载 PDF → 接受 → Booking | 未开始 |

## 当前阻塞与风险

| 风险 | 影响 | 处理建议 |
| --- | --- | --- |
| 本地 Docker 命令不可用 | PostgreSQL / Redis / MinIO 不能按 README 启动 | 安装 Docker Desktop，或配置本机 PostgreSQL / Redis / MinIO |
| 本机 Redis 版本为 3.2.100 | BullMQ worker 无法正常运行 | 升级到 Redis 5+，推荐 Redis 7 |
| 业务模型尚未落库 | 真实 Rate / Quote / Booking 无法保存 | 下一步优先做 Prisma schema + migration |
| Auth / tenant scope 尚未实现 | 不能安全开放业务 API | Rate 查询前必须先完成最小 Auth 和隔离 |
| Quote PDF 存储策略未接 S3 | 第一版可直接响应 PDF，后续需迁移到 Document + Object Storage | 第一纵切先同步生成，V1 完整化再异步化 |

## 下一步建议

1. 完成 Prisma 业务模型和 migration。
2. 写 seed，准备北辰国际物流、客户账号、盐田到洛杉矶 40HQ 三条 Rate。
3. 实现最小 Auth 和 tenant/customer scope。
4. 实现 Rate Search API 和 `/portal/rates`。
5. 接 Quote 创建、详情、PDF、接受报价和 Booking 草稿。

