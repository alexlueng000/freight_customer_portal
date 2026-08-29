# Freight Customer Portal 开发进度日志

> 最后更新：2026-08-29
> 当前阶段：Phase 4 — Shipment + Document 基础
> 当前目标：验收 Rate → Quote → Booking → SO Released → Shipment Created 前半段核心链路

## 1. 项目当前状态

项目基础环境已经建立，客户门户与运营后台界面可以正常运行。Rate、Quote、Booking、SO Document 与 Shipment 建档已经接入真实数据库、鉴权、权限和租户上下文；Container、Tracking、BL、Invoice 等后半段履约链路仍待开发。

本地开发入口：

- Web：`http://localhost:3000`
- 客户门户：`http://localhost:3000/portal`
- 运营后台：`http://localhost:3000/admin`
- API：`http://localhost:4000/api/v1`
- API 文档：`http://localhost:4000/api/docs`
- PostgreSQL：`localhost:5433`

## 2. 已完成内容

### 2.1 项目基础

- 建立 pnpm monorepo，包含 Web、API、Worker 和共享 packages。
- 建立 Next.js、NestJS、Prisma、PostgreSQL、Redis、MinIO 基础结构。
- 完成 Docker Compose、本地环境变量示例和 CI 基线。
- 增加健康检查、数据库 readiness 检查、统一 API 错误结构和请求上下文。
- 修复 Next.js 开发缓存与生产构建产物混用导致的 Webpack/CSS 异常。

### 2.2 数据库与多租户基础

- 已建立 Tenant、User、Role、Permission、UserRole、CustomerCompany、CustomerContact、AuditLog、BusinessNumberCounter 等基础模型。
- 已加入关键租户一致性约束和数据库触发器，防止跨租户绑定客户、用户和角色。
- 已新增 RefreshSession 表，用于刷新令牌轮换和重放检测。
- 当前 15 个 Prisma migration 已写入版本库并应用到本地数据库。
- Demo seed 可重复执行，已经创建 DEMO 租户、系统角色、权限、演示客户公司、演示用户、Accepted Quote 与 Draft Booking。

### 2.3 后端认证

- 支持“租户代码 + 邮箱 + 密码”登录。
- 密码使用 bcrypt，并在哈希前加入环境级 pepper。
- 使用短期 JWT Access Token。
- Refresh Token 使用随机不透明令牌，只在数据库保存 HMAC 哈希。
- Refresh Token 使用 HttpOnly、SameSite=Strict Cookie，并在每次刷新时轮换。
- 检测旧 Refresh Token 重用后会撤销整个令牌族。
- 已实现登录、刷新、退出和当前用户接口：
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- 全局 Auth Guard 会重新查询当前用户、租户和角色，不把 JWT 中的角色当作唯一权限来源。
- 登录和退出会写入审计日志。
- 登录接口和刷新接口已配置限流。

### 2.4 前端认证与角色分流

- 已新增 `/login` 登录页面并接入真实 API。
- Web 通过同源代理访问 API，避免跨域和 Refresh Cookie 问题。
- Access Token 仅保存在前端运行内存，不写入 localStorage。
- 页面初始化时使用 HttpOnly Refresh Cookie 恢复登录状态。
- 已对 React Strict Mode 下重复刷新请求进行去重，避免触发令牌重放保护。
- 未登录访问业务页面会跳转登录页，并保留合法的目标路径。
- 内部用户登录后进入 `/admin`。
- 客户用户登录后进入 `/portal`。
- 客户用户访问 `/admin` 会被送回 `/portal`。
- 页面租户名称和用户名称已经来自真实登录数据。
- 顶部用户按钮已经接入退出登录。

### 2.5 当前演示账号

租户代码：`DEMO`

| 类型       | 邮箱                          | 本地演示密码        | 登录后入口 |
| ---------- | ----------------------------- | ------------------- | ---------- |
| 内部管理员 | `admin@demo.freight.local`    | `DemoAdmin!2026`    | `/admin`   |
| 客户管理员 | `customer@demo.freight.local` | `DemoCustomer!2026` | `/portal`  |

演示密码仅用于本地开发，不得用于共享、测试或生产环境。

### 2.6 客户公司 API

- 已新增 `customers` NestJS 模块。
- 已实现客户公司分页列表、关键词/状态筛选、创建和详情接口：
  - `GET /api/v1/customers`
  - `POST /api/v1/customers`
  - `GET /api/v1/customers/:id`
