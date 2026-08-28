import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto.js';
import { ListCustomersDto } from './dto/list-customers.dto.js';

@ApiTags('customers')
@ApiBearerAuth()
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('customer.read')
  @ApiOkResponse({ description: 'Tenant-scoped paginated customer company list' })
  @ApiForbiddenResponse({ description: 'Missing customer.read permission' })
  list(@Query() query: ListCustomersDto) {
    return this.customers.list(query);
  }

  @Post()
  @RequirePermissions('customer.manage')
  @ApiCreatedResponse({ description: 'Customer company created' })
  @ApiConflictResponse({ description: 'Customer code already exists in this tenant' })
  @ApiForbiddenResponse({ description: 'Missing customer.manage permission' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get(':id')
  @RequirePermissions('customer.read')
  @ApiOkResponse({ description: 'Tenant-scoped customer company detail' })
  @ApiNotFoundResponse({ description: 'Customer is outside the caller scope or does not exist' })
  @ApiForbiddenResponse({ description: 'Missing customer.read permission' })
  getById(@Param('id') id: string) {
    return this.customers.getById(id);
  }

  @Get(':id/contacts')
  @RequirePermissions('customer.read')
  @ApiOkResponse({ description: 'Contacts for a tenant-scoped customer company' })
  @ApiNotFoundResponse({ description: 'Customer is outside the caller scope or does not exist' })
  @ApiForbiddenResponse({ description: 'Missing customer.read permission' })
  listContacts(@Param('id') id: string) {
    return this.customers.listContacts(id);
  }

  @Post(':id/contacts')
  @RequirePermissions('customer.manage')
  @ApiCreatedResponse({ description: 'Customer contact created' })
  @ApiNotFoundResponse({ description: 'Customer is outside the caller scope or does not exist' })
  @ApiForbiddenResponse({ description: 'Missing customer.manage permission' })
  createContact(@Param('id') id: string, @Body() dto: CreateCustomerContactDto) {
    return this.customers.createContact(id, dto);
  }
}
