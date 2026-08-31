# Booking 操作员审核页优化需求

## 1. 背景

当前 Booking 操作员审核页已经具备基本的订舱详情展示能力，包括：

- Booking 编号
- 客户
- 航线
- 来源 Quote
- Carrier
- ETD
- Cargo 信息
- Shipper / Booking Contact
- 箱型与箱量
- SO / Shipment 状态
- 审核入口

当前页面已经可以作为 Booking Detail 使用，但从运营操作角度看，仍然更像：

> Booking 详情页 + 一个审核按钮

而不是一个真正面向订舱操作员的审核工作台。

本轮优化目标是：

> 让操作员可以快速判断「客户提交的资料是否足以进入实际订舱执行」，并完成明确的通过 / 驳回操作，同时保留处理留痕。

---

## 2. 核心产品原则

操作员在此页面的任务不是重新审核 Quote，也不是重新确认商务方案。

Quote 已经完成并被客户接受，因此：

- 航线
- Carrier
- ETD
- Container Type
- Quantity
- Quote Reference

这些信息应视为已确认的商务信息。

操作员真正需要审核的是：

- Cargo 是否完整
- Cargo Ready Date 是否合理
- Package 是否明确
- Weight / Volume 是否完整
- Shipper 是否完整
- Booking Contact 是否可联系
- Dangerous Goods 信息是否明确
- 是否存在足以阻止订舱执行的问题

因此页面应明确区分：

```text
Quote 已确认信息
        ↓
客户补充 Booking 信息
        ↓
操作员审核
        ↓
通过 / 驳回
```

---

# 3. P0 优化项

## 3.1 删除无业务价值的「开始审核 / UNDER_REVIEW」流程

### 当前问题

当前状态：

```text
SUBMITTED
```

右上角操作：

```text
[开始审核] [取消]
```

问题是「开始审核」的业务含义不明确。

操作员无法理解：

- 点击后是否锁单
- 是否只是修改状态
- 是否表示自己成为处理人
- 下一步如何通过 / 驳回

---

当前实现中：

```text
SUBMITTED
↓
点击「开始审核」
↓
UNDER_REVIEW
↓
页面几乎没有任何业务变化
↓
点击「确认订舱」
```

这属于无业务价值的中间流程。

如果「开始审核」没有带来以下任何能力：

- 领取任务
- 锁定处理人
- 阻止其他 Operation 重复处理
- 记录 SLA 起点
- 改变可执行动作

那么该状态和按钮应在 V1 直接删除。

V1 统一采用：

```text
客户提交 Booking
        ↓
SUBMITTED / 待审核
        ↓
[退回补充] [审核通过]
```

不要再经过：

```text
UNDER_REVIEW
```

只有未来存在真实多人抢单或任务归属需求时，才重新引入：

```text
[领取处理]
→ UNDER_REVIEW
→ assignedTo / assignedAt
```

此时 UNDER_REVIEW 的价值必须明确是：

> 标识该票已经由某个 Operation 领取并锁定处理。

而不能只是为了让状态机看起来更完整。

---

## 3.2 审核备注不要永久显示大文本框

### 当前问题

当前页面直接展示：

```text
审核备注（拒绝时必填）
[                         ]
[                         ]
```

这会让用户产生错误认知：

> 每次审核都需要填写备注。

同时永久占用大量页面空间。

---

### 优化方案

#### 审核通过

点击：

```text
[审核通过]
```

弹出简单确认：

```text
确认审核通过？

该 Booking 将进入下一订舱执行阶段。

[取消] [确认通过]
```

审核通过默认不要求填写备注。

---

#### 退回补充

点击：

```text
[退回补充]
```

弹出 Modal：

```text
退回原因 *

○ Cargo 信息不完整
○ Shipper 信息不完整
○ Booking Contact 信息不完整
○ Cargo Ready Date 不合理
○ 箱量 / 货物信息存在冲突
○ 危险品信息需要补充
○ 其他

补充说明 *

[                              ]

[取消] [确认退回]
```