- 所有客户查询强制使用认证上下文中的 `tenantId`；客户类型账号只能读取自己绑定的客户公司。
- 已新增通用 `@RequirePermissions()` decorator 和数据库权限 Guard，客户读取/创建分别要求 `customer.read` / `customer.manage`。
- 客户代码在租户内唯一；不同租户可使用相同代码。
- 金额和加价字段以字符串 DTO 接收并转换为 Prisma Decimal，避免 JavaScript 浮点数参与权威金额保存。
- 已校验默认加价类型/数值组合及销售负责人必须属于当前租户的内部用户。
- 创建客户与 AuditLog 写入位于同一数据库事务。

### 2.7 运营后台客户页面

- 已将 `/admin/customers` 从模拟数据切换到真实客户 API。
- 已实现分页、关键词搜索、状态筛选和清空筛选。
- 已实现 loading、empty、error 和 permission-denied 状态。
- 已新增基于 React Hook Form + Zod 的“新建客户”表单，覆盖基本信息、状态、信用额度、账期和基础加价规则。
- Access Token 过期时，前端 API 请求会使用 HttpOnly Refresh Cookie 轮换会话并自动重试一次。
- 创建权限按钮按当前角色提供前端提示性控制，最终权限仍由后端 `customer.manage` 强制执行。

### 2.8 客户联系人

- 已实现客户联系人列表和创建接口：
  - `GET /api/v1/customers/:id/contacts`
  - `POST /api/v1/customers/:id/contacts`
- 联系人查询强制校验租户和客户公司范围；客户类型账号只能读取自己绑定公司的联系人。
- 联系人创建要求 `customer.manage`，列表要求 `customer.read`。
- 已支持主要联系人、订舱联系人和单证联系人标记。
- 联系人创建与 AuditLog 写入位于同一事务；审计数据只记录是否存在邮箱/电话，不复制完整联系方式。
- 已新增 `/admin/customers/:id` 客户详情页，展示公司信息和联系人列表。
- 客户列表名称已链接到详情页，并新增 React Hook Form + Zod 联系人创建表单。

### 2.9 用户管理与基础 RBAC

- 已新增 `users` NestJS 模块及租户用户分页列表、创建和更新接口：
  - `GET /api/v1/users`
  - `POST /api/v1/users`
  - `PATCH /api/v1/users/:id`
- 用户列表支持姓名/邮箱搜索、用户类型、状态和客户公司筛选，响应不包含密码哈希。
- 内部用户只能分配 `TENANT_ADMIN`、`SALES`、`OPERATION`、`FINANCE`；客户用户只能分配 `CUSTOMER_ADMIN`、`CUSTOMER_USER`。
- 客户用户必须绑定当前租户下的 CustomerCompany，内部用户禁止绑定客户公司。
- 用户创建要求 `user.manage`，列表要求 `user.read`；角色读取以当前数据库配置为准。
- 初始密码只用于 bcrypt 哈希，不返回、不写审计；用户、角色分配和 AuditLog 在同一事务创建。
- 用户状态和角色变更按租户查询，跨租户 ID 返回未找到；角色与用户类型必须匹配。
- 角色分配、状态更新和包含前后值的 AuditLog 在同一数据库事务中完成。
- 已将 `/admin/users` 从模拟数据切换到真实 API，并支持分页、筛选、新建用户及角色/状态管理。

### 2.10 Rate 数据模型与后台 CRUD（后端已完成）

- 已按批准 ERD 建立 `Rate`、`RatePrice`、`RateCharge`、`RateStatus` 和 `ChargeBasis`。
- 已增加租户内运价编号唯一约束、有效期/币种/金额/费用计价单位检查，以及面向查价的组合索引。
- RatePrice/RateCharge 通过数据库触发器校验与 Rate 的租户一致性，作为应用层租户范围之外的纵深防御。
- 已实现后台运价分页、筛选、创建、详情和受控更新接口：
  - `GET /api/v1/rates`
  - `POST /api/v1/rates`
  - `GET /api/v1/rates/:id`
  - `PATCH /api/v1/rates/:id`
- 运价金额以字符串 DTO 接收并转换为 Prisma Decimal；业务日期以 PostgreSQL DATE 保存。
- 创建和修改在事务内写入 AuditLog，修改记录保存可追溯的前后快照。
- 后台接口明确拒绝客户类型账号，避免在客户查价接口完成前暴露采购成本。
- 已加入 `rate.read` / `rate.manage` 权限；当前仅平台/租户管理员可访问包含采购成本的后台接口，客户查价将使用独立的销售价响应模型。

