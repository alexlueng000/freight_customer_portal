# Freight Customer Portal 开发进度日志

> 最后更新：2026-09-02
> 当前阶段：V1.1 范围冻结，主链路收敛为 Rate → Quote → Booking → SO → Basic Shipment
> 当前目标：完成 V1.1 主链路 UAT、Email/Deep Link、操作型 Dashboard 与试点前安全加固

## 1. 项目当前状态

项目基础环境已经建立，客户门户与运营后台界面可以正常运行。根据 2026-09-02 最新 PRD V1.1，当前 V1 MVP 不再以完整 `Tracking → Document → Invoice` 闭环为 P0，而以 `Rate → Quote → Booking → SO → Basic Shipment` 作为商用试点主链路。Rate、Quote、Booking、SO 与 Basic Shipment 已接入真实数据库、鉴权、权限、租户/客户范围、审计及主要前端页面；Container、完整 Tracking、BL 和 Invoice/Billing 作为历史已实现能力保留，但后续不作为 V1 P0 扩展重点。

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
- 当前已写入版本库的 Prisma migration 包含 V1.1 Basic Shipment 状态迁移 `20260902190000_basic_shipment_status_v11`；应用到目标数据库前需先重跑 `pnpm prisma:generate`。
- Demo seed 可重复执行，已经创建 DEMO 租户、系统角色、权限、演示客户公司、演示用户、Accepted Quote、Draft Booking、确定性的 Booked Basic Shipment 与历史 Issued Invoice。

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

| 类型         | 邮箱                               | 本地演示密码        | 登录后入口 |
| ------------ | ---------------------------------- | ------------------- | ---------- |
| 货代管理员   | `admin@demo.freight.local`         | `DemoAdmin!2026`    | `/admin`   |
| 货代销售     | `sales@demo.freight.local`         | `DemoAdmin!2026`    | `/admin`   |
| 货代操作     | `operation@demo.freight.local`     | `DemoAdmin!2026`    | `/admin`   |
| 货代财务     | `finance@demo.freight.local`       | `DemoAdmin!2026`    | `/admin`   |
| 客户管理员   | `customer@demo.freight.local`      | `DemoCustomer!2026` | `/portal`  |
| 客户普通用户 | `customer-user@demo.freight.local` | `DemoCustomer!2026` | `/portal`  |

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
- 导入模板采用中文表头并提供多条样例数据；一行一个箱型价格，相同运价编号的多行合并为一条 Rate 和多条 RatePrice。
- 已校验中文/英文兼容表头、必填列、币种、金额、有效期、状态、箱型重复、同一 Rate 航线一致性和租户内运价编号重复。
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
- “申请报价”已接入确认流程：客户必须核对方案并填写 1–999 的整数箱量，页面展示按计价单位计算的费用预估后再提交。

### 2.14 Quote 快照与状态机

- 已按批准 ERD 建立 Quote、QuoteItem、QuoteStatus、租户内月度业务编号和价格快照。
- 已实现客户报价创建、列表、详情、接受和拒绝接口，并确保客户响应不包含成本字段。
- Quote 创建接口要求箱量；海运费和 `PER_CONTAINER` 费用按箱量计算，`PER_BL` / `PER_SHIPMENT` 费用只计算一次，QuoteItem 保存数量、单价和金额快照。
- 已实现独立状态机：DRAFT → SENT → VIEWED → ACCEPTED/REJECTED；开放报价可转 EXPIRED，非法跳转由服务端拒绝。
- 客户侧将 DRAFT 显示为“待销售确认”；销售发送前禁止客户下载正式 PDF、接受或拒绝，避免将报价申请误认为正式报价。
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
- 已实现客户 Booking 列表、详情、Draft 编辑、提交和取消；后台实现列表、详情、退回补充、审核通过、提交 Carrier/Agent、拒绝和取消。
- 服务端已按 V1.1 强制执行 `DRAFT → SUBMITTED → REVISION_REQUIRED/APPROVED → BOOKING_SUBMITTED → BOOKED`，拒绝非法跳转。
- Booking 编号通过租户/月度计数器并发安全生成；常规 V1 服务流程限制一份 Quote 一次转单，数据层仍保留 Quote 1:N Booking。
- 已增加 Booking 权限、状态审计、重复转单保护、资料完整性校验、客户公司范围和跨租户负向测试。