业务规则：

```text
退回补充
→ Reject Reason 必填
```

---

### 内部备注

如后续确有需求，可以增加：

```text
内部备注
```

但必须和：

```text
Reject Reason
```

分开。

内部备注只给内部人员查看，不返回 Customer Portal。

---

# 4. Booking 审核信息补全

## 4.1 Cargo Ready Date

当前页面缺少：

```text
Cargo Ready Date
```

这是操作员判断订舱是否合理的重要字段，应列为 P0。

示例：

```text
ETD
2026-09-05

Cargo Ready Date
2026-09-01
```

以后可以增加规则提示，例如：

```text
⚠ Cargo Ready Date 距离 ETD 仅 1 天，请确认截关时间。
```

V1 可以先只展示，不做复杂自动规则。

---

## 4.2 Package Type

当前只有：

```text
件数：1
```

信息不足。

建议改为：

```text
Packages
20 CARTONS
```

或者：

```text
1 PALLET
5 CASES
10 BAGS
```

数据结构建议至少包含：

```text
packageCount
packageType
```

---

## 4.3 Booking Contact 信息完整展示

当前页面只有联系人名称。

审核页建议展示：

```text
Contact Name
Email
Phone
```

因为 Operation 后续实际订舱执行中，很可能需要联系客户。

---

## 4.4 Cargo 信息建议统一展示

建议最终字段：

| 字段 | 示例 |
|---|---|
| Commodity | 测试物品001 |
| Package | 20 CARTONS |
| Gross Weight | 19 KG |
| Volume | 10 CBM |
| Cargo Ready Date | 2026-09-01 |
| Dangerous Goods | 否 |
| Special Instructions | — |

---

## 4.5 Shipper 信息建议统一展示

| 字段 | 示例 |
|---|---|
| Company | LL |
| Address | Shenzhen, China |
| Contact | JJ |
| Email | test@example.com |
| Phone | +86 138xxxx8888 |

---

# 5. 明确区分 Quote 信息和 Booking 补录信息

这是审核页信息架构的核心调整。

## 5.1 Quote Confirmed Information

单独建立 Section：

```text
报价确认信息
```

包含：

```text
来源报价
QT202608000010 →

航线
CNSHA → USLAX

Carrier
COSCO

ETD
2026-09-05

Container
3 × 40HQ
```

建议增加轻量提示：

```text
🔒 来自已接受报价
```

表达：

> 这些信息已经在 Quote 阶段确认，不属于本次 Booking 审核重点。

---

## 5.2 Customer Submitted Booking Information

第二个 Section：

```text
客户提交的订舱资料
```

包含：

```text
Cargo Ready Date
Commodity
Package
Weight
Volume
Dangerous Goods
Shipper
Booking Contact
Special Instructions
```

这样操作员能够非常清楚地理解：

```text
Quote 商务方案
已经确定

↓

现在只审核
客户补充的履约资料
```

---

# 6. 页面信息密度优化

## 当前问题

页面宽度较大，但内容大量横向铺开。

例如：

```text
品名                  件数                  毛重/体积
```

字段之间距离很远，不利于 Operation 高频扫读。

后台操作页应该优先追求：

> 信息密度 + 扫读效率

而不是 Customer Portal 式的舒展布局。

---

## 推荐布局

### Quote / Route 卡片

```text
┌─────────────────────────────────────────────┐
│ 报价与航程                                  │
│                                             │
│ QT202608000010      CNSHA → USLAX           │
│ COSCO               ETD 2026-09-05          │
│ 3 × 40HQ                                    │
└─────────────────────────────────────────────┘
```

---

### Cargo + Shipper 双栏