### 2.11 运营后台运价页面

- 已将 `/admin/rates` 从模拟页面切换到真实 Rate API。
- 已支持关键词、POL、POD、Carrier、箱型、状态和指定有效日筛选，以及分页和清空筛选。
- 运价列表展示航线、船司、各箱型采购成本、有效期、供应方、合约号和状态。
- 已实现基于 React Hook Form + Zod 的新建和编辑抽屉，支持基础信息、业务日期、多个箱型价格和附加费用。
- 表单校验覆盖有效期顺序、金额格式、重复箱型及按箱费用必须选择箱型。
- 已处理 loading、empty、error、permission-denied、保存中和成功反馈状态。
- 前端仅向具有平台/租户管理员角色的用户展示新建和编辑操作，服务端权限仍为最终安全边界。

### 2.12 Rate Excel 异步导入

- 已新增 `RateImportJob` 持久化模型和 `PENDING / PROCESSING / COMPLETED / FAILED` 状态。
- 已实现标准 `.xlsx` 模板下载、5 MB 内存上传限制、BullMQ 入队和导入状态查询：
  - `GET /api/v1/rates/import-template`
  - `POST /api/v1/rates/import`
  - `GET /api/v1/rate-imports/:id`
- Worker 已从单纯队列事件监听升级为真实 Processor，并携带、校验租户与操作者上下文。
- 导入模板采用一行一个箱型价格；相同 `rateNo` 的多行合并为一条 Rate 和多条 RatePrice。
- 已校验固定表头、必填列、币种、金额、有效期、状态、箱型重复、同一 Rate 航线一致性和租户内运价编号重复。
- 采用全量校验后单事务写入；任一行错误则整批不写入，最多返回 500 条逐行错误。
- 导入成功为每条 Rate 写入 `RATE_IMPORTED` 审计记录；BullMQ 按 import job id 幂等入队并配置 3 次指数退避重试。
- 后台运价页已增加模板下载、Excel 上传、进度轮询、汇总和逐行错误展示。

### 2.13 客户查价与基础加价

- 已新增独立的客户查价接口 `GET /api/v1/portal/rates`，要求 `rate.search` 权限并强制客户公司范围。
- `rate.search` 仅回填给 `CUSTOMER_ADMIN` / `CUSTOMER_USER`，与包含采购成本的后台 `rate.read` / `rate.manage` 分离。
- 查询支持 POL、POD、ETD 日期范围、箱型和可选 Carrier，只匹配当前租户的 ACTIVE 且有效运价。
- 客户响应只返回最终销售价和航线/船期信息，不返回 costAmount、供应方、合约号、内部备注或客户加价参数。
- 当前批准文档未明确标准售价与客户加价的组合顺序；采用可逆规则：以 `sellAmount` 为基价，缺失时回退到 `costAmount`，再应用 FIXED/PERCENT 客户加价。
- 金额计算全部使用 Prisma Decimal 并保留最多 4 位小数，不使用 JavaScript 浮点权威计算。
- 已将 `/portal/rates` 从模拟页切换为真实查询表单和结果表格，覆盖 loading、初始、无结果、错误和权限拒绝状态。
- “生成报价”按钮已接入 Quote 创建接口，成功后进入真实报价详情。

### 2.14 Quote 快照与状态机

- 已按批准 ERD 建立 Quote、QuoteItem、QuoteStatus、租户内月度业务编号和价格快照。
- 已实现客户报价创建、列表、详情、接受和拒绝接口，并确保客户响应不包含成本字段。
- 已实现独立状态机：DRAFT → SENT → VIEWED → ACCEPTED/REJECTED；开放报价可转 EXPIRED，非法跳转由服务端拒绝。
- 客户首次查看已发送报价时原子标记 VIEWED；接受操作保存 acceptedAt，并对重复接受提供幂等结果。
- 已新增后台报价列表、详情、发送和手工过期操作；Sales 查询限制为自己负责的客户报价。
- 所有状态动作均写入包含 from/to 的 AuditLog；到期报价在客户决策前先持久化为 EXPIRED。
- 已新增 quote.manage、quote.accept、quote.reject 权限及迁移。
- 客户查价已按 V1 受控规则汇总同币种、未包含且计价单位匹配的 RateCharge；Quote 创建会保存独立附加费 QuoteItem 快照。
- 已实现销售草稿报价手工改价，强制填写原因并保留原始单价、修改人、修改时间、版本号和 before/after 审计记录。
- Quote PDF 已改为 BullMQ Worker 异步生成，按租户、Quote 和版本写入 S3 兼容对象存储；同版本重复下载复用对象，API 下载前仍执行租户、客户或 Sales 数据范围校验。
- Worker 已增加主动过期扫描，将到期的 DRAFT/SENT/VIEWED 报价持久化为 EXPIRED 并写入系统审计记录。

