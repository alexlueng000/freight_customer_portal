# 本地 Demo 角色账号

> 仅用于本地开发与 UAT。禁止在共享测试环境或生产环境复用这些密码。

## 登录信息

- 登录地址：<http://localhost:3000/login>
- 租户代码：`DEMO`

## 货代内部角色

| 角色 | 邮箱 | 密码 | 登录入口 |
| --- | --- | --- | --- |
| 租户管理员 `TENANT_ADMIN` | `admin@demo.freight.local` | `DemoAdmin!2026` | `/admin` |
| 销售 `SALES` | `sales@demo.freight.local` | `DemoAdmin!2026` | `/admin` |
| 操作 `OPERATION` | `operation@demo.freight.local` | `DemoAdmin!2026` | `/admin` |
| 财务 `FINANCE` | `finance@demo.freight.local` | `DemoAdmin!2026` | `/admin` |

## 客户角色

| 角色 | 邮箱 | 密码 | 登录入口 |
| --- | --- | --- | --- |
| 客户管理员 `CUSTOMER_ADMIN` | `customer@demo.freight.local` | `DemoCustomer!2026` | `/portal` |
| 客户普通用户 `CUSTOMER_USER` | `customer-user@demo.freight.local` | `DemoCustomer!2026` | `/portal` |

## 使用说明

- 后台 Rate 创建、编辑和导入请使用租户管理员账号。
- Quote 审核、调价和发送请使用销售账号。
- Booking、Shipment、Container、Tracking 和 Document 操作请使用操作账号。
- Invoice 创建、发布、作废和收款标记请使用财务账号。
- 客户查价、接受 Quote、创建 Booking、查看 Tracking/Document/Invoice 请使用客户账号。
- 如果重新执行 seed 时修改了 `DEMO_ADMIN_PASSWORD` 或 `DEMO_CUSTOMER_PASSWORD`，需要同步更新本文。
