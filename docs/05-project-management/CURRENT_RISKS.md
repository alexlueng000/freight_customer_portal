# Freight Customer Portal 当前风险登记

> 最后更新：2026-09-02
> 当前阶段：V1.1 范围冻结，主链路收敛为 Rate → Quote → Booking → SO → Basic Shipment
> 适用范围：本地开发至首批试点上线前

## 1. 使用说明

本文只登记当前已经识别、尚未关闭的风险，不把尚未开发的正常业务范围全部视为缺陷。

优先级定义：

- **P0**：已经造成数据泄露、数据损坏或系统不可用，必须立即处理。
- **P1**：进入外部试点或生产前必须关闭。
- **P2**：不阻塞当前本地开发，但应在对应业务阶段或试点加固阶段处理。
- **P3**：工程效率或维护性风险，可排期优化。

当前没有已知 P0 风险。所有条目默认状态为 `OPEN`，关闭时应补充验证证据和关闭日期。

## 2. 风险总览

| ID        | 优先级 | 风险                                                          | 当前状态 | 最晚处理节点           |
| --------- | ------ | ------------------------------------------------------------- | -------- | ---------------------- |
| SEC-01    | P1     | 登录失败审计和账号锁定策略不完整                              | OPEN     | 外部试点前             |
| SEC-02    | P1     | CSP、Security Headers 与 CSRF 部署策略未完成                  | OPEN     | 外部试点前             |
| SEC-03    | P1     | 忘记密码和安全重置流程缺失                                    | OPEN     | 外部试点前             |
| AUTH-01   | P2     | 当前用户管理按单角色操作，未来多角色语义尚未确认              | OPEN     | 扩展角色模型前         |
| TENANT-01 | P1     | 敏感业务域跨租户自动化测试覆盖                                | CLOSED   | 2026-08-29             |
| TEST-01   | P1     | 缺少 Playwright 核心黄金路径 E2E                              | CLOSED   | 2026-08-30             |
| TEST-02   | P2     | 前端缺少组件和交互自动化测试基线                              | OPEN     | Rate / Quote UI 稳定后 |
| OBS-01    | P1     | 生产级错误监控、结构化日志聚合和告警尚未闭环                  | OPEN     | 外部试点前             |
| INFRA-01  | P1     | 对象存储上传下载已验证；邮件、签名 URL 与生产重试恢复仍未闭环 | OPEN     | 文件/通知功能验收前    |
| DEV-01    | P2     | `next dev` 与 `next build` 共用 `.next` 可能互相污染          | CLOSED   | 2026-08-29             |
| DATA-01   | P1     | 生产迁移、备份恢复和回滚演练尚未完成                          | OPEN     | 首次生产发布前         |
| SCOPE-01  | P2     | 多个业务页面仍为模拟数据，容易被误认为已可交付                | OPEN     | 对应模块完成时         |
| SCOPE-02  | P1     | V1.0 已实现的 Invoice/BL/复杂 Tracking 可能造成 V1.1 范围漂移 | OPEN     | 外部试点前             |
| DEV-02    | P2     | Prisma Client 生成被 Windows engine DLL 文件锁阻塞            | OPEN     | 下一次数据库迁移验证前 |

## 3. 详细风险与关闭标准

### SEC-01 — 登录失败审计和账号锁定策略不完整

- **现状**：登录接口已有节流，但尚未形成按租户、账号和来源维度的失败审计、连续失败计数、临时锁定与安全解锁策略。
- **影响**：仅靠接口级限流不足以应对分布式密码喷洒；发生攻击时也缺少完整追踪依据。
- **当前缓解**：登录接口限流；密码使用 bcrypt 和环境级 pepper；错误响应不区分账号不存在与密码错误。
- **建议措施**：定义失败窗口、阈值、锁定时长和管理员解锁规则；记录脱敏审计事件；避免通过锁定行为泄露账号是否存在。
- **关闭标准**：服务端规则、审计事件、管理员解锁路径及正常/锁定/自动恢复集成测试全部通过。

### SEC-02 — CSP、Security Headers 与 CSRF 部署策略未完成

- **现状**：Refresh Token 使用 `HttpOnly`、`SameSite=Strict` Cookie，但生产环境的 CSP、HSTS、frame、MIME sniffing、Referrer Policy 等响应头尚未系统配置；反向代理部署后的 CSRF 边界尚未形成书面验证。
- **影响**：XSS、点击劫持、错误内容嗅探和错误代理配置的防御深度不足。
- **当前缓解**：Access Token 仅保存在运行内存；Refresh Cookie 不向 JavaScript 暴露并使用严格 SameSite。
- **建议措施**：在 Next.js/Nginx 统一配置安全响应头；明确受 Cookie 保护端点的 Origin/CSRF 策略；在 HTTPS 环境验证 Secure Cookie。
- **关闭标准**：生产配置检查、浏览器响应头检查、跨站请求负向测试及安全扫描通过。