```text
┌───────────────────────┬───────────────────────┐
│ Cargo                 │ Shipper               │
│                       │                       │
│ Commodity  测试物品   │ Company    LL         │
│ Package    1 PALLET   │ Contact    JJ         │
│ Weight     19 KG      │ Email      xxx        │
│ Volume     10 CBM     │ Phone      xxx        │
│ Ready      09-01      │ Address    xxx        │
│ DG         否         │                       │
└───────────────────────┴───────────────────────┘
```

桌面端可以使用双栏。

移动端 / 窄屏自动变成单栏。

---

# 7. 顶部区域优化

推荐顶部结构：

```text
← 返回订舱列表

NORTHSTAR TRADING CO., LTD.

BOOK202608000005                       [待审核]

CNSHA → USLAX
COSCO · ETD 2026-09-05 · 3 × 40HQ

来源报价 QT202608000010 →
```

操作按钮：

```text
[退回补充] [审核通过]
```

如果未来采用领取机制，则增加：

```text
处理人
Demo Operation

领取时间
2026-08-31 21:18
```

---

# 7.1 操作按钮语义必须与业务阶段一致

当前实现中的：

```text
[拒绝] [确认订舱] [取消]
```

存在两个问题。

第一，当前阶段并没有真正向 Carrier 完成订舱，因此：

```text
确认订舱
```

语义过早。此时 Operation 只是确认客户资料是否足以进入实际订舱执行。

因此按钮必须改为：

```text
[退回补充] [审核通过]
```

第二，「拒绝」语气过重。多数场景只是资料不完整，需要客户补充，不是拒绝承接该票业务。

因此统一使用：

```text
退回补充
```

审核通过之后，状态进入：

```text
APPROVED / 待订舱
```

真正完成向 Carrier 的订舱并取得 Booking Confirmation / SO 后，才进入：

```text
BOOKED / 已订舱
```

此时才可以出现类似：

```text
[录入 SO]
[确认已订舱]
```

---

# 7.2 删除页面永久审核备注框

当前页面中永久展示：

```text
审核备注（拒绝时必填）
[                         ]
```

应删除。

原因：

- 审核通过通常不需要填写备注
- 大文本框占据大量页面空间
- 操作员会误以为每次审核都必须填写
- Reject 按钮不应依赖页面 textarea 是否有值来决定是否可点击

正确交互：

```text
点击「审核通过」
→ 二次确认
→ 通过
```

```text
点击「退回补充」
→ 打开 Modal
→ 选择退回原因
→ 填写补充说明
→ 确认退回
```

不要采用：

```text
先填写审核备注
→ Reject 按钮才变为可点击
```

这种隐藏依赖会增加不必要的操作成本。

---

# 8. 状态显示统一

数据库 Enum 可以继续使用英文：

```text
DRAFT
SUBMITTED
REVIEWING
REJECTED
APPROVED
CANCELLED
BOOKED
```

但前端不能直接显示 Enum。

统一映射：

| Database | UI |
|---|---|
| DRAFT | 草稿 |
| SUBMITTED | 待审核 |
| REJECTED | 已驳回 |
| APPROVED | 待订舱 |
| CANCELLED | 已取消 |
| BOOKED | 已订舱 |

---

# 9. 增加处理记录 / Audit Timeline

操作员审核属于关键业务动作，需要留痕。

建议页面底部增加：

```text
处理记录
```

示例：

```text
2026-08-31 20:36
客户提交 Booking

2026-08-31 21:18
Demo Operation 开始处理

2026-08-31 21:25
Demo Operation 审核通过
```

驳回场景：

```text
2026-08-31 21:25
Demo Operation 驳回 Booking

原因：
Cargo Ready Date 缺失

备注：
请补充预计备货完成日期。
```

至少记录：

```text
action
operator
timestamp
reason
remark
```

---

# 10. SO / Shipment 展示逻辑

当前 Booking 还未审核完成时：

```text
暂无 SO 或 Shipment
```

本身没有问题。

但建议降低这一块的视觉权重。

因为在当前状态：

```text
SUBMITTED / 待审核
```

SO 和 Shipment 本来就不应该存在。

