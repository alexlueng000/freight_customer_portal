# 多货物报价及后续流程改造方案

## 1. 背景

实际报价业务中，客户在向销售申请正式报价时，已经需要提供货物信息，并说明需要货代办理的头程物流、清关和尾程物流等服务。一张报价申请可能同时包含多种货物，因此货物不能继续建模为 Quote 或 Booking 上的一组单值字段。

本次调整后的业务主链为：

```text
Rate
→ Quote Request（多货物 + 委托服务）
→ Sales Review（核价 + 服务范围确认）
→ Official Quote
→ Customer Accept
→ Booking Draft（继承报价需求）
→ Customer 补充履约资料
→ Operation Review
→ Booking Execution
→ Shipment
```

本方案聚焦多货物报价对 Quote、Booking 和 Shipment 主链的影响，不扩展为通用工作流、复杂价格规则或完整门到门 ERP。

## 2. 与现有基线的关系

V1.1 PRD 原定在 Accepted Quote 创建 Booking 后，由客户补充 Commodity、Package、Gross Weight、Dangerous Goods 和 Special Instructions。

根据 2026-09-06 的实际业务反馈，调整为：

- Quote Request 阶段提前收集报价必需的货物信息和委托服务；
- Booking 阶段继承 Quote 信息，仅补充或确认履约所需资料；
- 不要求客户在 Booking 重复录入 Quote 已经提供的数据；
- Quote 与 Booking 分别保存快照，不能共用同一条可变记录。

当前任务要求优先于原 PRD 中“货物信息仅在 Booking 阶段补录”的描述。该差异应在后续 PRD 修订时正式合并。

## 3. 核心产品原则

### 3.1 报价需求与履约资料分层

Quote Cargo 表达销售核价所依据的客户需求；Booking Cargo 表达实际订舱执行所依据的最终资料。

两者需要关联，但生命周期不同：

```text
QuoteCargoItem（报价需求快照）
→ BookingCargoItem（订舱履约快照）
→ Shipment Cargo Allocation（后续确有拆票需求时再引入）
```

### 3.2 已知数据不重复填写

Booking 创建时必须自动继承：

- 多条货物的品名、毛重和特殊要求；
- 发货地、收货地；
- 已确认的委托服务；
- POL、POD、Carrier、Service、ETD、箱型和箱量；
- 来源 Quote 编号及版本。

### 3.3 快照不可被上游静默修改

Booking 创建后，即使 Quote 后续生成新版本，也不能自动覆盖已经创建的 BookingCargoItem。需要重新报价时，应通过明确的业务动作建立新 Quote 或重新确认，而不是直接修改历史快照。

### 3.4 租户隔离贯穿明细表

QuoteCargoItem 和 BookingCargoItem 都必须包含 `tenantId`。所有查询、创建、更新、复制和差异比较必须同时校验 tenant、customer company 和父对象归属。

## 4. Quote Request 改造

### 4.1 客户填写内容

每张 Quote Request 至少包含一条货物，最多 50 条。

每条货物填写：

- `commodity`：货物品名，必填；
- `grossWeightKg`：毛重，必填且大于 0；
- `specialRequirements`：该货物特殊要求，选填。

Quote 级填写：

- `pickupAddress`：发货地；勾选头程物流后必填；
- `deliveryAddress`：收货地；勾选尾程物流后必填；
- `requestedServices`：需要货代办理的服务，可多选。

V1 委托服务代码：

```text
ORIGIN_LOGISTICS
ORIGIN_CUSTOMS_CLEARANCE
DESTINATION_CUSTOMS_CLEARANCE
DESTINATION_LOGISTICS
```

### 4.2 页面交互

货物信息区右上角显示“添加货物”按钮。

每条货物使用独立卡片展示：

```text
货物 1                                      [删除]
货物品名                    毛重 kg
特殊要求
```

交互规则：

- 默认创建一条空货物；
- 点击“添加货物”在列表末尾新增一条；
- 每条货物可以单独删除；
- 只剩一条时禁用删除，避免提交空货物列表；
- 校验错误定位到具体货物和具体字段；
- 提交期间禁用添加、删除和重复提交；
- 移动端按单列排列，桌面端品名和重量可双列排列。

### 4.3 当前数据模型

Quote 保存整体服务需求，QuoteCargoItem 保存逐条货物：

```text
Quote
├─ pickupAddress
├─ deliveryAddress
├─ requestedServices[]
└─ cargoItems: QuoteCargoItem[]

QuoteCargoItem
├─ id
├─ tenantId
├─ quoteId
├─ commodity
├─ grossWeightKg
├─ specialRequirements
├─ sortOrder
└─ createdAt
```

