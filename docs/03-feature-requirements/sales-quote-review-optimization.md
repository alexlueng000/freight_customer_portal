# Sales Quote Review 销售报价审核页优化需求

## 1. 背景

当前销售端已经具备以下基本流程：

```text
客户基于 Rate 提交 Quote Request
↓
Quote 状态 = PENDING_REVIEW
↓
销售进入 Quote Detail
↓
查看价格
↓
手工调整价格
↓
发送客户
```

现有页面主骨架正确，但当前仍存在几个关键问题：

1. 页面核心语义偏向「销售手工改价」，但销售真正的主任务应是「审核并发送报价」。
2. 已展示成本，但未计算总成本、预计毛利、毛利率，销售无法快速判断报价质量。
3. 费用表缺少计费单位，后续 `PER_CONTAINER / PER_BL / PER_SHIPMENT` 无法正确表达。
4. 缺少 Rate 来源、Supplier、Contract 等内部追溯信息。
5. 「标记过期」不符合状态语义，Quote 过期应由系统自动判断。
6. `PENDING_REVIEW` 状态下不应该直接下载正式 PDF。
7. 销售当前只能修改已有费用，后续应支持新增 / 删除报价费用。
8. 缺少客户可见 Terms 与内部改价原因的区分。
9. Quote Valid Until 应允许销售调整，但不能无规则超过 Rate Validity。

本次目标不是推翻页面，而是把现有销售处理页面升级为真正可用的：

> **Quote Review / Pricing Review / Send Quote 工作台**

---

# 2. 核心产品定位

销售进入此页面时，主任务应定义为：

```text
审核报价
→ 检查 Rate 来源
→ 检查成本与利润
→ 必要时调整报价
→ 补充报价条款
→ 预览
→ 确认并发送客户
```

因此页面主标题和操作逻辑不应围绕：

```text
销售手工改价
```

而应围绕：

```text
报价审核
```

---

# 3. 页面状态设计

Quote 初始状态：

```text
PENDING_REVIEW
```

中文：

```text
待销售确认
```

在该状态下：

- 可以查看价格
- 可以查看成本
- 可以调整价格
- 可以修改 Quote Valid Until
- 可以补充客户条款
- 可以作废
- 可以预览报价
- 可以确认并发送

发送后：

```text
PENDING_REVIEW
→ SENT
```

---

# 4. 页面结构建议

整个销售审核页建议拆成 4 个主要区块：

```text
1. Quote Header
2. Transport / Rate Summary
3. Pricing Review
4. Terms & Internal Information
```

---

# 5. Quote Header

页面顶部至少展示：

```text
Quote Number
QT202608000001

Customer
Northstar Trading Co., Ltd.

Route
CNSZX → USNYC

Container
2 × 40HQ

Status
待销售确认
```

建议主要操作：

```text
预览报价
调整报价
作废
确认并发送
```

不要继续使用：

```text
标记过期
```

---

# 6. Quote 过期 / 作废状态

## 6.1 EXPIRED

Quote 过期应该由系统自动判断：

```text
current_time > quote.valid_until
→ EXPIRED
```

销售不需要手工点击「标记过期」。

---

## 6.2 CANCELLED

如果销售主动停止一个 Quote：

按钮：

```text
作废
```

状态：

```text
CANCELLED
```

建议操作时要求填写：

```text
作废原因
```

例如：

```text
客户取消需求
Rate 已撤回
舱位不可用
内部错误报价
其他
```

---

# 7. Transport / Rate Summary

建议展示：

```text
Carrier
MAEU

Service
Pacific Express

POL
CNSZX

POD
USNYC

ETD
2026-09-05

Transit Time
16 Days

Routing
Direct / Via XXX

Free Time
14 DEM + 7 DET

Rate Valid Until
2026-09-06
```

---

# 8. Quote Valid Until

Quote Valid Until 应允许销售调整。

例如：

```text
Rate Valid Until
2026-09-10

Quote Valid Until
[2026-09-06]
```

V1 规则建议：

```text
Quote Valid Until <= Rate Valid Until
```

如果销售尝试超过 Rate Validity：

```text
该报价有效期不能超过来源运价有效期。
```

如未来存在特殊权限，可另做 Override。

---

# 9. Pricing Review

当前页面已有：

```text
成本快照
销售单价
金额
```

这一结构应保留。

但需要增加：

```text
计费方式
计费数量
```

最终建议表格：

| 费用 | 计费方式 | 计费数量 | 成本单价 | 销售单价 | 金额 |
|---|---|---:|---:|---:|---:|
| Ocean Freight | /40HQ | 2 | CNY 1,500 | CNY 3,000 | CNY 6,000 |
| ISPS | /40HQ | 2 | CNY 400 | CNY 400 | CNY 800 |
| AMS | /B/L | 1 | USD 25 | USD 35 | USD 35 |

---

# 10. Charge Unit

费用必须支持：

```text
PER_CONTAINER
PER_BL
PER_SHIPMENT
```

页面可以显示为：