可以在审核通过后才明显展示：

```text
SO 与 Shipment
```

例如：

```text
审核通过
    ↓
待订舱
    ↓
SO Created
    ↓
Shipment Created
```

---

# 11. 推荐 V1 审核状态机

V1 状态机应尽量简单，每个状态必须对应真实业务动作。

```text
DRAFT
草稿
  ↓ 客户提交

SUBMITTED
待审核
  ↓
  ├───────────────┐
  ↓               ↓
REJECTED        APPROVED
待客户补充        待订舱
  ↓               ↓
客户修改          Operation 实际订舱
  ↓               ↓
再次提交          获取 Booking Confirmation / SO
  ↓               ↓
SUBMITTED        BOOKED
待审核             已订舱
                    ↓
                 Shipment
```

V1 不引入：

```text
UNDER_REVIEW / REVIEWING
```

除非该状态真正承担以下职责之一：

- 领取任务
- 锁单
- 标记处理人
- 阻止多人同时操作
- SLA 计时

否则不允许增加中间状态。

状态设计原则：

> 每增加一个状态，都必须回答：谁在这个状态下做什么？为什么不能直接进入下一个状态？这个状态解决了什么业务问题？

---

# 12. 推荐审核交互

## 审核通过

```text
SUBMITTED
    ↓
点击「审核通过」
    ↓
确认
    ↓
APPROVED
```

系统记录：

```text
reviewedBy
reviewedAt
```

---

## 退回补充

```text
SUBMITTED
    ↓
点击「退回补充」
    ↓
选择 Reject Reason
    ↓
填写补充说明
    ↓
REJECTED
```

Customer Portal 显示：

```text
订舱资料需要补充

Cargo Ready Date 缺失

操作员备注：
请补充预计备货完成日期。

[修改订舱资料]
```

修改完成：

```text
REJECTED
    ↓
RESUBMIT
    ↓
SUBMITTED
```

---

# 13. 建议数据字段

审核相关建议至少包含：

```text
booking.status

booking.reviewedBy
booking.reviewedAt

booking.rejectReason
booking.rejectRemark

booking.submittedAt

booking.cargoReadyDate

booking.packageCount
booking.packageType
```

如果增加领取机制：

```text
booking.assignedTo
booking.assignedAt
```

---

# 14. 开发优先级

## P0

必须完成：

- `SUBMITTED → 待审核` UI 映射
- 删除无业务价值的「开始审核 / UNDER_REVIEW」流程
- 明确「审核通过 / 退回补充」操作
- 退回补充 Modal
- 退回原因必填
- Cargo Ready Date
- Package Type
- Booking Contact Email / Phone
- Quote 信息与 Booking 补录信息分区
- Audit Timeline
- 审核状态流转
- 客户驳回后可以修改并重新提交

---

## P1

建议完成：

- Cargo / Shipper 双栏布局
- Quote 信息增加「来自已接受报价」提示
- 审核确认弹窗
- 退回原因标准选项
- SO / Shipment 根据状态调整展示权重
- 操作记录展示 Reject Reason / Remark

---

## P2

后续再做：

- 多 Operation 领取 Booking（届时再引入 UNDER_REVIEW）
- Booking Lock
- 自动分配 Operator
- SLA
- 审核超时提醒
- Cargo Ready Date 与 ETD 自动风险提示
- Cut-off Time 校验
- Carrier / Route 规则校验

---

# 15. 验收 Case

## Case 1：正常审核通过

```text
客户接受 Quote
→ 创建 Booking
→ 补充完整资料
→ Submit
→ 后台状态：待审核
→ Operation 打开 Booking
→ 检查资料
→ 审核通过
→ 状态：已通过
```

Audit Log 必须记录：

```text
客户提交
操作员审核通过
```

---

## Case 2：Cargo Ready Date 缺失

```text
客户 Submit
→ Operation 审核
→ 点击驳回客户
→ 选择 Cargo Ready Date 不完整
→ 填写补充说明
→ 退回补充
```