### 2.16 SO Document 与 Shipment 建档

- 已建立独立 `Shipment`、`Document`、`ShipmentStatus` 和 `DocumentStatus` 数据模型及租户一致性数据库触发器。
- 后台仅允许对 `BOOKING_SUBMITTED` 或 `BOOKED` Booking 登记 SO；支持 PDF、PNG、JPEG，单文件最大 10 MB。
- SO 先写入 S3 兼容对象存储，再在数据库事务内创建 Document 和 BookingSoRecord；首次登记 SO 时将 Booking 更新为 `BOOKED` 并写入审计，数据库失败时清理孤儿对象。
- Document 保存对象 Key、原始文件名、MIME、大小、版本、上传者、客户可见性和状态；对象 Key 不作为授权边界。
- 客户下载前同时校验 tenant、customer scope、`customerVisible=true` 和 ACTIVE 状态；隐藏文件及跨租户 Document ID 不可下载。
- 后台可从已 `BOOKED` 且存在已发布 SO 的 Booking 创建 Basic Shipment，复制客户、航线、船司和 ETD 快照并生成租户内 Shipment 编号。
- 客户与后台 Booking 详情页均展示 SO 和 Shipment；下载通过带 Bearer Token 的 API 请求完成。
- DEMO 数据已经实际走通 Submitted → Approved → Booking Submitted → SO Registered/Published → Basic Shipment Created，并完成真实 MinIO 上传和客户下载验证。

### 2.17 Basic Shipment 后端

- Shipment 已按 PRD V1.1 收敛为 Basic Shipment，状态机调整为：CREATED → BOOKED → DEPARTED → IN_TRANSIT → ARRIVED → COMPLETED，非终态可受控取消。
- Booking 已登记并发布 SO 后创建 Shipment 的 V1.1 常规路径直接进入 BOOKED，避免客户看到没有业务意义的 Planned 阶段。
- 新增迁移 `20260902190000_basic_shipment_status_v11`，将历史 `PLANNED` 映射为 `CREATED`，将历史 `IN_PROGRESS` 映射为 `BOOKED`。
- 状态动作使用语义化端点，事务内同步写入系统 TrackingEvent 与包含 before/after 的 AuditLog。
- 已建立 Container 模型，支持柜号、箱型、封条、VGM 及提柜/进港/装船/卸船时间；柜号按批准格式校验。
- 已建立 append-oriented TrackingEvent 模型，支持事件类型、时间、地点、备注、来源和客户可见性；客户 API 自动过滤内部节点。
- Shipment 详情仍可聚合 Containers、Tracking Timeline 和 Documents，但这些能力在 V1.1 中不作为客户侧 P0 主任务继续扩展。
- 已实现 Shipment 的 DRAFT_BL/FINAL_BL/OTHER 上传、同类型递增版本、旧版本 SUPERSEDED、S3 对象清理和下载授权。
- Container/TrackingEvent 增加数据库租户一致性触发器；Shipment 文档版本增加租户内唯一约束。
- 新增 `shipment.manage`、`tracking.manage`、`document.manage` 权限，仅租户管理员、平台管理员和 Operation 默认拥有。

### 2.18 Basic Shipment 前端