```text
/40HQ
/B/L
/Shipment
```

不要所有费用都显示为：

```text
数量 = Container Quantity
```

例如：

```text
2 × 40HQ
```

但：

```text
AMS / B/L
```

计费数量应该是：

```text
1
```

---

# 11. 成本 / 毛利 / 毛利率

这是销售审核页 P0。

如果当前报价：

```text
Ocean Freight
Cost 1500 × 2 = 3000
Sell 3000 × 2 = 6000

ISPS
Cost 400 × 2 = 800
Sell 400 × 2 = 800
```

系统应计算：

```text
总成本
CNY 3,800

报价总额
CNY 6,800

预计毛利
CNY 3,000

毛利率
44.12%
```

计算公式：

```text
Gross Profit = Sell Total - Cost Total

Gross Margin % =
Gross Profit / Sell Total × 100%
```

---

# 12. 多币种毛利

如果费用存在多币种：

```text
USD
CNY
EUR
```

V1 不允许直接跨币种汇总利润。

应分别展示：

```text
USD
Cost USD 2,100
Sell USD 2,400
Profit USD 300

CNY
Cost CNY 800
Sell CNY 1,200
Profit CNY 400
```

除非系统已经存在：

```text
Tenant Base Currency
Exchange Rate
Exchange Rate Date
Conversion Rule
```

否则不得计算统一毛利率。

---

# 13. 调整报价模式

默认页面不应该直接进入可编辑状态。

默认：

```text
报价审核
```

点击：

```text
调整报价
```

后进入编辑模式。

编辑模式建议：

```text
费用              原销售价       修改后销售价

Ocean Freight
CNY 3,000         [3000]

ISPS
CNY 400           [400]
```

修改价格后必须填写：

```text
改价原因 *
```

---

# 14. 改价原因

改价原因属于内部信息。

示例：

```text
客户 VIP 折扣
市场价调整
竞争报价匹配
临时促销
客户议价
Rate 录入错误修正
其他
```

必须记录：

```text
Old Price
New Price
Reason
Changed By
Changed At
```

---

# 15. 客户可见条款与内部原因必须分离

页面需要两个完全不同的数据区域。

## 15.1 Internal Adjustment Reason

仅内部可见：

```text
改价原因
```

绝对不能进入客户 PDF。

---

## 15.2 Customer Visible Terms

正式报价可见：

```text
报价条款 / 客户备注
```

示例：

```text
Subject to space and equipment availability.
General cargo only.
Destination local charges excluded.
Rate valid until 2026-09-06.
```

---

# 16. Rate 来源

销售审核页必须能追溯 Quote 来源。

建议展示：

```text
Rate Source
RATE-SZX-NYC-00018

Supplier
Pacific Ocean Logistics

Contract No.
MAEU-CNUS-2609

Rate Valid From
2026-08-31

Rate Valid To
2026-09-06
```

Rate Number 应支持点击跳转：

```text
Quote Detail
→ Rate Detail
```

---

# 17. Supplier 与 Contract

Supplier / Contract 不属于客户侧信息，但属于销售审核关键数据。

销售需要知道：

```text
这个成本从谁那里来的？
这个报价用了哪个合约？
出了问题找谁？
```

因此内部页面必须显示。

---

# 18. 添加 / 删除报价费用

当前只支持修改已有费用。

P1 应支持：

```text
+ 添加费用
```

例如销售临时增加：

```text
DOC CNY 450 / B/L
AMS USD 35 / B/L
PSS USD 100 / Container
Handling CNY 300 / Shipment
```

新增费用至少包含：

```text
Charge Name
Cost
Sell
Currency
Charge Unit
Applicable Container
Customer Visible
```

---

# 19. 删除费用

销售可删除：

- 非必须费用
- 错误导入费用
- 本次客户不适用费用

但删除必须保留 Audit Log：

```text
Charge Removed
Charge Name
Old Amount
Removed By
Removed At
Reason
```

---

# 20. PDF 行为

## PENDING_REVIEW

不要提供：

```text
下载正式 PDF
```

建议改为：

```text
预览报价
```

如果允许下载：

```text
下载草稿 PDF
```

草稿 PDF 必须明显显示：

```text
DRAFT
未正式发送
```

---

## SENT

销售点击：

```text
确认并发送
```

后：

```text
Quote Status = SENT
```

此时再生成正式 PDF。

正式 PDF 不应展示：

- Cost
- Supplier
- Internal Margin
- Adjustment Reason
- Internal Notes

---

# 21. 确认发送

销售点击：

```text
确认并发送
```

建议弹出最终确认框。

示例：

```text
发送正式报价

客户
Northstar Trading Co., Ltd.

航线
CNSZX → USNYC

箱量
2 × 40HQ

报价总额
CNY 6,800

有效期至
2026-09-06

发送后客户将可以查看、下载并接受该报价。

[取消] [确认发送]
```

---

# 22. 发送后行为

确认发送后：

```text
PENDING_REVIEW
→ SENT
```

记录：

```text
sent_at
sent_by
```