### SEC-03 — 忘记密码和安全重置流程缺失

- **现状**：只能由管理员创建带初始密码的用户，用户没有自助找回或重置密码流程。
- **影响**：试点期间可能需要开发者或数据库介入恢复账号；人工传递新密码会增加泄露风险。
- **当前缓解**：管理员可以停用账号；密码不会返回给 API 客户端或写入审计日志。
- **建议措施**：实现一次性、短有效期、单次使用的重置令牌；重置成功后撤销现有 Refresh Session；通知用户并记录安全审计。
- **关闭标准**：请求重置、令牌过期、重复使用、密码更新、会话撤销和防账号枚举测试通过。

### AUTH-01 — 当前用户管理按单角色操作

- **现状**：数据库支持 `UserRole` 关系，但管理接口每次更新会替换为一个角色，前端也只提供单选。
- **影响**：如果后续确认一个内部用户需要同时拥有多个角色，现有更新语义和权限组合测试需要调整。
- **当前缓解**：当前 V1 操作方式明确且可审计，已覆盖内部/客户角色类型边界。
- **建议措施**：在扩展角色能力前由 PRD 明确单角色还是多角色；未明确前不增加复杂角色组合。
- **关闭标准**：批准的角色语义写入设计文档，接口、UI 和权限测试与之保持一致。

### TENANT-01 — 后续业务域的租户隔离测试尚未落地

- **状态**：CLOSED
- **现状**：Customer、Contact、User、Rate、Quote、Booking、Shipment、Document 和 Invoice 已覆盖跨租户或跨客户负向测试。
- **影响**：如果新模块只依赖前端过滤或按对象 ID 查询，可能形成严重数据越权。
- **当前缓解**：Booking/Shipment/Document 查询均强制 tenant/customer scope；Document 下载额外校验客户可见性，数据库触发器校验 Shipment/Document 父对象租户一致性。
- **建议措施**：把跨租户读取和修改失败测试作为每个敏感域的 Definition of Done，不允许延期到项目末尾集中补测。
- **关闭标准**：AGENTS.md 指定的每个敏感域均至少有一组跨租户访问失败测试。
- **关闭日期**：2026-08-29
- **验证证据**：Invoice 数据库集成测试证明 Tenant B 客户无法读取 Tenant A Invoice；服务端查询强制 tenant/customer scope，数据库触发器阻止 Invoice 与 Shipment/Customer/Document 跨租户绑定；统一异常边界会把已认证敏感资源 403/404 记录为请求方租户下的 `ACCESS_DENIED`，单元测试验证 Invoice ID 探测审计且不泄露目标租户。

### TEST-01 — 缺少核心黄金路径 Playwright E2E

- **状态**：CLOSED

- **现状**：已建立 Playwright/Chromium 基线并接入 CI。历史 V1.0 黄金路径曾使用真实 API、PostgreSQL、MinIO 与客户页面完成 Rate → Quote → Booking → SO → Shipment → 两个 Container → Tracking → BL → Invoice → 附件 → 客户确认；V1.1 主链路收紧后需要重定为 Rate → Quote → Booking → SO → Basic Shipment。
- **影响**：页面路由、Cookie 刷新、权限分流和完整业务链可能在单元/接口测试均通过时发生回归。
- **当前缓解**：关键页面已进行人工浏览器回归；Shipment 与 Invoice/Billing 冒烟 E2E 可重复执行，失败时保留截图、视频、trace 和 HTML 报告；API 与 Worker 继续提供领域和租户隔离覆盖。
- **处理结果**：CI 启动 S3 兼容对象存储，幂等 seed 后串行执行全部 Chromium 用例；黄金路径每次使用唯一业务编号，失败保留截图、视频、trace 和 HTML 报告。
- **关闭标准**：CI 中可稳定运行核心黄金路径及关键负向路径，失败时保留截图、trace 或视频证据。
- **关闭日期**：2026-08-30
- **验证证据**：历史本地 `pnpm test:e2e:golden` 真实执行通过；Shipment/Invoice 冒烟、API 租户隔离和隐藏文件负向测试继续保留。
- **剩余风险**：需按 PRD V1.1 重定黄金路径并观察 CI 多次运行稳定性；业务 UAT 签署仍独立进行。

### TEST-02 — 前端自动化测试基线不足