Customer Portal：

```text
已驳回
→ 显示原因
→ 修改资料
→ 再次提交
```

后台：

```text
REJECTED
→ SUBMITTED
```

---

## Case 3：Quote 信息不可被审核页修改

已接受 Quote：

```text
CNSHA → USLAX
COSCO
ETD 2026-09-05
3 × 40HQ
```

Booking 审核页必须原样显示。

Operation 不允许直接修改：

```text
Origin
Destination
Carrier
ETD
Container Type
Quantity
```

如果确实需要修改，应进入独立异常处理流程，不应通过普通审核直接修改。

---

## Case 4：Reject Reason 必填

点击：

```text
驳回客户
```

未填写 Reject Reason：

```text
禁止提交
```

---

## Case 5：已通过 Booking 不可重复审核

状态：

```text
APPROVED
```

再次进入页面：

不能再次出现：

```text
审核通过
驳回客户
```

只显示审核结果和 Audit Timeline。

---

# 16. 最终目标

该页面不是简单的 Booking Detail。

它应该回答 Operation 三个问题：

```text
1. 客户订的是什么？
2. 客户补充的资料完整吗？
3. 这票是否已经可以进入实际订舱执行？
```

最终审核流程应保持：

```text
Quote 已确认
    ↓
客户补充 Booking 资料
    ↓
Operation 检查
    ↓
通过 / 驳回
    ↓
SO / Shipment
```

V1 的重点不是增加更多审核功能，而是把：

> 检查 → 判断 → 通过 / 驳回 → 留痕 → 进入订舱执行

这条链路做得足够清晰、稳定、可追踪。


# 17. 本轮补充决策（2026-08-31）

本轮根据实际审核页操作验证，确认以下调整：

1. 删除 V1 的「开始审核」步骤。
2. 删除无实际业务价值的 `UNDER_REVIEW / REVIEWING` 中间状态。
3. `SUBMITTED / 待审核` 页面直接提供：

```text
[退回补充] [审核通过]
```

4. 将「确认订舱」改为「审核通过」。审核通过只代表资料可进入订舱执行，不代表已经完成 Carrier Booking。
5. 审核通过后进入：

```text
APPROVED / 待订舱
```

6. 实际向 Carrier 完成订舱并取得 Booking Confirmation / SO 后，再进入：

```text
BOOKED / 已订舱
```

7. 将「拒绝」改为「退回补充」，避免把资料补充场景表达成业务拒绝。
8. 删除审核页永久展示的审核备注 textarea。
9. 「退回补充」按钮始终可点击，点击后在 Modal 内选择原因并填写说明，不允许通过页面 textarea 是否有值来控制按钮 Disabled。
10. `UNDER_REVIEW` 只有在未来增加真实的任务领取 / 锁单 / 处理人归属后才允许重新引入。
# 18. 订舱执行与 SO 阶段优化（2026-08-31）

本轮继续验证审核通过后的实际操作流程，发现当前实现仍存在明显的业务语义错位：

```text
客户提交 Booking
↓
操作员点击「确定订舱」
↓
状态直接变成 CONFIRMED
↓
页面立即出现文件上传
↓
「上传并放出 SO」
```

这套流程会让操作员产生明显困惑，因为它把以下四个不同动作压缩在一起：

```text
资料审核通过
+
向 Carrier 实际提交订舱
+
收到 SO / Booking Confirmation
+
把 SO 发布给客户
```

这四件事必须拆开。

---

## 18.1 `CONFIRMED` 不应在审核通过后立即出现

### 当前问题

审核通过后页面立即显示：

```text
CONFIRMED
```

但页面同时又显示：

```text
暂无 SO 或 Shipment
```

这两个信息在业务语义上冲突。

`CONFIRMED` 很容易被理解为：

> Carrier 已经确认舱位。

但当前真实情况只是：

> 内部操作员确认客户提交的资料没有问题。