- 已将后台与客户门户的 Shipment 模拟页面替换为真实 API 列表和详情，支持关键词、状态筛选及 loading、empty、error 状态。
- 后台详情支持维护船名航次、ETD/ETA、MBL/HBL 参考字段，新增 Container、追加客户可见/内部 TrackingEvent，并执行 Basic Shipment 状态动作。
- 后台保留 DRAFT_BL、FINAL_BL 和 OTHER 参考附件上传能力；V1.1 客户侧不再把 BL/完整单证作为 P0 任务暴露。
- 客户 Shipment 详情保持只读，只展示 Basic Shipment 摘要、船期时间和简化进度，不渲染资料维护、Container、完整 TrackingEvent、状态动作或文件上传控件。
- Booking 详情中的 Shipment 已链接至真实履约详情页。
- Web 生产构建改用独立 `.next-build`，不再覆盖 `next dev` 使用的 `.next` 缓存。

### 2.19 Playwright Shipment 自动化基线

- 根工作区已加入 Playwright 配置、Chromium 项目和可独立运行的 `test:e2e:shipment` 脚本。
- 自动化覆盖内部用户登录、真实 Shipment 列表/详情、维护控件，以及客户用户登录、客户范围列表、只读详情和敏感操作控件不存在。
- Shipment 用例只读取幂等 DEMO 数据，不执行状态变更、Container 新增、Tracking 写入或文件上传，支持重复运行。
- 本地运行通过环境变量传入 DEMO 密码；密码不写入源码、配置或测试报告。
- CI 已加入 migration、幂等 DEMO seed、Chromium 安装和 Shipment E2E，并在失败时保留截图、视频、trace 和 HTML 报告。

### 2.20 Invoice / Billing

- 已按批准 ERD 建立 Invoice、InvoiceLine 与 `DRAFT → ISSUED → CUSTOMER_CONFIRMED → PAID` 状态机，并支持受控 `VOID` 终止状态。
- 后台可从当前租户 Shipment 创建含多费用行的 Draft Invoice，费用行保存 charge code、说明、数量、单价、币种和公式计算金额；权威汇总使用 Prisma Decimal。
- 后台支持发布、作废和人工标记收款；客户只可查看本公司已发布账单并执行确认。
- Invoice 编号通过 tenant + yearMonth 计数器在事务内生成；创建和状态变化均写入 AuditLog。
- 已接入后台 `/admin/invoices` 与客户 `/portal/billing` 列表/详情页面，包含 loading、empty、error 和状态操作界面。
- 已通过数据库触发器、服务端 tenant/customer scope 与负向集成测试验证跨租户访问失败。

### 2.21 Notification 基础切片

- 已建立 Notification、EMAIL/IN_APP 渠道及 PENDING/SENT/FAILED 状态，保存收件人、事件类型、payload、尝试次数、发送/失败/已读时间与错误摘要。
- 已增加 Notification 与 User 的数据库租户一致性触发器，防止跨租户收件人绑定。
- 已实现当前用户站内通知列表与已读接口：`GET /api/v1/notifications`、`POST /api/v1/notifications/:id/read`。
- Invoice 发布会在同一数据库事务中为目标客户的 ACTIVE 用户创建站内与邮件通知；邮件任务按 Notification ID 幂等入 BullMQ，配置 3 次指数退避。
- Worker 会在发送前重新校验 tenant + notification ID，记录尝试次数、成功或失败状态；本地开发提供显式 `EMAIL_DELIVERY_MODE=log`。
- Invoice 数据库集成测试已验证发布 Invoice 后生成一条站内和一条邮件通知。

### 2.22 Invoice 附件闭环

- Document 已增加明确的 Invoice 关联；数据库约束要求每个 Document 必须且只能归属 Booking、Shipment 或 Invoice 之一。
- 已增加 Invoice 与 Document 的租户一致性触发器，阻止跨租户附件绑定。
- 后台可为 Invoice 上传 PDF、PNG、JPEG 附件，单文件最大 10 MB；新版本会将旧版本标记为 SUPERSEDED。
- Invoice 附件固定为客户可见，客户仅能在本公司已发布账单范围内列出和下载有效版本。
- 后台和客户 Invoice 详情页均已显示附件；后台支持上传新版本，下载继续复用统一 Document 授权路径并记录审计。
- 数据库集成测试已覆盖附件创建、客户范围读取和跨租户下载拒绝。