- **现状**：表单校验、筛选、错误状态和权限提示主要依靠构建检查与人工验收。
- **影响**：复杂表单和列表交互增加后，人工回归成本和遗漏概率会上升。
- **当前缓解**：TypeScript、ESLint 和 Next.js 生产构建均通过；表单使用 Zod 和 React Hook Form。
- **建议措施**：为共享认证、表单校验和关键列表状态增加组件测试，避免测试纯样式或实现细节。
- **关闭标准**：形成可在 CI 稳定执行的前端测试命令，并覆盖认证恢复、权限状态和至少一个复杂表单。

### OBS-01 — 生产级可观测性尚未闭环

- **现状**：已有 request context、统一错误响应和健康检查，但尚未完成日志集中采集、错误监控、关键告警和队列失败观测。
- **影响**：试点环境出现间歇性错误时，定位速度和影响评估能力不足。
- **当前缓解**：服务端错误具备统一结构，数据库 readiness 可检测。
- **建议措施**：接入批准的错误监控；输出结构化日志并贯穿 correlation ID；配置 API、数据库、Worker 和队列失败告警。
- **关闭标准**：能够从一次前端失败追踪到 API 日志/错误事件，并对关键依赖故障产生可验证告警。

### INFRA-01 — 队列、对象存储和外部副作用尚未完整验证

- **现状**：Rate Excel 导入与 Quote PDF 已通过 BullMQ/Redis/S3 路径；SO 已通过真实 MinIO 上传、版本化 Document 元数据和受权限保护下载。Notification message log、Invoice 发布事件与 BullMQ 三次退避已完成，本地邮件仍为显式 log transport；生产邮件服务、预签名 URL、对象存储生产凭据轮换及大文件策略仍未完成。
- **影响**：连接配置、重试、幂等、租户上下文和签名 URL 授权问题可能到较晚阶段才暴露。
- **当前缓解**：Docker Compose 和环境变量已提供基础依赖配置；对象 Key 按租户/业务对象隔离但不作为权限边界；SO 数据库写入失败时会尝试删除孤儿对象；客户下载执行 tenant/customer/visibility/status 四层校验。
- **建议措施**：在对应模块首次使用时增加集成测试，验证失败重试、重复执行、文件权限和租户上下文传播。
- **关闭标准**：邮件队列、生产对象存储凭据和签名 URL/流式下载策略完成，并覆盖失败重试、孤儿对象巡检和租户上下文。

### DEV-01 — Next.js 开发与构建产物冲突

- **状态**：CLOSED

- **现状**：`next dev` 与 `next build` 共用 `.next`，在开发服务运行时执行生产构建曾导致 Webpack 模块或 CSS 清单错位。
- **影响**：本地页面可能出现难以复现的 500、样式丢失或热更新异常。
- **当前缓解**：执行生产构建前停止开发服务，构建完成后再重新启动。
- **处理结果**：Next.js 配置支持 `NEXT_DIST_DIR`，生产构建脚本固定输出到 `.next-build`，开发服务继续使用 `.next`；两者不再共享缓存。
- **关闭标准**：开发与生产构建可连续执行且不会污染正在使用的页面缓存，或仓库脚本自动处理服务/目录隔离。
- **关闭日期**：2026-08-29
- **关闭提交**：工作区待提交
- **验证证据**：Web lint、typecheck、生产构建通过；清理旧冲突缓存并重启开发服务后，后台与客户 Shipment 页面浏览器渲染通过。
- **剩余风险**：无；CI/本地自定义构建命令需继续使用仓库 `build` 脚本或显式设置独立 `NEXT_DIST_DIR`。

### DATA-01 — 生产迁移和恢复流程尚未演练

- **现状**：Prisma migration 已持续增加，并已新增 V1.1 Basic Shipment 状态迁移 `20260902190000_basic_shipment_status_v11`；但还没有针对试点数据的备份、恢复、迁移失败和回滚演练记录。
- **影响**：首次发布或后续模型变更时，失败恢复时间和数据损失风险不可量化。
- **当前缓解**：迁移已纳入版本控制；禁止修改已应用迁移；Demo seed 与生产开关分离。
- **建议措施**：建立发布前备份、migration deploy、校验和故障恢复流程；使用接近生产的数据量演练。
- **关闭标准**：在隔离环境成功完成备份、迁移、校验和恢复演练，并记录步骤、耗时和责任人。

### SCOPE-01 — 模拟页面可能造成完成度误判