因此：

```text
审核通过 ≠ Booking Confirmed
```

### 正确状态

审核通过后应进入：

```text
APPROVED
待订舱
```

含义：

> 客户资料已通过内部审核，可以进入实际订舱执行。

此时仍未代表 Carrier 已确认舱位。

---

## 18.2 审核通过后必须进入真实的订舱执行阶段

建议 Booking 后半段状态机调整为：

```text
SUBMITTED
待审核
    ↓
审核通过
    ↓
APPROVED
待订舱
    ↓
向 Carrier / Agent 实际提交订舱
    ↓
等待 Carrier 回复
    ↓
收到 SO / Booking Confirmation
    ↓
登记 SO
    ↓
BOOKED
已订舱
```

如果系统需要明确追踪“是否已经向 Carrier 提交”，可以增加一个有真实业务意义的状态：

```text
APPROVED
待订舱
    ↓
[标记已提交船司]
    ↓
BOOKING_SUBMITTED
已提交船司 / 待 SO
    ↓
收到 SO
    ↓
BOOKED
已订舱
```

### 与 `UNDER_REVIEW` 的区别

`UNDER_REVIEW` 在当前 V1 没有解决实际业务问题，因此删除。

但：

```text
BOOKING_SUBMITTED
已提交船司 / 待 SO
```

代表一个真实存在、可能持续数小时甚至数天的业务阶段，因此可以保留。

---

## 18.3 「上传并放出 SO」必须拆成两个动作

### 当前问题

当前按钮：

```text
上传并放出 SO
```

同时执行：

```text
上传文件
+
发布给客户
```

风险很高。

例如：

```text
操作员选错文件
↓
立即发布给客户
```

或者：

```text
SO 信息尚未核对
↓
上传
↓
客户立即可见
```

都可能导致操作事故。

---

## 18.4 改成「登记 SO」

收到 Carrier 的 SO / Booking Confirmation 后，Operation 应进入一个明确的：

```text
[登记 SO]
```

流程，而不是直接显示裸文件上传控件。

推荐表单：

```text
登记订舱结果

SO / Booking No. *
COSU123456789

Carrier
COSCO

Vessel / Voyage
COSCO SHIPPING XXX / 123E

ETD
2026-09-05

ETA
2026-09-20

CY Cut-off
2026-09-03 18:00

SI Cut-off
2026-09-02 12:00

VGM Cut-off
2026-09-03 12:00

Terminal
XXX Terminal

附件
[上传 SO PDF]

[保存草稿]    [确认并发布]
```

---

# 19. SO 必须是结构化数据，而不是单纯 PDF

当前如果只设计成：

```text
Booking
↓
上传 SO.pdf
```

会形成严重技术债。

PDF 应仅作为：

> 原始附件 / Carrier 凭证

SO 本身必须有结构化数据。

建议至少包含：

```text
soNumber
carrier
vessel
voyage
etd
eta
cyCutoff
siCutoff
vgmCutoff
terminal
containerSummary
attachment
```

原因是后续系统需要基于这些字段做：

```text
Dashboard 待办
截 SI 提醒
VGM 提醒
CY Cut-off 提醒
Shipment 节点
客户 Portal 展示
异常预警
```

如果所有信息都只存在 PDF 中，这些功能都无法可靠实现。

---

# 20. SO 上传与客户发布必须解耦

推荐 SO 生命周期：

```text
收到 SO
↓
登记 SO
↓
保存
↓
内部核对
↓
发布给客户
```

状态可以考虑：

```text
SO_DRAFT
待核对

↓

SO_PUBLISHED
已发布
```

V1 如果不想增加 SO 子状态，也至少应该保证：

```text
上传附件
≠
自动发布
```

---

## 20.1 保存草稿

操作员可以：

```text
[保存草稿]
```

系统保存 SO 信息和附件，但 Customer Portal 不可见。

---

## 20.2 确认并发布

操作员核对完成后：

