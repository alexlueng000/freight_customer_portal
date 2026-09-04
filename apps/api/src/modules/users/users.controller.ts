import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('user.read')
  @ApiOkResponse({ description: 'Tenant-scoped paginated user list' })
  @ApiForbiddenResponse({ description: 'Missing user.read permission' })
  list(@Query() query: ListUsersDto) {
    return this.users.list(query);
  }

  @Post()
  @RequirePermissions('user.manage')
  @ApiCreatedResponse({ description: 'Tenant user created with one V1 role' })
  @ApiConflictResponse({ description: 'Email already exists in this tenant' })
  @ApiForbiddenResponse({ description: 'Missing user.manage permission' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('user.manage')
  @ApiOkResponse({ description: 'Tenant user status or V1 role updated' })
  @ApiNotFoundResponse({ description: 'User is outside the current tenant or does not exist' })
  @ApiForbiddenResponse({ description: 'Missing user.manage permission' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }
}

@ApiTags('portal users')
@ApiBearerAuth()
@Controller({ path: 'portal/users', version: '1' })
export class PortalUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('customer_user.read')
  @ApiOkResponse({ description: 'Customer-company-scoped paginated user list' })
  @ApiForbiddenResponse({ description: 'Missing customer_user.read permission' })
  list(@Query() query: ListUsersDto) {
    return this.users.listPortalUsers(query);
  }

  @Post()
  @RequirePermissions('customer_user.manage')
  @ApiCreatedResponse({ description: 'Customer user created within the caller customer company' })
  @ApiConflictResponse({ description: 'Email already exists in this tenant' })
  @ApiForbiddenResponse({ description: 'Missing customer_user.manage permission' })
  create(@Body() dto: CreateUserDto) {
    return this.users.createPortalUser(dto);
  }

  @Patch(':id')
  @RequirePermissions('customer_user.manage')
  @ApiOkResponse({ description: 'Customer user status or V1 role updated' })
  @ApiNotFoundResponse({
    description: 'User is outside the current customer company or does not exist',
  })
  @ApiForbiddenResponse({ description: 'Missing customer_user.manage permission' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.updatePortalUser(id, dto);
  }
}