### 2.23 越权访问安全审计

- 统一 API 异常边界会对已认证用户访问 Customer、Rate、Quote、Booking、Shipment、Document、Invoice 时产生的 403/404 记录 `ACCESS_DENIED`。
- 安全审计归属于发起请求的 tenant 和 user，不查询或暴露被猜测对象所属租户。
- 审计保存实体类型、目标 ID、HTTP 状态、错误码、方法、路径、request ID、IP 与 User-Agent；不保存请求正文、Token 或文件内容。
- 未认证请求和非敏感公共路径不会写入租户安全审计；审计写入失败会记录结构化错误，但不替换原始 API 响应。
- 单元测试覆盖跨租户风格的 Invoice ID 探测以及未认证请求不写审计。

## 3. 已完成验证

> 2026-08-31 复核说明：当天 `pnpm lint` 与 `pnpm typecheck` 通过。完整 `pnpm test` 因本地 PostgreSQL `localhost:5433` 未运行而在数据库初始化阶段中止；下列 API/Worker/E2E 通过数量是 2026-08-30 及此前已保存的验证基线，不代表 2026-08-31 已重新全量通过。详见 [2026-08-31 代码与测试审阅报告](./TEST_REPORT_2026-08-31_CN.md)。

- ESLint：通过。
- TypeScript typecheck：通过。
- Next.js / NestJS 生产构建：通过。
- API 自动化测试：19 个测试套件、65 个测试全部通过；Worker：3 个测试套件、5 个测试全部通过。
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
- 浏览器验收基线已覆盖后台 Shipment 列表/详情、维护控件，以及客户 Shipment 列表/只读详情与敏感操作控件隐藏；V1.1 调整后需重跑 Playwright。
- Playwright Shipment E2E：2 个 Chromium 用例全部通过。
- 数据库集成测试已覆盖 Quote 原子转 Booking、重复转单、Booking 完整性、状态机、SO 可见性、隐藏文件、跨租户下载拒绝和 Shipment 建档。
- Invoice 状态机与数据库集成测试共 2 个测试套件、3 个测试通过，覆盖 Decimal 汇总、费用行字段、完整状态流、审计和跨租户/跨客户读取拒绝。
- Playwright Invoice/Billing E2E：后台财务操作与客户只读/确认权限共 2 个 Chromium 用例通过；连同 Shipment 共 4 个用例串行稳定通过。
- Playwright 完整套件：黄金路径 1 项加 Shipment/Invoice 冒烟 4 项，共 5 个 Chromium 用例串行通过。
- 真实本地依赖验收已覆盖 MinIO SO 上传、客户授权下载及客户 Shipment 列表读取。

## 4. 当前未完成事项与风险

- Dashboard、通用 Documents 等页面仍有模拟数据或占位内容；Rate、Quote、Booking、SO、Shipment 和 Invoice/Billing 已接入真实 API。
- 通用 permission decorator / guard 已实现，但完整权限矩阵和其他业务模块的敏感操作权限仍需逐模块落地。
- 前端仍缺少组件测试；Playwright 已覆盖 Shipment、Invoice 冒烟及完整核心黄金路径。
- 忘记密码和重置密码尚未实现。
- 登录失败审计、账号锁定策略、CSP 和更完整的 Security Headers 尚未完成。
- `RateCharge` V1 规则已确认并实现；仍需在 Rate UAT 中用真实费用样本复核。
- Quote 发送邮件通知按批准路线图属于 M5 Notifications，本阶段不提前建立完整通知域。
- Notification 已接通 Invoice 发布事件与本地 log transport；真实 SMTP/邮件服务商、通知中心 UI、Quote/Booking/Shipment 事件仍未完成。
- 历史 V1.0 中 Invoice 附件、越权拒绝安全日志及完整黄金路径 Playwright 已完成；V1.1 主链路仍需重新完成业务 UAT 签署。
- 仓库 `build` 脚本已使用 `.next-build` 隔离生产构建；自定义 Next.js 构建命令仍应显式设置独立 `NEXT_DIST_DIR`。
- Shipment 后端、前端和冒烟 E2E 已按 V1.1 Basic Shipment 口径更新；仍需重跑 Prisma Client 生成、数据库迁移和 Playwright。
- Invoice、BL 和复杂 Tracking 已从 V1.1 P0 移出；已有实现需作为历史能力冻结，避免继续扩大试点范围。