```text
[确认并发布]
```

系统记录：

```text
publishedBy
publishedAt
```

客户随后才能看到 SO。

---

# 21. 审核通过后的页面职责必须改变

不同 Booking 状态不能只是切换一个 Badge。

页面任务必须随状态发生变化。

---

## 21.1 `SUBMITTED / 待审核`

页面重点：

```text
检查客户提交资料
```

操作：

```text
[退回补充] [审核通过]
```

显示：

```text
客户提交资料
Quote 确认信息
Audit Timeline
```

不显示：

```text
SO 上传
订舱执行按钮
```

---

## 21.2 `APPROVED / 待订舱`

审核相关控件全部消失。

不再显示：

```text
审核备注
退回补充
审核通过
```

页面重点切换成：

```text
订舱执行
```

推荐显示：

```text
订舱结果 / SO

当前尚未收到 SO。

客户资料已审核通过，
请向 Carrier 完成订舱后登记订舱结果。
```

操作：

```text
[登记订舱结果]
```

或者，如果需要追踪 Carrier 提交动作：

```text
[标记已提交船司]
```

---

## 21.3 `BOOKING_SUBMITTED / 待 SO`

如果启用该状态：

```text
订舱已提交给 COSCO
提交时间：2026-08-31 21:30

当前状态：
等待 Carrier 回复
```

操作：

```text
[登记 SO]
```

---

## 21.4 `BOOKED / 已订舱`

页面展示结构化 SO：

```text
SO No.
COSU123456789

Vessel / Voyage
COSCO SHIPPING XXX / 123E

ETD
2026-09-05

ETA
2026-09-20

CY Cut-off
09-03 18:00

SI Cut-off
09-02 12:00

VGM Cut-off
09-03 12:00

Terminal
XXX Terminal

附件
SO_COSU123456789.pdf
[查看]
```

如尚未发布给客户：

```text
状态：待发布

[编辑] [发布给客户]
```

发布后：

```text
已于 2026-08-31 21:45
由 Demo Operation 发布给客户
```

---

# 22. 删除原生裸文件上传 UI

后台正式业务界面不应直接展示浏览器原生：

```text
Choose File
No file chosen
```

它属于开发阶段 UI。

正式版本应封装成明确的业务组件：

```text
SO 附件

[选择文件]

支持 PDF，单文件最大 XX MB
```

选择后显示：

```text
SO_COSU123456789.pdf
1.8 MB

[查看] [删除]
```

文件上传必须位于「登记 SO」流程内部，而不是单独漂浮在 Booking Detail 页面。

---

# 23. 「SO 与 Shipment」必须拆分

当前 Section：

```text
SO 与 Shipment
```

概念过于混杂。

Booking 页建议首先只管理：

```text
订舱结果 / SO
```

SO 确认后，再处理 Shipment。

推荐：

```text
Booking
↓
SO
↓
Shipment
```

Shipment 应成为后续独立履约对象。

当 Shipment 已创建时，Booking 页面只展示关联关系：

```text
Shipment

SHP202608000005 →
```

不要把 Shipment 的完整执行信息继续堆在 Booking 页面。

---

# 24. Shipment 创建时点

推荐 V1：

```text
BOOKED
↓
SO 已确认
↓
Create Shipment
```

可以有两种实现：

### 方案 A：自动创建

```text
BOOKED
→ 系统自动 Create Shipment
```

适合 Quote → Booking → Shipment 强绑定流程。

### 方案 B：人工确认创建

```text
BOOKED
→ [创建 Shipment]
```

适合前期需要人工控制数据完整性的场景。

V1 可以根据现有数据模型选择更简单的一种，但不建议在 SO 尚未确认前就提前创建 Shipment。

---

# 25. 修正版完整状态机

建议当前 V1 最终收敛为：