QuoteCargoItem 是报价需求快照，不承担计费行职责。费用仍保存在 QuoteItem，禁止把货物明细与费用明细合并为一个通用 Item。

## 5. Sales Quote Review 改造

销售审核正式报价时，应同时看到：

- 每条货物的品名、毛重和特殊要求；
- 合计毛重；
- 发货地和收货地；
- 客户勾选的全部委托服务；
- 当前 QuoteItem 已覆盖的费用；
- 尚未定价或明确不包含的服务。

### 5.1 委托服务范围状态

客户勾选服务不代表该服务已经计入报价。建议为每项委托服务增加明确处理状态：

```text
REQUESTED             客户已提出，销售尚未处理
QUOTED                已报价并存在对应 QuoteItem
PENDING_CONFIRMATION  暂时无法定价，正式报价中明确待确认
NOT_INCLUDED          明确不包含在本次报价范围
```

正式发送前，所有客户请求的服务必须有处理结果，不能停留在 `REQUESTED`。

### 5.2 销售动作

建议销售审核页提供：

```text
[退回补充需求]
[保存审核信息]
[确认并发送客户]
```

“退回补充需求”需要记录原因并通知提交客户。V1 可以先将 Quote 保持在 DRAFT，并增加需求补充标记；是否新增独立状态应在状态机评审后决定，避免临时扩充枚举。

### 5.3 正式报价发送校验

发送前至少校验：

- 至少一条有效货物；
- 每条货物品名和毛重完整；
- 勾选头程/尾程物流时地址完整；
- 客户请求的服务均已被销售明确处理；
- 至少存在一条报价费用；
- 报价有效期合法；
- 多币种口径符合现有 Quote 规则。

## 6. Quote PDF 改造

正式报价 PDF 应增加两个区块。

### 6.1 货物摘要

逐条显示：

- 序号；
- 货物品名；
- 毛重；
- 特殊要求。

同时显示合计毛重。货物过多时表格允许自然分页并重复表头。

### 6.2 服务范围

逐项显示：

- 客户请求的服务；
- 是否已报价；
- 对应费用项或“待确认 / 不包含”；
- 发货地和收货地。

PDF 不应让客户误解“已勾选”等同于“已包含在报价总额”。

## 7. Quote → Booking 改造

### 7.1 Booking 创建

只有 Accepted Quote 可以创建 Booking。创建必须在一个数据库事务中完成：

1. 校验 Quote 属于当前 tenant 和 customer company；
2. 校验 Quote 状态为 ACCEPTED 且未创建 Booking；
3. 创建 Booking 快照；
4. 复制 QuoteCargoItem 为 BookingCargoItem；
5. 复制已确认的委托服务和地址；
6. 创建箱量需求；
7. 写入 AuditLog；
8. 将 Quote 转为 BOOKED 或按现有原子流程更新。

任一步失败必须整体回滚。

### 7.2 BookingCargoItem 建议模型

```text
BookingCargoItem
├─ id
├─ tenantId
├─ bookingId
├─ sourceQuoteCargoItemId
├─ commodity
├─ packageCount
├─ packageType
├─ grossWeightKg
├─ volumeCbm
├─ isDangerousGoods
├─ dangerousGoodsInfo
├─ specialInstructions
├─ sortOrder
├─ createdAt
└─ updatedAt
```

`sourceQuoteCargoItemId` 用于差异追溯，复制后的字段仍是独立快照。

### 7.3 Booking 页面信息架构

Booking Draft 页面分为：

#### A. 报价已确认信息

- 来源 Quote；
- 航线、Carrier、Service、ETD；
- 箱型和箱量；
- 已确认服务范围；
- 报价金额摘要。

#### B. 货物履约资料

按 QuoteCargoItem 生成多条 BookingCargoItem，客户补充：

- 件数；
- 包装类型；
- 体积；
- 危险品标记和资料；
- Booking 阶段新增的操作说明。

#### C. 通用订舱资料

- Cargo Ready Date；
- Shipper；
- Booking Contact。

Quote 已经提供的品名、毛重和特殊要求默认带入，不要求客户重新输入。

## 8. Booking 货物变更规则

### 8.1 普通补充

以下内容属于履约补充，不触发重新报价：

- 包装类型；
- 件数；
- 体积；
- 联系人；
- Shipper；
- 不改变服务范围的一般操作备注。

### 8.2 商务实质变化

