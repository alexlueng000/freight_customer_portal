import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleCode, UserType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { RequestContextService } from '../../shared/request-context/request-context.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ListUsersDto } from './dto/list-users.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

const internalRoles = new Set<RoleCode>([
  RoleCode.TENANT_ADMIN,
  RoleCode.SALES,
  RoleCode.OPERATION,
  RoleCode.FINANCE,
]);
const customerRoles = new Set<RoleCode>([RoleCode.CUSTOMER_ADMIN, RoleCode.CUSTOMER_USER]);

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  userType: true,
  status: true,
  customerCompanyId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  customerCompany: { select: { id: true, code: true, name: true } },
  userRoles: { select: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(query: ListUsersDto) {
    const context = this.requestContext.requireAuthenticated();
    return this.listWithScope(query, { tenantId: context.tenantId });
  }

  async listPortalUsers(query: ListUsersDto) {
    const context = this.requestContext.requireAuthenticated();
    if (!context.customerCompanyId) {
      throw new BadRequestException({
        code: 'CUSTOMER_CONTEXT_REQUIRED',
        message: 'Customer user management requires a customer company context',
      });
    }
    return this.listWithScope(query, {
      tenantId: context.tenantId,
      customerCompanyId: context.customerCompanyId,
      userType: UserType.CUSTOMER,
    });
  }

  async createPortalUser(dto: CreateUserDto) {
    const context = this.requestContext.requireAuthenticated();
    if (!context.customerCompanyId) {
      throw new BadRequestException({
        code: 'CUSTOMER_CONTEXT_REQUIRED',
        message: 'Customer user management requires a customer company context',
      });
    }
    return this.create({
      ...dto,
      userType: UserType.CUSTOMER,
      customerCompanyId: context.customerCompanyId,
    });
  }

  async updatePortalUser(id: string, dto: UpdateUserDto) {
    const context = this.requestContext.requireAuthenticated();
    if (!context.customerCompanyId) {
      throw new BadRequestException({
        code: 'CUSTOMER_CONTEXT_REQUIRED',
        message: 'Customer user management requires a customer company context',
      });
    }
    if (dto.roleCode && !customerRoles.has(dto.roleCode)) {
      throw new BadRequestException({
        code: 'INVALID_USER_ROLE',
        message: 'Customer admins can only assign customer roles',
      });
    }
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        userType: UserType.CUSTOMER,
        customerCompanyId: context.customerCompanyId,
      },
      select: userSelect,
    });
    if (!existing) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const currentRole = existing.userRoles[0]?.role.code;
    const nextRole = dto.roleCode ?? currentRole;
    const nextStatus = dto.status ?? existing.status;
    if (
      id === context.userId &&
      (nextRole !== RoleCode.CUSTOMER_ADMIN || nextStatus !== existing.status)
    ) {
      throw new BadRequestException({
        code: 'CUSTOMER_ADMIN_SELF_CHANGE_REJECTED',
        message: 'Customer admins cannot change their own role or account status',
      });
    }
    return this.updateScoped(id, dto, {
      tenantId: context.tenantId,
      userType: UserType.CUSTOMER,
      customerCompanyId: context.customerCompanyId,
    });
  }

  private async listWithScope(
    query: ListUsersDto,
    scope: { tenantId: string; customerCompanyId?: string; userType?: UserType },
  ) {
    const where: Prisma.UserWhereInput = {
      tenantId: scope.tenantId,
      ...(scope.userType
        ? { userType: scope.userType }
        : query.userType
          ? { userType: query.userType }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(scope.customerCompanyId
        ? { customerCompanyId: scope.customerCompanyId }
        : query.customerCompanyId
          ? { customerCompanyId: query.customerCompanyId }
          : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async create(dto: CreateUserDto) {
    const context = this.requestContext.requireAuthenticated();
    this.validateRole(dto);
    await this.validateCustomerCompany(dto, context.tenantId);
    const role = await this.prisma.role.findUnique({
      where: { tenantId_code: { tenantId: context.tenantId, code: dto.roleCode } },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException({
        code: 'ROLE_NOT_CONFIGURED',
        message: 'The selected role is not configured for this tenant',
      });
    }

    const passwordHash = await this.passwords.hash(dto.initialPassword);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            tenantId: context.tenantId,
            customerCompanyId:
              dto.userType === UserType.CUSTOMER ? dto.customerCompanyId : undefined,
            email: dto.email.trim().toLowerCase(),
            passwordHash,
            displayName: dto.displayName.trim(),
            userType: dto.userType,
            status: dto.status,
            userRoles: { create: { roleId: role.id, assignedById: context.userId } },
          },
          select: userSelect,
        });
        await transaction.auditLog.create({
          data: {
            tenantId: context.tenantId,
            actorUserId: context.userId,
            entityType: 'User',
            entityId: user.id,
            action: 'USER_CREATED',
            afterData: {
              email: user.email,
              displayName: user.displayName,
              userType: user.userType,
              status: user.status,
              customerCompanyId: user.customerCompanyId,
              roleCode: dto.roleCode,
            },
          },
        });
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'USER_EMAIL_EXISTS',
          message: 'A user with this email already exists in this tenant',
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    const context = this.requestContext.requireAuthenticated();
    return this.updateScoped(id, dto, { tenantId: context.tenantId });
  }

  private async updateScoped(
    id: string,
    dto: UpdateUserDto,
    scope: { tenantId: string; customerCompanyId?: string; userType?: UserType },
  ) {
    const context = this.requestContext.requireAuthenticated();
    if (dto.roleCode === undefined && dto.status === undefined) {
      throw new BadRequestException({
        code: 'USER_UPDATE_REQUIRED',
        message: 'At least one user field must be provided',
      });
    }
    const existing = await this.prisma.user.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        ...(scope.customerCompanyId ? { customerCompanyId: scope.customerCompanyId } : {}),
        ...(scope.userType ? { userType: scope.userType } : {}),
      },
      select: userSelect,
    });
    if (!existing) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    const currentRole = existing.userRoles[0]?.role.code;
    const nextRole = dto.roleCode ?? currentRole;
    if (!nextRole || !this.isRoleValid(existing.userType, nextRole)) {
      throw new BadRequestException({
        code: 'INVALID_USER_ROLE',
        message: 'The selected role is not valid for this user type',
      });
    }
    const role = await this.prisma.role.findUnique({
      where: { tenantId_code: { tenantId: context.tenantId, code: nextRole } },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException({
        code: 'ROLE_NOT_CONFIGURED',
        message: 'The selected role is not configured for this tenant',
      });
    }
    const nextStatus = dto.status ?? existing.status;
    if (nextRole === currentRole && nextStatus === existing.status) return existing;

    return this.prisma.$transaction(async (transaction) => {
      if (nextRole !== currentRole) {
        await transaction.userRole.deleteMany({ where: { userId: id } });
        await transaction.userRole.create({
          data: { userId: id, roleId: role.id, assignedById: context.userId },
        });
      }
      const updated = await transaction.user.update({
        where: { id },
        data: { status: nextStatus },
        select: userSelect,
      });
      await transaction.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorUserId: context.userId,
          entityType: 'User',
          entityId: id,
          action: 'USER_UPDATED',
          beforeData: { status: existing.status, roleCode: currentRole ?? null },
          afterData: { status: updated.status, roleCode: nextRole },
        },
      });
      return updated;
    });
  }

  private validateRole(dto: CreateUserDto): void {
    if (!this.isRoleValid(dto.userType, dto.roleCode)) {
      throw new BadRequestException({
        code: 'INVALID_USER_ROLE',
        message: 'The selected role is not valid for this user type',
      });
    }
    if (dto.userType === UserType.INTERNAL && dto.customerCompanyId) {
      throw new BadRequestException({
        code: 'INVALID_CUSTOMER_BINDING',
        message: 'Internal users cannot be bound to a customer company',
      });
    }
    if (dto.userType === UserType.CUSTOMER && !dto.customerCompanyId) {
      throw new BadRequestException({
        code: 'CUSTOMER_COMPANY_REQUIRED',
        message: 'Customer users must be bound to a customer company',
      });
    }
  }

  private isRoleValid(userType: UserType, roleCode: RoleCode): boolean {
    return userType === UserType.INTERNAL
      ? internalRoles.has(roleCode)
      : customerRoles.has(roleCode);
  }

  private async validateCustomerCompany(dto: CreateUserDto, tenantId: string): Promise<void> {
    if (dto.userType !== UserType.CUSTOMER || !dto.customerCompanyId) return;
    const customer = await this.prisma.customerCompany.findFirst({
      where: { id: dto.customerCompanyId, tenantId },
      select: { id: true },
    });
    if (!customer) {
      throw new BadRequestException({
        code: 'INVALID_CUSTOMER_COMPANY',
        message: 'Customer company must belong to the current tenant',
      });
    }
  }
}