```text
Quote Accepted
       ↓
Booking Draft
DRAFT
       ↓
Customer Submit
       ↓
SUBMITTED
待审核
       ↓
   ┌───┴───────────┐
   ↓               ↓
REJECTED         APPROVED
待客户修改        待订舱
   ↓               ↓
客户修改        向 Carrier 提交
   ↓               ↓
再次提交     BOOKING_SUBMITTED（可选）
   ↓               ↓
SUBMITTED        等待 SO
                   ↓
                 登记 SO
                   ↓
                 BOOKED
                 已订舱
                   ↓
                发布 SO
                   ↓
                Shipment
```

其中：

```text
UNDER_REVIEW
CONFIRMED
```

不再作为当前 V1 的核心 Booking 状态。

---

# 26. 本轮必须修改的现有实现

## P0

当前代码应立即调整：

1. 审核通过后不得直接进入 `CONFIRMED`。
2. 审核通过进入：

```text
APPROVED / 待订舱
```

3. 删除审核通过页面上的「审核备注」输入框。
4. 删除裸露的文件上传控件。
5. 删除「上传并放出 SO」。
6. 新增「登记订舱结果 / 登记 SO」流程。
7. SO 文件上传和客户发布解耦。
8. SO 至少保存核心结构化字段。
9. `APPROVED` 页面不再显示任何审核操作。
10. SO 确认后才进入：

```text
BOOKED / 已订舱
```

11. 「SO 与 Shipment」拆成独立业务区域。
12. Shipment 不应在 SO 未确认前提前创建。

---

## P1

建议后续补充：

- `BOOKING_SUBMITTED / 待 SO`
- SO 保存草稿
- SO 编辑
- SO 发布人 / 发布时间
- Cut-off 字段
- Vessel / Voyage
- ETA
- Terminal
- 文件查看 / 删除
- Audit Timeline 增加 Carrier Submission / SO Published 事件

---

## P2

后续增强：

- Carrier API 自动订舱
- Carrier Portal Integration
- SO 自动解析
- Cut-off 自动提醒
- SO Revision / Version History
- Booking Amendment
- Carrier Reject / No Space 异常流程
- 自动生成 Shipment

---

# 27. 新增验收 Case

## Case 6：审核通过后不能直接显示已订舱

```text
SUBMITTED
↓
审核通过
↓
APPROVED / 待订舱
```

此时：

```text
SO = 无
Shipment = 无
```

页面不得显示：

```text
CONFIRMED
已订舱
```

---

## Case 7：登记 SO

状态：

```text
APPROVED
```

Operation 点击：

```text
登记订舱结果
```

录入：

```text
SO Number
Carrier
Vessel / Voyage
ETD
Cut-off
Terminal
Attachment
```

保存成功。

---

## Case 8：上传附件不自动发布

操作员上传：

```text
SO.pdf
```

但没有点击：

```text
确认并发布
```

Customer Portal 不得看到附件。

---

## Case 9：发布 SO

Operation 完成核对：

```text
确认并发布
```

系统记录：

```text
publishedBy
publishedAt
```

Customer Portal 可以查看 SO。

---

## Case 10：状态完成后创建 Shipment

只有在：

```text
BOOKED
```

之后，才允许：

```text
Create Shipment
```

或由系统自动创建 Shipment。

---

# 28. 本轮结论

Booking 后半段必须明确区分：

```text
审核通过
≠
实际订舱
≠
收到 SO
≠
发布 SO
≠
Shipment
```

每一个状态和按钮都必须对应一个真实业务动作。

最终 Operation 的工作链应该是：

```text
检查 Booking
↓
审核通过
↓
向 Carrier 实际订舱
↓
等待回复
↓
登记 SO
↓
内部核对
↓
发布给客户
↓
进入 Shipment 履约
```

V1 不应该为了缩短页面数量，把这些业务动作重新压缩成：

```text
确认订舱
↓
上传并放出 SO
```

因为这种设计虽然代码更简单，但会直接破坏业务语义、操作安全性和后续 Shipment / Cut-off / SI / VGM 能力的扩展空间。