以下变化可能影响价格或承运条件：

- 新增或删除货物；
- 修改货物品名；
- 修改毛重；
- 普货变为危险品；
- 新增头程、清关或尾程服务；
- 修改影响服务报价的发货地或收货地。

V1 建议采用保守规则：发生任一实质变化时，将 Booking 标记为 `quoteReconfirmationRequired = true`，在销售确认前不允许客户提交订舱。

暂不建设复杂阈值规则或通用差异引擎。后续有真实业务数据后，再决定重量变化多少可以免于重新确认。

### 8.3 重新确认流程

```text
Booking Draft 修改实质字段
→ 标记需重新确认价格
→ Sales 查看差异
→ 确认原报价仍有效 或 创建新 Quote
→ 客户重新接受（仅价格或范围变化时）
→ Booking 继续提交
```

是否允许 Sales 直接确认“原报价仍有效”而不生成 Quote 新版本，需要产品和审计规则进一步确认。

## 9. Operation Review 改造

操作审核页需要并排或分区展示：

- Quote 原始货物快照；
- Booking 当前货物资料；
- 新增、删除和修改差异；
- Quote 已确认服务范围；
- Booking 实际要求执行的服务。

操作重点检查：

- 箱量与总重量是否合理；
- 每条货物包装、件数和体积是否完整；
- 是否新增危险品；
- 危险品资料是否完整；
- 是否存在未报价服务；
- 发货地和收货地是否满足执行要求；
- Cargo Ready Date 是否满足 ETD；
- 是否仍处于需销售重新确认状态。

存在未完成的商务重新确认时，Operation 不得审核通过。

## 10. Shipment 阶段

V1 默认一个 Booking 创建一个 Shipment 时，Shipment 可以读取已确认的 BookingCargoItem 展示货物信息，不立即新增 ShipmentCargoItem。

只有出现以下真实需求后，再引入 Shipment 级货物分配：

- 一个 Booking 拆分多个 Shipment；
- 部分货物分批出运；
- 不同货物分配到不同 Container；
- Shipment 层需要独立舱单或单证数据。

在这些需求出现前，不建立通用货物分配引擎。

## 11. Invoice 和 Document 影响

### 11.1 Invoice

V1 Invoice 仍按 Quote、Booking 或 Shipment 的费用项展示，不按货物明细拆分计费。只有真实业务要求按货物计费时，再增加 QuoteItem 与 CargoItem 的关联。

### 11.2 Document

Document 继续关联 Booking 或 Shipment。V1 不要求每个文件关联到单条货物，避免增加无必要的文件权限复杂度。

## 12. 通知与审计

### 12.1 通知

建议覆盖：

- 客户提交多货物报价申请；
- 销售退回补充需求；
- 客户重新提交；
- 正式报价已发送；
- Booking 货物变化需要重新确认；
- 销售确认原报价仍有效或发出新报价。

### 12.2 审计

至少记录：

- QuoteCargoItem 创建、增加、删除和修改；
- 客户请求服务变化；
- 服务范围处理结果；
- Quote → Booking 货物复制；
- BookingCargoItem 实质变化；
- 触发和解除价格重新确认；
- 操作人、时间、tenant、父对象及必要的 before/after。

## 13. API 调整建议

### 13.1 创建 Quote

```http
POST /api/v1/quotes
```

请求示例：

```json
{
  "rateId": "rate-id",
  "containerType": "40HQ",
  "quantity": 1,
  "cargoItems": [
    {
      "commodity": "家具",
      "grossWeightKg": 18000,
      "specialRequirements": "防潮"
    },
    {
      "commodity": "服装",
      "grossWeightKg": 2500
    }
  ],
  "pickupAddress": "上海市……",
  "deliveryAddress": "Jakarta……",
  "requestedServices": ["ORIGIN_LOGISTICS", "ORIGIN_CUSTOMS_CLEARANCE", "DESTINATION_LOGISTICS"]
}
```

### 13.2 Booking Cargo

建议使用面向明细的资源接口或随 Booking Draft 一次性保存，禁止提供绕过父 Booking 权限校验的通用更新接口。

示例：

```http
PUT /api/v1/bookings/:id/cargo-items
```

服务端必须校验 Booking 仍可编辑、属于当前 tenant/customer，并在实质变化时自动设置重新确认标记。

## 14. 数据迁移策略

### 14.1 Quote

新增 QuoteCargoItem 表。历史 Quote 没有货物明细时返回空列表，并在详情页显示“历史报价未填写货物明细”，不构造虚假数据。