- **现状**：Rate、Quote、Booking、SO Document、Shipment 与 Invoice/Billing 已连接真实 API；Dashboard 和通用 Document 管理仍有模拟数据或占位内容。
- **影响**：演示时可能把可视页面误认为已具备真实持久化、权限和业务规则。
- **当前缓解**：开发进度日志已明确真实 API 覆盖范围。
- **建议措施**：页面显式标记未接入模块；模块完成时同时替换模拟数据、补齐后端授权和测试。
- **关闭标准**：所有对外试点页面均连接真实 API，具备 loading、empty、error、permission-denied 状态和对应自动化验证。

### SCOPE-02 — V1.0 历史实现造成 V1.1 范围漂移

- **现状**：最新 PRD V1.1 已将 V1 P0 收紧为 `Rate → Quote → Booking → SO → Basic Shipment`，并明确把 Invoice、完整 BL/Document、完整 Tracking、LCL、空运、报关、财务等移出 V1 P0；但代码库历史上已经实现了 Invoice/Billing、Shipment Document、Container 和较完整 Tracking 页面。
- **影响**：试点演示或后续开发可能继续按 V1.0 完整 ERP 闭环推进，导致客户教育成本、UAT 范围、缺陷数量和发布风险上升。
- **当前缓解**：Basic Shipment 页面已按 V1.1 降噪；客户侧不再把 Container、BL 和完整 Tracking 作为 P0 主任务暴露；进度文档已标记 Invoice/BL/复杂 Tracking 为历史能力和 Backlog。
- **建议措施**：外部试点只开放 V1.1 主链路；冻结或隐藏非 P0 菜单入口；E2E 黄金路径按 V1.1 重定基线；所有新增需求先检查是否服务 Rate/Quote/Booking/SO/Basic Shipment。
- **关闭标准**：试点演示脚本、验收清单、Dashboard 和 E2E 均只围绕 V1.1 主链路；非 P0 能力在产品文档和 UI 中明确标记为 Backlog/历史能力或对试点隐藏。

### DEV-02 — Prisma Client 生成被 Windows DLL 文件锁阻塞

- **现状**：`pnpm prisma:validate` 已通过，但 `pnpm prisma:generate` 在 Windows 下更新 `query_engine-windows.dll.node` 时失败，错误为 `EPERM rename ... query_engine-windows.dll.node.tmp* -> query_engine-windows.dll.node`。本机存在多个 Node 进程，疑似 API、Worker、测试或 dev server 持有 Prisma engine DLL。
- **影响**：V1.1 ShipmentStatus enum 虽已通过 TypeScript 与 schema validate，但如果不重新生成 Prisma Client，后续数据库迁移验证、集成测试或运行时可能仍使用旧生成产物。
- **当前缓解**：API/Web typecheck 和 lint 通过；Shipment 状态机单测通过；schema validate 通过。
- **建议措施**：关闭正在运行的 API/Worker/Next dev/test 进程后重跑 `pnpm prisma:generate`；随后执行 migration deploy/dev、seed、Shipment/Booking 相关集成测试和 V1.1 Playwright。
- **关闭标准**：`pnpm prisma:generate`、`pnpm prisma:validate`、V1.1 migration 应用、相关 API 测试和 Playwright 主链路 E2E 全部通过，并记录执行日期。

### PRICE-01 — RateCharge 客户计价边界（已关闭）

- **状态**：CLOSED
- **处理结果**：V1 只汇总同币种、未包含且计价单位匹配的附加费；按箱费用匹配所选箱型，按提单/票费用数量为 1。客户加价只作用于主运价，附加费作为独立 QuoteItem 透传并保存快照；不同币种不自动转换。
- **验证证据**：客户查价与 Quote 数据库集成测试覆盖同币种汇总、已包含费用排除、箱型匹配、不同币种排除、总额和 QuoteItem 快照。
- **剩余风险**：正式 Rate UAT 仍需使用真实费用样本复核；未来多数量、多币种或复杂费用组合必须另行批准。
- **关闭日期**：2026-08-29

## 4. 发布门禁

### 进入外部试点前必须完成

- 关闭全部 P1 风险，或由项目负责人书面接受剩余风险并明确到期日。
- 为当时已经开放的每个敏感业务域完成跨租户访问测试。
- 核心浏览器黄金路径能够在 CI 中重复运行。
- 完成生产环境安全头、HTTPS、Cookie、秘密配置和数据库恢复验证。
- 明确哪些页面为真实功能，禁止把模拟数据页面开放给试点客户。

### 风险关闭记录格式

关闭风险时，在对应条目末尾追加：

```text
关闭日期：yyyy-mm-dd
关闭提交：<commit SHA>
验证证据：<测试命令、测试报告或文档链接>
剩余风险：<无，或说明已接受的残余风险>
```