并生成：

```text
Official Quote PDF
```

客户门户：

```text
Quotes
→ Quote Detail
```

立即可见。

---

# 23. 销售发送前校验

发送前必须校验：

```text
Quote Status = PENDING_REVIEW
Valid Until >= Today
至少存在 1 条报价费用
销售价格 >= 0
Container Quantity > 0
```

如果来源 Rate 已变化，可显示 Warning，但 Quote 已有 Snapshot 时不应静默覆盖历史 Quote。

---

# 24. Margin Warning

V1 可以先做提示，不做审批。

例如：

```text
Gross Margin < 10%
```

显示：

```text
⚠ 当前毛利率低于 10%
```

但仍允许有权限的销售发送。

以后再扩展：

```text
Margin Approval Workflow
```

---

# 25. Audit Log

至少记录：

```text
Quote Created
Quote Price Edited
Charge Added
Charge Removed
Quote Validity Changed
Quote Previewed
Quote Sent
Quote Cancelled
Quote Expired
```

改价日志：

```text
Old Sell Price
New Sell Price
Reason
User
Timestamp
```

---

# 26. 权限

客户绝对不能看到：

```text
Cost
Supplier
Contract Cost
Margin
Margin %
Internal Adjustment Reason
Internal Notes
```

销售 / 运营内部页面可以看到。

后端 API 不能只依赖前端隐藏字段，必须按 Role 做权限过滤。

---

# 27. 推荐页面最终结构

## Section 1 — Quote Header

```text
QT202608000001
Northstar Trading Co., Ltd.

CNSZX → USNYC
2 × 40HQ

状态：待销售确认
```

操作：

```text
预览报价
调整报价
作废
确认并发送
```

---

## Section 2 — Transport Summary

```text
Carrier          MAEU
Service          Pacific Express
ETD              2026-09-05
Transit Time     16 Days
Routing          Direct
Free Time        14 DEM + 7 DET
Valid Until      2026-09-06
```

---

## Section 3 — Pricing Review

```text
费用          计费方式   数量   成本     销售价     金额

Ocean Freight /40HQ      2     1,500    3,000      6,000
ISPS          /40HQ      2       400      400        800
```

汇总：

```text
总成本
CNY 3,800

报价总额
CNY 6,800

预计毛利
CNY 3,000

毛利率
44.12%
```

---

## Section 4 — Terms & Internal Information

```text
客户可见报价条款
[........................]

Rate Source
RATE-SZX-NYC-018

Supplier
Pacific Ocean Logistics

Contract
MAEU-CNUS-2609
```

---

# 28. 状态流转

```text
PENDING_REVIEW
├── SENT
├── CANCELLED
└── EXPIRED
```

发送：

```text
PENDING_REVIEW
→ SENT
```

客户接受：

```text
SENT
→ ACCEPTED
```

客户拒绝：

```text
SENT
→ REJECTED
```

系统过期：

```text
PENDING_REVIEW / SENT
→ EXPIRED
```

---

# 29. P0 优先级

本轮必须完成：

```text
页面语义：报价审核，而非手工改价

成本总额
报价总额
预计毛利
毛利率

Charge Unit
计费数量

Rate Source
Supplier
Contract

客户 Terms / 内部改价原因分离

标记过期 → 作废

EXPIRED 自动判断

PENDING_REVIEW 不生成正式 PDF

确认并发送
```

---

# 30. P1 优先级

建议后续完成：

```text
添加费用
删除费用

Margin Warning

草稿 PDF

Free Time

可编辑 Quote Valid Until

Quote → Rate Detail Link
```

---

# 31. P2

后续再做：

```text
Margin Approval
Supervisor Approval
Discount Approval
Exchange Rate
Multi-currency Profit Consolidation
Rate Override Permission
Customer-level Pricing Rules
```

---

# 32. Codex 实施前检查

Codex 修改代码前先检查：

```text
Quote Model
QuoteLine Model
QuoteCharge Model
Rate Snapshot
Rate Model
Surcharge Model
Quote Status Enum
Quote Detail API
Quote Update API
Quote Send API
PDF Generator
Audit Log
Role / Permission
```

第一步只输出：

1. 当前实现分析
2. 页面与本需求差异
3. 数据模型差异
4. 是否需要 Migration
5. 拟修改文件
6. API 修改点
7. 权限风险
8. 实施顺序

不要立即修改代码。

---

# 33. 最终目标

销售处理 Quote 的体验应该变成：

```text
客户提交报价需求
↓
我马上知道来源 Rate
↓
我看到成本和利润
↓
如果没问题直接确认
↓
如有需要调整价格 / 条款
↓
预览客户最终看到的 Quote
↓
确认并发送
```

而不是：

```text
打开 Quote
↓
手动看几个数字
↓
不知道利润
↓
不知道来源
↓
不知道哪些费用按柜哪些按票
↓
改完价格直接发
```

销售审核页的核心价值应是：

> **快速、可追溯、可控地把 Rate 转换成正式 Customer Quote。**