### 14.2 Booking

新增 BookingCargoItem 后，对历史 Booking 的处理建议：

- 若旧 Booking 有单值 commodity、grossWeight 等字段，则迁移为一条 BookingCargoItem；
- 保留旧字段一个兼容版本周期，仅用于回滚和核对；
- 完成数据校验与所有调用方切换后，再通过独立破坏性迁移删除旧字段；
- 不修改已经应用的共享迁移。

### 14.3 回滚

第一阶段只做新增表和新增读取路径，不删除旧 Booking 字段，因此可通过关闭新页面入口回滚应用行为。删除旧字段必须有单独迁移计划。

## 15. 测试要求

### 15.1 单元测试

- 至少一条、最多 50 条货物校验；
- 每条货物品名和重量校验；
- 地址条件校验；
- 服务范围状态完整性；
- Booking 实质变化判断；
- Quote 与 Booking 差异计算。

### 15.2 集成测试

- 多条 QuoteCargoItem 在一个事务内创建；
- 创建 Booking 时完整复制多条货物且顺序不变；
- 任一复制失败时 Booking 和货物全部回滚；
- 客户不能访问同租户其他 CustomerCompany 的 CargoItem；
- Tenant A 不能读取或修改 Tenant B 的 CargoItem；
- 修改 BookingCargoItem 后正确触发重新确认和 AuditLog；
- 历史 Quote 空货物列表兼容。

### 15.3 E2E

```text
客户查价
→ 添加两种货物
→ 勾选头程和清关服务
→ 提交报价申请
→ 销售查看货物并确认服务范围
→ 发送正式报价
→ 客户接受
→ 创建 Booking
→ 两种货物自动继承
→ 客户补充各自包装与体积
→ Operation 审核通过
```

负向路径至少覆盖：

- 空货物列表；
- 第二条货物缺少重量；
- 勾选头程但未填写发货地；
- 请求服务未处理就发送报价；
- Booking 新增货物后绕过销售确认；
- 跨客户和跨租户访问货物明细。

## 16. 分阶段实施计划

### 阶段 A Quote 多货物基础

- QuoteCargoItem 模型和迁移；
- 客户添加、删除多条货物；
- Create Quote API 校验和事务保存；
- 客户及销售 Quote 详情展示；
- 审计和基础测试。

### 阶段 B 销售服务范围确认

- 委托服务处理状态；
- 销售退回补充；
- 正式报价发送前校验；
- Quote PDF 服务范围和多货物摘要；
- 通知。

### 阶段 C Booking 多货物继承

- BookingCargoItem 模型；
- Quote → Booking 原子复制；
- Booking 多货物补充页面；
- 历史 Booking 数据迁移；
- 继承和租户隔离测试。

### 阶段 D 变更与审核闭环

- 实质变化识别；
- 报价重新确认标记；
- Sales 差异确认；
- Operation 差异展示和阻断规则；
- 完整 E2E 回归。

## 17. 待确认产品决策

实施阶段 B 和阶段 D 前，需要确认：

1. 客户请求的服务是否允许以“待确认价格”状态发送正式报价。
2. Quote Request 被销售退回时，是保留 DRAFT 并加标记，还是新增独立状态。
3. Booking 修改重量时是否任何变化都触发重新确认，还是允许配置容差。
4. Booking 出现实质变化后，是销售确认原 Quote 继续有效，还是必须创建 Quote 新版本并由客户重新接受。
5. 多种货物是否可能分别对应不同箱型或不同集装箱；V1 建议暂不支持。
6. 特殊要求是仅保持每条货物级，还是还需要一份 Quote 级通用备注。

在这些决策确定前，采用最小可逆实现：保存完整快照、记录差异、阻止未经确认的实质变化继续进入 Operation，不引入通用规则引擎。

## 18. 验收标准

1. 客户可以在 Quote Request 中添加、编辑和删除多种货物，并至少保留一条。
2. 每条货物独立保存品名、毛重、特殊要求和排序。
3. 客户和销售只能在授权 tenant/customer 范围内查看货物。
4. 销售能清楚看到多货物、总重量、委托服务及其报价覆盖情况。
5. Accepted Quote 创建 Booking 后，多条货物无损继承且不要求客户重复录入。
6. Booking 的履约补充不会修改历史 QuoteCargoItem。
7. 实质货物或服务变化会阻止 Booking 未经销售确认继续提交。
8. Quote PDF 明确展示多货物和服务包含范围。
9. 相关 TypeScript、Lint、单元、集成和 E2E 测试全部通过。