### 2.15 Booking 交易闭环

- 已建立 `Booking`、`BookingContainerRequest` 与独立 `BookingStatus` 状态机。
- 已实现 `ACCEPTED Quote → DRAFT Booking` 原子转单：复制航线、船司、ETD、箱型需求和默认订舱联系人，并将 Quote 更新为 `BOOKED`。
- 已实现客户 Booking 列表、详情、Draft 编辑、提交和取消；后台实现列表、详情、开始审核、确认、拒绝和取消。
- 服务端强制执行 `DRAFT → SUBMITTED → UNDER_REVIEW → CONFIRMED → SO_RELEASED`，拒绝非法跳转。
- Booking 编号通过租户/月度计数器并发安全生成；常规 V1 服务流程限制一份 Quote 一次转单，数据层仍保留 Quote 1:N Booking。
- 已增加 Booking 权限、状态审计、重复转单保护、资料完整性校验、客户公司范围和跨租户负向测试。

### 2.16 SO Document 与 Shipment 建档

- 已建立独立 `Shipment`、`Document`、`ShipmentStatus` 和 `DocumentStatus` 数据模型及租户一致性数据库触发器。
- 后台仅允许对 `CONFIRMED` Booking 上传 SO；支持 PDF、PNG、JPEG，单文件最大 10 MB。
- SO 先写入 S3 兼容对象存储，再在数据库事务内创建 Document、更新 Booking 为 `SO_RELEASED` 并写入审计；数据库失败时清理孤儿对象。
- Document 保存对象 Key、原始文件名、MIME、大小、版本、上传者、客户可见性和状态；对象 Key 不作为授权边界。
- 客户下载前同时校验 tenant、customer scope、`customerVisible=true` 和 ACTIVE 状态；隐藏文件及跨租户 Document ID 不可下载。
- 后台可从 `SO_RELEASED` Booking 创建 Shipment，复制客户、航线、船司和 ETD 快照并生成租户内 Shipment 编号。
- 客户与后台 Booking 详情页均展示 SO 和 Shipment；下载通过带 Bearer Token 的 API 请求完成。
- DEMO 数据已经实际走通 Submitted → Under Review → Confirmed → SO Released → Shipment Created，并完成真实 MinIO 上传和客户下载验证。

## 3. 已完成验证

- ESLint：通过。
- TypeScript typecheck：通过。
- Next.js / NestJS 生产构建：通过。
- API 自动化测试：15 个测试套件、58 个测试全部通过；Worker：3 个测试套件、5 个测试全部通过。
- 已覆盖登录、错误密码、当前用户、刷新令牌轮换、旧令牌重用、租户限定身份和数据库租户约束。
- 已覆盖客户公司跨租户隔离、同租户代码唯一性、客户账号公司范围、创建审计和权限 Guard。
- 已覆盖联系人跨租户/跨客户隔离、创建审计和联系方式审计脱敏。
- 已覆盖用户列表与更新的租户隔离、用户类型/角色匹配、客户公司绑定、状态/角色事务更新、变更审计和密码审计保护。
- 已覆盖运价编号租户唯一性、跨租户读取/修改失败、有效期/箱型筛选、明细事务更新、数据库约束和修改审计。
- 真实 HTTP 验收已覆盖登录、`/auth/me`、刷新和退出。
- 浏览器验收已覆盖内部账号登录、客户账号登录、角色分流、刷新恢复登录状态、客户列表/详情、联系人表单校验和 CSS 渲染。
- 浏览器验收已覆盖后台运价创建、成本与状态编辑、多条件筛选、筛选空状态和清空筛选，页面无控制台错误。
- 浏览器验收已覆盖标准模板上传、BullMQ/Worker 异步处理、完成状态轮询和导入后列表刷新。
- 浏览器验收已覆盖客户账号真实查价、销售价展示和采购成本/供应方/合约号/内部备注不可见。
- 数据库集成测试已覆盖 Quote 原子转 Booking、重复转单、Booking 完整性、状态机、SO 可见性、隐藏文件、跨租户下载拒绝和 Shipment 建档。
- 真实本地依赖验收已覆盖 MinIO SO 上传、客户授权下载及客户 Shipment 列表读取。