## 5. 下一步开发计划

V1.1 主链路为 Rate → Quote → Booking → SO → Basic Shipment。当前先完成主链路业务 UAT，再进入 Email/Deep Link、Dashboard 待办、Notifications 与 Branding；Invoice、完整 BL、复杂 Tracking 进入 Backlog。

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

### 5.4 Booking → SO → Basic Shipment

- [x] 完成 Booking 提交、审核、确认、拒绝和取消状态动作。
- [x] SO 上传至 S3 兼容对象存储并通过 Document 元数据授权客户下载。
- [x] 登记 SO 后进入 `BOOKED`，SO 发布动作独立控制客户可见性。
- [x] 从已发布 SO 的 Booking 创建 Basic Shipment 并复制航线快照。
- [x] Shipment 状态机已按 PRD V1.1 更新为 CREATED/BOOKED/DEPARTED/IN_TRANSIT/ARRIVED/COMPLETED。
- [x] 覆盖隐藏文件、跨租户文件访问和 Shipment 租户一致性测试。
- [ ] 按 [Booking/SO/Shipment 阶段验收清单](./Booking_SO_Shipment_Acceptance_Checklist_V1_CN.md) 完成业务验收。

### 5.5 自动化验收

- [x] 建立 Playwright 浏览器测试基线，并接入 CI 失败证据留存。
- [x] 固化后台/客户 Shipment 列表、详情、维护权限与只读权限冒烟路径。
- [ ] 按 PRD V1.1 重定并固化 Rate → Quote → Booking → SO → Basic Shipment 黄金路径。
- [x] 历史黄金路径曾覆盖 Rate → Quote → Booking → SO → Shipment → 两个 Container → Tracking → BL → Invoice → 附件 → 客户确认；该路径不再代表 V1.1 P0 范围。
- [x] 在 CI 中保留失败截图、trace、视频和 HTML 报告。

### 5.6 Invoice / Billing

- [x] 建立 Invoice、InvoiceLine、Decimal 汇总、租户约束和业务编号迁移。
- [x] 完成后台创建/发布/作废/标记收款及客户查看/确认。
- [x] 完成状态机、审计、跨租户数据库测试及后台/客户 Playwright E2E。
- [x] 将全量 Playwright E2E 接入 CI，并通过串行执行避免触发认证限流。
- [ ] 按 [Invoice/Billing 阶段验收清单](./Invoice_Billing_Acceptance_Checklist_V1_CN.md) 完成业务 UAT 与签署。

### 5.7 Notifications 与 Branding

- [x] 建立 Notification 持久化、租户约束、站内列表/已读 API 和 BullMQ 邮件任务基线。
- [x] Invoice 发布事件生成站内与邮件 Notification message log。
- [ ] 接入批准的生产邮件传输并验证重试、失败恢复和投递日志。
- [ ] 接入 Quote、Booking 与 Shipment 的批准通知事件。
- [ ] 完成通知中心前端与未读状态。
- [ ] 完成租户品牌名、Logo、主色和自定义域名配置。

## 6. 后续里程碑

当前后续里程碑：

1. Rate/Quote、Booking/SO/Shipment 与 Invoice/Billing 业务 UAT。
2. Notifications 和 Branding。
3. 安全、可观测性、备份恢复与试点加固。