## 4. 当前未完成事项与风险

- Dashboard、Container、Tracking、通用 Documents、Invoice 和 Billing 页面仍有模拟数据或占位内容；Rate、Quote、Booking、SO 和 Shipment 基础查询已接入真实 API。
- 通用 permission decorator / guard 已实现，但完整权限矩阵和其他业务模块的敏感操作权限仍需逐模块落地。
- 前端还没有自动化组件测试和 Playwright E2E 测试基线。
- 忘记密码和重置密码尚未实现。
- 登录失败审计、账号锁定策略、CSP 和更完整的 Security Headers 尚未完成。
- `RateCharge` V1 规则已确认并实现；仍需在 Rate UAT 中用真实费用样本复核。
- Quote 发送邮件通知按批准路线图属于 M5 Notifications，本阶段不提前建立完整通知域。
- 开发环境不要在 `next dev` 运行期间执行 `next build`，否则共用 `.next` 可能导致 Webpack 模块或 CSS 清单错位。
- 当前 Shipment 仅完成建档和基础查询；船名航次维护、Container、Tracking Timeline、BL 版本/可见性和 Shipment 状态机操作尚未实现。

## 5. 下一步开发计划

Rate + Quote、Booking、SO Released 与 Shipment Created 已形成前半段纵向切片。当前先完成阶段验收，再进入 Shipment 履约明细：

### 5.1 Rate 业务 UAT

- [ ] 按 [Rate 阶段验收清单](./Rate_Acceptance_Checklist_V1_CN.md) 完成 RATE-UAT-001 至 RATE-UAT-009。
- [x] 已确认并实现 `RateCharge` 进入客户查价和 QuoteItem 的 V1 受控规则。
- [ ] 保存业务验收证据并完成产品、业务和技术签署。

### 5.2 Quote 完成范围

- [x] 实现 Quote PDF 异步生成、S3 版本复用和受权限保护的客户/后台下载。
- [x] 实现受控销售手工改价，保存原价、修改价、操作人、时间、原因、版本和审计记录。
- [x] 补充 Worker 定时过期扫描，避免只在读取/决策时惰性持久化。
- [ ] Quote 发送邮件通知随 M5 Notifications 实现；邮件投递使用 BullMQ 并记录 Notification/message log。

### 5.3 Quote → Booking

- [x] 按批准 ERD 核对 Booking、BookingContainerRequest、状态和编号规则。
- [x] 从 `ACCEPTED` Quote 创建 Booking，并复制必要航线与箱型快照。
- [x] 在同一事务中创建 Booking 并将 Quote 更新为 `BOOKED`。
- [x] 覆盖重复转单、非法状态和跨租户/跨客户负向测试。

### 5.4 Booking → SO → Shipment

- [x] 完成 Booking 提交、审核、确认、拒绝和取消状态动作。
- [x] SO 上传至 S3 兼容对象存储并通过 Document 元数据授权客户下载。
- [x] 上传 SO 后原子更新 Booking 为 `SO_RELEASED`。
- [x] 从 Booking 创建 Shipment 并复制航线快照。
- [x] 覆盖隐藏文件、跨租户文件访问和 Shipment 租户一致性测试。
- [ ] 按 [Booking/SO/Shipment 阶段验收清单](./Booking_SO_Shipment_Acceptance_Checklist_V1_CN.md) 完成业务验收。

### 5.5 自动化验收

- [ ] 建立 Playwright 浏览器测试基线。
- [ ] 固化后台创建 Rate → 客户查价 → 生成 Quote → 后台发送 → 客户查看/接受的黄金路径。
- [ ] 在 CI 中保留失败截图、trace 或视频证据。

## 6. 后续里程碑

当前后续里程碑：

1. Rate/Quote 与 Booking/SO/Shipment 业务 UAT。
2. Shipment 维护、Container、TrackingEvent 和 BL Documents。
3. Invoice、Notifications 和 Branding。
4. 核心黄金路径 Playwright E2E 与试点加固。
